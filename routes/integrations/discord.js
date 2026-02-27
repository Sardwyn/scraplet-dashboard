import express from "express";
import crypto from "crypto";
import db from "../../db.js";
import requireAuth from "../../utils/requireAuth.js";

const router = express.Router();

function b64url(buf) {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function signState(payloadObj) {
  const secret = process.env.DISCORD_CONNECT_STATE_SECRET;
  if (!secret) throw new Error("Missing DISCORD_CONNECT_STATE_SECRET");
  const payload = Buffer.from(JSON.stringify(payloadObj), "utf8");
  const sig = crypto.createHmac("sha256", secret).update(payload).digest();
  return `${b64url(payload)}.${b64url(sig)}`;
}

function b64urlToBuf(s) {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/");
  const pad = "=".repeat((4 - (b64.length % 4)) % 4);
  return Buffer.from(b64 + pad, "base64");
}

function verifyState(state) {
  const secret = process.env.DISCORD_CONNECT_STATE_SECRET;
  if (!secret) throw new Error("Missing DISCORD_CONNECT_STATE_SECRET");

  const [p, s] = String(state || "").split(".");
  if (!p || !s) return null;

  const payload = b64urlToBuf(p);
  const sig = b64urlToBuf(s);
  const expected = crypto.createHmac("sha256", secret).update(payload).digest();

  if (sig.length !== expected.length) return null;
  if (!crypto.timingSafeEqual(sig, expected)) return null;

  try {
    return JSON.parse(payload.toString("utf8"));
  } catch {
    return null;
  }
}


// GET /integrations/discord/connect
router.get("/connect", requireAuth, (req, res) => {
  const userId = req.session.user?.id;
  if (!userId) return res.status(401).send("Not logged in");

  const clientId = process.env.DISCORD_CLIENT_ID;
  const redirectUri = process.env.DISCORD_REDIRECT_URI;
  const perms = process.env.DISCORD_BOT_PERMISSIONS || "0";

  if (!clientId || !redirectUri) {
    return res.status(500).send("Discord integration misconfigured.");
  }

  const state = signState({
    user_id: userId,
    nonce: crypto.randomUUID(),
    exp: Date.now() + 10 * 60 * 1000, // 10 min
  });

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "bot applications.commands",
    permissions: perms,
    state,
    prompt: "consent",
  });

  res.redirect(`https://discord.com/api/oauth2/authorize?${params.toString()}`);
});

// GET /integrations/discord/callback
router.get("/callback", async (req, res) => {
  const { state, guild_id } = req.query;

  const decoded = verifyState(state);
  if (!decoded || decoded.exp < Date.now()) {
    return res.status(400).send("Invalid or expired state.");
  }

  if (!guild_id) {
    return res.status(400).send("No guild_id returned from Discord install.");
  }

  const ownerUserId = decoded.user_id;

  try {
    await db.query("BEGIN");

    // Hard tenancy fence:
    // guild_id is PK, so it cannot be claimed by two tenants.
    const existing = await db.query(
      `SELECT guild_id, owner_user_id
       FROM public.discord_guild_integrations
       WHERE guild_id = $1
       FOR UPDATE`,
      [guild_id]
    );

    if (existing.rows.length) {
      const row = existing.rows[0];
      if (String(row.owner_user_id) !== String(ownerUserId)) {
        await db.query("ROLLBACK");
        return res
          .status(409)
          .send("This Discord server is already connected to another Scraplet account.");
      }

      await db.query(
        `UPDATE public.discord_guild_integrations
         SET status='active', updated_at=now()
         WHERE guild_id=$1`,
        [guild_id]
      );
    } else {
      await db.query(
        `INSERT INTO public.discord_guild_integrations
          (guild_id, owner_user_id, installed_by_user_id, status)
         VALUES ($1, $2, $2, 'active')`,
        [guild_id, ownerUserId]
      );

      // Seed default reactions
      await db.query(
        `INSERT INTO public.discord_reaction_map (guild_id, emoji, action)
         VALUES
           ($1, '✅', 'show_now'),
           ($1, '📌', 'save_only'),
           ($1, '❌', 'remove')
         ON CONFLICT (guild_id, emoji) DO NOTHING`,
        [guild_id]
      );
    }

    await db.query("COMMIT");

    // You may not have a page yet; safe redirect back to dashboard.
    res.redirect(`/dashboard?discord_guild_id=${encodeURIComponent(guild_id)}`);
  } catch (err) {
    try { await db.query("ROLLBACK"); } catch {}
    console.error("Discord callback error:", err);
    res.status(500).send("Failed to connect Discord.");
  }
});

export default router;

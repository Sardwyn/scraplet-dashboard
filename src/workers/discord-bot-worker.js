import crypto from "crypto";
import dotenv from "dotenv";
import db from "../../db.js";
import { Client, GatewayIntentBits, Partials, PermissionsBitField } from "discord.js";

// Make the worker completely immune to PM2 env-file caching bugs by forcing it to load the .env dynamically
dotenv.config({ path: "/var/www/scraplet/scraplet-dashboard/.env" });


const ENABLED = String(process.env.DISCORD_BOT_ENABLED || "true").toLowerCase() === "true";
let TOKEN = process.env.DISCORD_BOT_TOKEN || "";
// Aggressively strip quotes and trailing spaces just in case the .env was copy-pasted weirdly
TOKEN = TOKEN.replace(/^["']|["']$/g, "").trim();

if (!ENABLED) {
  console.log("[discord-bot] DISABLED via env");
  process.exit(0);
}
if (!TOKEN) {
  console.error("[discord-bot] Missing DISCORD_BOT_TOKEN");
  process.exit(1);
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.MessageContent, // needed to read text to build lower-third
  ],
  partials: [Partials.Message, Partials.Channel, Partials.Reaction],
});

function hasAdministrator(member) {
  try {
    return Boolean(member?.permissions?.has?.(PermissionsBitField.Flags.Administrator));
  } catch {
    return false;
  }
}

async function safeReact(message, emoji) {
  try {
    await message.react(emoji);
  } catch {
    // ignore (missing perms / unknown emoji / etc)
  }
}

async function safeRemoveUserReaction(reaction, user) {
  try {
    // remove only the user's reaction to reduce clutter if you want
    await reaction.users.remove(user.id);
  } catch {
    // ignore
  }
}


function firstUrl(text) {
  const m = String(text || "").match(/https?:\/\/\S+/i);
  return m ? m[0] : null;
}

async function getGuildClaim(guildId) {
  const { rows } = await db.query(
    `SELECT guild_id, owner_user_id, status
     FROM public.discord_guild_integrations
     WHERE guild_id = $1 AND status = 'active'`,
    [String(guildId)]
  );
  return rows[0] || null;
}

async function getChannelRule(guildId, channelId) {
  const { rows } = await db.query(
    `SELECT guild_id, channel_id, enabled, mode, show_ttl_seconds
     FROM public.discord_channel_rules
     WHERE guild_id = $1 AND channel_id = $2`,
    [String(guildId), String(channelId)]
  );
  return rows[0] || null;
}

async function getReactionAction(guildId, emoji) {
  const { rows } = await db.query(
    `SELECT action
     FROM public.discord_reaction_map
     WHERE guild_id = $1 AND emoji = $2`,
    [String(guildId), String(emoji)]
  );
  return rows[0]?.action || null;
}

async function canUserReactShow(guildId, roleIds) {
  if (!roleIds?.length) return false;

  const { rows } = await db.query(
    `SELECT 1
     FROM public.discord_role_rules
     WHERE guild_id = $1
       AND can_react_show = true
       AND role_id = ANY($2::text[])
     LIMIT 1`,
    [String(guildId), roleIds.map(String)]
  );

  return rows.length > 0;
}

async function enqueueShowNow({ ownerUserId, eventId, packet }) {
  await db.query(
    `INSERT INTO public.producer_outbox (event_id, target, owner_user_id, payload)
     VALUES ($1, 'overlay_gate', $2, $3::jsonb)
     ON CONFLICT (event_id, target) DO NOTHING`,
    [eventId, ownerUserId, JSON.stringify({ tenantId: ownerUserId, packet })]
  );
}

client.on("ready", () => {
  console.log(`[discord-bot] ready as ${client.user?.tag}`);
});

client.on("error", (err) => {
  console.error("[discord-bot] client error:", err?.message || err);
});

process.on("uncaughtException", (err) => {
  console.error("[discord-bot] process uncaughtException:", err?.message || err);
});

process.on("unhandledRejection", (err) => {
  console.error("[discord-bot] process unhandledRejection:", err?.message || err);
});

client.on("messageReactionAdd", async (reaction, user) => {
  try {
    if (!reaction || !user || user.bot) return;

    // Ensure we have full reaction + message
    if (reaction.partial) await reaction.fetch().catch(() => null);
    const msg = reaction.message;
    if (!msg) return;
    if (msg.partial) await msg.fetch().catch(() => null);

    const guildId = msg.guildId;
    const channelId = msg.channelId;
    if (!guildId || !channelId) return;

    // 1) Hard tenancy fence
    const claim = await getGuildClaim(guildId);
    if (!claim) return;

    // 2) Channel allowlist
    const chan = await getChannelRule(guildId, channelId);
    if (!chan || chan.enabled !== true) return;

    // 3) Reaction map
    const emoji = reaction.emoji?.name;
    if (!emoji) return;
    const action = await getReactionAction(guildId, emoji);
    if (!action) return;

    if (action !== "show_now") return; // V1: only implement show_now

    // 4) Role allowlist (can_react_show)
    const member = await msg.guild.members.fetch(user.id).catch(() => null);
    const roleIds = member ? Array.from(member.roles.cache.keys()) : [];
    // Admin/owner fallback OR role allowlist
    const isAdmin = hasAdministrator(member);

    let allowed = false;
    if (isAdmin) {
      allowed = true;
    } else {
      allowed = await canUserReactShow(guildId, roleIds);
    }

    if (!allowed) {
      await safeReact(msg, "🚫");

      const ownerUserId = Number(claim.owner_user_id);
      const eventId = crypto.randomUUID();

      const packet = {
        header: {
          id: eventId,
          type: "producer.card_rejected",
          ts: Date.now(),
          producer: "discord",
          platform: "discord",
          scope: { tenantId: ownerUserId },
        },
        payload: {
          reason: "unauthorized_role",
          source: {
            guild_id: String(guildId),
            channel_id: String(channelId),
            message_id: String(msg.id),
            author_id: String(user.id),
            author_name: String(msg.author?.username || ""),
          },
        },
      };

      await db.query(
        `
    INSERT INTO public.producer_outbox
      (event_id, target, owner_user_id, payload)
    VALUES
      ($1, 'overlay_gate', $2, $3::jsonb)
    ON CONFLICT (event_id, target) DO NOTHING
    `,
        [
          eventId,
          ownerUserId,
          JSON.stringify({
            tenantId: ownerUserId,
            packet,
          }),
        ]
      );

      return;
    }



    // 5) Build deterministic card from message
    const ttl = Number(chan.show_ttl_seconds || 12);
    const content = msg.content || "";
    const url = firstUrl(content);

    const attachments = Array.from(msg.attachments?.values?.() || []);
    let card;

    if (attachments.length > 0) {
      const a = attachments[0];
      card = {
        kind: "media",
        url: a.url,
        filename: a.name || null,
        content_type: a.contentType || null,
        text: content || null,
      };
    } else if (url) {
      card = { kind: "link", url, text: content || null };
    } else {
      card = { kind: "lower_third", text: content };
    }

    const ownerUserId = Number(claim.owner_user_id);
    const eventId = crypto.randomUUID();

    // Packet template (deliverer will set scope per overlay)
    const packet = {
      header: {
        id: eventId,
        type: "producer.card_show",
        ts: Date.now(),
        producer: "discord",
        platform: "discord",
        scope: { tenantId: ownerUserId, overlayPublicId: "__fill__" },
      },
      payload: {
        ttl,
        card,
        source: {
          guild_id: String(guildId),
          channel_id: String(channelId),
          message_id: String(msg.id),
          author_id: String(msg.author?.id || ""),
          author_name: String(msg.author?.username || ""),
        },
      },
    };

    await enqueueShowNow({ ownerUserId, eventId, packet });
    // UX: accepted
    await safeReact(msg, "📤");

    // Optional: remove the user's ✅ to keep channel clean (comment out if you prefer to keep it)
    // await safeRemoveUserReaction(reaction, user);

  } catch (err) {
    console.error("[discord-bot] reaction handler error:", err?.message || err);
  }
});

import express from "express";

const internalApp = express();

internalApp.get("/internal/guild/:guildId/structure", (req, res) => {
  try {
    if (!client.isReady()) {
      return res.status(503).json({ error: "bot_offline", channels: [], roles: [] });
    }

    const guild = client.guilds.cache.get(req.params.guildId);
    if (!guild) {
      return res.json({ channels: [], roles: [] });
    }

    const channels = guild.channels.cache
      .filter(c => c.isTextBased())
      .map(c => ({
        id: c.id,
        name: c.name
      }));

    const roles = guild.roles.cache
      .filter(r => !r.managed)
      .map(r => ({
        id: r.id,
        name: r.name
      }));

    res.json({ channels, roles });
  } catch (err) {
    console.error("[discord-bot] structure error:", err?.message || err);
    res.status(500).json({ channels: [], roles: [] });
  }
});

internalApp.listen(3025, "localhost", () => {
  console.log("[discord-bot] internal structure API on localhost:3025");
  if (typeof process.send === "function") {
    process.send("ready");
  }
});


client.login(TOKEN).catch((e) => {
  console.error("[discord-bot] login failed:", e?.message || e);
  // Do not exit, allow express to run so dashboard knows bot is dead instead of timing out
});

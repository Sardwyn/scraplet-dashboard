// /root/scrapletdashboard/routes/auth.js
console.log("*** auth.js LOADED (top-level login, always -> /dashboard) ***");

import express from "express";
import bcrypt from "bcrypt";
import db from "../db.js";
import validator from "validator";
import multer from "multer";

const router = express.Router();
const upload = multer({ dest: "public/uploads/" });

// ======================================================
// EMBED DETECTION
// ======================================================

function isEmbedRequest(req) {
  if (req.query?.embed === "1") return true;
  if (req.body?.embed === "1") return true;

  const ref = String(req.get("referer") || "");
  if (ref.includes("embed=1")) return true;

  const dest = String(req.get("sec-fetch-dest") || "").toLowerCase();
  if (dest === "iframe") return true;

  return false;
}

function withEmbedQuery(req, url) {
  if (!isEmbedRequest(req)) return url;
  return url.includes("?") ? `${url}&embed=1` : `${url}?embed=1`;
}

function wantsJSON(req) {
  return (
    req.xhr ||
    String(req.headers.accept || "").includes("application/json") ||
    String(req.headers["content-type"] || "").includes("application/json")
  );
}

// ======================================================
// LOGGING
// ======================================================

router.use((req, res, next) => {
  console.log(
    `[auth] ${req.method} ${req.originalUrl}`,
    "embed =",
    isEmbedRequest(req),
    "referer =",
    req.get("referer") || "—",
    "sec-fetch-dest =",
    req.get("sec-fetch-dest") || "—",
    "session user =",
    req.session?.user?.id || null
  );
  next();
});

// ======================================================
// SESSION HELPER
// ======================================================

router.get("/whoami", (req, res) => {
  return res.json({ user: req.session?.user || null });
});

// ======================================================
// LOGOUT
// ======================================================

function clearSessionCookies(req, res) {
  res.clearCookie("scraplet.sid", { path: "/" });
  res.clearCookie("connect.sid", { path: "/" }); // legacy/default name safety
}

function doLogout(req, res) {
  try {
    req.session?.destroy(() => {
      clearSessionCookies(req, res);
      return res.redirect("/auth/login");
    });
  } catch (e) {
    console.error("Logout error:", e);
    return res.redirect("/auth/login");
  }
}

router.get("/logout", (req, res) => doLogout(req, res));
router.post("/logout", (req, res) => doLogout(req, res));

// ======================================================
// SIGNUP
// ======================================================

router.get("/signup", (req, res) => {
  const embed = isEmbedRequest(req);

  res.render("signup", {
    embed,
    layout: embed ? "auth-embed" : undefined,
  });
});

router.post("/signup", async (req, res) => {
  let { email, username, password } = req.body;

  try {
    if (!email || !username || !password) {
      return res.status(400).send("All fields are required");
    }

    email = validator.normalizeEmail(email);
    username = validator.escape(String(username).trim());

    const existing = await db.query(
      "SELECT id FROM users WHERE email = $1 OR username = $2",
      [email, username]
    );

    if (existing.rows.length > 0) {
      return res.redirect(withEmbedQuery(req, "/auth/signup?error=exists"));
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const result = await db.query(
      `INSERT INTO users (email, username, password_hash)
       VALUES ($1, $2, $3)
       RETURNING id, email, username, display_name`,
      [email, username, hashedPassword]
    );

    const user = result.rows[0];

    req.session.user = {
      id: user.id,
      email: user.email,
      username: user.username,
    };

    // Signup goes through onboarding first.
    const target = withEmbedQuery(req, "/auth/onboard");

    if (isEmbedRequest(req)) {
      return res.render("auth/embed-success", { redirect: target });
    }

    return res.redirect(target);
  } catch (err) {
    console.error("Signup error:", err);
    return res.status(500).send("Signup failed");
  }
});

// ======================================================
// LOGIN
// ======================================================

router.get("/login", (req, res) => {
  const embed = isEmbedRequest(req);

  res.render("login", {
    embed,
    layout: embed ? "auth-embed" : undefined,
  });
});

router.post("/login", async (req, res) => {
  let { email, username, password } = req.body;

  const json = wantsJSON(req);

  if (!password || (!email && !username)) {
    if (json) return res.status(400).json({ success: false, error: "missing" });
    return res.redirect(withEmbedQuery(req, "/auth/login?error=missing"));
  }

  const identifier = (email || username || "").trim();
  const field = email ? "email" : "username";

  try {
    const result = await db.query(`SELECT * FROM users WHERE ${field} = $1`, [
      identifier,
    ]);

    if (result.rows.length === 0) {
      if (json) return res.status(401).json({ success: false, error: "invalid" });
      return res.redirect(withEmbedQuery(req, "/auth/login?error=invalid"));
    }

    const user = result.rows[0];
    const ok = await bcrypt.compare(password, user.password_hash);

    if (!ok) {
      if (json) return res.status(401).json({ success: false, error: "invalid" });
      return res.redirect(withEmbedQuery(req, "/auth/login?error=invalid"));
    }

    req.session.user = {
      id: user.id,
      email: user.email,
      username: user.username,
    };

    const needsOnboarding = !user.display_name;

    const target = needsOnboarding
      ? withEmbedQuery(req, "/auth/onboard")
      : "/dashboard";

    if (json) return res.json({ success: true, redirect: target });

    if (isEmbedRequest(req)) {
      return res.render("auth/embed-success", { redirect: target });
    }

    return res.redirect(target);
  } catch (err) {
    console.error("Login error:", err);
    return res.status(500).send("Login failed");
  }
});

// ======================================================
// ONBOARD
// ======================================================

router.get("/onboard", (req, res) => {
  if (!req.session.user) return res.redirect("/auth/login");

  const embed = isEmbedRequest(req);

  res.render("onboard", {
    user: req.session.user,
    embed,
    layout: embed ? "auth-embed" : undefined,
  });
});

router.post("/onboard", upload.single("avatar"), async (req, res) => {
  if (!req.session.user) return res.redirect("/auth/login");

  let { bio, tags, display_name } = req.body;
  const avatarPath = req.file ? `/uploads/${req.file.filename}` : null;

  const safeDisplayName = validator.escape(String(display_name || "").trim());
  const safeBio = validator.escape(String(bio || "").trim());

  const tagArray = String(tags || "")
    .split(",")
    .map((t) => validator.escape(t.trim()))
    .filter(Boolean);

  try {
    await db.query(
      `UPDATE users
       SET display_name = $1,
           bio = $2,
           tags = $3,
           avatar_url = COALESCE($4, avatar_url)
       WHERE id = $5`,
      [safeDisplayName, safeBio, tagArray, avatarPath, req.session.user.id]
    );

    const target = "/dashboard";

    if (isEmbedRequest(req)) {
      return res.render("auth/embed-success", { redirect: target });
    }

    return res.redirect(target);
  } catch (err) {
    console.error("Onboard error:", err);
    return res.status(500).send("Onboarding failed");
  }
});

export default router;

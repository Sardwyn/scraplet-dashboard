// /root/scrapletdashboard/utils/widgetTokens.js
import jwt from "jsonwebtoken";

function getSecret() {
  const secret =
    process.env.WIDGET_JWT_SECRET ||
    process.env.WIDGET_TOKEN_SECRET; // legacy/back-compat

  if (!secret || String(secret).length < 16) {
    console.warn(
      "[widgetTokens] Missing widget secret. Set WIDGET_JWT_SECRET (preferred) or WIDGET_TOKEN_SECRET (legacy)."
    );
    return null;
  }

  return String(secret);
}

export function mintWidgetToken({ userId, widgetId, ttlSec = 60 * 60 * 24 }) {
  const secret = getSecret();
  if (!secret) throw new Error("Widget secret missing");

  const payload = { sub: String(userId), wid: String(widgetId) };
  return jwt.sign(payload, secret, { algorithm: "HS256", expiresIn: ttlSec });
}

export function verifyWidgetToken(token) {
  const secret = getSecret();
  if (!secret) return null;

  try {
    return jwt.verify(String(token || ""), secret, { algorithms: ["HS256"] });
  } catch {
    return null;
  }
}

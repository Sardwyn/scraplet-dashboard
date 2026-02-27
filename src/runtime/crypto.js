// src/runtime/crypto.js
import crypto from "crypto";

/**
 * URL-safe random id (no symbols), good for public_id.
 */
export function randomId(len = 22) {
  // base64url is supported in modern Node; fallback if needed
  const buf = crypto.randomBytes(Math.ceil((len * 3) / 4));
  return buf
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "")
    .slice(0, len);
}

/**
 * Secret key used by Scrapbot to ingest messages.
 */
export function randomKey(len = 48) {
  return crypto.randomBytes(len).toString("hex"); // 2x len chars
}

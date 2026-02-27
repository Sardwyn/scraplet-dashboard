// services/kick/kickClient.js

import { getValidUserAccessToken } from "../kickUserTokens.js";

const KICK_API_BASE = process.env.KICK_API_BASE || "https://api.kick.com";

export class KickReauthRequired extends Error {
  constructor(userId) {
    super("Kick reauth required");
    this.code = "KICK_REAUTH_REQUIRED";
    this.userId = userId;
  }
}

export default class KickClient {
  constructor({ userId, accessToken }) {
    this.userId = userId;
    this.accessToken = accessToken;
  }

  static async forUser(userId) {
    try {
      const token = await getValidUserAccessToken(userId);
      return new KickClient({ userId, accessToken: token });
    } catch (err) {
      if (String(err?.message || "").toLowerCase().includes("reauth")) {
        throw new KickReauthRequired(userId);
      }
      throw err;
    }
  }

  async api(path, options = {}) {
    const url = `${KICK_API_BASE}${path}`;

    const resp = await fetch(url, {
      ...options,
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        ...(options.headers || {}),
      },
    });

    if (!resp.ok) {
      const text = await resp.text().catch(() => "");
      throw new Error(`Kick API error ${resp.status}: ${text}`);
    }

    const contentType = resp.headers.get("content-type") || "";
    if (contentType.includes("application/json")) return resp.json();
    return resp.text();
  }
}

#!/usr/bin/env node
/**
 * modsim.js — Flood + Swarm simulator for Scrapbot inbound kick route
 *
 * Examples:
 *  node tools/modsim.js swarm --target http://127.0.0.1:3030/api/inbound/kick --userId 4 --channel scraplet --broadcasterUserId 1017792 --secret "..." --users 15 --repeats 3 --interval 120 --text "free followers"
 *  node tools/modsim.js flood --target http://127.0.0.1:3030/api/inbound/kick --userId 4 --channel scraplet --broadcasterUserId 1017792 --secret "..." --messages 20 --interval 80 --text "SPam"
 *
 * Auth:
 *  - Sends header: x-scrapbot-secret
 *  - Secret source priority:
 *      1) --secret CLI arg
 *      2) process.env.SCRAPBOT_SHARED_SECRET
 *      3) .env file (auto loaded) if it contains SCRAPBOT_SHARED_SECRET
 */

import fs from 'fs';
import path from 'path';
import process from 'process';

// Load .env if present (best-effort)
try {
  const envPath = path.resolve(process.cwd(), '.env');
  if (fs.existsSync(envPath)) {
    const dotenv = await import('dotenv');
    dotenv.config({ path: envPath });
  }
} catch (_) {
  // ignore
}

const args = process.argv.slice(2);
const mode = (args[0] || '').toLowerCase();

function getArg(name, fallback = null) {
  const i = args.indexOf(`--${name}`);
  if (i === -1) return fallback;
  return args[i + 1] ?? fallback;
}

function getNum(name, fallback) {
  const v = getArg(name, null);
  if (v == null) return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function uuid() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

async function postJson(url, body, secret) {
  const headers = { 'Content-Type': 'application/json' };
  if (secret) headers['x-scrapbot-secret'] = secret;

  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });

  const text = await res.text();
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} ${res.statusText}: ${text}`);
  }

  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }

  if (data && data.ok === false) {
    throw new Error(data.error || text || 'Request failed');
  }

  return data;
}

/**
 * Payload format that inboundKick.js understands
 * (it looks for broadcasterUserId in req.body.*)
 */
function makeInboundPayload({
  scraplet_user_id,
  platform,
  channel_slug,
  broadcasterUserId,
  sender_username,
  sender_user_id,
  user_role,
  message_text,
}) {
  const b = Number(broadcasterUserId);
  const senderId = Number(sender_user_id);

  return {
    // Required routing
    scraplet_user_id,
    platform,
    channelSlug: channel_slug,

    // Broadcaster (ALL variants)
    broadcasterUserId: Number.isFinite(b) ? b : broadcasterUserId,
    broadcaster_user_id: Number.isFinite(b) ? b : broadcasterUserId,

    // 🔑 NORMALIZED FIELDS (THIS IS WHAT GUARDS READ)
    senderUserId: senderId,
    senderUsername: sender_username,
    userRole: user_role,
    text: message_text,
    message_id: uuid(),

    // Legacy/raw (safe to keep)
    sender_username,
    sender_user_id: String(senderId),
    message_text,

    _sim: true,
    _sim_ts: new Date().toISOString(),
  };
}


async function runSwarm(opts) {
  const {
    target, secret, scraplet_user_id, platform, channel_slug,
    broadcasterUserId, users, repeats, interval, text,
  } = opts;

  console.log(`[swarm] target=${target}`);
  console.log(`[swarm] userId=${scraplet_user_id} channel=${channel_slug} broadcasterUserId=${broadcasterUserId}`);
  console.log(`[swarm] users=${users} repeats=${repeats} interval=${interval}ms text="${text}"`);
  console.log(`[swarm] authHeader=${secret ? 'x-scrapbot-secret (set)' : 'NOT SET (will 401)'}`);

  const userPool = Array.from({ length: users }, (_, i) => ({
    id: 9000000 + i,
    name: `SwarmUser${String(i + 1).padStart(2, '0')}`,
  }));

  for (let r = 0; r < repeats; r++) {
    for (const u of userPool) {
      const payload = makeInboundPayload({
        scraplet_user_id,
        platform,
        channel_slug,
        broadcasterUserId,
        sender_username: u.name,
        sender_user_id: u.id,
        user_role: 'everyone',
        message_text: text,
      });

      try {
        await postJson(target, payload, secret);
      } catch (e) {
        console.error(`[swarm] post failed: ${e.message}`);
        process.exitCode = 1;
        return;
      }

      await sleep(Math.max(10, Math.floor(interval / 4)));
    }
    await sleep(interval);
  }

  console.log('[swarm] done');
}

async function runFlood(opts) {
  const {
    target, secret, scraplet_user_id, platform, channel_slug,
    broadcasterUserId, messages, interval, text, sender,
  } = opts;

  console.log(`[flood] target=${target}`);
  console.log(`[flood] userId=${scraplet_user_id} channel=${channel_slug} broadcasterUserId=${broadcasterUserId}`);
  console.log(`[flood] messages=${messages} interval=${interval}ms text="${text}" sender=${sender}`);
  console.log(`[flood] authHeader=${secret ? 'x-scrapbot-secret (set)' : 'NOT SET (will 401)'}`);

  const senderId = 9100000;
  const senderName = sender || 'FloodUser01';

  for (let i = 0; i < messages; i++) {
    const payload = makeInboundPayload({
      scraplet_user_id,
      platform,
      channel_slug,
      broadcasterUserId,
      sender_username: senderName,
      sender_user_id: senderId,
      user_role: 'everyone',
      message_text: text,
    });

    try {
      await postJson(target, payload, secret);
    } catch (e) {
      console.error(`[flood] post failed: ${e.message}`);
      process.exitCode = 1;
      return;
    }

    await sleep(interval);
  }

  console.log('[flood] done');
}

(async function main() {
  const target = getArg('target', 'http://127.0.0.1:3030/api/inbound/kick');
  const scraplet_user_id = getNum('userId', 4);
  const channel_slug = getArg('channel', 'scraplet');
  const platform = getArg('platform', 'kick');

  // NEW: broadcasterUserId (required to avoid your kickChatSend error)
  const broadcasterUserId = getNum('broadcasterUserId', null);

  // NEW: secret support (your CLI arg now actually works)
  const secret =
    getArg('secret', null) ||
    process.env.SCRAPBOT_SHARED_SECRET ||
    '';

  if (!mode || !['swarm', 'flood'].includes(mode)) {
    console.log('Usage: node tools/modsim.js <swarm|flood> [--target URL] [--userId N] [--channel slug] [--broadcasterUserId N] [--secret S] ...');
    process.exit(1);
  }

  if (!broadcasterUserId) {
    console.error('[modsim] ERROR: --broadcasterUserId is required (this is why you keep seeing missing/invalid broadcasterUserId).');
    process.exit(1);
  }

  if (mode === 'swarm') {
    await runSwarm({
      target,
      secret,
      scraplet_user_id,
      platform,
      channel_slug,
      broadcasterUserId,
      users: getNum('users', 15),
      repeats: getNum('repeats', 8),
      interval: getNum('interval', 120),
      text: getArg('text', 'free followers'),
    });
  }

  if (mode === 'flood') {
    await runFlood({
      target,
      secret,
      scraplet_user_id,
      platform,
      channel_slug,
      broadcasterUserId,
      messages: getNum('messages', 20),
      interval: getNum('interval', 120),
      text: getArg('text', 'SPam'),
      sender: getArg('sender', 'FloodUser01'),
    });
  }
})();

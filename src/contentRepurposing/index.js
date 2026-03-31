// src/contentRepurposing/index.js
// Content repurposing pipeline — generates post-session content packs.

import db from '../../db.js';
import llmClient from '../../services/llmClient.js';

// ── Pure functions ────────────────────────────────────────────────────────────

/**
 * Check if a session meets the minimum threshold for content pack generation.
 * @param {object} session - stream_sessions row
 * @param {number} highlightCount
 * @returns {boolean}
 */
export function meetsThreshold(session, highlightCount) {
  try {
    const duration = Number(session?.duration_minutes ?? 0);
    return duration >= 30 && highlightCount >= 1;
  } catch { return false; }
}

/**
 * Validate a Twitter thread — each tweet must be <= 280 chars.
 * @param {string[]} tweets
 * @returns {{ valid: boolean, violations: number[] }}
 */
export function validateThread(tweets) {
  try {
    if (!Array.isArray(tweets)) return { valid: false, violations: [] };
    const violations = tweets
      .map((t, i) => (String(t).length > 280 ? i : -1))
      .filter(i => i >= 0);
    return { valid: violations.length === 0, violations };
  } catch { return { valid: false, violations: [] }; }
}

// ── Data assembler ────────────────────────────────────────────────────────────

export async function assembleSessionData(sessionId) {
  try {
    // Session
    const { rows: sessions } = await db.query(
      `SELECT ss.*, ea.user_id,
         c.game_name
       FROM stream_sessions ss
       JOIN channels c ON c.channel_slug = ss.channel_slug
       JOIN external_accounts ea ON ea.id = c.account_id
       WHERE ss.session_id = $1`,
      [sessionId]
    );
    if (!sessions.length) return null;
    const session = sessions[0];

    // Highlights
    const { rows: highlights } = await db.query(
      `SELECT signal, magnitude, detected_at, context_json
       FROM stream_highlights
       WHERE session_id = $1
       ORDER BY detected_at ASC`,
      [sessionId]
    );

    if (!meetsThreshold(session, highlights.length)) return null;

    // Top chatters
    const { rows: chatters } = await db.query(
      `SELECT actor_username, COUNT(*) AS msg_count
       FROM chat_messages
       WHERE channel_slug = $1
         AND ts BETWEEN $2 AND COALESCE($3, NOW())
       GROUP BY actor_username
       ORDER BY msg_count DESC
       LIMIT 5`,
      [session.channel_slug, session.started_at, session.ended_at]
    );

    // Stake stats (optional)
    let stakeStats = null;
    try {
      const { rows: stake } = await db.query(
        `SELECT MAX(last_win) AS biggest_win,
                MIN(session_pnl) AS biggest_loss,
                (SELECT session_pnl FROM stake_session_events
                 WHERE session_id = $1 ORDER BY received_at DESC LIMIT 1) AS net_pnl
         FROM stake_session_events WHERE session_id = $1`,
        [sessionId]
      );
      if (stake[0]?.biggest_win) {
        stakeStats = {
          biggestWin: parseFloat(stake[0].biggest_win),
          biggestLoss: parseFloat(stake[0].biggest_loss),
          netPnl: parseFloat(stake[0].net_pnl),
        };
      }
    } catch { /* optional */ }

    return {
      session,
      userId: session.user_id,
      highlights,
      topChatters: chatters,
      stakeStats,
      gameName: session.game_name || null,
    };
  } catch (err) {
    console.error('[contentRepurposing] assembleSessionData error:', err.message);
    return null;
  }
}

// ── Content generator ─────────────────────────────────────────────────────────

const VOICE_RULES = `You are Scrapbot. Rules:
- Use specific numbers from the data
- Direct language, no hedging
- No corporate phrases like "amazing" or "incredible" without a stat
- Keep it punchy and in character`;

async function llmGenerate(prompt, maxTokens = 400) {
  const resp = await llmClient.chat.completions.create({
    model: 'scrapbot',
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.7,
    max_tokens: maxTokens,
  });
  return resp.choices[0]?.message?.content?.trim() || '';
}

export async function generateTwitterThread(input) {
  const { session, highlights, stakeStats, gameName, topChatters } = input;
  const topHighlight = highlights[0];
  const statsLine = `${Math.round(session.duration_minutes)}min stream, peak ${session.peak_ccv || '?'} viewers, ${session.messages_per_minute || '?'} MPM`;
  const stakeStr = stakeStats ? ` Biggest win: $${stakeStats.biggestWin?.toFixed(2)}, net P&L: $${stakeStats.netPnl?.toFixed(2)}.` : '';
  const gameStr = gameName ? ` Playing ${gameName}.` : '';

  const prompt = `${VOICE_RULES}

Generate a Twitter/X thread (3-5 tweets) about this stream session.
Session: ${statsLine}.${gameStr}${stakeStr}
Top highlight: ${topHighlight?.signal || 'engagement spike'} at ${topHighlight?.detected_at ? new Date(topHighlight.detected_at).toLocaleTimeString() : 'unknown time'}.
Top chatters: ${topChatters.map(c => c.actor_username).join(', ')}.

Format as JSON array of tweet strings. Each tweet MUST be under 280 characters.
First tweet is the hook. Last tweet is a call to action (follow/subscribe).
Example: ["Hook tweet here", "Detail tweet", "CTA tweet"]

Respond with ONLY the JSON array.`;

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const raw = await llmGenerate(prompt, 500);
      const match = raw.match(/\[[\s\S]*\]/);
      if (!match) continue;
      const tweets = JSON.parse(match[0]);
      if (!Array.isArray(tweets) || tweets.length < 3) continue;
      const { valid, violations } = validateThread(tweets);
      if (valid) return tweets;
      // Truncate violating tweets
      return tweets.map((t, i) => violations.includes(i) ? t.slice(0, 277) + '...' : t);
    } catch { continue; }
  }
  // Fallback
  return [
    `Stream recap: ${statsLine}.${gameStr}`,
    stakeStats ? `Gambling session: biggest win $${stakeStats.biggestWin?.toFixed(2)}, net P&L $${stakeStats.netPnl?.toFixed(2)}.` : `Top chatters: ${topChatters.slice(0,3).map(c=>c.actor_username).join(', ')}.`,
    `Follow for more. Stream is live regularly.`,
  ];
}

export async function generateShortsScript(input) {
  const { session, highlights, stakeStats, gameName } = input;
  const topHighlight = highlights[0];

  const prompt = `${VOICE_RULES}

Generate a YouTube Shorts script (30 seconds spoken) based on this stream highlight.
Highlight: ${topHighlight?.signal || 'big moment'} during a ${Math.round(session.duration_minutes)}min stream.
${gameName ? `Game: ${gameName}.` : ''}
${stakeStats ? `Biggest win: $${stakeStats.biggestWin?.toFixed(2)}.` : ''}

Respond with JSON: {"title": "...", "description": "...", "hashtags": ["...", "..."], "script": "..."}
Title must be under 100 chars. Description under 500 chars. 3-8 hashtags. Script is 30s spoken content.`;

  try {
    const raw = await llmGenerate(prompt, 400);
    const match = raw.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]);
  } catch { /* fallback */ }

  return {
    title: `Stream Highlight — ${gameName || 'Live Stream'}`,
    description: `${Math.round(session.duration_minutes)} minute stream. Peak ${session.peak_ccv || '?'} viewers.`,
    hashtags: ['streaming', 'live', gameName?.toLowerCase().replace(/\s+/g, '') || 'gaming'].filter(Boolean),
    script: `Here's what happened on stream today. ${topHighlight?.signal || 'Big moment'} with ${session.peak_ccv || '?'} viewers watching.`,
  };
}

export async function generateDiscordRecap(input) {
  const { session, highlights, stakeStats, gameName, topChatters } = input;

  const prompt = `${VOICE_RULES}

Write a Discord community recap for this stream session.
Duration: ${Math.round(session.duration_minutes)} minutes.
Peak viewers: ${session.peak_ccv || '?'}.
MPM: ${session.messages_per_minute || '?'}.
${gameName ? `Game: ${gameName}.` : ''}
${stakeStats ? `Stake session: biggest win $${stakeStats.biggestWin?.toFixed(2)}, net P&L $${stakeStats.netPnl?.toFixed(2)}.` : ''}
Top chatters: ${topChatters.map(c => `${c.actor_username} (${c.msg_count} msgs)`).join(', ')}.
Highlights: ${highlights.map(h => h.signal).join(', ') || 'none'}.

Write a short, punchy Discord message (not an embed, just text). Include stats, shout out top chatters, tease next stream.
Keep it under 300 characters.`;

  try {
    return await llmGenerate(prompt, 200);
  } catch {
    return `Stream done. ${Math.round(session.duration_minutes)}min, peak ${session.peak_ccv || '?'} viewers. Top chatters: ${topChatters.slice(0,3).map(c=>c.actor_username).join(', ')}. Back soon.`;
  }
}

// ── Main pipeline ─────────────────────────────────────────────────────────────

export async function generateContentPack(sessionId) {
  try {
    // Deduplication check
    const { rows: existing } = await db.query(
      `SELECT pack_id FROM content_packs WHERE session_id = $1`,
      [sessionId]
    );
    if (existing.length) {
      console.log(`[contentRepurposing] pack already exists for session ${sessionId}`);
      return null;
    }

    const input = await assembleSessionData(sessionId);
    if (!input) {
      console.log(`[contentRepurposing] session ${sessionId} doesn't meet threshold or not found`);
      return null;
    }

    console.log(`[contentRepurposing] generating pack for session ${sessionId}...`);

    const [twitterThread, shortsScript, discordRecap] = await Promise.all([
      generateTwitterThread(input),
      generateShortsScript(input),
      generateDiscordRecap(input),
    ]);

    // Store pack
    const { rows: [pack] } = await db.query(
      `INSERT INTO content_packs
         (user_id, session_id, twitter_thread, shorts_script, discord_recap, status)
       VALUES ($1, $2, $3, $4, $5, 'generated')
       RETURNING pack_id`,
      [input.userId, sessionId, JSON.stringify(twitterThread), JSON.stringify(shortsScript), discordRecap]
    );

    console.log(`[contentRepurposing] pack ${pack.pack_id} generated for session ${sessionId}`);
    return { packId: pack.pack_id, twitterThread, shortsScript, discordRecap, input };
  } catch (err) {
    console.error('[contentRepurposing] generateContentPack error:', err.message);
    return null;
  }
}

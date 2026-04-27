// services/streamDebrief.js
// Sends a post-stream debrief to Discord when a session ends.
// Pulls session stats, highlights, top chatters, then generates
// a Scrapbot-style summary via vLLM and posts to the configured channel.

import db from '../db.js';
import llmClient from './llmClient.js';

const DASHBOARD_BASE = process.env.DASHBOARD_INTERNAL_URL || 'http://127.0.0.1:3000';
const BOT_INTERNAL_PORT = process.env.BOT_INTERNAL_PORT || 3025;

async function notifyBot(payload) {
  try {
    const resp = await fetch(`http://127.0.0.1:${BOT_INTERNAL_PORT}/internal/debrief`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(5000),
    });
    return resp.ok;
  } catch (e) {
    console.error('[streamDebrief] notify bot failed:', e.message);
    return false;
  }
}


// ── Stake session stats ───────────────────────────────────────────────────────
async function getStakeStats(sessionId) {
  if (!sessionId) return null;
  try {
    const { rows } = await db.query(
      `SELECT
         MAX(last_win)   AS biggest_win,
         MIN(session_pnl) AS biggest_loss,
         (SELECT session_pnl FROM public.stake_session_events
          WHERE session_id = $1 ORDER BY received_at DESC LIMIT 1) AS net_pnl,
         COUNT(*)        AS event_count
       FROM public.stake_session_events
       WHERE session_id = $1`,
      [sessionId]
    );
    if (!rows[0] || rows[0].event_count === '0') return null;
    return {
      biggestWin:  rows[0].biggest_win  ? parseFloat(rows[0].biggest_win)  : null,
      biggestLoss: rows[0].biggest_loss ? parseFloat(rows[0].biggest_loss) : null,
      netPnl:      rows[0].net_pnl      ? parseFloat(rows[0].net_pnl)      : null,
    };
  } catch (e) {
    console.warn('[streamDebrief] stake stats error:', e.message);
    return null;
  }
}

export async function sendStreamDebrief(sessionId, channelSlug) {
  try {
    // Get session stats
    const { rows: sessions } = await db.query(
      `SELECT ss.*, ea.user_id
       FROM public.stream_sessions ss
       JOIN public.channels c ON c.channel_slug = ss.channel_slug
       JOIN public.external_accounts ea ON ea.id = c.account_id
       WHERE ss.session_id = $1`,
      [sessionId]
    );
    if (!sessions.length) return;
    const session = sessions[0];
    const userId = session.user_id;

    // Get guild settings
    const { rows: guildRows } = await db.query(
      `SELECT sgs.* FROM public.scrapbot_guild_settings sgs
       JOIN public.discord_guild_integrations dgi ON dgi.guild_id = sgs.guild_id
       WHERE dgi.owner_user_id = $1 AND dgi.status = 'active'
         AND sgs.debrief_enabled = true
         AND sgs.debrief_channel_id IS NOT NULL
       LIMIT 1`,
      [userId]
    );
    if (!guildRows.length) return; // debrief not configured
    const settings = guildRows[0];

    // Get highlights for this session
    const { rows: highlights } = await db.query(
      `SELECT trigger_signal, magnitude, peak_mpm, baseline_mpm, triggered_at, clip_tagged
       FROM public.stream_highlights
       WHERE session_id = $1
       ORDER BY triggered_at ASC`,
      [sessionId]
    );

    // Get top chatters
    const { rows: chatters } = await db.query(
      `SELECT cm.sender_username, COUNT(*) as msg_count
       FROM public.chat_messages cm
       JOIN public.channels c ON c.channel_slug = cm.channel_slug
       WHERE c.channel_slug = $1
         AND cm.created_at BETWEEN $2 AND COALESCE($3, now())
       GROUP BY cm.sender_username
       ORDER BY msg_count DESC LIMIT 5`,
      [channelSlug, session.started_at, session.ended_at]
    );

    // Build data summary for LLM
    const dur = session.duration_minutes ? `${Math.round(session.duration_minutes)} min` : 'unknown duration';
    const msgs = session.total_messages || 0;
    const chatters_count = session.unique_chatters || 0;
    const mpm = session.messages_per_minute ? session.messages_per_minute.toFixed(1) : '?';
    const peak = session.peak_ccv || '?';

    const highlightSummary = highlights.length
      ? highlights.map((h, i) =>
          `${i + 1}. ${h.trigger_signal.replace('_', ' ')} at ${new Date(h.triggered_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} — ${h.magnitude}x baseline (${h.peak_mpm} msg/min)${h.clip_tagged ? ' 📎 clipped' : ''}`
        ).join('\n')
      : 'No significant spikes detected.';

    const topChatterStr = chatters.length
      ? chatters.map(c => `${c.sender_username} (${c.msg_count})`).join(', ')
      : 'No data';

    const stakeStats = await getStakeStats(sessionId).catch(() => null);
    const stakeBlock = stakeStats ? `\nStake session: biggest win $${(stakeStats.biggestWin||0).toFixed(2)}, biggest loss $${Math.abs(stakeStats.biggestLoss||0).toFixed(2)}, net P&L ${stakeStats.netPnl >= 0 ? '+' : ''}$${(stakeStats.netPnl||0).toFixed(2)}` : '';

    const dataBlock = `Stream: ${channelSlug} | Duration: ${dur} | Messages: ${msgs} | Unique chatters: ${chatters_count} | Avg msg/min: ${mpm} | Peak CCV: ${peak}\n\nHighlights:\n${highlightSummary}\n\nTop chatters: ${topChatterStr}${stakeBlock}`;

    // Generate Scrapbot debrief via vLLM
    let debriefText = null;
    try {
      const prompt = [
        { role: 'system', content: 'You are Scrapbot. Write a punchy post-stream debrief in your signature style — mischievous, sharp, genuinely useful. 3-5 sentences max. No markdown headers. Reference the actual numbers.' },
        { role: 'user', content: `Write a stream debrief for this session:\n\n${dataBlock}` },
      ];
      debriefText = await llmClient.chat(prompt, { max_tokens: 300, temperature: 0.85 });
    } catch (e) {
      console.error('[streamDebrief] LLM failed:', e.message);
      // Fallback to plain stats if LLM is down
      debriefText = `Stream wrapped. ${dur}, ${msgs} messages, ${chatters_count} unique chatters at ${mpm} msg/min. ${highlights.length} highlight moment${highlights.length !== 1 ? 's' : ''} detected.`;
    }

    // Send to bot for Discord delivery
    await notifyBot({
      channel_id: settings.debrief_channel_id,
      guild_id: settings.guild_id,
      debrief_text: debriefText,
      stats: { dur, msgs, chatters_count, mpm, peak, highlights_count: highlights.length },
      highlights,
      top_chatters: chatters,
    });

    console.log('[streamDebrief] sent for session', sessionId);
  } catch (e) {
    console.error('[streamDebrief] error:', e.message);
  }
}

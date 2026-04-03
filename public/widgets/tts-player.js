// public/widgets/tts-player.js
// TTS Player widget runtime — runs as an OBS browser source.
// Connects to the TTS SSE stream and plays audio when jobs are ready.
// Self-contained, no imports.

(function () {
  'use strict';

  // Config from URL params (set by overlay runtime)
  const qs = new URLSearchParams(location.search);
  const platform        = qs.get('platform') || 'kick';
  const channel         = qs.get('channel') || '';
  const showNotif       = qs.get('showNotification') !== 'false';
  const notifPos        = qs.get('notificationPos') || 'bottom-left';
  const notifStyle      = qs.get('notificationStyle') || 'dark';
  const acceptFree      = qs.get('acceptFree') !== 'false';
  const acceptPaid      = qs.get('acceptPaid') !== 'false';
  const volume          = Math.min(100, Math.max(0, parseInt(qs.get('volume') || '100'))) / 100;

  if (!channel) {
    console.warn('[TTS Widget] No channel configured');
    return;
  }

  // ── Audio element ─────────────────────────────────────────────────────────
  const audio = document.createElement('audio');
  audio.preload = 'auto';
  audio.volume = volume;
  document.body.appendChild(audio);

  // ── Notification bar ──────────────────────────────────────────────────────
  let notifEl = null;
  if (showNotif) {
    const styles = {
      dark:  { bg: 'rgba(0,0,0,0.75)', color: '#fff', border: 'rgba(255,255,255,0.1)' },
      light: { bg: 'rgba(255,255,255,0.9)', color: '#111', border: 'rgba(0,0,0,0.1)' },
      neon:  { bg: 'rgba(10,0,30,0.85)', color: '#a5b4fc', border: '#6366f1' },
    };
    const s = styles[notifStyle] || styles.dark;
    const posMap = {
      'bottom-left':  'bottom:16px;left:16px;',
      'bottom-right': 'bottom:16px;right:16px;',
      'top-left':     'top:16px;left:16px;',
      'top-right':    'top:16px;right:16px;',
    };

    notifEl = document.createElement('div');
    notifEl.style.cssText = `
      position:fixed;${posMap[notifPos] || posMap['bottom-left']}
      background:${s.bg};color:${s.color};
      border:1px solid ${s.border};
      padding:8px 14px;border-radius:10px;
      font-family:system-ui,sans-serif;font-size:13px;
      backdrop-filter:blur(8px);
      display:none;max-width:400px;
      animation:tts-slide-in 0.3s ease;
      z-index:9999;
    `;
    document.head.insertAdjacentHTML('beforeend', `
      <style>
        @keyframes tts-slide-in { from { opacity:0; transform:translateY(8px); } to { opacity:1; transform:translateY(0); } }
      </style>
    `);
    document.body.appendChild(notifEl);
  }

  function showNotification(sender, text, voiceName) {
    if (!notifEl) return;
    notifEl.innerHTML = `<strong>🎙️ ${escHtml(sender || 'Anonymous')}</strong>: ${escHtml(text || '')}`;
    notifEl.style.display = 'block';
    clearTimeout(notifEl._timer);
    notifEl._timer = setTimeout(() => { notifEl.style.display = 'none'; }, 6000);
  }

  // ── Job queue ─────────────────────────────────────────────────────────────
  const queue = [];
  let playing = false;

  function enqueue(job) {
    queue.push(job);
    if (!playing) playNext();
  }

  function playNext() {
    if (!queue.length) { playing = false; return; }
    playing = true;
    const job = queue.shift();

    if (job.audioUrl) {
      audio.src = job.audioUrl;
      audio.volume = volume;
      showNotification(job.senderUsername, job.messageText, job.voiceName);
      audio.play().catch(e => console.warn('[TTS Widget] play error:', e.message));
      audio.onended = playNext;
      audio.onerror = playNext;
    } else {
      playNext();
    }
  }

  // ── SSE connection ────────────────────────────────────────────────────────
  // Supports two modes:
  //   1. Overlay runtime mode: token provided → listen on /w/:token/stream for tts.ready packets
  //   2. Legacy mode: channel provided (no token) → listen on /api/tts/stream

  const token = cfg.token || window.__WIDGET_TOKEN__ || qs.get('token') || '';

  function handleOverlayPacket(packet) {
    try {
      const payload = packet.payload || {};
      // Filter by tier
      const isFree = payload.source === 'free_tts' || payload.priority === 0 || (!payload.source && !payload.priority);
      const isPaid = payload.source === 'paid_tts' || payload.priority === 100;
      if (isFree && !acceptFree) return;
      if (isPaid && !acceptPaid) return;
      enqueue({
        audioUrl:       payload.audioUrl || payload.audio_url,
        senderUsername: payload.senderUsername || payload.requested_by_username || 'Anonymous',
        messageText:    payload.messageText || payload.text_sanitized || payload.text || '',
        voiceName:      payload.voiceId || payload.voice_id || 'default',
        jobId:          payload.jobId || payload.id,
      });
    } catch (err) {
      console.warn('[TTS Widget] overlay packet parse error:', err.message);
    }
  }

  function connectOverlayRuntime() {
    const url = '/w/' + encodeURIComponent(token) + '/stream';
    const es = new EventSource(url);
    es.addEventListener('message', function (e) {
      try {
        const packet = JSON.parse(e.data);
        if (packet.header && packet.header.type === 'tts.ready') {
          handleOverlayPacket(packet);
        }
      } catch (err) {
        console.warn('[TTS Widget] parse error:', err.message);
      }
    });
    es.onerror = function () { es.close(); setTimeout(connectOverlayRuntime, 5000); };
    console.log('[TTS Widget] connected to overlay runtime stream', url.slice(0, 30) + '...');
  }

  function connectLegacy() {
    const url = `/api/tts/stream?platform=${encodeURIComponent(platform)}&channel=${encodeURIComponent(channel)}&consumer=widget:tts`;
    const es = new EventSource(url);
    es.addEventListener('tts_ready', function (e) {
      try {
        const job = JSON.parse(e.data);
        const isFree = job.source === 'free_tts' || job.priority === 0;
        const isPaid = job.source === 'paid_tts' || job.priority === 100;
        if (isFree && !acceptFree) return;
        if (isPaid && !acceptPaid) return;
        enqueue({
          audioUrl:       job.audio_url || job.audioUrl,
          senderUsername: job.requested_by_username || job.sender || 'Anonymous',
          messageText:    job.text_sanitized || job.text || '',
          voiceName:      job.voice_id || 'default',
          jobId:          job.id,
        });
      } catch (err) {
        console.warn('[TTS Widget] parse error:', err.message);
      }
    });
    es.onerror = function () { es.close(); setTimeout(connectLegacy, 5000); };
    console.log('[TTS Widget] connected to legacy stream', url);
  }

  if (token) {
    connectOverlayRuntime();
  } else if (channel) {
    connectLegacy();
  } else {
    console.warn('[TTS Widget] No token or channel — cannot connect');
  }

  function escHtml(s) {
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  console.log('[TTS Widget] started — channel:', channel, 'platform:', platform);
})();

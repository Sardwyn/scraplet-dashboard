// public/widgets/chat-overlay.js
// Chat Overlay widget runtime v2 — full feature set.
// Reads config from window.__WIDGET_CONFIG_CHAT_OVERLAY__
// Connects to /w/:token/stream SSE and renders chat messages.

(function () {
  'use strict';

  const cfg = window.__WIDGET_CONFIG_CHAT_OVERLAY__ || {};
  const token = cfg.token || window.__WIDGET_TOKEN__ || '';
  console.log('[chat-overlay] INIT cfg keys:', Object.keys(cfg), 'token:', token ? token.slice(0,15)+'...' : 'EMPTY', 'editorPreview:', cfg.editorPreview);

  // Config with defaults
  const fontName        = cfg.fontFamily || 'Inter';
  const fontFamily      = `${fontName}, system-ui, sans-serif`;
  // Load font from Google Fonts (dedupe by removing old link first)
  if (fontName && fontName !== 'system-ui') {
    const existingLink = document.querySelector('link[data-gfont]');
    if (existingLink) existingLink.remove();
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.setAttribute('data-gfont', fontName);
    link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(fontName)}:wght@400;600;700&display=swap`;
    document.head.appendChild(link);
  }
  const fontSizePx      = parseInt(cfg.fontSizePx)  || 16;
  const lineHeight      = parseFloat(cfg.lineHeight) || 1.4;
  const messageGapPx    = parseInt(cfg.messageGapPx) || 6;
  const nameColor       = cfg.nameColor       || '#a5b4fc';
  const nameColorMode   = cfg.nameColorMode   || 'custom'; // 'custom' | 'platform' | 'user'
  const messageColor    = cfg.messageColor    || '#ffffff';
  const showAvatars     = cfg.showAvatars !== false && cfg.showAvatars !== 'false';
  const showPlatformIcon= cfg.showPlatformIcon !== false && cfg.showPlatformIcon !== 'false';
  const shadow          = cfg.shadow !== false && cfg.shadow !== 'false';
  const animateIn       = cfg.animateIn !== false && cfg.animateIn !== 'false';
  const bubbleEnabled   = cfg.bubbleEnabled === true || cfg.bubbleEnabled === 'true';
  const bubbleRadiusPx  = parseInt(cfg.bubbleRadiusPx) || 8;
  const bubbleBg        = cfg.bubbleBg        || 'rgba(0,0,0,0.4)';
  const bubbleBorder    = cfg.bubbleBorder    || 'transparent';
  const maxMessages     = parseInt(cfg.limitsMaxMessages) || 20;
  const fadeMs          = parseInt(cfg.limitsFadeMs) || 0;
  const enableKick      = cfg.enableKick !== false && cfg.enableKick !== 'false';
  const enableYoutube   = cfg.enableYoutube !== false && cfg.enableYoutube !== 'false';
  const enableTwitch    = cfg.enableTwitch !== false && cfg.enableTwitch !== 'false';
  const bufferMax       = parseInt(cfg.bufferMax) || 120;
  const glowEnabled     = cfg.glowEnabled === true || cfg.glowEnabled === 'true';
  const glowColor       = cfg.glowColor || '#a5b4fc';
  const glowBlur        = parseInt(cfg.glowBlur) || 8;
  const depthEnabled    = cfg.depthEnabled === true || cfg.depthEnabled === 'true';
  const depthOffset     = parseInt(cfg.depthOffset) || 2;
  const depthColor      = cfg.depthColor || 'rgba(0,0,0,0.5)';

  const PLATFORM_COLORS = { kick: '#53fc18', youtube: '#ff0000', twitch: '#9146ff' };
  const PLATFORM_ICONS  = { kick: '🟢', youtube: '▶️', twitch: '💜' };

  const editorPreview = cfg.editorPreview === true || cfg.editorPreview === 'true';

  if (!token && !editorPreview) {
    console.warn('[chat-overlay] No token — add widget to overlay and configure');
    return;
  }

  if (token) window.__WIDGET_TOKEN__ = token;

  // ── DOM setup ─────────────────────────────────────────────────────────────
  function applyContainerStyles(el, position) {
    el.style.cssText = `
      position: ${position}; inset: 0;
      display: flex; flex-direction: column-reverse;
      padding: 12px; gap: ${messageGapPx}px;
      overflow: hidden; pointer-events: none;
      font-family: ${fontFamily};
      font-size: ${fontSizePx}px;
      line-height: ${lineHeight};
    `;
  }

  let container;

  if (editorPreview) {
    // Wait for React to render the scoped container div, then initialise
    function findAndInit() {
      const root = document.querySelector('[data-widget-editor-preview="chat-overlay"]');
      if (root) {
        container = root;
        applyContainerStyles(container, 'relative');
        init();
      } else {
        requestAnimationFrame(findAndInit);
      }
    }
    findAndInit();
    return; // init() called async once container is found
  } else {
    container = document.createElement('div');
    container.id = 'chat-overlay-root';
    applyContainerStyles(container, 'fixed');
    document.body.style.background = 'transparent';
    document.body.appendChild(container);
  }


  function init() {
  // ── CSS ───────────────────────────────────────────────────────────────────
  const style = document.createElement('style');
  style.textContent = `
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600&display=swap');

    .cm {
      display: flex;
      align-items: flex-start;
      gap: 8px;
      max-width: 100%;
      word-break: break-word;
      ${bubbleEnabled ? `
        background: ${bubbleBg};
        border: 1px solid ${bubbleBorder};
        border-radius: ${bubbleRadiusPx}px;
        padding: 5px 10px;
      ` : ''}
      ${animateIn ? 'animation: cm-in 0.25s ease;' : ''}
    }
    .cm-avatar {
      width: 24px; height: 24px; border-radius: 50%;
      object-fit: cover; flex-shrink: 0; margin-top: 2px;
    }
    .cm-avatar-placeholder {
      width: 24px; height: 24px; border-radius: 50%;
      background: rgba(255,255,255,0.15); flex-shrink: 0;
    }
    .cm-platform { font-size: 12px; flex-shrink: 0; margin-top: 2px; }
    .cm-name {
      font-weight: 600; flex-shrink: 0;
      ${shadow ? 'text-shadow: 0 1px 3px rgba(0,0,0,0.8);' : ''}
      ${glowEnabled ? `text-shadow: 0 0 ${glowBlur}px ${glowColor}, 0 1px 3px rgba(0,0,0,0.8);` : ''}
      ${depthEnabled ? `text-shadow: ${depthOffset}px ${depthOffset}px 0 ${depthColor}, 0 1px 3px rgba(0,0,0,0.8);` : ''}
    }
    .cm-text {
      color: ${messageColor};
      ${shadow ? 'text-shadow: 0 1px 3px rgba(0,0,0,0.8);' : ''}
      ${depthEnabled ? `text-shadow: ${depthOffset}px ${depthOffset}px 0 ${depthColor};` : ''}
    }
    .cm-fade { animation: cm-fade 0.5s ease forwards; }
    @keyframes cm-in { from { opacity:0; transform:translateX(-10px); } to { opacity:1; transform:translateX(0); } }
    @keyframes cm-fade { to { opacity:0; } }
  `;
  document.head.appendChild(style);

  // ── Message rendering ─────────────────────────────────────────────────────
  const messages = [];

  function addMessage({ username, text, platform, avatar, color }) {
    // Platform filter
    if (platform === 'kick'    && !enableKick)    return;
    if (platform === 'youtube' && !enableYoutube) return;
    if (platform === 'twitch'  && !enableTwitch)  return;

    const el = document.createElement('div');
    el.className = 'cm';

    let html = '';

    // Avatar — show image if available, placeholder circle if not, nothing if disabled
    if (showAvatars) {
      if (avatar) {
        html += `<img class="cm-avatar" src="${escHtml(avatar)}" alt="${escHtml(username)}" onerror="this.outerHTML='<div class=cm-avatar-placeholder></div>'" />`;
      } else {
        html += `<div class="cm-avatar-placeholder"></div>`;
      }
    }

    // Platform icon
    if (showPlatformIcon && platform) {
      html += `<span class="cm-platform" title="${escHtml(platform)}">${PLATFORM_ICONS[platform] || '💬'}</span>`;
    }

    // Name + message
    let nameCol;
    if (nameColorMode === 'user') {
      nameCol = color || PLATFORM_COLORS[platform] || nameColor;
    } else if (nameColorMode === 'platform') {
      nameCol = PLATFORM_COLORS[platform] || nameColor;
    } else {
      nameCol = nameColor;
    }
    html += `<span class="cm-name" style="color:${escHtml(nameCol)}">${escHtml(username || 'User')}</span>`;
    html += `<span class="cm-text">${escHtml(text || '')}</span>`;

    el.innerHTML = html;
    container.insertBefore(el, container.firstChild);
    messages.push({ el, timer: null });

    // Fade out after fadeMs
    if (fadeMs > 0) {
      const entry = messages[messages.length - 1];
      entry.timer = setTimeout(() => {
        el.classList.add('cm-fade');
        setTimeout(() => el.remove(), 500);
      }, fadeMs);
    }

    // Trim to max (use bufferMax for memory, maxMessages for display)
    while (messages.length > Math.max(maxMessages, bufferMax)) {
      const old = messages.shift();
      if (old.timer) clearTimeout(old.timer);
      old.el.remove();
    }
    // Hide overflow messages (keep in buffer but not visible)
    messages.forEach((m, i) => {
      m.el.style.display = i < maxMessages ? '' : 'none';
    });
  }

  // ── SSE connection ────────────────────────────────────────────────────────
  function connect() {
    const es = new EventSource(`/w/${encodeURIComponent(token)}/stream`);

    // Handle various event formats
    function handleEvent(data) {
      try {
        const d = typeof data === 'string' ? JSON.parse(data) : data;
        const type = d.type || d.event_type || d.kind || '';

        // Handle both new-style (chat.message.sent) and legacy (chat_message/chat) events
        const isChatEvent = type === 'chat' || type === 'chat_message' || type === 'message' ||
                            type === 'chat.message.sent' || !type;

        if (isChatEvent) {
          const payload = d.payload || d;
          const raw = payload.message?.raw || {};
          const sender = raw.sender || {};

          // Extract from Kick webhook nested structure first, then fall back to flat
          const username = sender.username || payload.message?.sender_username ||
                           d.actor_username || payload.actor?.username || d.username || 'User';
          const text = payload.message?.text || raw.content ||
                       d.text || d.message || d.content || '';
          const platform = payload.platform || d.platform || d.source || 'kick';
          const avatar = sender.profile_picture || payload.actor?.avatar_url || d.avatar || '';
          // Use platform colour from identity if available, else fall back
          const color = sender.identity?.username_color || d.color || d.nameColor || '';

          console.log('[chat-overlay] message received:', username, text.slice(0,20));
          if (text) addMessage({ username, text, platform, avatar, color });
        }
      } catch { /* ignore */ }
    }

    es.addEventListener('chat_message', e => handleEvent(e.data));
    es.addEventListener('chat', e => handleEvent(e.data));
    es.addEventListener('message', e => handleEvent(e.data));
    es.addEventListener('chat.message.sent', e => handleEvent(e.data));
    es.onmessage = e => handleEvent(e.data);
    es.onerror = () => { es.close(); setTimeout(connect, 5000); };

    console.log('[chat-overlay] SSE connected to /w/'+token.slice(0,8)+'...');
  }

  if (!editorPreview) connect();

  // ── Test fire SSE listener ────────────────────────────────────────────────
  // Connects to the dashboard test fire endpoint to receive test events
  // from the overlay editor inspector
  function connectTestFire() {
    try {
      const testEs = new EventSource('/dashboard/api/widget-test-events', { withCredentials: true });
      testEs.onmessage = function (e) {
        try {
          const d = JSON.parse(e.data);
          if (d._test && (d.type === 'chat_message' || d.type === 'chat')) {
            addMessage({
              username: d.username || 'TestUser',
              text:     d.text || 'Test message!',
              platform: d.platform || 'kick',
              avatar:   d.avatar || '',
              color:    d.color || '',
            });
          }
        } catch { /* ignore */ }
      };
      testEs.onerror = function () {
        testEs.close();
        // Don't reconnect test fire — it's optional
      };
    } catch { /* test fire is optional */ }
  }

  // Connect test fire in editor preview mode or when in an iframe
  if (editorPreview || window.parent !== window) {
    connectTestFire();
  }

  // ── Test fire support ─────────────────────────────────────────────────────
  // Listen for test messages from the overlay editor
  window.addEventListener('message', function (e) {
    if (e.data?.type === 'widget:test' && e.data?.widgetId === 'chat-overlay') {
      const d = e.data.payload || {};
      addMessage({
        username: d.username || 'TestUser',
        text:     d.text || 'This is a test message from the overlay editor!',
        platform: d.platform || 'kick',
        avatar:   d.avatar || '',
        color:    d.color || '',
      });
    }
  });

  // Also expose a global for direct test firing
  window.__chatOverlayTest = function (username, text, platform) {
    addMessage({ username: username || 'TestUser', text: text || 'Test message!', platform: platform || 'kick', avatar: '', color: '' });
  };

  function escHtml(s) {
    return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  console.log('[chat-overlay] v2 started — platforms:', { kick: enableKick, youtube: enableYoutube, twitch: enableTwitch });

  // Editor preview: show dummy messages so users can style the widget
  if (editorPreview) {
    const dummies = [
      { username: 'StreamerFan99', text: 'This is what your chat overlay looks like!', platform: 'kick',    color: '#53fc18', avatar: 'https://i.pravatar.cc/24?u=1' },
      { username: 'YTViewer',      text: 'Loving the stream today',                    platform: 'youtube', color: '#ff0000', avatar: 'https://i.pravatar.cc/24?u=2' },
      { username: 'TwitchUser',    text: 'PogChamp PogChamp PogChamp',                 platform: 'twitch',  color: '#9146ff', avatar: 'https://i.pravatar.cc/24?u=3' },
      { username: 'Sardwyn',       text: 'Welcome to the overlay editor preview!',     platform: 'kick',    color: '#a5b4fc', avatar: 'https://i.pravatar.cc/24?u=4' },
    ];
    dummies.forEach((d, i) => setTimeout(() => addMessage(d), i * 300));
  }
  }

  function reinit() {
    // Clear existing messages and re-run with updated config
    const root = document.querySelector('[data-widget-editor-preview="chat-overlay"]');
    if (root) root.innerHTML = '';
    // Re-read config
    const newCfg = window.__WIDGET_CONFIG_CHAT_OVERLAY__ || {};
    Object.assign(cfg, newCfg);
    init();
  }

  // Expose reinit for the editor inspector to call on config change
  window.__WIDGET_REINIT_CHAT_OVERLAY__ = reinit;

  init();

})();

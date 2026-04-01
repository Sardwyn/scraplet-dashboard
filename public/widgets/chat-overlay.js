// public/widgets/chat-overlay.js
// Chat Overlay widget runtime for the overlay editor.
// Self-contained. Reads config from window.__WIDGET_CONFIG_CHAT_OVERLAY__
// Connects to /w/:token/stream and renders chat messages.

(function () {
  'use strict';

  const cfg = window.__WIDGET_CONFIG_CHAT_OVERLAY__ || {};
  const token = cfg.token || window.__WIDGET_TOKEN__ || '';
  const maxMessages = parseInt(cfg.maxMessages || '20');
  const fontSize = cfg.fontSize || '16px';
  const fontFamily = cfg.fontFamily || 'system-ui, sans-serif';
  const msgColor = cfg.messageColor || '#ffffff';
  const nameColor = cfg.nameColor || '#a5b4fc';
  const bgColor = cfg.backgroundColor || 'transparent';
  const showBadges = cfg.showBadges !== false;
  const animateIn = cfg.animateIn !== false;

  if (!token) {
    console.warn('[chat-overlay] No token configured');
    return;
  }

  // Set global token for compatibility
  window.__WIDGET_TOKEN__ = token;

  // Create container
  const container = document.createElement('div');
  container.id = 'chat-overlay-container';
  container.style.cssText = `
    position: fixed; inset: 0;
    display: flex; flex-direction: column-reverse;
    padding: 12px; gap: 6px;
    overflow: hidden; pointer-events: none;
    font-family: ${fontFamily};
    background: ${bgColor};
  `;
  document.body.appendChild(container);

  // Add CSS
  const style = document.createElement('style');
  style.textContent = `
    .chat-msg {
      display: flex; align-items: flex-start; gap: 8px;
      padding: 4px 8px; border-radius: 6px;
      background: rgba(0,0,0,0.35);
      font-size: ${fontSize}; line-height: 1.4;
      max-width: 100%; word-break: break-word;
      ${animateIn ? 'animation: chat-slide-in 0.2s ease;' : ''}
    }
    .chat-name { color: ${nameColor}; font-weight: 700; flex-shrink: 0; }
    .chat-text { color: ${msgColor}; }
    @keyframes chat-slide-in { from { opacity:0; transform:translateX(-8px); } to { opacity:1; transform:translateX(0); } }
  `;
  document.head.appendChild(style);

  const messages = [];

  function addMessage(username, text, color) {
    const el = document.createElement('div');
    el.className = 'chat-msg';
    el.innerHTML = `<span class="chat-name" style="color:${color || nameColor}">${escHtml(username)}</span><span class="chat-text">${escHtml(text)}</span>`;
    container.insertBefore(el, container.firstChild);
    messages.push(el);
    if (messages.length > maxMessages) {
      const old = messages.shift();
      old.remove();
    }
  }

  // Connect to SSE stream
  function connect() {
    const es = new EventSource(`/w/${encodeURIComponent(token)}/stream`);

    es.addEventListener('chat_message', function (e) {
      try {
        const d = JSON.parse(e.data);
        addMessage(d.username || d.sender || 'User', d.text || d.message || '', d.color);
      } catch { /* ignore */ }
    });

    // Also listen for generic message events
    es.onmessage = function (e) {
      try {
        const d = JSON.parse(e.data);
        if (d.type === 'chat' || d.type === 'chat_message') {
          addMessage(d.username || d.sender || 'User', d.text || d.message || '', d.color);
        }
      } catch { /* ignore */ }
    };

    es.onerror = function () {
      es.close();
      setTimeout(connect, 5000);
    };
  }

  connect();

  function escHtml(s) {
    return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  console.log('[chat-overlay] started');
})();

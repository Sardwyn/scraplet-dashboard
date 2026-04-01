// public/widgets/alert-box-widget.js
// Alert Box widget runtime for the overlay editor.
// Listens for follow/sub/donation/raid events and shows animated alerts.

(function () {
  'use strict';

  const cfg = window.__WIDGET_CONFIG_ALERT_BOX_WIDGET__ || {};
  const token = cfg.token || window.__WIDGET_TOKEN__ || '';
  const duration = parseInt(cfg.duration || '5000');
  const position = cfg.position || 'top-center';
  const bgColor = cfg.backgroundColor || 'rgba(99,102,241,0.9)';
  const textColor = cfg.textColor || '#ffffff';
  const fontSize = cfg.fontSize || '18px';
  const fontFamily = cfg.fontFamily || 'system-ui, sans-serif';

  if (!token) {
    console.warn('[alert-box] No token configured');
    return;
  }

  window.__WIDGET_TOKEN__ = token;

  // Position map
  const posMap = {
    'top-center':    'top:20px;left:50%;transform:translateX(-50%);',
    'top-left':      'top:20px;left:20px;',
    'top-right':     'top:20px;right:20px;',
    'bottom-center': 'bottom:20px;left:50%;transform:translateX(-50%);',
    'bottom-left':   'bottom:20px;left:20px;',
    'bottom-right':  'bottom:20px;right:20px;',
  };

  const container = document.createElement('div');
  container.id = 'alert-box-container';
  container.style.cssText = `position:fixed;${posMap[position] || posMap['top-center']}z-index:9999;pointer-events:none;`;
  document.body.appendChild(container);

  const style = document.createElement('style');
  style.textContent = `
    .alert-box-item {
      background: ${bgColor}; color: ${textColor};
      font-family: ${fontFamily}; font-size: ${fontSize};
      padding: 16px 24px; border-radius: 12px;
      text-align: center; min-width: 280px; max-width: 500px;
      box-shadow: 0 8px 32px rgba(0,0,0,0.4);
      animation: alert-in 0.4s cubic-bezier(0.34,1.56,0.64,1);
      margin-bottom: 8px;
    }
    .alert-box-item.hiding { animation: alert-out 0.3s ease forwards; }
    .alert-box-title { font-weight: 800; font-size: 1.2em; margin-bottom: 4px; }
    .alert-box-msg { opacity: 0.9; }
    @keyframes alert-in { from { opacity:0; transform:scale(0.7) translateY(-20px); } to { opacity:1; transform:scale(1) translateY(0); } }
    @keyframes alert-out { to { opacity:0; transform:scale(0.8) translateY(-10px); } }
  `;
  document.head.appendChild(style);

  const queue = [];
  let showing = false;

  function showNext() {
    if (!queue.length || showing) return;
    showing = true;
    const { title, message } = queue.shift();

    const el = document.createElement('div');
    el.className = 'alert-box-item';
    el.innerHTML = `<div class="alert-box-title">${escHtml(title)}</div><div class="alert-box-msg">${escHtml(message)}</div>`;
    container.appendChild(el);

    setTimeout(() => {
      el.classList.add('hiding');
      setTimeout(() => {
        el.remove();
        showing = false;
        showNext();
      }, 300);
    }, duration);
  }

  function queueAlert(title, message) {
    queue.push({ title, message });
    showNext();
  }

  // Event type handlers
  const handlers = {
    follow:    (d) => queueAlert('🎉 New Follower!', `${d.username || d.user || 'Someone'} just followed!`),
    subscribe: (d) => queueAlert('⭐ New Subscriber!', `${d.username || d.user || 'Someone'} subscribed!`),
    donation:  (d) => queueAlert(`💰 Donation — $${d.amount || '?'}`, `${d.username || 'Anonymous'}: ${d.message || ''}`),
    raid:      (d) => queueAlert(`⚔️ Raid!`, `${d.username || 'Someone'} raided with ${d.viewers || '?'} viewers!`),
    gift_sub:  (d) => queueAlert('🎁 Gift Sub!', `${d.username || 'Someone'} gifted a sub!`),
  };

  function connect() {
    const es = new EventSource(`/w/${encodeURIComponent(token)}/stream`);

    Object.entries(handlers).forEach(([type, handler]) => {
      es.addEventListener(type, function (e) {
        try { handler(JSON.parse(e.data)); } catch { /* ignore */ }
      });
    });

    es.onmessage = function (e) {
      try {
        const d = JSON.parse(e.data);
        const h = handlers[d.type];
        if (h) h(d);
      } catch { /* ignore */ }
    };

    es.onerror = function () { es.close(); setTimeout(connect, 5000); };
  }

  connect();

  function escHtml(s) {
    return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  console.log('[alert-box] started');
})();

// public/widgets/event-console-widget.js
// Event Console widget runtime — shows a scrolling log of stream events.

(function () {
  'use strict';

  const cfg = window.__WIDGET_CONFIG_EVENT_CONSOLE_WIDGET__ || {};
  const token = cfg.token || window.__WIDGET_TOKEN__ || '';
  const maxEvents = parseInt(cfg.maxEvents || '15');
  const fontSize = cfg.fontSize || '13px';
  const fontFamily = cfg.fontFamily || 'monospace';
  const bgColor = cfg.backgroundColor || 'rgba(0,0,0,0.7)';
  const textColor = cfg.textColor || '#e2e8f0';
  const position = cfg.position || 'bottom-left';

  if (!token) { console.warn('[event-console] No token'); return; }
  window.__WIDGET_TOKEN__ = token;

  const posMap = {
    'bottom-left':  'bottom:16px;left:16px;',
    'bottom-right': 'bottom:16px;right:16px;',
    'top-left':     'top:16px;left:16px;',
    'top-right':    'top:16px;right:16px;',
  };

  const container = document.createElement('div');
  container.style.cssText = `
    position:fixed;${posMap[position] || posMap['bottom-left']}
    width:320px; max-height:300px; overflow:hidden;
    background:${bgColor}; border-radius:8px;
    font-family:${fontFamily}; font-size:${fontSize};
    color:${textColor}; padding:8px;
    display:flex; flex-direction:column-reverse; gap:2px;
    pointer-events:none;
  `;
  document.body.appendChild(container);

  const events = [];
  const typeColors = {
    follow: '#6ee7b7', subscribe: '#a5b4fc', donation: '#fcd34d',
    raid: '#f87171', chat: '#94a3b8', gift_sub: '#c084fc',
  };

  function addEvent(type, text) {
    const el = document.createElement('div');
    const color = typeColors[type] || '#94a3b8';
    el.style.cssText = `padding:2px 4px;border-left:2px solid ${color};padding-left:6px;`;
    el.innerHTML = `<span style="color:${color};font-weight:600;">[${type}]</span> ${escHtml(text)}`;
    container.insertBefore(el, container.firstChild);
    events.push(el);
    if (events.length > maxEvents) events.shift()?.remove();
  }

  function connect() {
    const es = new EventSource(`/w/${encodeURIComponent(token)}/stream`);
    es.onmessage = function (e) {
      try {
        const d = JSON.parse(e.data);
        const type = d.type || 'event';
        const text = d.username ? `${d.username}${d.message ? ': ' + d.message : ''}` : (d.text || JSON.stringify(d).slice(0, 60));
        addEvent(type, text);
      } catch { /* ignore */ }
    };
    es.onerror = function () { es.close(); setTimeout(connect, 5000); };
  }

  connect();
  function escHtml(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
  console.log('[event-console] started');
})();

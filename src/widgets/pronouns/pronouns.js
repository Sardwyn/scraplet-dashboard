/**
 * Pronouns Widget — IIFE runtime
 * Displays configurable pronoun text. Updates via widget.config.update SSE.
 */
(function () {
  'use strict';

  const CONFIG_KEY = '__WIDGET_CONFIG_pronouns__';

  function getConfig() {
    const cfg = window[CONFIG_KEY] || {};
    return {
      pronouns:     cfg.pronouns     || 'they/them',
      fontFamily:   cfg.fontFamily   || 'Inter, system-ui, sans-serif',
      fontSize:     Number(cfg.fontSize)     || 18,
      textColor:    cfg.textColor    || '#ffffff',
      bgColor:      cfg.bgColor      || 'rgba(0,0,0,0.5)',
      borderRadius: Number(cfg.borderRadius) || 8,
      padding:      Number(cfg.padding)      || 8,
    };
  }

  function render() {
    const container = document.getElementById('pronouns-root');
    if (!container) return;
    const c = getConfig();
    container.innerHTML = `
      <div style="
        display:inline-block;
        font-family:${c.fontFamily};
        font-size:${c.fontSize}px;
        color:${c.textColor};
        background:${c.bgColor};
        border-radius:${c.borderRadius}px;
        padding:${c.padding}px ${c.padding * 1.5}px;
        white-space:nowrap;
      ">${c.pronouns}</div>
    `;
  }

  function mount() {
    if (!document.getElementById('pronouns-root')) {
      const div = document.createElement('div');
      div.id = 'pronouns-root';
      div.style.cssText = 'width:100%;height:100%;display:flex;align-items:center;justify-content:center;';
      document.body.appendChild(div);
    }
    render();
  }

  const token = window.__WIDGET_TOKEN__;
  const publicId = document.body.dataset.overlayPublicId || '';

  function connectSSE() {
    if (!publicId) return;
    const url = `/api/overlays/public/${publicId}/events/stream${token ? `?token=${token}` : ''}`;
    const es = new EventSource(url);
    es.onmessage = (e) => {
      try {
        const packet = JSON.parse(e.data);
        const type = packet?.header?.type || packet?.type;
        if (type === 'widget.config.update') {
          window.location.reload();
        }
      } catch {}
    };
    es.onerror = () => { setTimeout(connectSSE, 5000); es.close(); };
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => { mount(); connectSSE(); });
  } else {
    mount();
    connectSSE();
  }
})();

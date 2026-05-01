/**
 * Media Share Widget — IIFE runtime
 * Shows the currently active viewer media request.
 * Listens for mediashare.active and queue.update SSE events.
 */
(function () {
  'use strict';

  const CONFIG_KEY = '__WIDGET_CONFIG_media_share__';

  function getConfig() {
    const cfg = window[CONFIG_KEY] || {};
    return {
      idleMessage:   cfg.idleMessage   || 'No requests yet',
      fontFamily:    cfg.fontFamily    || 'Inter, system-ui, sans-serif',
      fontSize:      Number(cfg.fontSize)     || 16,
      textColor:     cfg.textColor     || '#ffffff',
      bgColor:       cfg.bgColor       || 'rgba(0,0,0,0.6)',
      borderRadius:  Number(cfg.borderRadius) || 8,
      showRequester: cfg.showRequester !== false,
    };
  }

  let activeRequest = null;

  function render() {
    const container = document.getElementById('media-share-root');
    if (!container) return;
    const c = getConfig();
    if (!activeRequest) {
      container.innerHTML = `
        <div style="
          font-family:${c.fontFamily};font-size:${c.fontSize}px;color:${c.textColor};
          background:${c.bgColor};border-radius:${c.borderRadius}px;
          padding:12px 16px;opacity:0.6;
        ">${c.idleMessage}</div>
      `;
      return;
    }
    const { title, requester, platform } = activeRequest;
    const platformIcon = platform === 'kick' ? '🟢' : platform === 'twitch' ? '🟣' : platform === 'youtube' ? '🔴' : '🎵';
    container.innerHTML = `
      <div style="
        font-family:${c.fontFamily};color:${c.textColor};
        background:${c.bgColor};border-radius:${c.borderRadius}px;
        padding:12px 16px;animation:msSlideIn 0.4s ease;
      ">
        <div style="font-size:${c.fontSize * 0.75}px;opacity:0.7;margin-bottom:4px;">
          ${platformIcon} Now Playing
        </div>
        <div style="font-size:${c.fontSize}px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
          ${title || 'Unknown'}
        </div>
        ${c.showRequester && requester ? `<div style="font-size:${c.fontSize * 0.8}px;opacity:0.7;margin-top:4px;">Requested by ${requester}</div>` : ''}
      </div>
    `;
  }

  function mount() {
    if (!document.getElementById('media-share-root')) {
      const div = document.createElement('div');
      div.id = 'media-share-root';
      div.style.cssText = 'width:100%;height:100%;box-sizing:border-box;';
      document.body.appendChild(div);
    }
    const style = document.createElement('style');
    style.textContent = '@keyframes msSlideIn { from { opacity:0; transform:translateY(-8px); } to { opacity:1; transform:none; } }';
    document.head.appendChild(style);
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
        const payload = packet?.payload || packet;
        if (type === 'mediashare.active') {
          activeRequest = payload;
          render();
        }
        if (type === 'mediashare.clear') {
          activeRequest = null;
          render();
        }
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

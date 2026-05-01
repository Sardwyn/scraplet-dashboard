/**
 * Goal Bar Widget — IIFE runtime
 * Displays a progress bar toward a follower/sub/donation goal.
 * Listens for `goal.update` SSE events.
 */
(function () {
  'use strict';

  const CONFIG_KEY = '__WIDGET_CONFIG_goal_bar__';
  const cfg = window[CONFIG_KEY] || {};

  const label = cfg.label || 'Goal';
  const target = Number(cfg.target) || 100;
  const startValue = Number(cfg.startValue) || 0;
  const fillColor = cfg.fillColor || '#818cf8';
  const trackColor = cfg.trackColor || '#1e1e2e';
  const fontFamily = cfg.fontFamily || 'Inter, system-ui, sans-serif';
  const fontSize = Number(cfg.fontSize) || 16;
  const textColor = cfg.textColor || '#ffffff';
  const milestoneAnimation = cfg.milestoneAnimation || 'pulse';

  let current = startValue;
  let milestoneTriggered = false;

  function pct() {
    return Math.min(100, Math.max(0, (current / target) * 100));
  }

  function render() {
    const container = document.getElementById('goal-bar-root');
    if (!container) return;
    const p = pct();
    container.innerHTML = `
      <div style="font-family:${fontFamily};color:${textColor};padding:8px 0;">
        <div style="display:flex;justify-content:space-between;font-size:${fontSize}px;margin-bottom:6px;">
          <span>${label}</span>
          <span>${current} / ${target}</span>
        </div>
        <div style="background:${trackColor};border-radius:999px;height:12px;overflow:hidden;">
          <div id="goal-bar-fill" style="
            background:${fillColor};
            width:${p}%;
            height:100%;
            border-radius:999px;
            transition:width 0.6s ease;
          "></div>
        </div>
      </div>
    `;
  }

  function triggerMilestone() {
    if (milestoneTriggered) return;
    milestoneTriggered = true;
    const fill = document.getElementById('goal-bar-fill');
    if (!fill) return;
    if (milestoneAnimation === 'pulse') {
      fill.style.animation = 'goalPulse 0.6s ease 3';
    } else if (milestoneAnimation === 'flash') {
      fill.style.background = '#ffffff';
      setTimeout(() => { fill.style.background = fillColor; }, 300);
    }
  }

  // Inject keyframes
  const style = document.createElement('style');
  style.textContent = `
    @keyframes goalPulse {
      0%,100% { opacity:1; } 50% { opacity:0.4; }
    }
  `;
  document.head.appendChild(style);

  // Mount
  const token = window.__WIDGET_TOKEN__;
  const publicId = document.body.dataset.overlayPublicId || '';

  function mount() {
    const existing = document.getElementById('goal-bar-root');
    if (!existing) {
      const div = document.createElement('div');
      div.id = 'goal-bar-root';
      div.style.cssText = 'width:100%;height:100%;box-sizing:border-box;padding:4px 8px;';
      document.body.appendChild(div);
    }
    render();
  }

  // SSE
  function connectSSE() {
    if (!publicId) return;
    const url = `/api/overlays/public/${publicId}/events/stream${token ? `?token=${token}` : ''}`;
    const es = new EventSource(url);
    es.onmessage = (e) => {
      try {
        const packet = JSON.parse(e.data);
        const type = packet?.header?.type || packet?.type;
        if (type === 'goal.update') {
          const payload = packet?.payload || packet;
          if (typeof payload.current === 'number') {
            current = payload.current;
            render();
            if (current >= target) triggerMilestone();
          }
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

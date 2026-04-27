// public/widgets/hype-train.js
// Hype Train v2 — state-only contract, no DOM injection.
// Emits structured state via 'scraplet:widget:state' event.
// React renderer (HypeTrainWidget.tsx) owns all DOM/CSS.

(function () {
  'use strict';

  var cfg = window.__WIDGET_CONFIG_HYPE_TRAIN__ || window.__WIDGET_CONFIG__ || {};
  var token = cfg.token || window.__WIDGET_TOKEN__ || '';
  var editorPreview = cfg.editorPreview === true || cfg.editorPreview === 'true';

  if (!token && !editorPreview) { console.warn('[hype-train] No token'); return; }
  if (token) window.__WIDGET_TOKEN__ = token;

  function n(v, d) { var x = Number(v); return isFinite(x) ? x : d; }
  function b(v, d) { if (v === true || v === false) return v; var s = String(v||'').toLowerCase(); return ['1','true','yes','on'].includes(s) ? true : ['0','false','no','off'].includes(s) ? false : d; }
  function s(v, d) { var x = String(v||'').trim(); return x || d; }

  var config = {
    trainColor:    s(cfg.trainColor,    '#6366f1'),
    trainColor2:   s(cfg.trainColor2,   '#4f46e5'),
    wheelColor:    s(cfg.wheelColor,    '#1e1b4b'),
    smokeColor:    s(cfg.smokeColor,    'rgba(200,200,220,0.7)'),
    barColor:      s(cfg.barColor,      '#6366f1'),
    barBg:         s(cfg.barBg,         'rgba(255,255,255,0.1)'),
    textColor:     s(cfg.textColor,     '#ffffff'),
    fontFamily:    s(cfg.fontFamily,    'Inter, system-ui, sans-serif'),
    showConductor: b(cfg.showConductor, true),
    showLevel:     b(cfg.showLevel,     true),
    showTimer:     b(cfg.showTimer,     true),
    showBar:       b(cfg.showBar,       true),
  };

  var trainState = {
    status: 'idle',
    level: 1,
    points: 0,
    pointsToNext: 3,
    conductorUsername: null,
    conductorAvatar: null,
    expiresAt: null,
  };

  function getInstanceId() {
    var el = document.querySelector('[data-widget-id="hype-train"]');
    return el ? (el.getAttribute('data-element-id') || 'hype-train') : 'hype-train';
  }

  function emitState() {
    window.dispatchEvent(new CustomEvent('scraplet:widget:state', {
      detail: {
        widgetId:   'hype-train',
        instanceId: getInstanceId(),
        state: Object.assign({}, config, trainState),
      }
    }));
  }

  function handleUpdate(d) {
    var payload = d.payload || d;
    var session = payload.session || payload;
    if (!session) return;
    trainState.status             = session.status || 'idle';
    trainState.level              = session.level || 1;
    trainState.points             = session.points || 0;
    trainState.pointsToNext       = session.points_to_next || 3;
    trainState.conductorUsername  = session.conductor_username || null;
    trainState.conductorAvatar    = session.conductor_avatar || null;
    trainState.expiresAt          = session.expires_at || null;
    emitState();
  }

  function connect() {
    if (window.__OVERLAY_PUBLIC_ID__) {
      window.addEventListener('scraplet:widget:sse', function(e) {
        try {
          var d = JSON.parse(e.data || '{}');
          if (d.kind === 'hype.update') handleUpdate(d);
        } catch(err) {}
      });
      console.log('[hype-train] using shared SSE');
    } else {
      var es = new EventSource('/w/' + encodeURIComponent(token) + '/stream');
      es.addEventListener('hype.update', function(ev) {
        try { handleUpdate(JSON.parse(ev.data || '{}')); } catch(err) {}
      });
      es.onerror = function() { es.close(); setTimeout(connect, 5000); };
    }
    console.log('[hype-train] v2 started');
  }

  function showPreview() {
    trainState.status = 'active';
    trainState.level = 3;
    trainState.points = 2;
    trainState.pointsToNext = 5;
    trainState.conductorUsername = 'StreamKing99';
    trainState.expiresAt = new Date(Date.now() + 18000).toISOString();
    emitState();
  }

  window.addEventListener('scraplet:widget:ready', function(e) {
    var detail = (e && e.detail) || {};
    if (detail.widgetId === 'hype-train') {
      if (editorPreview) showPreview();
      else emitState();
    }
  });

  if (editorPreview) showPreview();
  else connect();
  emitState();
})();

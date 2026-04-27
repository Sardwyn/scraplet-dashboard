// public/widgets/viewer-count.js
// Viewer Count v2 — state-only contract, no DOM injection.
// React renderer (ViewerCountWidget.tsx) owns all DOM/CSS.

(function () {
  'use strict';

  var cfg = window.__WIDGET_CONFIG_VIEWER_COUNT__ || window.__WIDGET_CONFIG__ || {};
  var token = cfg.token || window.__WIDGET_TOKEN__ || '';
  var editorPreview = cfg.editorPreview === true || cfg.editorPreview === 'true';

  if (!token && !editorPreview) { console.warn('[viewer-count] No token'); return; }
  if (token) window.__WIDGET_TOKEN__ = token;

  function n(v, d) { var x = Number(v); return isFinite(x) ? x : d; }
  function b(v, d) { if (v === true || v === false) return v; var s = String(v||'').toLowerCase(); return ['1','true','yes','on'].includes(s) ? true : ['0','false','no','off'].includes(s) ? false : d; }
  function s(v, d) { var x = String(v||'').trim(); return x || d; }

  var config = {
    label:         s(cfg.label,         'VIEWERS'),
    showLabel:     b(cfg.showLabel,     true),
    showPlatforms: b(cfg.showPlatforms, true),
    showPeak:      b(cfg.showPeak,      false),
    showKick:      b(cfg.showKick,      true),
    showYoutube:   b(cfg.showYoutube,   true),
    showTwitch:    b(cfg.showTwitch,    true),
    displayMode:   s(cfg.displayMode,   'total'),
    fontFamily:    s(cfg.fontFamily,    'Inter, system-ui, sans-serif'),
    fontSizePx:    n(cfg.fontSizePx,    48),
    labelSizePx:   n(cfg.labelSizePx,   12),
    textColor:     s(cfg.textColor,     '#ffffff'),
    bgColor:       s(cfg.bgColor,       'transparent'),
    accentColor:   s(cfg.accentColor,   '#6366f1'),
    borderRadius:  n(cfg.borderRadius,  12),
    showIcon:      b(cfg.showIcon,      true),
    layout:        s(cfg.layout,        'vertical'),
  };

  var viewerState = { total: 0, kick: 0, youtube: 0, twitch: 0, peak: 0 };

  function getInstanceId() {
    var el = document.querySelector('[data-widget-id="viewer-count"]');
    return el ? (el.getAttribute('data-element-id') || 'viewer-count') : 'viewer-count';
  }

  function emitState() {
    window.dispatchEvent(new CustomEvent('scraplet:widget:state', {
      detail: { widgetId: 'viewer-count', instanceId: getInstanceId(), state: Object.assign({}, config, viewerState) }
    }));
  }

  function handleEvent(d) {
    var payload = d.payload || d;
    if (typeof payload.total === 'number') {
      viewerState.total   = payload.total;
      viewerState.kick    = payload.kick    || 0;
      viewerState.youtube = payload.youtube || 0;
      viewerState.twitch  = payload.twitch  || 0;
      if (viewerState.total > viewerState.peak) viewerState.peak = viewerState.total;
      emitState();
    }
  }

  function connect() {
    if (window.__OVERLAY_PUBLIC_ID__) {
      window.addEventListener('scraplet:widget:sse', function(e) { try { handleEvent(JSON.parse(e.data || '{}')); } catch(err) {} });
      window.addEventListener('scraplet:widget:event:viewer.update', function(e) { try { handleEvent(JSON.parse(e.data || '{}')); } catch(err) {} });
      console.log('[viewer-count] using shared SSE');
    } else {
      var es = new EventSource('/w/' + encodeURIComponent(token) + '/stream');
      es.addEventListener('viewer.update', function(ev) { try { handleEvent(JSON.parse(ev.data || '{}')); } catch(err) {} });
      es.onerror = function() { es.close(); setTimeout(connect, 5000); };
    }
    console.log('[viewer-count] v2 started');
  }

  function showPreview() {
    viewerState.kick = 847; viewerState.youtube = 312; viewerState.twitch = 203;
    viewerState.total = viewerState.kick + viewerState.youtube + viewerState.twitch;
    viewerState.peak = viewerState.total + 142;
    emitState();
  }

  window.addEventListener('scraplet:widget:ready', function(e) {
    var detail = (e && e.detail) || {};
    if (detail.widgetId === 'viewer-count') { if (editorPreview) showPreview(); else emitState(); }
  });

  if (editorPreview) showPreview();
  else connect();
  emitState();
})();

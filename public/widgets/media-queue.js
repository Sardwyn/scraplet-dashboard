// public/widgets/media-queue.js
// Media Queue v2 — state-only contract, no DOM injection.
// React renderer (MediaQueueWidget.tsx) owns all DOM/CSS.

(function () {
  'use strict';

  var cfg = window.__WIDGET_CONFIG_MEDIA_QUEUE__ || window.__WIDGET_CONFIG__ || {};
  var token = cfg.token || window.__WIDGET_TOKEN__ || '';
  var editorPreview = cfg.editorPreview === true || cfg.editorPreview === 'true';

  if (!token && !editorPreview) { console.warn('[media-queue] No token'); return; }
  if (token) window.__WIDGET_TOKEN__ = token;

  function n(v, d) { var x = Number(v); return isFinite(x) ? x : d; }
  function b(v, d) { if (v === true || v === false) return v; var s = String(v||'').toLowerCase(); return ['1','true','yes','on'].includes(s) ? true : ['0','false','no','off'].includes(s) ? false : d; }
  function s(v, d) { var x = String(v||'').trim(); return x || d; }

  var config = {
    showNowPlaying:  b(cfg.showNowPlaying,  true),
    showQueue:       b(cfg.showQueue,       true),
    maxVisible:      Math.min(10, Math.max(1, n(cfg.maxVisible, 5))),
    showRequester:   b(cfg.showRequester,   true),
    showVotes:       b(cfg.showVotes,       true),
    showPlatform:    b(cfg.showPlatform,    true),
    showCommand:     b(cfg.showCommand,     true),
    command:         s(cfg.command,         '!sr'),
    nowPlayingLabel: s(cfg.nowPlayingLabel, 'NOW PLAYING'),
    upNextLabel:     s(cfg.upNextLabel,     'UP NEXT'),
    emptyLabel:      s(cfg.emptyLabel,      ''),
    fontFamily:      s(cfg.fontFamily,      'Inter, system-ui, sans-serif'),
    fontSizePx:      n(cfg.fontSizePx,      14),
    textColor:       s(cfg.textColor,       '#ffffff'),
    bgColor:         s(cfg.bgColor,         'rgba(0,0,0,0.75)'),
    nowPlayingBg:    s(cfg.nowPlayingBg,    'rgba(99,102,241,0.2)'),
    nowPlayingColor: s(cfg.nowPlayingColor, '#a5b4fc'),
    rowBg:           s(cfg.rowBg,           'rgba(255,255,255,0.04)'),
    accentColor:     s(cfg.accentColor,     '#6366f1'),
    borderRadius:    n(cfg.borderRadius,    10),
    rowGap:          n(cfg.rowGap,          3),
  };

  var queue = [];
  var nowPlaying = null;

  function getInstanceId() {
    var el = document.querySelector('[data-widget-id="media-queue"]');
    return el ? (el.getAttribute('data-element-id') || 'media-queue') : 'media-queue';
  }

  function emitState() {
    window.dispatchEvent(new CustomEvent('scraplet:widget:state', {
      detail: { widgetId: 'media-queue', instanceId: getInstanceId(), state: Object.assign({}, config, { nowPlaying: nowPlaying, queue: queue.slice() }) }
    }));
  }

  function handleQueueUpdate(d) {
    var payload = d.payload || d;
    var newQueue = payload.queue || [];
    nowPlaying = newQueue.find(function(r) { return r.status === 'playing'; }) || null;
    queue = newQueue;
    emitState();
  }

  function connect() {
    if (window.__OVERLAY_PUBLIC_ID__) {
      window.addEventListener('scraplet:widget:sse', function(e) {
        try { var d = JSON.parse(e.data || '{}'); if (d.kind === 'queue.update') handleQueueUpdate(d); } catch(err) {}
      });
      console.log('[media-queue] using shared SSE');
    } else {
      var es = new EventSource('/w/' + encodeURIComponent(token) + '/stream');
      es.addEventListener('queue.update', function(ev) { try { handleQueueUpdate(JSON.parse(ev.data || '{}')); } catch(err) {} });
      es.onerror = function() { es.close(); setTimeout(connect, 5000); };
    }
    console.log('[media-queue] v2 started');
  }

  function showPreview() {
    nowPlaying = { title: 'Blinding Lights', artist: 'The Weeknd', requester: 'StreamKing99', platform: 'kick', request_type: 'song', status: 'playing' };
    queue = [
      { id:1, title:'Levitating', artist:'Dua Lipa', requester:'YTFan', platform:'youtube', request_type:'song', status:'pending', votes:3 },
      { id:2, title:'Stay', artist:'The Kid LAROI', requester:'TwitchUser', platform:'twitch', request_type:'song', status:'pending', votes:1 },
      { id:3, title:'Heat Waves', artist:'Glass Animals', requester:'KickViewer', platform:'kick', request_type:'song', status:'pending', votes:0 },
    ];
    emitState();
  }

  window.addEventListener('scraplet:widget:ready', function(e) {
    var detail = (e && e.detail) || {};
    if (detail.widgetId === 'media-queue') { if (editorPreview) showPreview(); else emitState(); }
  });

  window.__mediaQueueUpdate = function(newQueue) { handleQueueUpdate({ queue: newQueue }); };

  if (editorPreview) showPreview();
  else connect();
  emitState();
})();

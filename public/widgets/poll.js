// public/widgets/poll.js
// Poll v2 — state-only contract, no DOM injection.
// React renderer (PollWidget.tsx) owns all DOM/CSS.

(function () {
  'use strict';

  var cfg = window.__WIDGET_CONFIG_POLL__ || window.__WIDGET_CONFIG__ || {};
  var token = cfg.token || window.__WIDGET_TOKEN__ || '';
  var editorPreview = cfg.editorPreview === true || cfg.editorPreview === 'true';

  if (!token && !editorPreview) { console.warn('[poll] No token'); return; }
  if (token) window.__WIDGET_TOKEN__ = token;

  function n(v, d) { var x = Number(v); return isFinite(x) ? x : d; }
  function b(v, d) { if (v === true || v === false) return v; var s = String(v||'').toLowerCase(); return ['1','true','yes','on'].includes(s) ? true : ['0','false','no','off'].includes(s) ? false : d; }
  function s(v, d) { var x = String(v||'').trim(); return x || d; }

  var config = {
    showTitle:       b(cfg.showTitle,       true),
    showVoteCount:   b(cfg.showVoteCount,   true),
    showPercent:     b(cfg.showPercent,     true),
    showTimer:       b(cfg.showTimer,       true),
    showWinner:      b(cfg.showWinner,      true),
    highlightWinner: b(cfg.highlightWinner, true),
    voteCommand:     s(cfg.voteCommand,     '!vote'),
    fontFamily:      s(cfg.fontFamily,      'Inter, system-ui, sans-serif'),
    fontSizePx:      n(cfg.fontSizePx,      15),
    textColor:       s(cfg.textColor,       '#ffffff'),
    bgColor:         s(cfg.bgColor,         'rgba(0,0,0,0.8)'),
    barBg:           s(cfg.barBg,           'rgba(255,255,255,0.1)'),
    accentColor:     s(cfg.accentColor,     '#6366f1'),
    winnerColor:     s(cfg.winnerColor,     '#fbbf24'),
    borderRadius:    n(cfg.borderRadius,    12),
    barHeight:       n(cfg.barHeight,       32),
    barRadius:       n(cfg.barRadius,       6),
    optionColors: [
      s(cfg.color1, '#6366f1'), s(cfg.color2, '#ec4899'), s(cfg.color3, '#10b981'), s(cfg.color4, '#f59e0b'),
      s(cfg.color5, '#3b82f6'), s(cfg.color6, '#8b5cf6'), s(cfg.color7, '#ef4444'), s(cfg.color8, '#14b8a6'),
    ],
  };

  var currentPoll = null;

  function getInstanceId() {
    var el = document.querySelector('[data-widget-id="poll"]');
    return el ? (el.getAttribute('data-element-id') || 'poll') : 'poll';
  }

  function emitState() {
    window.dispatchEvent(new CustomEvent('scraplet:widget:state', {
      detail: { widgetId: 'poll', instanceId: getInstanceId(), state: Object.assign({}, config, { poll: currentPoll }) }
    }));
  }

  function handlePollUpdate(d) {
    var payload = d.payload || d;
    var poll = payload.poll || payload;
    if (poll && poll.title) { currentPoll = poll; emitState(); }
  }

  function connect() {
    if (window.__OVERLAY_PUBLIC_ID__) {
      window.addEventListener('scraplet:widget:sse', function(e) {
        try { var d = JSON.parse(e.data || '{}'); if (d.kind === 'poll.update') handlePollUpdate(d); } catch(err) {}
      });
      console.log('[poll] using shared SSE');
    } else {
      var es = new EventSource('/w/' + encodeURIComponent(token) + '/stream');
      es.addEventListener('poll.update', function(ev) { try { handlePollUpdate(JSON.parse(ev.data || '{}')); } catch(err) {} });
      es.onerror = function() { es.close(); setTimeout(connect, 5000); };
    }
    console.log('[poll] v2 started');
  }

  function showPreview() {
    currentPoll = {
      id: 1, title: 'What game should I play next?', status: 'active',
      ends_at: new Date(Date.now() + 45000).toISOString(), winner_id: null,
      options: [
        { id: 1, text: 'Minecraft',     votes: 42 },
        { id: 2, text: 'Fortnite',      votes: 28 },
        { id: 3, text: 'Valorant',      votes: 19 },
        { id: 4, text: 'Just Chatting', votes: 11 },
      ]
    };
    emitState();
  }

  window.addEventListener('scraplet:widget:ready', function(e) {
    var detail = (e && e.detail) || {};
    if (detail.widgetId === 'poll') { if (editorPreview) showPreview(); else emitState(); }
  });

  window.__pollUpdate = function(poll) { handlePollUpdate({ poll: poll }); };

  if (editorPreview) showPreview();
  else connect();
  emitState();
})();

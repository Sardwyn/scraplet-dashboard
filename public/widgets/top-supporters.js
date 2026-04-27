// public/widgets/top-supporters.js
// Top Supporters v2 — state-only contract, no DOM injection.
// React renderer (TopSupportersWidget.tsx) owns all DOM/CSS.

(function () {
  'use strict';

  var cfg = window.__WIDGET_CONFIG_TOP_SUPPORTERS__ || window.__WIDGET_CONFIG__ || {};
  var token = cfg.token || window.__WIDGET_TOKEN__ || '';
  var editorPreview = cfg.editorPreview === true || cfg.editorPreview === 'true';

  if (!token && !editorPreview) { console.warn('[top-supporters] No token'); return; }
  if (token) window.__WIDGET_TOKEN__ = token;

  function n(v, d) { var x = Number(v); return isFinite(x) ? x : d; }
  function b(v, d) { if (v === true || v === false) return v; var s = String(v||'').toLowerCase(); return ['1','true','yes','on'].includes(s) ? true : ['0','false','no','off'].includes(s) ? false : d; }
  function s(v, d) { var x = String(v||'').trim(); return x || d; }

  var config = {
    title:        s(cfg.title,        'Top Supporters'),
    showTitle:    b(cfg.showTitle,    true),
    maxEntries:   Math.min(10, Math.max(1, n(cfg.maxEntries, 5))),
    metric:       s(cfg.metric,       'subs'),
    showRank:     b(cfg.showRank,     true),
    showAmount:   b(cfg.showAmount,   true),
    showPlatform: b(cfg.showPlatform, true),
    showAvatar:   b(cfg.showAvatar,   false),
    highlightTop: b(cfg.highlightTop, true),
    layout:       s(cfg.layout,       'list'),
    fontFamily:   s(cfg.fontFamily,   'Inter, system-ui, sans-serif'),
    fontSizePx:   n(cfg.fontSizePx,   15),
    textColor:    s(cfg.textColor,    '#ffffff'),
    bgColor:      s(cfg.bgColor,      'rgba(0,0,0,0.6)'),
    rowBg:        s(cfg.rowBg,        'rgba(255,255,255,0.04)'),
    accentColor:  s(cfg.accentColor,  '#6366f1'),
    goldColor:    s(cfg.goldColor,    '#fbbf24'),
    borderRadius: n(cfg.borderRadius, 10),
    rowGap:       n(cfg.rowGap,       4),
  };

  var supporters = {}; // key -> entry

  function getInstanceId() {
    var el = document.querySelector('[data-widget-id="top-supporters"]');
    return el ? (el.getAttribute('data-element-id') || 'top-supporters') : 'top-supporters';
  }

  function getSortedEntries() {
    var metric = config.metric;
    return Object.values(supporters)
      .sort(function(a, b) { return (b[metric] || b.combined) - (a[metric] || a.combined); })
      .slice(0, config.maxEntries);
  }

  function emitState() {
    window.dispatchEvent(new CustomEvent('scraplet:widget:state', {
      detail: { widgetId: 'top-supporters', instanceId: getInstanceId(), state: Object.assign({}, config, { entries: getSortedEntries() }) }
    }));
  }

  function handleEvent(d) {
    var kind = d.kind || d.type;
    var username = d.actor_username || (d.payload && d.payload.username) || '';
    var platform = d.source || (d.payload && d.payload.platform) || 'unknown';
    if (!username) return;
    var key = username.toLowerCase();
    var entry = supporters[key] || { username: username, platform: platform, subs: 0, tips: 0, combined: 0 };
    if (kind === 'channel.subscription.new' || kind === 'channel.subscription.renewal') {
      var tier = (d.payload && d.payload.tier) || 1;
      var pts = tier === 3 ? 6 : tier === 2 ? 2 : 1;
      entry.subs += 1; entry.combined += pts;
    } else if (kind === 'channel.subscription.gifts') {
      var count = (d.payload && (d.payload.count || d.payload.gift_count)) || 1;
      entry.subs += count; entry.combined += count;
    } else if (kind === 'kicks.gifted' || kind === 'tip' || kind === 'donation') {
      var amount = parseFloat((d.payload && (d.payload.amount || d.payload.kicks)) || 0);
      entry.tips += amount; entry.combined += Math.floor(amount);
    } else return;
    entry.platform = platform;
    supporters[key] = entry;
    emitState();
  }

  function connect() {
    var eventTypes = ['channel.subscription.new','channel.subscription.renewal','channel.subscription.gifts','kicks.gifted','tip','donation'];
    if (window.__OVERLAY_PUBLIC_ID__) {
      window.addEventListener('scraplet:widget:sse', function(e) { try { handleEvent(JSON.parse(e.data || '{}')); } catch(err) {} });
      console.log('[top-supporters] using shared SSE');
    } else {
      var es = new EventSource('/w/' + encodeURIComponent(token) + '/stream');
      eventTypes.forEach(function(t) { es.addEventListener(t, function(ev) { try { handleEvent(JSON.parse(ev.data || '{}')); } catch(err) {} }); });
      es.onerror = function() { es.close(); setTimeout(connect, 5000); };
    }
    console.log('[top-supporters] v2 started');
  }

  function showPreview() {
    var previewData = [
      { username: 'StreamKing99', platform: 'kick',    subs: 12, tips: 25.00, combined: 37 },
      { username: 'YTFanatic',    platform: 'youtube', subs: 8,  tips: 10.00, combined: 18 },
      { username: 'TwitchLurker', platform: 'twitch',  subs: 5,  tips: 50.00, combined: 55 },
      { username: 'KickViewer',   platform: 'kick',    subs: 3,  tips: 5.00,  combined: 8  },
      { username: 'SubGifter',    platform: 'kick',    subs: 7,  tips: 0,     combined: 7  },
    ];
    previewData.forEach(function(d) { supporters[d.username.toLowerCase()] = d; });
    emitState();
  }

  window.addEventListener('scraplet:widget:ready', function(e) {
    var detail = (e && e.detail) || {};
    if (detail.widgetId === 'top-supporters') { if (editorPreview) showPreview(); else emitState(); }
  });

  if (editorPreview) showPreview();
  else connect();
  emitState();
})();

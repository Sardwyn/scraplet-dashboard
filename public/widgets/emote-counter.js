// public/widgets/emote-counter.js
// Emote Counter v2 — state-only contract, no DOM injection.
// Emits structured state via 'scraplet:widget:state' event.
// React renderer (EmoteCounterWidget.tsx) owns all DOM/CSS.

(function () {
  'use strict';

  function getCfg() {
    return window.__WIDGET_CONFIG_EMOTE_COUNTER__ || {};
  }

  function n(v, d) { var x = Number(v); return isFinite(x) ? x : d; }
  function s(v, d) { var x = String(v || '').trim(); return x || d; }
  function b(v, d) { if (v === true || v === false) return v; var t = String(v || '').toLowerCase(); return ['1','true','yes'].includes(t) ? true : ['0','false','no'].includes(t) ? false : d; }

  function readConfig(cfg) {
    return {
      watchEmotes:  s(cfg.watchEmotes,  'PogChamp,KEKW,LUL,Pog'),
      windowSec:    n(cfg.windowSec,    30),
      maxDisplay:   n(cfg.maxDisplay,   5),
      fontFamily:   s(cfg.fontFamily,   'Inter, system-ui, sans-serif'),
      fontSizePx:   n(cfg.fontSizePx,   18),
      textColor:    s(cfg.textColor,    '#ffffff'),
      accentColor:  s(cfg.accentColor,  '#6366f1'),
      bgColor:      s(cfg.bgColor,      'rgba(0,0,0,0.75)'),
      borderRadius: n(cfg.borderRadius, 12),
      showBar:      b(cfg.showBar,      true),
      title:        s(cfg.title,        'Emote Counter'),
    };
  }

  var counts = {}; // emote -> [{ts}]
  var config = readConfig(getCfg());
  var watchList = config.watchEmotes.split(',').map(function (x) { return x.trim(); }).filter(Boolean);

  function getInstanceId() {
    var el = document.querySelector('[data-widget-id="emote-counter"]');
    return el ? (el.getAttribute('data-element-id') || 'emote-counter') : 'emote-counter';
  }

  function prune() {
    if (config.windowSec <= 0) return;
    var cutoff = Date.now() - config.windowSec * 1000;
    Object.keys(counts).forEach(function (k) {
      counts[k] = counts[k].filter(function (e) { return e.ts > cutoff; });
    });
  }

  function getTopEntries() {
    prune();
    return Object.entries(counts)
      .map(function (e) { return { emote: e[0], count: e[1].length }; })
      .filter(function (e) { return e.count > 0; })
      .sort(function (a, b) { return b.count - a.count; })
      .slice(0, config.maxDisplay);
  }

  function emitState() {
    window.dispatchEvent(new CustomEvent('scraplet:widget:state', {
      detail: {
        widgetId:   'emote-counter',
        instanceId: getInstanceId(),
        state: {
          entries:      getTopEntries(),
          title:        config.title,
          fontFamily:   config.fontFamily,
          fontSizePx:   config.fontSizePx,
          textColor:    config.textColor,
          accentColor:  config.accentColor,
          bgColor:      config.bgColor,
          borderRadius: config.borderRadius,
          showBar:      config.showBar,
        },
      }
    }));
  }

  function handleMessage(data) {
    var msg = data.message || data.content || '';
    var changed = false;
    watchList.forEach(function (emote) {
      var re = new RegExp('(?:^|\\s)' + emote.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?:\\s|$)', 'g');
      var matches = msg.match(re);
      if (matches && matches.length > 0) {
        if (!counts[emote]) counts[emote] = [];
        for (var i = 0; i < matches.length; i++) counts[emote].push({ ts: Date.now() });
        changed = true;
      }
    });
    if (changed) emitState();
  }

  function normalizeChatMsg(d) {
    if (d.payload && d.payload.message) {
      return {
        message: d.payload.message.text || (d.payload.message.raw && d.payload.message.raw.content) || '',
      };
    }
    return d;
  }

  function onChat(ev) { try { handleMessage(normalizeChatMsg(JSON.parse(ev.data))); } catch (e) {} }
  window.addEventListener('scraplet:widget:event:chat_message', onChat);
  window.addEventListener('scraplet:widget:event:chat.message.sent', onChat);
  window.addEventListener('scraplet:widget:sse', function (ev) {
    try {
      var d = JSON.parse(ev.data);
      if (d.message || (d.payload && d.payload.message)) handleMessage(normalizeChatMsg(d));
    } catch (e) {}
  });

  // Re-emit periodically to prune old counts
  if (config.windowSec > 0) setInterval(emitState, 5000);

  // Re-emit when React container is ready
  window.addEventListener('scraplet:widget:ready', function (e) {
    var detail = (e && e.detail) || {};
    if (detail.widgetId === 'emote-counter') {
      // Seed preview data in editor
      if (getCfg().editorPreview) {
        watchList.forEach(function (emote, i) {
          counts[emote] = [];
          for (var j = 0; j < (i + 1) * 3; j++) counts[emote].push({ ts: Date.now() });
        });
      }
      emitState();
    }
  });

  // Hot-reload config in editor
  window.addEventListener('scraplet:widget:config-update', function (e) {
    var detail = e.detail || {};
    if (detail.widgetId === 'emote-counter') {
      var newCfg = Object.assign({}, getCfg(), detail.config || {});
      window.__WIDGET_CONFIG_EMOTE_COUNTER__ = newCfg;
      config = readConfig(newCfg);
      watchList = config.watchEmotes.split(',').map(function (x) { return x.trim(); }).filter(Boolean);
      emitState();
    }
  });

  emitState();
  console.log('[emote-counter] v2 started');
})();

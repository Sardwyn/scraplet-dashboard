// public/widgets/emote-wall.js
// Emote Wall v2 — state-only contract, no DOM injection.
// Emits structured state via 'scraplet:widget:state' event.
// React renderer (EmoteWallWidget.tsx) owns all DOM/CSS.

(function () {
  'use strict';

  function getCfg() {
    return window.__WIDGET_CONFIG_EMOTE_WALL__ || {};
  }

  function n(v, d) { var x = Number(v); return isFinite(x) ? x : d; }
  function s(v, d) { var x = String(v || '').trim(); return x || d; }
  function b(v, d) { if (v === true || v === false) return v; var t = String(v || '').toLowerCase(); return ['1','true','yes'].includes(t) ? true : ['0','false','no'].includes(t) ? false : d; }

  function readConfig(cfg) {
    return {
      emoteSize:   n(cfg.emoteSize,   48),
      speed:       n(cfg.speed,       4),
      maxOnScreen: n(cfg.maxOnScreen, 50),
      direction:   s(cfg.direction,   'up'),
      showNames:   b(cfg.showNames,   false),
      fontFamily:  s(cfg.fontFamily,  'Inter, system-ui, sans-serif'),
      fontSize:    n(cfg.fontSize,    12),
      textColor:   s(cfg.textColor,   '#ffffff'),
      bgColor:     s(cfg.bgColor,     'transparent'),
    };
  }

  var config = readConfig(getCfg());
  var pendingEmotes = [];
  var nextId = 0;

  var EMOTE_RE = /\[emote:(\d+):([^\]]+)\]|:([A-Za-z0-9_]+):/g;

  function getInstanceId() {
    var el = document.querySelector('[data-widget-id="emote-wall"]');
    return el ? (el.getAttribute('data-element-id') || 'emote-wall') : 'emote-wall';
  }

  function emitState() {
    window.dispatchEvent(new CustomEvent('scraplet:widget:state', {
      detail: {
        widgetId:   'emote-wall',
        instanceId: getInstanceId(),
        state: Object.assign({}, config, { pendingEmotes: pendingEmotes.slice() }),
      }
    }));
  }

  function addEmote(src, name) {
    pendingEmotes.push({ src: src, name: name, id: nextId++ });
    // Keep list bounded — React only needs to see new ones
    if (pendingEmotes.length > 200) pendingEmotes = pendingEmotes.slice(-200);
    emitState();
  }

  function processMessage(data) {
    var emotes = data.emotes || [];
    var msg = data.message || data.content || '';

    if (Array.isArray(emotes) && emotes.length > 0) {
      emotes.forEach(function (e) {
        var src = e.url || e.src || ('https://files.kick.com/emotes/' + e.id + '/fullsize');
        addEmote(src, e.name || e.code);
      });
      return;
    }

    var match;
    EMOTE_RE.lastIndex = 0;
    while ((match = EMOTE_RE.exec(msg)) !== null) {
      if (match[1]) {
        addEmote('https://files.kick.com/emotes/' + match[1] + '/fullsize', match[2]);
      }
    }
  }

  window.addEventListener('scraplet:widget:event:chat_message', function (ev) {
    try { processMessage(JSON.parse(ev.data)); } catch (e) {}
  });
  window.addEventListener('scraplet:widget:sse', function (ev) {
    try {
      var d = JSON.parse(ev.data);
      if (d.type === 'chat_message' || d.message) processMessage(d);
    } catch (e) {}
  });

  window.addEventListener('scraplet:widget:ready', function (e) {
    var detail = (e && e.detail) || {};
    if (detail.widgetId === 'emote-wall') {
      if (getCfg().editorPreview) {
        // Seed a few demo emotes
        var demoSrcs = [
          'https://files.kick.com/emotes/1/fullsize',
          'https://static-cdn.jtvnw.net/emoticons/v2/25/default/dark/2.0',
        ];
        var i = 0;
        var iv = setInterval(function () {
          addEmote(demoSrcs[i % demoSrcs.length], 'emote');
          i++;
          if (i >= 6) clearInterval(iv);
        }, 400);
      }
      emitState();
    }
  });

  window.addEventListener('scraplet:widget:config-update', function (e) {
    var detail = e.detail || {};
    if (detail.widgetId === 'emote-wall') {
      var newCfg = Object.assign({}, getCfg(), detail.config || {});
      window.__WIDGET_CONFIG_EMOTE_WALL__ = newCfg;
      config = readConfig(newCfg);
      emitState();
    }
  });

  emitState();
  console.log('[emote-wall] v2 started');
})();

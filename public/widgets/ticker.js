// public/widgets/ticker.js
// Scrolling Ticker v3 — state-only contract, no DOM injection.
// Emits structured state via 'scraplet:widget:state' event.
// React renderer (TickerWidget.tsx) owns all DOM/CSS.

(function () {
  'use strict';

  function getCfg() {
    return window.__WIDGET_CONFIG_TICKER__ || window.__WIDGET_CONFIG__ || {};
  }

  function n(v, d) { var x = Number(v); return isFinite(x) ? x : d; }
  function b(v, d) { if (v === true || v === false) return v; var s = String(v||'').toLowerCase(); return ['1','true','yes','on'].includes(s) ? true : ['0','false','no','off'].includes(s) ? false : d; }
  function s(v, d) { var x = String(v||'').trim(); return x || d; }

  function readConfig(cfg) {
    return {
      items:         cfg.items || 'Welcome to the stream! • Follow for more content • Check out the links below',
      separator:     s(cfg.separator,    ' • '),
      speed:         n(cfg.speed,        60),
      direction:     s(cfg.direction,    'left'),
      fontFamily:    s(cfg.fontFamily,   'Inter, system-ui, sans-serif'),
      fontSizePx:    n(cfg.fontSizePx,   18),
      textColor:     s(cfg.textColor,    '#ffffff'),
      bgColor:       s(cfg.bgColor,      'rgba(0,0,0,0.6)'),
      accentColor:   s(cfg.accentColor,  '#6366f1'),
      showAccent:    b(cfg.showAccent,   true),
      accentWidth:   n(cfg.accentWidth,  4),
      paddingV:      n(cfg.paddingV,     10),
      paddingH:      n(cfg.paddingH,     16),
      borderRadius:  n(cfg.borderRadius, 8),
      textShadow:    b(cfg.textShadow,   false),
      bold:          b(cfg.bold,         false),
      uppercase:     b(cfg.uppercase,    false),
      letterSpacing: n(cfg.letterSpacing, 0),
      pauseOnHover:  b(cfg.pauseOnHover, false),
      fadeEdges:     b(cfg.fadeEdges !== undefined ? cfg.fadeEdges : cfg.edgeFade, true),
      fadeWidth:     n(cfg.fadeWidth,    60),
      prefixIcon:    s(cfg.prefixIcon,   ''),
      prefixLabel:   s(cfg.prefixLabel || cfg.prefix, ''),
    };
  }

  function parseItems(cfg) {
    var items = cfg.items;
    var list = [];
    if (Array.isArray(items)) {
      list = items.filter(Boolean);
    } else {
      list = String(items).split(/\n|\|/).map(function(i) { return i.trim(); }).filter(Boolean);
    }
    return list.length ? list : ['Welcome to the stream!'];
  }

  // Get instanceId from the container element
  function getInstanceId() {
    var el = document.querySelector('[data-widget-id="ticker"]');
    return el ? (el.getAttribute('data-element-id') || 'ticker') : 'ticker';
  }

  // Emit structured state — no DOM mutation
  function emitState(cfg) {
    var state = {
      items:         parseItems(cfg),
      separator:     cfg.separator,
      speed:         cfg.speed,
      direction:     cfg.direction,
      fontFamily:    cfg.fontFamily,
      fontSizePx:    cfg.fontSizePx,
      textColor:     cfg.textColor,
      bgColor:       cfg.bgColor,
      accentColor:   cfg.accentColor,
      showAccent:    cfg.showAccent,
      accentWidth:   cfg.accentWidth,
      paddingV:      cfg.paddingV,
      paddingH:      cfg.paddingH,
      borderRadius:  cfg.borderRadius,
      textShadow:    cfg.textShadow,
      bold:          cfg.bold,
      uppercase:     cfg.uppercase,
      letterSpacing: cfg.letterSpacing,
      pauseOnHover:  cfg.pauseOnHover,
      fadeEdges:     cfg.fadeEdges,
      fadeWidth:     cfg.fadeWidth,
      prefixIcon:    cfg.prefixIcon,
      prefixLabel:   cfg.prefixLabel,
    };

    window.dispatchEvent(new CustomEvent('scraplet:widget:state', {
      detail: {
        widgetId:   'ticker',
        instanceId: getInstanceId(),
        state:      state,
      }
    }));
  }

  function init() {
    var cfg = readConfig(getCfg());
    emitState(cfg);
    console.log('[ticker] v3 started');
  }

  // Hot-reload when config changes in editor
  window.addEventListener('scraplet:widget:config-update', function(e) {
    var detail = e.detail || {};
    if (detail.widgetId === 'ticker') {
      var newCfg = Object.assign({}, getCfg(), detail.config || {});
      window.__WIDGET_CONFIG_TICKER__ = newCfg;
      emitState(readConfig(newCfg));
    }
  });

  // Public API (for programmatic updates)
  window.__tickerSetItems = function(newItems) {
    var cfg = readConfig(getCfg());
    cfg.items = Array.isArray(newItems) ? newItems : [String(newItems)];
    emitState(cfg);
  };
  window.__tickerAddItem = function(item) {
    var cfg = readConfig(getCfg());
    var list = parseItems(cfg);
    list.push(String(item));
    cfg.items = list;
    emitState(cfg);
  };

  // Re-emit state when React container signals it's ready
  window.addEventListener('scraplet:widget:ready', function(e) {
    var detail = (e && e.detail) || {};
    if (detail.widgetId === 'ticker') {
      var cfg = readConfig(getCfg());
      emitState(cfg);
    }
  });

  init();

})();

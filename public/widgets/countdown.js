// public/widgets/countdown.js
// Countdown v2 — state-only contract, no DOM injection.
// React renderer (CountdownWidget.tsx) owns all DOM/CSS.

(function () {
  'use strict';

  var cfg = window.__WIDGET_CONFIG_COUNTDOWN__ || window.__WIDGET_CONFIG__ || {};
  var editorPreview = cfg.editorPreview === true || cfg.editorPreview === 'true';

  function s(v,d){ return String(v||'').trim()||d; }
  function n(v,d){ var x=Number(v); return isFinite(x)?x:d; }
  function b(v,d){ if(v===true||v===false)return v; var t=String(v||'').toLowerCase(); return ['1','true','yes','on'].includes(t)?true:d; }

  var mode        = s(cfg.mode,        'datetime');
  var targetDate  = cfg.targetDate ? new Date(cfg.targetDate) : null;
  var durationSec = n(cfg.durationSec, 3600);

  var config = {
    mode:          mode,
    targetMs:      targetDate ? targetDate.getTime() : undefined,
    durationMs:    durationSec * 1000,
    startedAt:     editorPreview ? (Date.now() - 10000) : Date.now(),
    label:         s(cfg.label,        'STREAM STARTS IN'),
    showLabel:     b(cfg.showLabel,    true),
    showDays:      b(cfg.showDays,     true),
    showHours:     b(cfg.showHours,    true),
    showMinutes:   b(cfg.showMinutes,  true),
    showSeconds:   b(cfg.showSeconds,  true),
    showUnits:     b(cfg.showUnits,    true),
    showBar:       b(cfg.showBar,      false),
    endMessage:    s(cfg.endMessage,   'LIVE NOW! 🔴'),
    showEndMsg:    b(cfg.showEndMsg,   true),
    urgentSec:     n(cfg.urgentSec,    60),
    layout:        s(cfg.layout,       'blocks'),
    separatorChar: s(cfg.separatorChar,':'),
    fontFamily:    s(cfg.fontFamily,   'Inter, system-ui, sans-serif'),
    fontSizePx:    n(cfg.fontSizePx,   48),
    labelSizePx:   n(cfg.labelSizePx,  13),
    textColor:     s(cfg.textColor,    '#ffffff'),
    bgColor:       s(cfg.bgColor,      'transparent'),
    blockBg:       s(cfg.blockBg,      'rgba(0,0,0,0.4)'),
    accentColor:   s(cfg.accentColor,  '#6366f1'),
    urgentColor:   s(cfg.urgentColor,  '#ef4444'),
    borderRadius:  n(cfg.borderRadius, 10),
  };

  function getInstanceId() {
    var el = document.querySelector('[data-widget-id="countdown"]');
    return el ? (el.getAttribute('data-element-id') || 'countdown') : 'countdown';
  }

  function emitState() {
    window.dispatchEvent(new CustomEvent('scraplet:widget:state', {
      detail: { widgetId: 'countdown', instanceId: getInstanceId(), state: Object.assign({}, config) }
    }));
  }

  window.addEventListener('scraplet:widget:ready', function(e) {
    var detail = (e && e.detail) || {};
    if (detail.widgetId === 'countdown') emitState();
  });

  window.addEventListener('scraplet:widget:config-update', function(e) {
    var detail = e.detail || {};
    if (detail.widgetId === 'countdown') {
      var newCfg = Object.assign({}, window.__WIDGET_CONFIG_COUNTDOWN__ || {}, detail.config || {});
      window.__WIDGET_CONFIG_COUNTDOWN__ = newCfg;
      config.label = s(newCfg.label, 'STREAM STARTS IN');
      config.targetMs = newCfg.targetDate ? new Date(newCfg.targetDate).getTime() : undefined;
      emitState();
    }
  });

  emitState();
  console.log('[countdown] v2 started — mode:', mode);
})();

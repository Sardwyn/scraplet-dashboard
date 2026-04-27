// public/widgets/top-donators.js
// Top Donators v2 — state-only contract, no DOM injection.
// Emits structured state via 'scraplet:widget:state' event.
// React renderer (TopDonatorsWidget.tsx) owns all DOM/CSS.

(function () {
  'use strict';

  function getCfg() {
    return window.__WIDGET_CONFIG_TOP_DONATORS__ || {};
  }

  function n(v, d) { var x = Number(v); return isFinite(x) ? x : d; }
  function s(v, d) { var x = String(v || '').trim(); return x || d; }
  function b(v, d) { if (v === true || v === false) return v; var t = String(v || '').toLowerCase(); return ['1','true','yes'].includes(t) ? true : ['0','false','no'].includes(t) ? false : d; }

  function readConfig(cfg) {
    return {
      maxEntries:   n(cfg.maxEntries,   5),
      title:        s(cfg.title,        'Top Donators'),
      currency:     s(cfg.currency,     '$'),
      fontFamily:   s(cfg.fontFamily,   'Inter, system-ui, sans-serif'),
      fontSizePx:   n(cfg.fontSizePx,   18),
      textColor:    s(cfg.textColor,    '#ffffff'),
      accentColor:  s(cfg.accentColor,  '#fbbf24'),
      bgColor:      s(cfg.bgColor,      'rgba(0,0,0,0.75)'),
      borderRadius: n(cfg.borderRadius, 12),
      showRank:     b(cfg.showRank,     true),
      showBar:      b(cfg.showBar,      true),
    };
  }

  var config = readConfig(getCfg());
  var leaderboard = []; // [{name, amount, platform}]

  function getInstanceId() {
    var el = document.querySelector('[data-widget-id="top-donators"]');
    return el ? (el.getAttribute('data-element-id') || 'top-donators') : 'top-donators';
  }

  function emitState() {
    window.dispatchEvent(new CustomEvent('scraplet:widget:state', {
      detail: {
        widgetId:   'top-donators',
        instanceId: getInstanceId(),
        state: {
          leaderboard:  leaderboard.slice(),
          title:        config.title,
          currency:     config.currency,
          fontFamily:   config.fontFamily,
          fontSizePx:   config.fontSizePx,
          textColor:    config.textColor,
          accentColor:  config.accentColor,
          bgColor:      config.bgColor,
          borderRadius: config.borderRadius,
          showRank:     config.showRank,
          showBar:      config.showBar,
        },
      }
    }));
  }

  function addDonation(name, amount, platform) {
    var existing = leaderboard.find(function (e) { return e.name.toLowerCase() === name.toLowerCase(); });
    if (existing) {
      existing.amount += amount;
      existing.platform = platform || existing.platform;
    } else {
      leaderboard.push({ name: name, amount: amount, platform: platform || 'kick' });
    }
    leaderboard.sort(function (a, b) { return b.amount - a.amount; });
    leaderboard = leaderboard.slice(0, config.maxEntries);
    emitState();
  }

  window.addEventListener('scraplet:widget:event:donation', function (ev) {
    try {
      var d = JSON.parse(ev.data);
      var name = d.username || d.name || 'Anonymous';
      var amount = parseFloat(d.amount || d.value || 0);
      if (amount > 0) addDonation(name, amount, d.platform);
    } catch (e) {}
  });
  window.addEventListener('scraplet:widget:event:tip', function (ev) {
    try {
      var d = JSON.parse(ev.data);
      var name = d.username || d.name || 'Anonymous';
      var amount = parseFloat(d.amount || d.value || 0);
      if (amount > 0) addDonation(name, amount, d.platform);
    } catch (e) {}
  });
  window.addEventListener('scraplet:widget:sse', function (ev) {
    try {
      var d = JSON.parse(ev.data);
      if ((d.type === 'donation' || d.type === 'tip') && d.amount) {
        addDonation(d.username || 'Anonymous', parseFloat(d.amount), d.platform);
      }
    } catch (e) {}
  });

  window.addEventListener('scraplet:widget:ready', function (e) {
    var detail = (e && e.detail) || {};
    if (detail.widgetId === 'top-donators') {
      if (getCfg().editorPreview && leaderboard.length === 0) {
        leaderboard = [
          { name: 'StreamKing99', amount: 50.00, platform: 'kick' },
          { name: 'NightOwl',     amount: 25.50, platform: 'twitch' },
          { name: 'ProGamer',     amount: 15.00, platform: 'youtube' },
          { name: 'CoolViewer',   amount: 10.00, platform: 'kick' },
          { name: 'Anonymous',    amount: 5.00,  platform: 'kick' },
        ].slice(0, config.maxEntries);
      }
      emitState();
    }
  });

  window.addEventListener('scraplet:widget:config-update', function (e) {
    var detail = e.detail || {};
    if (detail.widgetId === 'top-donators') {
      var newCfg = Object.assign({}, getCfg(), detail.config || {});
      window.__WIDGET_CONFIG_TOP_DONATORS__ = newCfg;
      config = readConfig(newCfg);
      emitState();
    }
  });

  emitState();
  console.log('[top-donators] v2 started');
})();

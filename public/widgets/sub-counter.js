// public/widgets/sub-counter.js
// Sub Counter v2 — goal tracking, platform breakdown, milestones, ring/bar modes.

(function () {
  'use strict';

  const cfg = window.__WIDGET_CONFIG_SUB_COUNTER__ || window.__WIDGET_CONFIG__ || {};
  const token = cfg.token || window.__WIDGET_TOKEN__ || '';
  const editorPreview = cfg.editorPreview === true || cfg.editorPreview === 'true';

  if (!token && !editorPreview) {
    console.warn('[sub-counter] No token configured');
    return;
  }
  if (token) window.__WIDGET_TOKEN__ = token;

  // ── Config ─────────────────────────────────────────────────────────────────
  function n(v, d) { var x = Number(v); return isFinite(x) ? x : d; }
  function b(v, d) { if (v === true || v === false) return v; var s = String(v||'').toLowerCase(); return ['1','true','yes','on'].includes(s) ? true : ['0','false','no','off'].includes(s) ? false : d; }
  function s(v, d) { var x = String(v||'').trim(); return x || d; }

  var label        = s(cfg.label,        'Sub Goal');
  var goal         = Math.max(1, n(cfg.goal, 100));
  var startAt      = Math.max(0, n(cfg.startAt, 0));
  var overfill     = b(cfg.overfill,     true);
  var showNumbers  = b(cfg.showNumbers,  true);
  var showPercent  = b(cfg.showPercent,  false);
  var showBreakdown= b(cfg.showBreakdown,false);
  var trackPoints  = b(cfg.trackPoints,  false); // sub points (tier-weighted)
  var displayMode  = s(cfg.displayMode,  'bar');  // 'bar' | 'ring' | 'counter'
  var fontFamily   = s(cfg.fontFamily,   'Inter, system-ui, sans-serif');
  var fontSizePx   = n(cfg.fontSizePx,   18);
  var textColor    = s(cfg.textColor,    '#ffffff');
  var fillColor    = s(cfg.fillColor,    '#6366f1');
  var fillColor2   = s(cfg.fillColor2,   '');      // gradient end (empty = solid)
  var trackColor   = s(cfg.trackColor,   'rgba(255,255,255,0.1)');
  var bgColor      = s(cfg.bgColor,      'transparent');
  var milestoneAnim= s(cfg.milestoneAnim,'pulse');  // 'pulse' | 'confetti' | 'shake' | 'none'
  var barHeight    = n(cfg.barHeight,   12);
  var barRadius    = n(cfg.barRadius,   999);
  var barGlow      = b(cfg.barGlow,     false);
  var ringSize     = n(cfg.ringSize,    120);
  var ringStroke   = n(cfg.ringStroke,  10);
  var ringGlow     = b(cfg.ringGlow,    false);
  var milestoneSound=s(cfg.milestoneSound,'chime');
  var endDate      = cfg.endDate ? new Date(cfg.endDate) : null;

  var PLATFORM_COLORS = { kick: '#53fc18', youtube: '#ff0000', twitch: '#9146ff' };
  var TIER_POINTS = { 1: 1, 2: 2, 3: 6 };

  // ── State ──────────────────────────────────────────────────────────────────
  var state = {
    total: startAt,
    kick: 0, youtube: 0, twitch: 0,
    goalHit: false,
  };

  // ── DOM ────────────────────────────────────────────────────────────────────
  var container = null;
  var _findAttempts = 0;

  function findAndInit() {
    var editorRoot  = document.querySelector('[data-widget-editor-preview="sub-counter"]');
    var runtimeRoot = document.querySelector('[data-widget-id="sub-counter"]');
    var root = editorRoot || runtimeRoot;
    if (root) {
      container = root;
      // position managed by overlay runtime
      container.style.overflow = 'hidden';
      build();
    } else if (_findAttempts < 60) {
      _findAttempts++;
      requestAnimationFrame(findAndInit);
    } else {
      container = document.createElement('div');
      container.id = 'sub-counter-root';
      container.style.cssText = 'position:fixed;bottom:20px;left:50%;transform:translateX(-50%);z-index:9999;';
      document.body.appendChild(container);
      build();
    }
  }

  // ── Build DOM ──────────────────────────────────────────────────────────────
  var els = {};

  function build() {
    injectCSS();
    container.innerHTML = buildHTML();
    els.wrap     = container.querySelector('.sc-wrap');
    els.label    = container.querySelector('.sc-label');
    els.nums     = container.querySelector('.sc-nums');
    els.pct      = container.querySelector('.sc-pct');
    els.fill     = container.querySelector('.sc-fill');
    els.ring     = container.querySelector('.sc-ring-fill');
    els.breakdown= container.querySelector('.sc-breakdown');
    els.countdown= container.querySelector('.sc-countdown');
    render();
    if (endDate) startCountdown();
    if (!editorPreview) connect();
    else showPreview();
    console.log('[sub-counter] v2 started');
  }

  function buildHTML() {
    var isRing    = displayMode === 'ring';
    var isCounter = displayMode === 'counter';
    var hasBar    = !isRing && !isCounter;
    var hasGoal   = goal > 0;

    return '<div class="sc-wrap">' +
      '<div class="sc-label"></div>' +
      (isRing && hasGoal ? '<div class="sc-ring-wrap"><svg class="sc-ring-svg" viewBox="0 0 ' + ringSize + ' ' + ringSize + '"><circle class="sc-ring-track" cx="' + (ringSize/2) + '" cy="' + (ringSize/2) + '" r="' + (ringSize/2 - ringStroke) + '"/><circle class="sc-ring-fill" cx="' + (ringSize/2) + '" cy="' + (ringSize/2) + '" r="' + (ringSize/2 - ringStroke) + '"/></svg><div class="sc-ring-inner"><div class="sc-nums"></div><div class="sc-pct"></div></div></div>' : '') +
      (!isRing ? '<div class="sc-nums"></div>' : '') +
      (!isRing ? '<div class="sc-pct"></div>' : '') +
      (hasBar && hasGoal ? '<div class="sc-track"><div class="sc-fill"></div></div>' : '') +
      (showBreakdown ? '<div class="sc-breakdown"></div>' : '') +
      (endDate ? '<div class="sc-countdown"></div>' : '') +
      '</div>';
  }

  // ── CSS ────────────────────────────────────────────────────────────────────
  function injectCSS() {
    var fill = fillColor2
      ? 'linear-gradient(90deg,' + fillColor + ',' + fillColor2 + ')'
      : fillColor;
    var ringFill = fillColor2
      ? 'url(#sc-grad)'
      : fillColor;
    var r = (ringSize / 2) - ringStroke; var circumference = 2 * Math.PI * r;

    var s = document.createElement('style');
    s.textContent = [
      '.sc-wrap{font-family:' + fontFamily + ';font-size:' + fontSizePx + 'px;color:' + textColor + ';background:' + bgColor + ';padding:12px 16px;border-radius:12px;text-align:center;min-width:200px;}',
      '.sc-label{font-weight:700;font-size:1.1em;margin-bottom:6px;text-transform:uppercase;letter-spacing:0.05em;}',
      '.sc-nums{font-size:1.4em;font-weight:800;line-height:1;}',
      '.sc-pct{font-size:0.85em;opacity:0.7;margin-top:2px;}',
      '.sc-track{height:' + barHeight + 'px;background:' + trackColor + ';border-radius:' + barRadius + 'px;overflow:hidden;margin-top:8px;}',
      '.sc-fill{height:100%;width:0%;background:' + fill + ';border-radius:' + barRadius + 'px;transition:width 0.6s cubic-bezier(0.34,1.56,0.64,1);' + (barGlow ? 'box-shadow:0 0 12px ' + fillColor + ';' : '') + '}',
      '.sc-ring-wrap{position:relative;width:' + ringSize + 'px;height:' + ringSize + 'px;margin:0 auto 8px;}',
      '.sc-ring-svg{width:100%;height:100%;transform:rotate(-90deg);}',
      '.sc-ring-track{fill:none;stroke:' + trackColor + ';stroke-width:' + ringStroke + ';}',
      '.sc-ring-fill{fill:none;stroke:' + ringFill + ';stroke-width:' + ringStroke + ';stroke-linecap:round;stroke-dasharray:' + circumference + ';stroke-dashoffset:' + circumference + ';transition:stroke-dashoffset 0.6s cubic-bezier(0.34,1.56,0.64,1);' + (ringGlow ? 'filter:drop-shadow(0 0 8px ' + fillColor + ');' : '') + '}',
      '.sc-ring-inner{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;}',
      '.sc-breakdown{display:flex;justify-content:center;gap:12px;margin-top:8px;font-size:0.75em;opacity:0.8;}',
      '.sc-breakdown span{display:flex;align-items:center;gap:3px;}',
      '.sc-countdown{font-size:0.75em;opacity:0.6;margin-top:4px;}',
      '@keyframes sc-pulse{0%,100%{transform:scale(1)}50%{transform:scale(1.08)}}',
      '@keyframes sc-shake{0%,100%{transform:translateX(0)}20%,60%{transform:translateX(-6px)}40%,80%{transform:translateX(6px)}}',
      '.sc-milestone-pulse{animation:sc-pulse 0.6s ease 3;}',
      '.sc-milestone-shake{animation:sc-shake 0.5s ease 2;}',
    ].join('');
    document.head.appendChild(s);
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  function render() {
    var total = Math.max(0, state.total);
    var pctOfGoal = goal > 0 ? Math.min(overfill ? 200 : 100, (total / goal) * 100) : 0;
    var displayPct = goal > 0 ? Math.min(100, (total / goal) * 100) : 0;

    if (els.label) els.label.textContent = label;

    if (els.nums) {
      if (goal > 0 && showNumbers) {
        els.nums.textContent = total + ' / ' + goal;
      } else {
        els.nums.textContent = total;
      }
    }

    if (els.pct) {
      els.pct.textContent = showPercent ? displayPct.toFixed(0) + '%' : '';
      els.pct.style.display = showPercent ? '' : 'none';
    }

    // Bar fill
    if (els.fill) {
      var fillPct = Math.min(100, pctOfGoal);
      els.fill.style.width = fillPct + '%';
    }

    // Ring fill
    if (els.ring) {
      var r = (ringSize / 2) - ringStroke; var circumference = 2 * Math.PI * r;
      var offset = circumference - (displayPct / 100) * circumference;
      els.ring.style.strokeDashoffset = offset;
    }

    // Platform breakdown
    if (els.breakdown && showBreakdown) {
      els.breakdown.innerHTML =
        '<span style="color:' + PLATFORM_COLORS.kick    + '">🟢 ' + state.kick    + '</span>' +
        '<span style="color:' + PLATFORM_COLORS.youtube + '">▶️ ' + state.youtube + '</span>' +
        '<span style="color:' + PLATFORM_COLORS.twitch  + '">💜 ' + state.twitch  + '</span>';
    }
  }

  // ── Milestone ──────────────────────────────────────────────────────────────
  function checkMilestone(prev, next) {
    if (state.goalHit || goal <= 0) return;
    if (prev < goal && next >= goal) {
      state.goalHit = true;
      triggerMilestone();
    }
  }

  function triggerMilestone() {
    if (!els.wrap) return;
    var cls = milestoneAnim === 'shake' ? 'sc-milestone-shake' : 'sc-milestone-pulse';
    if (milestoneAnim !== 'none') {
      els.wrap.classList.add(cls);
      setTimeout(function() { els.wrap.classList.remove(cls); }, 2000);
    }
    playMilestoneSound();
  }

  function playMilestoneSound() {
    try {
      var ctx = new (window.AudioContext || window.webkitAudioContext)();
      var osc = ctx.createOscillator();
      var gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.type = 'triangle';
      var now = ctx.currentTime;
      osc.frequency.setValueAtTime(523, now);
      osc.frequency.setValueAtTime(659, now + 0.15);
      osc.frequency.setValueAtTime(784, now + 0.3);
      osc.frequency.setValueAtTime(1047, now + 0.45);
      gain.gain.setValueAtTime(0.5, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.8);
      osc.start(now); osc.stop(now + 0.8);
    } catch(e) {}
  }

  // ── Countdown ──────────────────────────────────────────────────────────────
  function startCountdown() {
    function tick() {
      if (!els.countdown || !endDate) return;
      var diff = endDate - Date.now();
      if (diff <= 0) { els.countdown.textContent = 'Goal ended'; return; }
      var d = Math.floor(diff / 86400000);
      var h = Math.floor((diff % 86400000) / 3600000);
      var m = Math.floor((diff % 3600000) / 60000);
      var s = Math.floor((diff % 60000) / 1000);
      els.countdown.textContent = (d > 0 ? d + 'd ' : '') + pad(h) + ':' + pad(m) + ':' + pad(s) + ' remaining';
    }
    function pad(n) { return n < 10 ? '0' + n : n; }
    tick();
    setInterval(tick, 1000);
  }

  // ── SSE ────────────────────────────────────────────────────────────────────
  function connect() {
    // Use shared SSE multiplexer from overlay runtime (avoids connection limit)
    // Falls back to direct EventSource if not in overlay runtime context
    if (window.__OVERLAY_PUBLIC_ID__) {
      var _onmessage = null;
      var es = {
        close: function() {},
        addEventListener: function(type, fn) {
          window.addEventListener('scraplet:widget:event:' + type, fn);
        },
        get onmessage() { return _onmessage; },
        set onmessage(fn) {
          if (_onmessage) window.removeEventListener('scraplet:widget:sse', _onmessage);
          _onmessage = fn;
          if (fn) window.addEventListener('scraplet:widget:sse', fn);
        },
        onerror: null
      };
      console.log('[sub-counter] using shared SSE');
    } else {
      var es = new EventSource('/w/' + encodeURIComponent(token) + '/stream');
    }
    var _sseListeners = [];
    es.addEventListener('subs.update', function(ev) {
      try {
        var d = JSON.parse(ev.data || '{}');
        var payload = d.payload || d;
        var prev = state.total;
        if (typeof payload.total === 'number') {
          state.total = payload.total + startAt;
          if (payload.counts) {
            state.kick    = (payload.counts.kick    || 0);
            state.youtube = (payload.counts.youtube || 0);
            state.twitch  = (payload.counts.twitch  || 0);
          }
          checkMilestone(prev, state.total);
          render();
        }
      } catch(e) {}
    });
    // Also handle individual sub events for real-time increment
    ['channel.subscription.new','channel.subscription.renewal','channel.subscription.gifts','subscribe'].forEach(function(t) {
      es.addEventListener(t, function(ev) {
        try {
          var d = JSON.parse(ev.data || '{}');
          var tier = (d.payload && d.payload.tier) || 1;
          var pts = trackPoints ? (TIER_POINTS[tier] || 1) : 1;
          var prev = state.total;
          state.total += pts;
          checkMilestone(prev, state.total);
          render();
        } catch(e) {}
      });
    });
    es.onerror = function() { es.close(); setTimeout(connect, 5000); };
    console.log('[sub-counter] SSE connected');
  }

  // ── Editor preview ─────────────────────────────────────────────────────────
  function showPreview() {
    state.total = Math.floor(goal * 0.65) + startAt;
    state.kick    = Math.floor(state.total * 0.6);
    state.youtube = Math.floor(state.total * 0.25);
    state.twitch  = state.total - state.kick - state.youtube;
    render();
    // Animate up to show progress
    var target = state.total;
    state.total = startAt;
    render();
    var step = Math.max(1, Math.floor(target / 20));
    var iv = setInterval(function() {
      state.total = Math.min(target, state.total + step);
      render();
      if (state.total >= target) clearInterval(iv);
    }, 80);
  }

  // ── Test fire ──────────────────────────────────────────────────────────────
  window.__subCounterAddSub = function(count) {
    var prev = state.total;
    state.total += (count || 1);
    checkMilestone(prev, state.total);
    render();
  };

  findAndInit();

})();

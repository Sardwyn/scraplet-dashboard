// public/widgets/random-number.js
// Random Number Generator — wheel, number picker, coin flip
(function () {
  'use strict';
  (function() {
    function _emitContainerState() {
      var _cfg = window.__WIDGET_CONFIG_RANDOM_NUMBER__ || {};
      window.dispatchEvent(new CustomEvent('scraplet:widget:state', {
        detail: {
          widgetId: 'random-number',
          instanceId: (function() { var el = document.querySelector('[data-widget-id="random-number"]'); return el ? (el.getAttribute('data-element-id') || 'random-number') : 'random-number'; })(),
          state: { bgColor: _cfg.bgColor || 'transparent', _ready: true },
        }
      }));
    }
    _emitContainerState();
    window.addEventListener('scraplet:widget:ready', function(e) {
      var d = (e && e.detail) || {};
      if (d.widgetId === 'random-number') _emitContainerState();
    });
  })();

  // Emit minimal state so React container renders
  (function() {
    function _emitContainerState() {
      var _cfg = window.__WIDGET_CONFIG_RANDOM_NUMBER__ || {};
      window.dispatchEvent(new CustomEvent('scraplet:widget:state', {{
        detail: {{
          widgetId: 'random-number',
          instanceId: (function() {{ var el = document.querySelector('[data-widget-id="random-number"]'); return el ? (el.getAttribute('data-element-id') || 'random-number') : 'random-number'; }})(),
          state: {{ bgColor: _cfg.bgColor || 'transparent', _ready: true }},
        }}
      }}));
    }}
    _emitContainerState();
    window.addEventListener('scraplet:widget:ready', function(e) {{
      var d = (e && e.detail) || {{}};
      if (d.widgetId === 'random-number') _emitContainerState();
    }});
  }})();


  // Prevent double-render in browser tab when iframe is pre-rendered
  var inIframe = (window.self !== window.top);
  if (!inIframe) {
    var iframes = document.querySelectorAll('iframe');
    for (var i = 0; i < iframes.length; i++) {
      if (iframes[i].src && iframes[i].src.indexOf('/w/') !== -1) return;
    }
  }

  var cfg = window.__WIDGET_CONFIG_RANDOM_NUMBER__ || {};
  var editorPreview = cfg.editorPreview === true || cfg.editorPreview === 'true';

  function n(v, d) { var x = Number(v); return isFinite(x) ? x : d; }
  function s(v, d) { var x = String(v || '').trim(); return x || d; }
  function b(v, d) { if (v === true || v === false) return v; var t = String(v || '').toLowerCase(); return ['1','true','yes'].includes(t) ? true : ['0','false','no'].includes(t) ? false : d; }

  var mode               = s(cfg.mode, 'number');
  var minVal             = n(cfg.minVal, 1);
  var maxVal             = n(cfg.maxVal, 100);
  var wheelItems         = s(cfg.wheelItems, 'Option 1,Option 2,Option 3,Option 4,Option 5');
  var triggerCmd         = s(cfg.triggerCmd, '!roll');
  var cmdPermission      = s(cfg.cmdPermission, 'all');
  var fontFamily         = s(cfg.fontFamily, 'Inter, system-ui, sans-serif');
  var fontSizePx         = n(cfg.fontSizePx, 64);
  var textColor          = s(cfg.textColor, '#ffffff');
  var accentColor        = s(cfg.accentColor, '#6366f1');
  var bgColor            = s(cfg.bgColor, 'rgba(0,0,0,0.85)');
  var borderRadius       = n(cfg.borderRadius, 16);
  var showTitle          = b(cfg.showTitle, true);
  var titleText          = s(cfg.titleText, '');
  var showCmd            = b(cfg.showCmd, true);
  var showHistory        = b(cfg.showHistory, false);
  var historyCount       = n(cfg.historyCount, 10);
  var autoDismiss        = n(cfg.autoDismiss, 5000);
  var autoHideStartup    = b(cfg.autoHideStartup, false);
  var autoHideStartupDelay = n(cfg.autoHideStartupDelay, 1000);
  var autoHideClose      = b(cfg.autoHideClose, false);
  var autoHideCloseDelay = n(cfg.autoHideCloseDelay, 1000);
  var chatNominate       = b(cfg.chatNominate, false);
  var nominateCmd        = s(cfg.nominateCmd, '!add');
  var nominatePermission = s(cfg.nominatePermission, 'all');
  var maxNominations     = n(cfg.maxNominations, 20);
  var clearCmd           = s(cfg.clearCmd, '!clearwheel');
  var setOptionsCmd      = s(cfg.setOptionsCmd, '!setoptions');
  var clearAfterSpin     = b(cfg.clearAfterSpin, false);

  var container = null;
  var spinning = false;
  var isHidden = false;
  var _attempts = 0;
  var wheelAngle = 0;
  var responsiveFontSize = fontSizePx;
  var resultHistory = [];

  var defaultItems = wheelItems.split(',').map(function(x) { return x.trim(); }).filter(Boolean);
  var liveItems = defaultItems.slice();
  var nominations = [];

  // Segment colour palette
  var PALETTE = [
    '#e74c3c','#e67e22','#f1c40f','#2ecc71','#1abc9c',
    '#3498db','#9b59b6','#e91e63','#00bcd4','#8bc34a',
    '#ff5722','#607d8b'
  ];

  function getActiveItems() {
    return nominations.length > 0 ? nominations : liveItems;
  }

  // ── Permission ────────────────────────────────────────────────────────────
  function checkPermission(badges, level) {
    if (level === 'all') return true;
    if (!badges) return false;
    if (Array.isArray(badges)) {
      if (level === 'broadcaster') return badges.some(function(b) { return b === 'broadcaster' || b.type === 'broadcaster'; });
      if (level === 'moderator')   return badges.some(function(b) { return ['broadcaster','moderator'].includes(b) || ['broadcaster','moderator'].includes(b.type); });
    } else if (typeof badges === 'object') {
      if (level === 'broadcaster') return !!(badges.broadcaster || badges.owner);
      if (level === 'moderator')   return !!(badges.broadcaster || badges.owner || badges.moderator || badges.mod);
    }
    return false;
  }

  // ── Canvas wheel drawing ──────────────────────────────────────────────────
  function drawWheel(canvas, items, angle) {
    var ctx = canvas.getContext('2d');
    var W = canvas.width, H = canvas.height;
    var cx = W / 2, cy = H / 2;
    var r = cx - 6; // radius with small margin
    var count = items.length;
    if (!count) return;
    var arc = (2 * Math.PI) / count;

    ctx.clearRect(0, 0, W, H);

    // Outer shadow ring
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.6)';
    ctx.shadowBlur = 18;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, 2 * Math.PI);
    ctx.fillStyle = '#111';
    ctx.fill();
    ctx.restore();

    // Segments
    for (var i = 0; i < count; i++) {
      var startAngle = angle + i * arc;
      var endAngle = startAngle + arc;
      var color = PALETTE[i % PALETTE.length];

      // Segment fill
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, r - 2, startAngle, endAngle);
      ctx.closePath();
      ctx.fillStyle = color;
      ctx.fill();

      // Segment border
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, r - 2, startAngle, endAngle);
      ctx.closePath();
      ctx.strokeStyle = 'rgba(0,0,0,0.25)';
      ctx.lineWidth = 2;
      ctx.stroke();

      // Label
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(startAngle + arc / 2);
      var labelR = r * 0.62;
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      var fontSize = Math.max(10, Math.min(18, Math.floor((r * 0.38) / Math.max(1, items[i].length * 0.45))));
      ctx.font = 'bold ' + fontSize + 'px ' + fontFamily;
      ctx.fillStyle = '#ffffff';
      ctx.shadowColor = 'rgba(0,0,0,0.7)';
      ctx.shadowBlur = 4;
      // Truncate long labels
      var label = items[i].length > 14 ? items[i].slice(0, 13) + '…' : items[i];
      ctx.fillText(label, labelR, 0);
      ctx.restore();
    }

    // Centre hub
    ctx.beginPath();
    ctx.arc(cx, cy, 18, 0, 2 * Math.PI);
    ctx.fillStyle = '#1a1a2e';
    ctx.fill();
    ctx.strokeStyle = accentColor;
    ctx.lineWidth = 3;
    ctx.stroke();

    // Outer rim
    ctx.beginPath();
    ctx.arc(cx, cy, r - 1, 0, 2 * Math.PI);
    ctx.strokeStyle = 'rgba(255,255,255,0.15)';
    ctx.lineWidth = 3;
    ctx.stroke();
  }

  // ── DOM ───────────────────────────────────────────────────────────────────
  function findAndInit() {
    var root = document.querySelector('[data-widget-editor-preview="random-number"]') ||
               document.querySelector('[data-widget-id="random-number"]');
    if (root) { 
      container = root;
      console.log('[random-number] ✓ Found container:', root, 'parent:', root.parentElement);
      console.log('[random-number] Parent transform:', root.parentElement?.style.transform);
      console.log('[random-number] Parent perspective:', root.parentElement?.style.perspective);
      build(); 
      // Add ResizeObserver to rebuild when container size changes
      if (typeof ResizeObserver !== 'undefined') {
        new ResizeObserver(function() {
          build();
        }).observe(container);
      }
      return; 
    }
    if (_attempts++ < 300) { // Increased from 150 to 300
      if (_attempts % 50 === 0) {
        console.log('[random-number] Still looking for container, attempt', _attempts);
      }
      requestAnimationFrame(findAndInit); 
      return; 
    }
    console.error('[random-number] ✗ Container not found after 300 attempts - THIS SHOULD NOT HAPPEN');
    console.log('[random-number] Available elements:', document.querySelectorAll('[data-widget-id], [data-widget-editor-preview]'));
    // Don't create fallback - just fail
    return;
  }

  function build() {
    container.innerHTML = '';

    // Calculate responsive font size based on actual container dimensions
    var actualWidth = container.offsetWidth || n(cfg._w, 400);
    var actualHeight = container.offsetHeight || n(cfg._h, 400);
    var configWidth = n(cfg._w, 400);
    var configHeight = n(cfg._h, 400);
    var scale = Math.min(actualWidth / configWidth, actualHeight / configHeight);
    responsiveFontSize = Math.round(fontSizePx * scale);

    var wrap = document.createElement('div');
    wrap.id = 'rng-wrap';
    wrap.style.cssText = [
      'display:flex;flex-direction:column;align-items:center;justify-content:center;',
      'gap:10px;padding:' + (mode === 'wheel' ? '12px' : '24px') + ';',
      'border-radius:' + borderRadius + 'px;background:' + bgColor + ';',
      'width:100%;height:100%;box-sizing:border-box;',
      'transition:opacity 0.3s ease, transform 0.3s ease;',
      editorPreview ? 'pointer-events:none;' : ''
    ].join('');

    // Title (conditionally shown)
    if (showTitle) {
      var title = document.createElement('div');
      title.style.cssText = 'font-family:' + fontFamily + ';font-size:' + Math.round(responsiveFontSize * 0.3) + 'px;color:rgba(255,255,255,0.5);text-transform:uppercase;letter-spacing:0.1em;flex-shrink:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;' + (editorPreview ? 'pointer-events:none;' : '');
      var defaultTitle = mode === 'coin' ? 'Coin Flip' : mode === 'wheel' ? 'Spin the Wheel' : 'Random Number';
      title.textContent = titleText || defaultTitle;
      wrap.appendChild(title);
    }

    var display = document.createElement('div');
    display.id = 'rng-display';
    if (editorPreview) display.style.pointerEvents = 'none';

    if (mode === 'coin') {
      var coinSize = Math.round(responsiveFontSize * 1.6);
      display.style.cssText = 'perspective:600px;width:' + coinSize + 'px;height:' + coinSize + 'px;display:flex;align-items:center;justify-content:center;flex-shrink:0;';
      display.innerHTML = [
        '<div id="rng-coin" style="width:' + coinSize + 'px;height:' + coinSize + 'px;position:relative;transform-style:preserve-3d;">',
          '<div style="position:absolute;inset:0;border-radius:50%;backface-visibility:hidden;',
            'background:radial-gradient(circle at 35% 35%,#f5d060,#c8960c,#7a5800);',
            'box-shadow:0 0 0 4px #c8960c,inset 0 2px 6px rgba(255,255,255,0.4),0 8px 24px rgba(0,0,0,0.5);',
            'display:flex;align-items:center;justify-content:center;',
            'font-family:' + fontFamily + ';font-size:' + Math.round(coinSize * 0.28) + 'px;font-weight:900;color:#7a5800;">H</div>',
          '<div style="position:absolute;inset:0;border-radius:50%;backface-visibility:hidden;',
            'background:radial-gradient(circle at 65% 35%,#e8e8e8,#a0a0a0,#606060);',
            'box-shadow:0 0 0 4px #909090,inset 0 2px 6px rgba(255,255,255,0.4),0 8px 24px rgba(0,0,0,0.5);',
            'display:flex;align-items:center;justify-content:center;',
            'font-family:' + fontFamily + ';font-size:' + Math.round(coinSize * 0.28) + 'px;font-weight:900;color:#505050;transform:rotateY(180deg);">T</div>',
        '</div>'
      ].join('');

    } else if (mode === 'wheel') {
      // Size wheel to fill container minus padding and title
      // Use actual container dimensions instead of config values
      var containerW = container.offsetWidth || n(cfg._w, 400);
      var containerH = container.offsetHeight || n(cfg._h, 400);
      var wSize = Math.min(containerW, containerH) - 60;
      wSize = Math.max(wSize, 160);
      display.style.cssText = 'position:relative;width:' + wSize + 'px;height:' + wSize + 'px;flex-shrink:0;';

      var canvas = document.createElement('canvas');
      canvas.id = 'rng-wheel-canvas';
      canvas.width = wSize;
      canvas.height = wSize;
      canvas.style.cssText = 'display:block;border-radius:50%;' + (editorPreview ? 'pointer-events:none;' : '');

      // Pointer arrow at top
      var pointer = document.createElement('div');
      pointer.style.cssText = [
        'position:absolute;top:-4px;left:50%;transform:translateX(-50%);z-index:2;',
        'width:0;height:0;',
        'border-left:14px solid transparent;',
        'border-right:14px solid transparent;',
        'border-top:32px solid ' + accentColor + ';',
        'filter:drop-shadow(0 2px 6px rgba(0,0,0,0.6));',
        editorPreview ? 'pointer-events:none;' : ''
      ].join('');

      display.appendChild(canvas);
      display.appendChild(pointer);
      drawWheel(canvas, getActiveItems(), wheelAngle);

    } else {
      display.style.cssText = 'font-family:' + fontFamily + ';font-size:' + responsiveFontSize + 'px;font-weight:700;color:' + textColor + ';text-align:center;min-height:' + (responsiveFontSize * 1.2) + 'px;display:flex;align-items:center;justify-content:center;flex-shrink:0;';
      display.textContent = '?';
    }

    wrap.appendChild(display);

    // Result label (wheel/number show below)
    var resultLabel = document.createElement('div');
    resultLabel.id = 'rng-result-label';
    resultLabel.style.cssText = 'font-family:' + fontFamily + ';font-size:' + Math.round(responsiveFontSize * 0.4) + 'px;font-weight:800;color:' + textColor + ';text-align:center;min-height:1.2em;flex-shrink:0;' + (editorPreview ? 'pointer-events:none;' : '');
    wrap.appendChild(resultLabel);

    if (showCmd) {
      var cmd = document.createElement('div');
      cmd.style.cssText = 'font-family:' + fontFamily + ';font-size:' + Math.round(responsiveFontSize * 0.22) + 'px;color:' + accentColor + ';opacity:0.7;flex-shrink:0;' + (editorPreview ? 'pointer-events:none;' : '');
      cmd.textContent = 'Type ' + triggerCmd + ' to trigger';
      wrap.appendChild(cmd);
    }

    // Nomination panel
    if (mode === 'wheel' && chatNominate) {
      var nomPanel = document.createElement('div');
      nomPanel.id = 'rng-nom-panel';
      nomPanel.style.cssText = 'width:100%;border-top:1px solid rgba(255,255,255,0.1);padding-top:8px;display:flex;flex-direction:column;gap:4px;flex-shrink:0;';
      nomPanel.innerHTML = [
        '<div style="font-family:' + fontFamily + ';font-size:' + Math.round(responsiveFontSize * 0.2) + 'px;color:rgba(255,255,255,0.4);display:flex;justify-content:space-between;">',
          '<span>Nominations</span><span id="rng-nom-count">0 / ' + maxNominations + '</span>',
        '</div>',
        '<div id="rng-nom-list" style="display:flex;flex-wrap:wrap;gap:4px;max-height:60px;overflow:hidden;"></div>',
        '<div style="font-family:' + fontFamily + ';font-size:' + Math.round(responsiveFontSize * 0.18) + 'px;color:' + accentColor + ';opacity:0.6;">Type ' + nominateCmd + ' &lt;option&gt; to add</div>'
      ].join('');
      wrap.appendChild(nomPanel);
    }

    container.appendChild(wrap);

    // Initialize history panel
    updateHistoryPanel();

    if (autoHideStartup && !editorPreview) setTimeout(hideWidget, autoHideStartupDelay);
    if (editorPreview) setTimeout(triggerSpin, 800);
  }

  function updateNomPanel() {
    var countEl = document.getElementById('rng-nom-count');
    var listEl  = document.getElementById('rng-nom-list');
    if (!countEl || !listEl) return;
    countEl.textContent = nominations.length + ' / ' + maxNominations;
    listEl.innerHTML = '';
    nominations.forEach(function(item) {
      var tag = document.createElement('span');
      tag.style.cssText = 'font-family:' + fontFamily + ';font-size:' + Math.round(responsiveFontSize * 0.2) + 'px;background:rgba(255,255,255,0.1);color:' + textColor + ';padding:2px 8px;border-radius:99px;white-space:nowrap;';
      tag.textContent = item;
      listEl.appendChild(tag);
    });
    // Redraw wheel with updated items
    var canvas = document.getElementById('rng-wheel-canvas');
    if (canvas) drawWheel(canvas, getActiveItems(), wheelAngle);
  }

  // ── Visibility ────────────────────────────────────────────────────────────
  function hideWidget() {
    var wrap = document.getElementById('rng-wrap');
    if (!wrap || isHidden) return;
    wrap.style.opacity = '0';
    wrap.style.transform = 'scale(0.85)';
    isHidden = true;
  }
  function showWidget() {
    var wrap = document.getElementById('rng-wrap');
    if (!wrap || !isHidden) return;
    wrap.style.opacity = '1';
    wrap.style.transform = 'scale(1)';
    isHidden = false;
  }

  // ── History ───────────────────────────────────────────────────────────────
  function addToHistory(result) {
    resultHistory.unshift(result); // Add to beginning
    if (resultHistory.length > historyCount) {
      resultHistory = resultHistory.slice(0, historyCount); // Keep only last N
    }
    // Update history display without rebuilding entire widget
    updateHistoryPanel();
  }

  function updateHistoryPanel() {
    if (!showHistory || !container) return;
    
    var existingPanel = document.getElementById('rng-history');
    if (existingPanel) {
      existingPanel.remove();
    }
    
    if (resultHistory.length === 0) return;
    
    var historyPanel = document.createElement('div');
    historyPanel.id = 'rng-history';
    historyPanel.style.cssText = [
      'position:absolute;top:0;left:100%;margin-left:12px;',
      'display:flex;flex-direction:column;gap:4px;',
      'padding:8px;border-radius:' + Math.round(borderRadius * 0.5) + 'px;',
      'background:' + bgColor + ';',
      'min-width:80px;max-width:120px;',
      editorPreview ? 'pointer-events:none;' : ''
    ].join('');
    
    var historyTitle = document.createElement('div');
    historyTitle.style.cssText = 'font-family:' + fontFamily + ';font-size:' + Math.round(responsiveFontSize * 0.18) + 'px;color:rgba(255,255,255,0.4);text-transform:uppercase;letter-spacing:0.05em;margin-bottom:4px;';
    historyTitle.textContent = 'History';
    historyPanel.appendChild(historyTitle);
    
    resultHistory.slice(0, historyCount).forEach(function(result) {
      var item = document.createElement('div');
      item.style.cssText = 'font-family:' + fontFamily + ';font-size:' + Math.round(responsiveFontSize * 0.22) + 'px;color:' + textColor + ';padding:4px 6px;background:rgba(255,255,255,0.05);border-radius:4px;text-align:center;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
      item.textContent = result;
      historyPanel.appendChild(item);
    });
    
    container.appendChild(historyPanel);
  }

  // ── Spin ──────────────────────────────────────────────────────────────────
  function afterSpin() {
    if (clearAfterSpin) { nominations = []; updateNomPanel(); }
    if (autoHideClose) setTimeout(hideWidget, autoHideCloseDelay);
  }

  function triggerSpin() {
    if (spinning) return;
    
    // If widget is hidden, show it first and wait for transition
    if (isHidden) {
      showWidget();
      setTimeout(function() { triggerSpin(); }, 350);
      return;
    }
    
    // Check if DOM elements exist
    if (mode === 'wheel') {
      var canvas = document.getElementById('rng-wheel-canvas');
      if (!canvas) {
        if (container) build();
        setTimeout(function() { triggerSpin(); }, 100);
        return;
      }
    } else if (mode === 'coin') {
      var coin = document.getElementById('rng-coin');
      if (!coin) {
        if (container) build();
        setTimeout(function() { triggerSpin(); }, 100);
        return;
      }
    } else {
      var display = document.getElementById('rng-display');
      if (!display) {
        if (container) build();
        setTimeout(function() { triggerSpin(); }, 100);
        return;
      }
    }
    
    spinning = true;

    var resultLabel = document.getElementById('rng-result-label');
    if (resultLabel) resultLabel.textContent = '';

    if (mode === 'coin') {
      var coin = document.getElementById('rng-coin');
      if (!coin) { spinning = false; return; }
      var targetResult = Math.random() < 0.5 ? 'HEADS' : 'TAILS';
      var landingDeg = (targetResult === 'HEADS' ? 8 * 360 : 8 * 360 + 180);
      var startTime = null;
      var duration = 1800;
      function animateCoin(ts) {
        if (!startTime) startTime = ts;
        var p = Math.min((ts - startTime) / duration, 1);
        var eased = 1 - Math.pow(1 - p, 3);
        coin.style.transform = 'rotateY(' + (eased * landingDeg) + 'deg)';
        if (p < 1) { requestAnimationFrame(animateCoin); return; }
        if (resultLabel) {
          resultLabel.textContent = targetResult;
          resultLabel.style.color = targetResult === 'HEADS' ? '#f5d060' : '#e0e0e0';
        }
        addToHistory(targetResult); // Record to history
        spinning = false;
        if (autoDismiss > 0) {
          setTimeout(function() {
            coin.style.transform = 'rotateY(0deg)';
            if (resultLabel) resultLabel.textContent = '';
            afterSpin();
          }, autoDismiss);
        } else afterSpin();
      }
      requestAnimationFrame(animateCoin);

    } else if (mode === 'wheel') {
      var items = getActiveItems();
      if (!items.length) { spinning = false; return; }
      var canvas = document.getElementById('rng-wheel-canvas');
      if (!canvas) { spinning = false; return; }

      // Pick winner and calculate landing angle
      var winnerIdx = Math.floor(Math.random() * items.length);
      var arc = (2 * Math.PI) / items.length;
      // We want the winning segment centred at the top (pointer position = -PI/2)
      // Segment i starts at angle: wheelAngle + i*arc
      // Centre of segment i: wheelAngle + i*arc + arc/2
      // We want that centre at -PI/2 (top), so we need to rotate by:
      var targetAngle = wheelAngle + (5 * 2 * Math.PI) // 5 full spins
        + (-Math.PI / 2 - (wheelAngle + winnerIdx * arc + arc / 2));
      // Normalise so we always spin forward
      while (targetAngle < wheelAngle + 4 * Math.PI) targetAngle += 2 * Math.PI;

      var spinStart = null;
      var spinDuration = 4000 + Math.random() * 1000;
      var fromAngle = wheelAngle;

      function animateWheel(ts) {
        if (!spinStart) spinStart = ts;
        var p = Math.min((ts - spinStart) / spinDuration, 1);
        // Ease out quart
        var eased = 1 - Math.pow(1 - p, 4);
        wheelAngle = fromAngle + eased * (targetAngle - fromAngle);
        drawWheel(canvas, items, wheelAngle);
        if (p < 1) { requestAnimationFrame(animateWheel); return; }
        // Normalise angle
        wheelAngle = wheelAngle % (2 * Math.PI);
        // Show result
        if (resultLabel) {
          resultLabel.textContent = items[winnerIdx];
          resultLabel.style.color = PALETTE[winnerIdx % PALETTE.length];
        }
        addToHistory(items[winnerIdx]); // Record to history
        spinning = false;
        if (autoDismiss > 0) {
          setTimeout(function() {
            if (resultLabel) resultLabel.textContent = '';
            afterSpin();
          }, autoDismiss);
        } else afterSpin();
      }
      requestAnimationFrame(animateWheel);

    } else {
      // Number mode
      var f = 0;
      var iv = setInterval(function() {
        var display = document.getElementById('rng-display');
        if (!display) {
          clearInterval(iv);
          spinning = false;
          return;
        }
        display.textContent = String(Math.floor(Math.random() * (maxVal - minVal + 1)) + minVal);
        if (++f >= 25) {
          clearInterval(iv);
          var result = Math.floor(Math.random() * (maxVal - minVal + 1)) + minVal;
          display.textContent = String(result);
          addToHistory(String(result)); // Record to history
          spinning = false;
          if (autoDismiss > 0) setTimeout(function() { 
            var d = document.getElementById('rng-display');
            if (d) d.textContent = '?'; 
            afterSpin(); 
          }, autoDismiss);
          else afterSpin();
        }
      }, 50);
    }
  }

  // ── Chat ──────────────────────────────────────────────────────────────────
  function extractChatText(d) {
    if (d.payload && d.payload.message) return d.payload.message.text || (d.payload.message.raw && d.payload.message.raw.content) || '';
    return d.message || d.content || d.text || '';
  }
  function extractBadges(d) {
    if (d.payload && d.payload.message && d.payload.message.sender) return d.payload.message.sender.badges || null;
    if (d.sender) return d.sender.badges || null;
    return d.badges || null;
  }

  function handleChatMessage(txt, badges) {
    txt = (txt || '').trim();
    var lower = txt.toLowerCase();
    
    if (lower === triggerCmd.toLowerCase()) {
      if (checkPermission(badges, cmdPermission)) {
        triggerSpin();
      }
      return;
    }
    if (mode !== 'wheel') return;
    if (lower === clearCmd.toLowerCase()) {
      if (checkPermission(badges, 'moderator')) { nominations = []; liveItems = defaultItems.slice(); updateNomPanel(); }
      return;
    }
    if (lower.startsWith(setOptionsCmd.toLowerCase() + ' ')) {
      if (checkPermission(badges, 'moderator')) {
        var newItems = txt.slice(setOptionsCmd.length + 1).split(',').map(function(x) { return x.trim(); }).filter(Boolean);
        if (newItems.length) { liveItems = newItems; nominations = []; updateNomPanel(); }
      }
      return;
    }
    if (chatNominate && lower.startsWith(nominateCmd.toLowerCase() + ' ')) {
      if (checkPermission(badges, nominatePermission) && nominations.length < maxNominations) {
        var item = txt.slice(nominateCmd.length + 1).trim();
        if (item && item.length <= 50 && !nominations.some(function(x) { return x.toLowerCase() === item.toLowerCase(); })) {
          nominations.push(item);
          updateNomPanel();
        }
      }
    }
  }

  function onChatEvent(ev) {
    try { var d = JSON.parse(ev.data); handleChatMessage(extractChatText(d), extractBadges(d)); } catch(e) {}
  }
  window.addEventListener('scraplet:widget:event:chat_message', onChatEvent);
  window.addEventListener('scraplet:widget:event:chat.message.sent', onChatEvent);

  var lastPollSeq = 0;
  var pollOverlayId = window.__OVERLAY_PUBLIC_ID__ || '';
  function pollChat() {
    if (!pollOverlayId) return;
    fetch('/api/overlays/public/' + pollOverlayId + '/chat-poll?since=' + lastPollSeq)
      .then(function(r) { return r.ok ? r.json() : null; })
      .then(function(d) {
        if (!d || !d.messages) return;
        d.messages.forEach(function(msg) {
          if (msg.seq > lastPollSeq) lastPollSeq = msg.seq;
          handleChatMessage(msg.text || '', msg.badges || msg.sender_badges || null);
        });
      }).catch(function() {});
  }
  setInterval(pollChat, 2000);

  window.addEventListener('scraplet:widget:sse', function(ev) {
    try { var d = JSON.parse(ev.data); if (d.type === 'rng.trigger') triggerSpin(); } catch(e) {}
  });

  // Hot-reload config when editor inspector changes props
  window.addEventListener('scraplet:widget:config-update', function(ev) {
    var detail = ev.detail;
    if (!detail || detail.widgetId !== 'random-number') return;
    var newCfg = detail.config || {};
    // Update live vars
    mode           = s(newCfg.mode, 'number');
    editorPreview  = newCfg.editorPreview === true || newCfg.editorPreview === 'true';
    minVal         = n(newCfg.minVal, 1);
    maxVal         = n(newCfg.maxVal, 100);
    triggerCmd     = s(newCfg.triggerCmd, '!roll');
    cmdPermission  = s(newCfg.cmdPermission, 'all');
    fontSizePx     = n(newCfg.fontSizePx, 64);
    textColor      = s(newCfg.textColor, '#ffffff');
    accentColor    = s(newCfg.accentColor, '#6366f1');
    bgColor        = s(newCfg.bgColor, 'rgba(0,0,0,0.85)');
    borderRadius   = n(newCfg.borderRadius, 16);
    showCmd        = b(newCfg.showCmd, true);
    autoDismiss    = n(newCfg.autoDismiss, 5000);
    autoHideStartup = b(newCfg.autoHideStartup, false);
    autoHideClose  = b(newCfg.autoHideClose, false);
    chatNominate   = b(newCfg.chatNominate, false);
    nominateCmd    = s(newCfg.nominateCmd, '!add');
    maxNominations = n(newCfg.maxNominations, 20);
    clearAfterSpin = b(newCfg.clearAfterSpin, false);
    // Update wheel items if changed
    var newDefault = s(newCfg.wheelItems, 'Option 1,Option 2,Option 3,Option 4,Option 5')
      .split(',').map(function(x) { return x.trim(); }).filter(Boolean);
    defaultItems = newDefault;
    if (!nominations.length) liveItems = newDefault.slice();
    // Rebuild the widget UI
    if (container) {
      spinning = false;
      isHidden = false;
      _attempts = 0;
      build();
    }
  });

  requestAnimationFrame(findAndInit);
})();

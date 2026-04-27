// public/widgets/sound-visualizer.js
// Sound Visualizer — wave, bars, pips modes using Web Audio API
(function () {
  'use strict';
  (function() {
    function _emitContainerState() {
      var _cfg = window.__WIDGET_CONFIG_SOUND_VISUALIZER__ || {};
      window.dispatchEvent(new CustomEvent('scraplet:widget:state', {
        detail: {
          widgetId: 'sound-visualizer',
          instanceId: (function() { var el = document.querySelector('[data-widget-id="sound-visualizer"]'); return el ? (el.getAttribute('data-element-id') || 'sound-visualizer') : 'sound-visualizer'; })(),
          state: { bgColor: _cfg.bgColor || 'transparent', _ready: true },
        }
      }));
    }
    _emitContainerState();
    window.addEventListener('scraplet:widget:ready', function(e) {
      var d = (e && e.detail) || {};
      if (d.widgetId === 'sound-visualizer') _emitContainerState();
    });
  })();

  // Emit minimal state so React container renders
  (function() {
    function _emitContainerState() {
      var _cfg = window.__WIDGET_CONFIG_SOUND_VISUALIZER__ || {};
      window.dispatchEvent(new CustomEvent('scraplet:widget:state', {{
        detail: {{
          widgetId: 'sound-visualizer',
          instanceId: (function() {{ var el = document.querySelector('[data-widget-id="sound-visualizer"]'); return el ? (el.getAttribute('data-element-id') || 'sound-visualizer') : 'sound-visualizer'; }})(),
          state: {{ bgColor: _cfg.bgColor || 'transparent', _ready: true }},
        }}
      }}));
    }}
    _emitContainerState();
    window.addEventListener('scraplet:widget:ready', function(e) {{
      var d = (e && e.detail) || {{}};
      if (d.widgetId === 'sound-visualizer') _emitContainerState();
    }});
  }})();


  var cfg = window.__WIDGET_CONFIG_SOUND_VISUALIZER__ || {};
  var editorPreview = cfg.editorPreview === true || cfg.editorPreview === 'true';

  function n(v, d) { var x = Number(v); return isFinite(x) ? x : d; }
  function s(v, d) { var x = String(v || '').trim(); return x || d; }
  function b(v, d) { if (v === true || v === false) return v; var t = String(v || '').toLowerCase(); return ['1','true','yes'].includes(t) ? true : ['0','false','no'].includes(t) ? false : d; }

  var mode        = s(cfg.mode, 'bars');       // 'bars' | 'wave' | 'pips' | 'mirror-bars'
  var barCount    = n(cfg.barCount, 32);
  var color1      = s(cfg.color1, '#6366f1');
  var color2      = s(cfg.color2, '#a855f7');  // gradient end (empty = solid)
  var bgColor     = s(cfg.bgColor, 'transparent');
  var barRadius   = n(cfg.barRadius, 4);
  var barGap      = n(cfg.barGap, 3);
  var sensitivity = n(cfg.sensitivity, 1.5);
  var smoothing   = n(cfg.smoothing, 0.8);
  var minHeight   = n(cfg.minHeight, 4);       // px
  var reactive    = b(cfg.reactive, true);     // use mic/audio input
  var mirrorH     = b(cfg.mirrorH, false);     // mirror horizontally

  var container = null;
  var canvas = null;
  var ctx = null;
  var analyser = null;
  var dataArray = null;
  var animId = null;
  var _attempts = 0;
  var demoPhase = 0;

  function findAndInit() {
    var root = document.querySelector('[data-widget-editor-preview="sound-visualizer"]') ||
               document.querySelector('[data-widget-id="sound-visualizer"]');
    if (root) {
      container = root;
      container.style.cssText = 'position:relative;width:100%;height:100%;overflow:hidden;background:' + bgColor + ';';
      buildCanvas();
      if (reactive) initAudio();
      else startDemo();
      draw();
    } else if (_attempts++ < 300) requestAnimationFrame(findAndInit);
  }

  function buildCanvas() {
    canvas = document.createElement('canvas');
    canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;';
    container.appendChild(canvas);
    ctx = canvas.getContext('2d');
    resize();
    window.addEventListener('resize', resize);
  }

  function resize() {
    if (!canvas || !container) return;
    canvas.width = container.offsetWidth || 400;
    canvas.height = container.offsetHeight || 200;
  }

  function initAudio() {
    // Try to use shared analyser from overlay runtime first
    if (window.__AUDIO_ANALYSERS__) {
      var el = document.querySelector('[data-widget-id="sound-visualizer"]');
      if (el) {
        var id = el.getAttribute('data-widget-instance-id') || 'sound-visualizer';
        var shared = window.__AUDIO_ANALYSERS__.get(id);
        if (shared) { analyser = shared; dataArray = new Uint8Array(analyser.frequencyBinCount); return; }
      }
    }
    // Fallback: request mic
    navigator.mediaDevices && navigator.mediaDevices.getUserMedia({ audio: true }).then(function (stream) {
      var ac = new AudioContext();
      var src = ac.createMediaStreamSource(stream);
      analyser = ac.createAnalyser();
      analyser.fftSize = barCount * 4;
      analyser.smoothingTimeConstant = smoothing;
      src.connect(analyser);
      dataArray = new Uint8Array(analyser.frequencyBinCount);
    }).catch(function () { startDemo(); });
  }

  function startDemo() {
    // Animate without real audio
    analyser = null;
  }

  function getDemoData(count) {
    demoPhase += 0.05;
    var arr = new Float32Array(count);
    for (var i = 0; i < count; i++) {
      arr[i] = (Math.sin(demoPhase + i * 0.4) * 0.5 + 0.5) *
               (Math.sin(demoPhase * 0.7 + i * 0.2) * 0.3 + 0.7) * 0.8;
    }
    return arr;
  }

  function getFreqData(count) {
    if (!analyser || !dataArray) return getDemoData(count);
    analyser.getByteFrequencyData(dataArray);
    var step = Math.floor(dataArray.length / count);
    var result = new Float32Array(count);
    for (var i = 0; i < count; i++) {
      var sum = 0;
      for (var j = 0; j < step; j++) sum += dataArray[i * step + j];
      result[i] = Math.min(1, (sum / step / 255) * sensitivity);
    }
    return result;
  }

  function makeGradient(x1, y1, x2, y2) {
    if (!color2) return color1;
    var g = ctx.createLinearGradient(x1, y1, x2, y2);
    g.addColorStop(0, color1);
    g.addColorStop(1, color2);
    return g;
  }

  function draw() {
    animId = requestAnimationFrame(draw);
    if (!ctx || !canvas) return;
    var W = canvas.width, H = canvas.height;
    ctx.clearRect(0, 0, W, H);

    var data = getFreqData(barCount);
    var count = mirrorH ? Math.ceil(barCount / 2) : barCount;
    var totalW = W;
    var barW = Math.max(1, (totalW - barGap * (count - 1)) / count);

    if (mode === 'bars' || mode === 'mirror-bars') {
      var isMirror = mode === 'mirror-bars';
      ctx.fillStyle = makeGradient(0, H, 0, 0);
      for (var i = 0; i < count; i++) {
        var idx = mirrorH ? i : i;
        var val = data[idx] || 0;
        var bh = Math.max(minHeight, val * H);
        var x = i * (barW + barGap);
        var y = isMirror ? (H - bh) / 2 : H - bh;
        var h = isMirror ? bh : bh;
        ctx.beginPath();
        ctx.roundRect ? ctx.roundRect(x, y, barW, h, barRadius) : ctx.rect(x, y, barW, h);
        ctx.fill();
        if (mirrorH) {
          var x2 = W - x - barW;
          ctx.beginPath();
          ctx.roundRect ? ctx.roundRect(x2, y, barW, h, barRadius) : ctx.rect(x2, y, barW, h);
          ctx.fill();
        }
      }
    } else if (mode === 'wave') {
      ctx.strokeStyle = color1;
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (var i2 = 0; i2 < barCount; i2++) {
        var val2 = data[i2] || 0;
        var x2w = (i2 / (barCount - 1)) * W;
        var y2w = H / 2 + (val2 - 0.5) * H * 0.8;
        i2 === 0 ? ctx.moveTo(x2w, y2w) : ctx.lineTo(x2w, y2w);
      }
      ctx.stroke();
    } else if (mode === 'pips') {
      var pipR = Math.max(2, (barW - barGap) / 2);
      var rows = Math.floor(H / (pipR * 2 + barGap));
      ctx.fillStyle = color1;
      for (var i3 = 0; i3 < count; i3++) {
        var val3 = data[i3] || 0;
        var litRows = Math.round(val3 * rows);
        var cx3 = i3 * (barW + barGap) + barW / 2;
        for (var r = 0; r < rows; r++) {
          var cy3 = H - r * (pipR * 2 + barGap) - pipR;
          ctx.globalAlpha = r < litRows ? 1 : 0.1;
          ctx.beginPath();
          ctx.arc(cx3, cy3, pipR, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.globalAlpha = 1;
    }
  }

  requestAnimationFrame(findAndInit);
})();

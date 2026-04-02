// public/widgets/subathon-timer.js
// Subathon Timer widget — countdown clock with event-driven time additions.

(function () {
  'use strict';

  var cfg = window.__WIDGET_CONFIG_SUBATHON_TIMER__ || {};
  var token = cfg.token || window.__WIDGET_TOKEN__ || '';
  var editorPreview = cfg.editorPreview === true || cfg.editorPreview === 'true';

  if (!token && !editorPreview) { console.warn('[subathon] No token'); return; }
  if (token) window.__WIDGET_TOKEN__ = token;

  // ── Config ─────────────────────────────────────────────────────────────────
  function s(v,d){ return String(v||'').trim()||d; }
  function n(v,d){ var x=Number(v); return isFinite(x)?x:d; }
  function b(v,d){ if(v===true||v===false)return v; var t=String(v||'').toLowerCase(); return ['1','true','yes','on'].includes(t)?true:d; }

  var fontFamily   = s(cfg.fontFamily,   'Inter, system-ui, sans-serif');
  var fontSizePx   = n(cfg.fontSizePx,   48);
  var textColor    = s(cfg.textColor,    '#ffffff');
  var accentColor  = s(cfg.accentColor,  '#6366f1');
  var bgColor      = s(cfg.bgColor,      'transparent');
  var showLabel    = b(cfg.showLabel,    true);
  var label        = s(cfg.label,        'SUBATHON');
  var showBar      = b(cfg.showBar,      true);
  var maxMs        = n(cfg.maxMs,        2 * 60 * 60 * 1000); // for bar calculation
  var urgentMs     = n(cfg.urgentMs,     5 * 60 * 1000);      // flash red when < 5min
  var showAddAnim  = b(cfg.showAddAnim,  true);

  // ── State ──────────────────────────────────────────────────────────────────
  var state = { status: 'stopped', remainingMs: 0 };
  var lastRemainingMs = 0;
  var container = null;
  var el = {};
  var _findAttempts = 0;
  var localTick = null;
  var localLastUpdate = Date.now();

  // ── DOM ────────────────────────────────────────────────────────────────────
  function findAndInit() {
    var editorRoot  = document.querySelector('[data-widget-editor-preview="subathon-timer"]');
    var runtimeRoot = document.querySelector('[data-widget-id="subathon-timer"]');
    var root = editorRoot || runtimeRoot;
    if (root) {
      container = root;
      container.style.position = 'relative';
      container.style.overflow = 'hidden';
      build();
    } else if (_findAttempts < 60) {
      _findAttempts++;
      requestAnimationFrame(findAndInit);
    } else {
      container = document.createElement('div');
      container.id = 'subathon-root';
      container.style.cssText = 'position:fixed;bottom:20px;left:50%;transform:translateX(-50%);z-index:9999;pointer-events:none;';
      document.body.appendChild(container);
      build();
    }
  }

  function build() {
    injectCSS();
    container.innerHTML = [
      '<div class="sa-wrap">',
        showLabel ? '<div class="sa-label">' + escHtml(label) + '</div>' : '',
        '<div class="sa-time"></div>',
        showBar ? '<div class="sa-bar-track"><div class="sa-bar-fill"></div></div>' : '',
        '<div class="sa-add-anim" style="display:none"></div>',
      '</div>',
    ].join('');
    el.wrap  = container.querySelector('.sa-wrap');
    el.time  = container.querySelector('.sa-time');
    el.fill  = container.querySelector('.sa-bar-fill');
    el.add   = container.querySelector('.sa-add-anim');
    render();
    if (!editorPreview) connect();
    else showPreview();
    console.log('[subathon] v1 started');
  }

  function injectCSS() {
    var st = document.createElement('style');
    st.textContent = [
      '.sa-wrap{width:100%;height:100%;background:'+bgColor+';display:flex;flex-direction:column;align-items:center;justify-content:center;font-family:'+fontFamily+';color:'+textColor+';padding:8px;box-sizing:border-box;position:relative;}',
      '.sa-label{font-size:0.35em;font-weight:700;letter-spacing:0.15em;text-transform:uppercase;opacity:0.7;margin-bottom:4px;}',
      '.sa-time{font-size:'+fontSizePx+'px;font-weight:800;font-variant-numeric:tabular-nums;line-height:1;transition:color 0.3s;}',
      '.sa-time.urgent{color:#ef4444;animation:sa-pulse 1s ease infinite;}',
      '.sa-bar-track{width:100%;height:6px;background:rgba(255,255,255,0.1);border-radius:999px;overflow:hidden;margin-top:8px;}',
      '.sa-bar-fill{height:100%;background:'+accentColor+';border-radius:999px;transition:width 1s linear;}',
      '.sa-add-anim{position:absolute;top:4px;right:8px;font-size:0.8em;font-weight:700;color:'+accentColor+';opacity:0;pointer-events:none;}',
      '@keyframes sa-pulse{0%,100%{opacity:1}50%{opacity:0.5}}',
      '@keyframes sa-add{0%{opacity:1;transform:translateY(0)}100%{opacity:0;transform:translateY(-20px)}}',
    ].join('');
    document.head.appendChild(st);
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  function formatTime(ms) {
    if (ms <= 0) return '00:00:00';
    var s = Math.floor(ms / 1000);
    var h = Math.floor(s / 3600);
    var m = Math.floor((s % 3600) / 60);
    var sec = s % 60;
    return pad(h) + ':' + pad(m) + ':' + pad(sec);
  }
  function pad(n) { return n < 10 ? '0' + n : String(n); }

  function render() {
    if (!el.time) return;
    var ms = state.remainingMs;
    el.time.textContent = formatTime(ms);
    el.time.classList.toggle('urgent', ms > 0 && ms < urgentMs);
    if (el.fill) {
      var pct = maxMs > 0 ? Math.min(100, (ms / maxMs) * 100) : 0;
      el.fill.style.width = pct + '%';
      el.fill.style.background = ms < urgentMs && ms > 0 ? '#ef4444' : accentColor;
    }
  }

  function showAddAnimation(addedMs) {
    if (!showAddAnim || !el.add) return;
    var mins = Math.floor(addedMs / 60000);
    var secs = Math.floor((addedMs % 60000) / 1000);
    el.add.textContent = '+' + (mins > 0 ? mins + 'm' : secs + 's');
    el.add.style.display = 'block';
    el.add.style.animation = 'none';
    requestAnimationFrame(function() {
      el.add.style.animation = 'sa-add 1.5s ease forwards';
      setTimeout(function() { el.add.style.display = 'none'; }, 1500);
    });
  }

  // ── Local tick (smooth countdown between SSE updates) ─────────────────────
  function startLocalTick() {
    if (localTick) return;
    localLastUpdate = Date.now();
    localTick = setInterval(function() {
      if (state.status !== 'running') return;
      var elapsed = Date.now() - localLastUpdate;
      localLastUpdate = Date.now();
      state.remainingMs = Math.max(0, state.remainingMs - elapsed);
      render();
    }, 100);
  }

  function stopLocalTick() {
    if (localTick) { clearInterval(localTick); localTick = null; }
  }

  // ── SSE connection ─────────────────────────────────────────────────────────
  function connect() {
    var url = '/dashboard/api/subathon/stream';
    var es = new EventSource(url, { withCredentials: true });
    es.onmessage = function(e) {
      try {
        var d = JSON.parse(e.data);
        var prevMs = state.remainingMs;
        state.status = d.status;
        state.remainingMs = d.remainingMs || 0;
        localLastUpdate = Date.now();
        if (d.config && d.config.maxMs) maxMs = d.config.maxMs;
        // Show add animation if time increased
        if (d.remainingMs > prevMs + 1000) showAddAnimation(d.remainingMs - prevMs);
        render();
        if (d.status === 'running') startLocalTick();
        else stopLocalTick();
      } catch(err) {}
    };
    es.onerror = function() { es.close(); setTimeout(connect, 5000); };
    console.log('[subathon] SSE connected');
  }

  // ── Editor preview ─────────────────────────────────────────────────────────
  function showPreview() {
    state.status = 'running';
    state.remainingMs = 1 * 60 * 60 * 1000 + 23 * 60 * 1000 + 45 * 1000; // 1:23:45
    render();
    startLocalTick();
    // Simulate a time addition after 2s
    setTimeout(function() { showAddAnimation(5 * 60 * 1000); }, 2000);
  }

  function escHtml(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

  findAndInit();

})();

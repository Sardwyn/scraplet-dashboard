// public/widgets/raffle.js
// Raffle widget v2 — script injection, bounding box aware, full visual config.

(function () {
  'use strict';

  var cfg = window.__WIDGET_CONFIG_RAFFLE__ || {};
  var token = cfg.token || window.__WIDGET_TOKEN__ || '';
  var editorPreview = cfg.editorPreview === true || cfg.editorPreview === 'true';

  if (!token && !editorPreview) { console.warn('[raffle] No token'); return; }
  if (token) window.__WIDGET_TOKEN__ = token;

  // ── Config ─────────────────────────────────────────────────────────────────
  function s(v,d){ var x=String(v||'').trim(); return x||d; }
  function n(v,d){ var x=Number(v); return isFinite(x)?x:d; }
  function b(v,d){ if(v===true||v===false)return v; var t=String(v||'').toLowerCase(); return ['1','true','yes','on'].includes(t)?true:['0','false','no','off'].includes(t)?false:d; }

  var fontFamily    = s(cfg.fontFamily,   'Inter, system-ui, sans-serif');
  var fontSizePx    = n(cfg.fontSizePx,   18);
  var textColor     = s(cfg.textColor,    '#ffffff');
  var accentColor   = s(cfg.accentColor,  '#6366f1');
  var bgColor       = s(cfg.bgColor,      'rgba(0,0,0,0.85)');
  var winnerColor   = s(cfg.winnerColor,  '#fbbf24');
  var borderRadius  = n(cfg.borderRadius, 16);
  var showStatus    = b(cfg.showStatus,   true);
  var showCount     = b(cfg.showCount,    true);
  var showJoinCmd   = b(cfg.showJoinCmd,  true);
  var joinCommand   = s(cfg.joinCommand,  '!join');
  var prefAnim      = s(cfg.prefAnim,     ''); // '' = use server value, or override

  // ── State ──────────────────────────────────────────────────────────────────
  var state = {
    connected: false,
    topic: '—', joinPhrase: joinCommand, count: 0,
    animation: prefAnim || 'wheel',
    status: 'idle',
    sampleNames: ['Wait.', 'Loading.', 'Drawing.'],
    frozenOnWinner: false,
    activeSessionId: null,
    slotTimer: null, wheelTimer: null,
    lastWinner: null,
  };

  var es = null;
  var retryMs = 800;

  // ── DOM ────────────────────────────────────────────────────────────────────
  var container = null;
  var el = {};
  var _findAttempts = 0;

  function findAndInit() {
    var editorRoot  = document.querySelector('[data-widget-editor-preview="raffle"]');
    var runtimeRoot = document.querySelector('[data-widget-id="raffle"]');
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
      container.id = 'raffle-root';
      container.style.cssText = 'position:fixed;inset:0;z-index:9999;pointer-events:none;';
      document.body.appendChild(container);
      build();
    }
  }

  function build() {
    // Restore state from previous instance if reinit happened
    if (window.__raffleState) {
      Object.assign(state, window.__raffleState);
      // Apply new config values over restored state
      if (prefAnim) state.animation = prefAnim;
      state.joinPhrase = joinCommand || state.joinPhrase;
    }
    // If we were mid-roll, re-trigger with new animation after DOM is built
    if (window.__raffleState && window.__raffleState.status === 'rolling') {
      setTimeout(function() {
        var pool = state.sampleNames;
        if (state.animation === 'wheel') startWheelRolling(pool);
        else if (state.animation === 'scramble') startScrambleRolling(pool);
        else startSlotRolling(pool);
      }, 50);
    }
    injectCSS();
    container.innerHTML = [
      '<div class="rf-wrap">',
        '<div class="rf-header">',
          '<span class="rf-dot"></span>',
          '<span class="rf-label">Waiting</span>',
          '<span class="rf-anim-chip"></span>',
        '</div>',
        '<div class="rf-name">—</div>',
        '<div class="rf-hint">Start the raffle from the dashboard.</div>',
        '<div class="rf-wheel-box" style="display:none"><div class="rf-wheel-list"></div></div>',
        '<div class="rf-slot-box" style="display:none"><div class="rf-slot-txt">—</div></div>',
        '<div class="rf-footer">',
          '<span class="rf-count-wrap">👥 <span class="rf-count">0</span></span>',
          '<span class="rf-join-wrap">Type <b class="rf-join-cmd">!join</b></span>',
        '</div>',
        '<div class="rf-confetti-box" style="display:none"></div>',
      '</div>',
    ].join('');

    el.dot       = container.querySelector('.rf-dot');
    el.label     = container.querySelector('.rf-label');
    el.animChip  = container.querySelector('.rf-anim-chip');
    el.name      = container.querySelector('.rf-name');
    el.hint      = container.querySelector('.rf-hint');
    el.wheelBox  = container.querySelector('.rf-wheel-box');
    el.wheelList = container.querySelector('.rf-wheel-list');
    el.slotBox   = container.querySelector('.rf-slot-box');
    el.slotTxt   = container.querySelector('.rf-slot-txt');
    el.count     = container.querySelector('.rf-count');
    el.countWrap = container.querySelector('.rf-count-wrap');
    el.joinWrap  = container.querySelector('.rf-join-wrap');
    el.joinCmd   = container.querySelector('.rf-join-cmd');
    el.confetti  = container.querySelector('.rf-confetti-box');
    el.footer    = container.querySelector('.rf-footer');

    if (!showStatus) { el.dot.style.display = 'none'; }
    if (!showCount)  { el.countWrap.style.display = 'none'; }
    if (!showJoinCmd){ el.joinWrap.style.display = 'none'; }

    resetToWaiting();
    if (!editorPreview) connect();
    else showPreview();
    console.log('[raffle] v2 started');
  }

  // ── CSS ────────────────────────────────────────────────────────────────────
  function injectCSS() {
    var st = document.createElement('style');
    st.textContent = [
      '.rf-wrap{width:100%;height:100%;background:'+bgColor+';border-radius:'+borderRadius+'px;display:flex;flex-direction:column;align-items:center;justify-content:center;font-family:'+fontFamily+';font-size:'+fontSizePx+'px;color:'+textColor+';padding:16px;box-sizing:border-box;position:relative;overflow:hidden;}',
      '.rf-header{display:flex;align-items:center;gap:8px;margin-bottom:8px;width:100%;justify-content:center;}',
      '.rf-dot{width:8px;height:8px;border-radius:50%;background:#ef4444;flex-shrink:0;transition:background 0.3s;}',
      '.rf-dot.ok{background:#22c55e;} .rf-dot.warn{background:#f59e0b;}',
      '.rf-label{font-weight:700;font-size:0.85em;text-transform:uppercase;letter-spacing:0.08em;opacity:0.7;}',
      '.rf-anim-chip{font-size:0.7em;background:rgba(255,255,255,0.1);padding:2px 6px;border-radius:4px;opacity:0.6;}',
      '.rf-name{font-size:1.8em;font-weight:800;text-align:center;line-height:1.1;margin:4px 0;transition:color 0.3s;word-break:break-word;max-width:100%;}',
      '.rf-name.winner{color:'+winnerColor+';text-shadow:0 0 20px '+winnerColor+'88;}',
      '.rf-hint{font-size:0.75em;opacity:0.5;text-align:center;margin-bottom:8px;}',
      '.rf-wheel-box{width:100%;max-height:200px;overflow:hidden;border:2px solid '+accentColor+';border-radius:8px;position:relative;margin:8px 0;}',
      '.rf-wheel-box::before,.rf-wheel-box::after{content:"";position:absolute;left:0;right:0;height:40%;z-index:2;pointer-events:none;}',
      '.rf-wheel-box::before{top:0;background:linear-gradient(to bottom,'+bgColor+',transparent);}',
      '.rf-wheel-box::after{bottom:0;background:linear-gradient(to top,'+bgColor+',transparent);}',
      '.rf-wheel-list{display:flex;flex-direction:column;will-change:transform;}',
      '.rf-wheel-pill{padding:8px 12px;text-align:center;font-size:0.9em;opacity:0.5;transition:opacity 0.2s;}',
      '.rf-wheel-pill.target{opacity:1;font-weight:700;color:'+accentColor+';}',
      '.rf-slot-box{width:100%;padding:12px;border:2px solid '+accentColor+';border-radius:8px;margin:8px 0;text-align:center;}',
      '.rf-slot-txt{font-size:1.4em;font-weight:700;color:'+accentColor+';min-height:1.5em;}',
      '.rf-footer{display:flex;gap:16px;font-size:0.75em;opacity:0.6;margin-top:auto;padding-top:8px;}',
      '.rf-confetti-box{position:absolute;inset:0;pointer-events:none;overflow:hidden;}',
      '.rf-confetti{position:absolute;top:-10px;width:8px;height:8px;border-radius:2px;animation:rf-fall 1.8s ease-in forwards;}',
      '@keyframes rf-fall{to{transform:translateY(110vh) rotate(720deg);opacity:0;}}',
    ].join('');
    document.head.appendChild(st);
  }

  // ── Helpers ────────────────────────────────────────────────────────────────
  function sanitize(s) { return s ? String(s).trim().slice(0,36) || '—' : '—'; }
  function pick(arr) { return arr[Math.floor(Math.random()*arr.length)]; }

  function setDot(mode) {
    if (!el.dot) return;
    el.dot.className = 'rf-dot' + (mode==='ok'?' ok':mode==='warn'?' warn':'');
  }

  function showMode(which) {
    if (el.wheelBox) el.wheelBox.style.display = which==='wheel'?'block':'none';
    if (el.slotBox)  el.slotBox.style.display  = (which==='slot'||which==='scramble')?'block':'none';
  }

  function updateFooter() {
    if (el.count)   el.count.textContent   = String(state.count);
    if (el.joinCmd) el.joinCmd.textContent = state.joinPhrase;
    if (el.animChip) el.animChip.textContent = state.animation.toUpperCase();
  }

  function stopAll() {
    if (state.slotTimer)  { clearInterval(state.slotTimer);  state.slotTimer  = null; }
    if (state.wheelTimer) { clearInterval(state.wheelTimer); state.wheelTimer = null; }
  }

  // ── Wheel ──────────────────────────────────────────────────────────────────
  function startWheelRolling(pool) {
    stopAll(); showMode('wheel');
    var safePool = (pool&&pool.length?pool:state.sampleNames).map(sanitize);
    var reel = new Array(30).fill(null).map(function(){ return pick(safePool); });
    el.wheelList.innerHTML = '';
    reel.forEach(function(name) {
      var row = document.createElement('div');
      row.className = 'rf-wheel-pill';
      row.textContent = name;
      el.wheelList.appendChild(row);
    });
    el.wheelList.style.transition = 'none';
    el.wheelList.style.transform = 'translateY(0px)';
    var rowH = 40;
    var y = 0;
    state.wheelTimer = setInterval(function() {
      y -= rowH;
      el.wheelList.style.transition = 'transform 120ms linear';
      el.wheelList.style.transform = 'translateY('+y+'px)';
      setTimeout(function() {
        var first = el.wheelList.firstElementChild;
        if (first) { el.wheelList.appendChild(first); if (Math.random()<0.35) first.textContent = pick(safePool); }
        el.wheelList.style.transition = 'none';
        y += rowH;
        el.wheelList.style.transform = 'translateY('+y+'px)';
      }, 130);
    }, 140);
  }

  function landWheel(pool, winner) {
    stopAll(); showMode('wheel');
    var safePool = (pool&&pool.length?pool:state.sampleNames).map(sanitize);
    var safeWinner = sanitize(winner);
    var reelSize = 33; var targetIdx = 17;
    var reel = new Array(reelSize).fill(null).map(function(){ return pick(safePool); });
    reel[targetIdx] = safeWinner;
    el.wheelList.innerHTML = '';
    reel.forEach(function(name, i) {
      var row = document.createElement('div');
      row.className = 'rf-wheel-pill' + (i===targetIdx?' target':'');
      row.textContent = name;
      el.wheelList.appendChild(row);
    });
    el.wheelList.style.transition = 'none';
    el.wheelList.style.transform = 'translateY(0px)';
    requestAnimationFrame(function() { requestAnimationFrame(function() {
      var target = el.wheelList.children[targetIdx];
      if (!target) return;
      var boxRect = el.wheelBox.getBoundingClientRect();
      var tRect   = target.getBoundingClientRect();
      var delta   = (boxRect.top + boxRect.height/2) - (tRect.top + tRect.height/2);
      el.wheelList.style.transition = 'transform 1900ms cubic-bezier(0.12,0.88,0.12,1)';
      el.wheelList.style.transform  = 'translateY('+delta+'px)';
    }); });
  }

  // ── Slot / Scramble ────────────────────────────────────────────────────────
  function startSlotRolling(pool) {
    stopAll(); showMode('slot');
    var safePool = (pool&&pool.length?pool:state.sampleNames).map(sanitize);
    state.slotTimer = setInterval(function() { el.slotTxt.textContent = pick(safePool); }, 60);
  }

  function startScrambleRolling(pool) {
    stopAll(); showMode('scramble');
    var safePool = (pool&&pool.length?pool:state.sampleNames).map(sanitize);
    var glyphs = '!@#$%^&*()_+=-{}[]<>?/\\|~';
    var base = pick(safePool);
    state.slotTimer = setInterval(function() {
      if (Math.random()<0.35) base = pick(safePool);
      var a = base.split('');
      for (var i=0;i<Math.min(3,Math.floor(Math.random()*4));i++) {
        a[Math.floor(Math.random()*a.length)] = glyphs[Math.floor(Math.random()*glyphs.length)];
      }
      el.slotTxt.textContent = a.join('') + (Math.random()<0.25?' ▌':'');
    }, 55);
  }

  // ── Confetti ───────────────────────────────────────────────────────────────
  function burstConfetti() {
    if (!el.confetti) return;
    el.confetti.innerHTML = '';
    el.confetti.style.display = 'block';
    var colors = ['#818cf8','#22c55e','#facc15','#ef4444','#f472b6'];
    for (var i=0;i<70;i++) {
      var dot = document.createElement('div');
      dot.className = 'rf-confetti';
      dot.style.left = (Math.random()*100).toFixed(2)+'%';
      dot.style.background = colors[i%colors.length];
      dot.style.animationDelay = (Math.random()*0.15)+'s';
      el.confetti.appendChild(dot);
    }
    setTimeout(function() { el.confetti.style.display='none'; el.confetti.innerHTML=''; }, 1900);
  }

  // ── State machine ──────────────────────────────────────────────────────────
  function resetToWaiting() {
    state.frozenOnWinner = false; state.activeSessionId = null;
    stopAll();
    state.status = 'idle'; state.lastWinner = null;
    setDot(state.connected?'warn':'');
    showMode('none');
    if (el.label) el.label.textContent = 'Waiting';
    if (el.name)  { el.name.textContent = '—'; el.name.classList.remove('winner'); }
    if (el.hint)  el.hint.textContent = 'Start the raffle from the dashboard.';
    updateFooter();
  }

  function applyState(p) {
    p = p || {};
    if (p.sessionId) {
      var sid = String(p.sessionId);
      if (state.activeSessionId && sid !== state.activeSessionId) return;
      if (!state.activeSessionId) state.activeSessionId = sid;
    }
    if (state.frozenOnWinner) return;
    if (p.joinPhrase) state.joinPhrase = String(p.joinPhrase).trim();
    if (isFinite(Number(p.count))) state.count = Number(p.count);
    if (p.animation && !prefAnim) state.animation = String(p.animation);
    if (p.sampleNames && p.sampleNames.length) state.sampleNames = p.sampleNames.slice(0,120);
    updateFooter();
    window.__raffleState = Object.assign({}, state);
    var status = String(p.status||'').toLowerCase();
    if (status === 'collecting') {
      stopAll(); showMode('none'); state.status = 'collecting';
      setDot('ok');
      if (el.label) el.label.textContent = 'Collecting';
      if (el.name)  { el.name.textContent = 'Entries Open'; el.name.classList.remove('winner'); }
      if (el.hint)  el.hint.textContent = 'Waiting for chat joins…';
    } else if (status === 'rolling') {
      state.status = 'rolling';
      setDot('ok');
      if (el.label) el.label.textContent = 'Rolling';
      if (el.name)  { el.name.textContent = '—'; el.name.classList.remove('winner'); }
      if (el.hint)  el.hint.textContent = 'Drawing a winner…';
      var pool = p.sampleNames || state.sampleNames;
      if (state.animation==='wheel') startWheelRolling(pool);
      else if (state.animation==='scramble') startScrambleRolling(pool);
      else startSlotRolling(pool);
    }
  }

  function applyWinner(p) {
    p = p || {};
    if (p.sessionId) state.activeSessionId = String(p.sessionId);
    stopAll();
    state.lastWinner = sanitize((p.winner&&(p.winner.username||p.winner.name))||p.username||p.name||'—');
    state.status = 'winner'; state.frozenOnWinner = true;
    setDot('ok');
    if (el.label) el.label.textContent = 'Winner!';
    if (el.name)  { el.name.textContent = state.lastWinner; el.name.classList.add('winner'); }
    if (el.hint)  el.hint.textContent = '🎉 Congratulations!';
    var pool = p.pool || p.sampleNames || state.sampleNames;
    if (state.animation==='wheel') landWheel(pool, state.lastWinner);
    else { showMode(state.animation==='scramble'?'scramble':'slot'); if (el.slotTxt) el.slotTxt.textContent = state.lastWinner; }
    burstConfetti();
  }

  // ── SSE ────────────────────────────────────────────────────────────────────
  var seenEvents = new Set();
  function seen(id) {
    if (!id) return false;
    if (seenEvents.has(id)) return true;
    seenEvents.add(id);
    if (seenEvents.size > 500) seenEvents.delete(seenEvents.values().next().value);
    return false;
  }

  function parseEnv(data) {
    try { var o=JSON.parse(data); return o&&typeof o==='object'?{id:o.id,kind:o.kind,payload:o.payload}:null; } catch(e){ return null; }
  }

  function connect() {
    if (!token) { setDot(''); return; }
    try { if (es) es.close(); } catch(e){}
    setDot('warn');
    es = new EventSource('/w/'+encodeURIComponent(token)+'/stream');
    es.addEventListener('hello', function() { state.connected=true; setDot('ok'); retryMs=800; });
    es.addEventListener('raffle.state',  function(ev){ var e=parseEnv(ev.data); if(e&&!seen(e.id)) applyState(e.payload); });
    es.addEventListener('raffle.winner', function(ev){ var e=parseEnv(ev.data); if(e&&!seen(e.id)) applyWinner(e.payload); });
    es.addEventListener('raffle.reset',  function(ev){ var e=parseEnv(ev.data); if(!e||!seen(e.id)) resetToWaiting(); });
    es.onmessage = function(ev) {
      var e=parseEnv(ev.data); if(!e||seen(e.id)) return;
      if(e.kind==='raffle.state') applyState(e.payload);
      else if(e.kind==='raffle.winner') applyWinner(e.payload);
      else if(e.kind==='raffle.reset') resetToWaiting();
    };
    es.onerror = function() {
      state.connected=false; setDot('');
      try{es.close();}catch(e){}
      setTimeout(connect, retryMs);
      retryMs = Math.min(8000, Math.floor(retryMs*1.6));
    };
    console.log('[raffle] SSE connected');
  }

  // ── Editor preview ─────────────────────────────────────────────────────────
  function showPreview() {
    if (window.__raffleDummyShown) return;
    window.__raffleDummyShown = true;
    state.connected = true; setDot('ok');
    // Show collecting state
    applyState({ status:'collecting', count:42, joinPhrase:'!join', animation:'wheel', sampleNames:['StreamerFan','BotRix','Sardwyn','NewViewer','ChatGoblin'] });
    // Then roll after 2s
    setTimeout(function() {
      applyState({ status:'rolling', count:42, joinPhrase:'!join', animation:state.animation, sampleNames:state.sampleNames });
    }, 2000);
    // Then winner after 4s
    setTimeout(function() {
      applyWinner({ winner:{ username:'StreamerFan' }, pool:state.sampleNames });
    }, 4500);
  }

  // Test fire — cycles through states for editor preview
  window.__raffleTestFire = function() {
    if (!container) return;
    if (state.status === 'idle' || state.status === 'winner') {
      applyState({ status:'collecting', count:42, joinPhrase:joinCommand, animation:prefAnim||'wheel',
        sampleNames:['StreamerFan','BotRix','Sardwyn','NewViewer','ChatGoblin'] });
    } else if (state.status === 'collecting') {
      applyState({ status:'rolling', count:state.count, joinPhrase:state.joinPhrase,
        animation:state.animation, sampleNames:state.sampleNames });
    } else if (state.status === 'rolling') {
      applyWinner({ winner:{ username:'StreamerFan' }, pool:state.sampleNames });
    }
  };

  findAndInit();

})();

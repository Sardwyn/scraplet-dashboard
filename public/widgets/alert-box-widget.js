// public/widgets/alert-box-widget.js
// Alert Box widget v2 — full feature set.
// Per-event config: template, colour, image/GIF, sound, animation, duration, min amount, TTS.

(function () {
  'use strict';

  const cfg = window.__WIDGET_CONFIG_ALERT_BOX_WIDGET__ || {};
  const token = cfg.token || window.__WIDGET_TOKEN__ || '';
  const editorPreview = cfg.editorPreview === true || cfg.editorPreview === 'true';

  if (!token && !editorPreview) {
    console.warn('[alert-box] No token configured');
    return;
  }
  if (token) window.__WIDGET_TOKEN__ = token;

  // ── Global config ──────────────────────────────────────────────────────────
  const fontFamily = cfg.fontFamily || 'Inter, system-ui, sans-serif';
  const fontSizePx = parseInt(cfg.fontSizePx) || 20;
  const textColor  = cfg.textColor   || '#ffffff';
  const masterVol  = parseFloat(cfg.masterVolume) || 0.8;

  // ── Per-event config defaults ──────────────────────────────────────────────
  const EVENT_DEFAULTS = {
    follow:       { enabled: true,  template: '🎉 {username} just followed!',                color: '#53fc18', bg: 'rgba(0,0,0,0.85)', duration: 5000, animation: 'bounce',     sound: 'pop',   soundVol: 0.8, image: '', minAmount: 0, tts: false },
    subscription: { enabled: true,  template: '⭐ {username} subscribed!',                   color: '#9146ff', bg: 'rgba(0,0,0,0.85)', duration: 6000, animation: 'scale-pop',  sound: 'chime', soundVol: 0.8, image: '', minAmount: 0, tts: false },
    resub:        { enabled: true,  template: '🔄 {username} resubbed for {months} months!', color: '#9146ff', bg: 'rgba(0,0,0,0.85)', duration: 6000, animation: 'scale-pop',  sound: 'chime', soundVol: 0.8, image: '', minAmount: 0, tts: true  },
    gift_sub:     { enabled: true,  template: '🎁 {username} gifted {count} sub(s)!',        color: '#ff6b6b', bg: 'rgba(0,0,0,0.85)', duration: 6000, animation: 'shake',      sound: 'horn',  soundVol: 0.8, image: '', minAmount: 0, tts: false },
    raid:         { enabled: true,  template: '⚔️ {username} raided with {count} viewers!',  color: '#f59e0b', bg: 'rgba(0,0,0,0.85)', duration: 8000, animation: 'slide-down', sound: 'horn',  soundVol: 1.0, image: '', minAmount: 0, tts: false },
    tip:          { enabled: true,  template: '💰 {username} tipped {amount}!',              color: '#fbbf24', bg: 'rgba(0,0,0,0.85)', duration: 7000, animation: 'bounce',     sound: 'coins', soundVol: 0.8, image: '', minAmount: 1, tts: true  },
    redemption:   { enabled: false, template: '✨ {username} redeemed {reward}!',            color: '#a78bfa', bg: 'rgba(0,0,0,0.85)', duration: 5000, animation: 'fade',       sound: 'pop',   soundVol: 0.6, image: '', minAmount: 0, tts: false },
  };

  function getEventCfg(type) {
    const d = EVENT_DEFAULTS[type] || EVENT_DEFAULTS.follow;
    const u = (cfg.alertTypes && cfg.alertTypes[type]) || {};
    return Object.assign({}, d, u);
  }

  // ── Sound ──────────────────────────────────────────────────────────────────
  var _audioCtx = null;
  function getAudioCtx() {
    if (!_audioCtx) {
      try { _audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch(e) {}
    }
    return _audioCtx;
  }

  function playSound(name, vol, customUrl) {
    var v = Math.min(1, (parseFloat(vol) || 0.8) * masterVol);
    if (customUrl) {
      var a = new Audio(customUrl);
      a.volume = v;
      a.play().catch(function(){});
      return;
    }
    var ctx = getAudioCtx();
    if (!ctx) return;
    var osc = ctx.createOscillator();
    var gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    gain.gain.value = v;
    var now = ctx.currentTime;
    if (name === 'chime') {
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(1047, now);
      osc.frequency.setValueAtTime(1319, now + 0.1);
      osc.frequency.setValueAtTime(1568, now + 0.2);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
      osc.start(now); osc.stop(now + 0.5);
    } else if (name === 'horn') {
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(220, now);
      osc.frequency.exponentialRampToValueAtTime(440, now + 0.3);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
      osc.start(now); osc.stop(now + 0.4);
    } else if (name === 'coins') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(1200, now);
      osc.frequency.setValueAtTime(1600, now + 0.05);
      osc.frequency.setValueAtTime(1200, now + 0.1);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
      osc.start(now); osc.stop(now + 0.3);
    } else { // pop
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, now);
      osc.frequency.exponentialRampToValueAtTime(440, now + 0.1);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
      osc.start(now); osc.stop(now + 0.15);
    }
  }

  // ── Animations ─────────────────────────────────────────────────────────────
  var ANIMATIONS = {
    'slide-down': { in: 'ab-slide-down-in', out: 'ab-slide-up-out' },
    'bounce':     { in: 'ab-bounce-in',     out: 'ab-fade-out'     },
    'scale-pop':  { in: 'ab-scale-pop-in',  out: 'ab-scale-out'    },
    'shake':      { in: 'ab-shake-in',      out: 'ab-fade-out'     },
    'fade':       { in: 'ab-fade-in',       out: 'ab-fade-out'     },
  };

  // ── CSS ────────────────────────────────────────────────────────────────────
  function injectCSS() {
    var s = document.createElement('style');
    s.textContent = [
      '.ab-wrap{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;pointer-events:none;}',
      '.ab-alert{font-family:' + fontFamily + ';font-size:' + fontSizePx + 'px;color:' + textColor + ';text-align:center;padding:20px 32px;border-radius:16px;min-width:300px;max-width:90%;box-shadow:0 8px 40px rgba(0,0,0,0.5);position:relative;overflow:hidden;}',
      '.ab-alert::before{content:"";position:absolute;inset:0;border-radius:16px;border:2px solid var(--ab-color,#fff);box-shadow:0 0 20px var(--ab-color,#fff),inset 0 0 20px rgba(255,255,255,0.05);pointer-events:none;}',
      '.ab-image{max-height:120px;max-width:100%;object-fit:contain;margin:0 auto 12px;display:block;}',
      '.ab-title{font-weight:800;font-size:1.3em;margin-bottom:6px;text-shadow:0 2px 8px rgba(0,0,0,0.8);}',
      '.ab-message{opacity:0.9;font-size:0.9em;text-shadow:0 1px 4px rgba(0,0,0,0.8);}',
      '@keyframes ab-slide-down-in{from{opacity:0;transform:translateY(-60px) scale(0.9)}to{opacity:1;transform:translateY(0) scale(1)}}',
      '@keyframes ab-bounce-in{0%{opacity:0;transform:scale(0.3)}50%{transform:scale(1.1)}70%{transform:scale(0.95)}100%{opacity:1;transform:scale(1)}}',
      '@keyframes ab-scale-pop-in{0%{opacity:0;transform:scale(0.5) rotate(-5deg)}80%{transform:scale(1.05) rotate(1deg)}100%{opacity:1;transform:scale(1) rotate(0)}}',
      '@keyframes ab-shake-in{0%,100%{transform:translateX(0)}10%,30%,50%,70%,90%{transform:translateX(-8px)}20%,40%,60%,80%{transform:translateX(8px)}}',
      '@keyframes ab-fade-in{from{opacity:0}to{opacity:1}}',
      '@keyframes ab-slide-up-out{to{opacity:0;transform:translateY(-40px) scale(0.9)}}',
      '@keyframes ab-scale-out{to{opacity:0;transform:scale(0.7)}}',
      '@keyframes ab-fade-out{to{opacity:0}}',
    ].join('');
    document.head.appendChild(s);
  }

  // ── Queue ──────────────────────────────────────────────────────────────────
  var queue = [];
  var showing = false;
  var container = null;

  function enqueue(alertData) {
    queue.push(alertData);
    if (!showing) showNext();
  }

  function showNext() {
    if (!queue.length || showing || !container) return;
    showing = true;
    renderAlert(queue.shift());
  }

  function renderAlert(data) {
    var anim = ANIMATIONS[data.animation] || ANIMATIONS.fade;
    var wrap = document.createElement('div');
    wrap.className = 'ab-wrap';
    var el = document.createElement('div');
    el.className = 'ab-alert';
    el.style.cssText = 'background:' + data.bg + ';--ab-color:' + data.color + ';animation:' + anim.in + ' 0.5s cubic-bezier(0.34,1.56,0.64,1) forwards;';
    var html = '';
    if (data.image) html += '<img class="ab-image" src="' + escHtml(data.image) + '" alt="" />';
    html += '<div class="ab-title" style="color:' + escHtml(data.color) + '">' + escHtml(data.title) + '</div>';
    if (data.message) html += '<div class="ab-message">' + escHtml(data.message) + '</div>';
    el.innerHTML = html;
    wrap.appendChild(el);
    container.appendChild(wrap);
    if (data.sound && data.sound !== 'none') playSound(data.sound, data.soundVol, data.soundUrl);
    if (data.ttsText) {
      // Slight delay so sound plays first
      setTimeout(function() { speakText(data.ttsText); }, 300);
    }
    var hideDelay = Math.max(1000, data.duration - 400);
    setTimeout(function() {
      el.style.animation = anim.out + ' 0.4s ease forwards';
      setTimeout(function() {
        wrap.remove();
        showing = false;
        showNext();
      }, 400);
    }, hideDelay);
  }

  // ── Template ───────────────────────────────────────────────────────────────
  function renderTemplate(template, vars) {
    return template.replace(/\{(\w+)\}/g, function(_, k) { return vars[k] || ''; });
  }

  // ── Event handler ──────────────────────────────────────────────────────────
  var TYPE_MAP = {
    'channel.followed': 'follow', 'channel.subscription.new': 'subscription',
    'channel.subscription.renewal': 'resub', 'channel.subscription.gifts': 'gift_sub',
    'raid': 'raid', 'kicks.gifted': 'tip', 'tip': 'tip', 'donation': 'tip',
    'channel.reward.redemption.updated': 'redemption',
    'follow': 'follow', 'subscribe': 'subscription', 'gift_sub': 'gift_sub',
  };

  function handleEvent(kind, payload) {
    var p = payload || {};
    var raw = p.payload || p;
    var alertType = TYPE_MAP[kind] || kind;
    var ec = getEventCfg(alertType);
    if (!ec.enabled) return;
    var username = (raw.actor && raw.actor.username) || (raw.follower && raw.follower.username) ||
                   p.actor_username || raw.username || 'Someone';
    var amount   = raw.amount || raw.kicks || raw.value || p.amount || '';
    var count    = raw.viewers || raw.gifts || raw.count || p.count || '';
    var months   = raw.months || raw.duration || '';
    var message  = (raw.message && raw.message.text) || raw.message || p.message || '';
    var reward   = (raw.reward && raw.reward.title) || raw.title || '';
    if (ec.minAmount > 0 && parseFloat(amount) < ec.minAmount) return;
    // Platform filter
    var platform = raw.platform || p.source || 'kick';
    if (platform && ec['platform_' + platform] === false) return;
    var title = renderTemplate(ec.template, { username: username, amount: amount, count: count, months: months, reward: reward });
    enqueue({ type: alertType, title: title, message: ec.tts ? message : '',
      ttsText: ec.tts ? message : '',
      color: ec.color, bg: ec.bg, image: ec.image, sound: ec.sound,
      soundVol: ec.soundVol, soundUrl: ec.soundUrl || '', animation: ec.animation, duration: ec.duration });
  }

  // ── SSE ────────────────────────────────────────────────────────────────────
  function connect() {
    // Use shared SSE multiplexer from overlay runtime (avoids connection limit)
    // Falls back to direct EventSource if not in overlay runtime context
    if (window.__OVERLAY_PUBLIC_ID__) {
      // In overlay runtime - use shared SSE via window events
      var _handler = function(ev) {
        var fakeEv = { data: ev.data, type: ev.type };
        // Route to appropriate listeners
        _sseListeners.forEach(function(l) { if (!l.type || l.type === ev.type || ev.type === 'scraplet:widget:sse') { try { l.fn(fakeEv); } catch(e){} } });
      };
      window.addEventListener('scraplet:widget:sse', _handler);
      var es = { close: function() { window.removeEventListener('scraplet:widget:sse', _handler); }, _shared: true };
      es.addEventListener = function(type, fn) { _sseListeners.push({type: type, fn: fn}); window.addEventListener('scraplet:widget:event:' + type, fn); };
      es.onerror = null;
      console.log('[alert-box] using shared SSE');
    } else {
      var es = new EventSource('/w/' + encodeURIComponent(token) + '/stream');
    }
    var _sseListeners = [];
    var types = ['channel.followed','channel.subscription.new','channel.subscription.renewal',
      'channel.subscription.gifts','kicks.gifted','raid','tip','donation',
      'channel.reward.redemption.updated','follow','subscribe','gift_sub'];
    types.forEach(function(t) {
      es.addEventListener(t, function(e) { try { handleEvent(t, JSON.parse(e.data)); } catch(err) {} });
    });
    es.onmessage = function(e) {
      try { var d = JSON.parse(e.data); handleEvent(d.kind || d.type, d); } catch(err) {}
    };
    es.onerror = function() { es.close(); setTimeout(connect, 5000); };
    console.log('[alert-box] SSE connected');
  }

  // ── Editor preview ─────────────────────────────────────────────────────────
  function showDummyAlerts() {
    if (window.__alertBoxDummyShown) return;
    window.__alertBoxDummyShown = true;
    var allDummies = [
      { kind: 'channel.followed',         type: 'follow',       payload: { actor_username: 'StreamerFan99' } },
      { kind: 'channel.subscription.new', type: 'subscription', payload: { actor_username: 'NewSubber' } },
      { kind: 'raid',                     type: 'raid',         payload: { actor_username: 'RaidLeader', count: 42 } },
      { kind: 'kicks.gifted',             type: 'tip',          payload: { actor_username: 'BigTipper', amount: 10 } },
    ];
    // Only show dummies for enabled event types
    var enabled = allDummies.filter(function(d) { return getEventCfg(d.type).enabled; });
    enabled.forEach(function(d, i) {
      setTimeout(function() { handleEvent(d.kind, d.payload); }, i * 3000);
    });
  }

  // ── Test fire (called from inspector) ──────────────────────────────────────
  window.__alertBoxTestFire = function(type, overrides) {
    var ec = getEventCfg(type);
    var vars = Object.assign({ username: 'TestUser', amount: '5.00', count: '42', months: '3', reward: 'Test Reward' }, overrides || {});
    enqueue({ type: type, title: renderTemplate(ec.template, vars), message: '',
      ttsText: ec.tts ? 'This is a test TTS message for ' + type : '',
      color: ec.color, bg: ec.bg, image: ec.image, sound: ec.sound,
      soundVol: ec.soundVol, soundUrl: ec.soundUrl || '', animation: ec.animation, duration: ec.duration });
  };

  // ── DOM init ───────────────────────────────────────────────────────────────
  function init() {
    injectCSS();
    if (!editorPreview) connect();
    else showDummyAlerts();
    console.log('[alert-box] v2 started');
  }

  var _findAttempts = 0;
  function findAndInit() {
    var editorRoot  = document.querySelector('[data-widget-editor-preview="alert-box-widget"]');
    var runtimeRoot = document.querySelector('[data-widget-id="alert-box-widget"]');
    var root = editorRoot || runtimeRoot;
    if (root) {
      container = root;
      container.style.position = 'relative';
      container.style.overflow = 'hidden';
      init();
    } else if (_findAttempts < 60) {
      _findAttempts++;
      requestAnimationFrame(findAndInit);
    } else {
      container = document.createElement('div');
      container.id = 'alert-box-root';
      container.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:9999;';
      document.body.appendChild(container);
      init();
    }
  }

  findAndInit();

  // ── TTS ────────────────────────────────────────────────────────────────────
  function speakText(text) {
    if (!text) return;
    // Try Kokoro TTS first (server-side, better quality)
    fetch('/dashboard/api/tts/alert', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ text: text }),
    }).then(function(r) {
      if (!r.ok) throw new Error('tts failed');
      return r.json();
    }).then(function(d) {
      if (d.ok && d.url) {
        var a = new Audio(d.url);
        a.volume = parseFloat(cfg.ttsVolume) || 1.0;
        a.play().catch(function() {});
      }
    }).catch(function() {
      // Fallback to browser speechSynthesis
      if (!window.speechSynthesis) return;
      window.speechSynthesis.cancel();
      var utt = new SpeechSynthesisUtterance(text);
      utt.rate = parseFloat(cfg.ttsRate) || 1.0;
      utt.volume = parseFloat(cfg.ttsVolume) || 1.0;
      window.speechSynthesis.speak(utt);
    });
  }

  function escHtml(s) {
    return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

})();

// public/widgets/alert-box-widget.js
// Alert Box widget v2 — full feature set.
// Per-event config: template, colour, image/GIF, sound, animation, duration, min amount, TTS.

(function () {
  'use strict';

  const cfg = window.__WIDGET_CONFIG_ALERT_BOX_WIDGET__ || {};
  // Per-instance ID set by ElementRenderer for multi-instance support
  const instanceId = cfg._instanceId || null;
  const token = cfg.token || window.__WIDGET_TOKEN__ || '';
  const editorPreview = cfg.editorPreview === true || cfg.editorPreview === 'true';

  if (!token && !editorPreview) {
    console.warn('[alert-box] No token configured');
    return;
  }
  if (token) window.__WIDGET_TOKEN__ = token;

  // ── Global config ──────────────────────────────────────────────────────────
  const fontFamily  = cfg.fontFamily  || 'Inter, system-ui, sans-serif';
  const fontSizePx  = parseInt(cfg.fontSizePx) || 20;
  const textColor   = cfg.textColor   || '#ffffff';
  const masterVol   = parseFloat(cfg.masterVolume) || 0.8;
  // 'classic' = card with image above text (scales with box)
  // 'media-fill' = media fills the box, text overlays at bottom
  const layoutMode  = cfg.layoutMode  || 'classic';

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
      '.ab-wrap{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;pointer-events:none;overflow:hidden;}',
      /* classic mode: card fills box, font scales with container */
      '.ab-alert.ab-classic{font-family:' + fontFamily + ';font-size:calc(var(--ab-fs, ' + fontSizePx + ') * 1px);color:' + textColor + ';text-align:center;padding:calc(var(--ab-pad, 20) * 1px) calc(var(--ab-pad, 20) * 1.6px);border-radius:calc(var(--ab-fs, 16) * 0.8px);width:100%;max-width:100%;box-sizing:border-box;box-shadow:0 8px 40px rgba(0,0,0,0.5);position:relative;overflow:hidden;}',
      /* media-fill mode: media fills box, text overlays at bottom */
      '.ab-alert.ab-media-fill{position:absolute;inset:0;overflow:hidden;border-radius:0;padding:0;background:transparent !important;box-shadow:none;}',
      '.ab-alert.ab-media-fill .ab-image,.ab-alert.ab-media-fill video.ab-image{position:absolute;inset:0;width:100%;height:100%;max-height:none;max-width:none;object-fit:contain;margin:0;border-radius:0;}',
      '.ab-alert.ab-media-fill .ab-text-overlay{position:absolute;bottom:0;left:0;right:0;padding:10px 14px;background:linear-gradient(transparent,rgba(0,0,0,0.75));text-align:center;}',
      '.ab-alert.ab-media-fill .ab-title{font-family:' + fontFamily + ';font-size:' + fontSizePx + 'px;color:' + textColor + ';font-weight:800;text-shadow:0 2px 8px rgba(0,0,0,0.9);margin:0;}',
      '.ab-alert.ab-media-fill .ab-message{font-family:' + fontFamily + ';font-size:' + Math.round(fontSizePx * 0.8) + 'px;color:' + textColor + ';opacity:0.9;text-shadow:0 1px 4px rgba(0,0,0,0.9);margin-top:2px;}',
      '.ab-alert.ab-media-fill::before{display:none;}',
      '.ab-alert::before{content:"";position:absolute;inset:0;border-radius:16px;border:2px solid var(--ab-color,#fff);box-shadow:0 0 20px var(--ab-color,#fff),inset 0 0 20px rgba(255,255,255,0.05);pointer-events:none;}',
      '.ab-image{max-height:120px;max-width:100%;object-fit:contain;margin:0 auto 12px;display:block;}',
      '.ab-title{font-weight:800;font-size:1.3em;margin-bottom:6px;text-shadow:0 2px 8px rgba(0,0,0,0.8);}',
      '.ab-message{opacity:0.9;font-size:0.9em;text-shadow:0 1px 4px rgba(0,0,0,0.8);}',
      '@keyframes ab-slide-down-in{from{opacity:0;transform:translateY(-100%) scale(0.9)}to{opacity:1;transform:translateY(0) scale(1)}}',
      '@keyframes ab-bounce-in{0%{opacity:0;transform:scale(0.3)}50%{transform:scale(1.1)}70%{transform:scale(0.95)}100%{opacity:1;transform:scale(1)}}',
      '@keyframes ab-scale-pop-in{0%{opacity:0;transform:scale(0.5) rotate(-5deg)}80%{transform:scale(1.05) rotate(1deg)}100%{opacity:1;transform:scale(1) rotate(0)}}',
      '@keyframes ab-shake-in{0%,100%{transform:translateX(0)}10%,30%,50%,70%,90%{transform:translateX(-8px)}20%,40%,60%,80%{transform:translateX(8px)}}',
      '@keyframes ab-fade-in{from{opacity:0}to{opacity:1}}',
      '@keyframes ab-slide-up-out{to{opacity:0;transform:translateY(-100%) scale(0.9)}}',
      '@keyframes ab-scale-out{to{opacity:0;transform:scale(0.7)}}',
      '@keyframes ab-fade-out{to{opacity:0}}',
    ].join('');
    document.head.appendChild(s);
  }

  // ── Queue ──────────────────────────────────────────────────────────────────
  var queue = [];
  var _seenIds = new Set(); // dedup - ignore replayed events
  var showing = false;
  var container = null;

  function getContainer() {
    // Scope to specific instance if instanceId is set (multi-instance safe)
    if (instanceId) {
      return document.getElementById('widget-preview-' + instanceId)
          || document.querySelector('[data-widget-instance-id="' + instanceId + '"]')
          || container;
    }
    return document.querySelector('[data-widget-editor-preview="alert-box-widget"]')
        || document.querySelector('[data-widget-id="alert-box-widget"]')
        || container;
  }

  function enqueue(alertData) {
    queue.push(alertData);
    if (!showing) showNext();
  }

  function showNext() {
    var c = getContainer();
    if (!queue.length || showing || !c) return;
    showing = true;
    renderAlert(queue.shift());
  }

  function renderAlert(data) {
    var anim = ANIMATIONS[data.animation] || ANIMATIONS.fade;
    var wrap = document.createElement('div');
    wrap.className = 'ab-wrap';
    var el = document.createElement('div');
    var hasMedia = !!data.image;
    var isMediaFill = hasMedia && layoutMode === 'media-fill';
    el.className = 'ab-alert ' + (isMediaFill ? 'ab-media-fill' : 'ab-classic');
    el.style.cssText = (isMediaFill ? '' : 'background:' + data.bg + ';') + '--ab-color:' + data.color + ';animation:' + anim.in + ' 0.5s cubic-bezier(0.34,1.56,0.64,1) forwards;';

    if (isMediaFill) {
      // Media fills the box; text overlays at bottom
      if (/\.mp4(\?|$)/i.test(data.image)) {
        var vid = document.createElement('video');
        vid.className = 'ab-image';
        vid.src = data.image;
        vid.loop = true;
        vid.playsInline = true;
        if (data.videoMuted !== false) vid.muted = true;
        el.appendChild(vid);
        vid.load();
        vid.play().catch(function() {});
      } else {
        var img = document.createElement('img');
        img.className = 'ab-image';
        img.src = data.image;
        img.alt = '';
        el.appendChild(img);
      }
      var overlay = document.createElement('div');
      overlay.className = 'ab-text-overlay';
      var titleEl = document.createElement('div');
      titleEl.className = 'ab-title';
      titleEl.textContent = data.title;
      overlay.appendChild(titleEl);
      if (data.message) {
        var msgEl = document.createElement('div');
        msgEl.className = 'ab-message';
        msgEl.textContent = data.message;
        overlay.appendChild(msgEl);
      }
      el.appendChild(overlay);
    } else {
      // Classic: image above text, card scales with box
      if (data.image) {
        if (/\.mp4(\?|$)/i.test(data.image)) {
          var vid2 = document.createElement('video');
          vid2.className = 'ab-image';
          vid2.src = data.image;
          vid2.loop = true;
          vid2.playsInline = true;
          if (data.videoMuted !== false) vid2.muted = true;
          el.appendChild(vid2);
          vid2.load();
          vid2.play().catch(function() {});
        } else {
          var img2 = document.createElement('img');
          img2.className = 'ab-image';
          img2.src = data.image;
          img2.alt = '';
          el.appendChild(img2);
        }
      }
      var titleEl2 = document.createElement('div');
      titleEl2.className = 'ab-title';
      titleEl2.style.color = data.color;
      titleEl2.textContent = data.title;
      el.appendChild(titleEl2);
      if (data.message) {
        var msgEl2 = document.createElement('div');
        msgEl2.className = 'ab-message';
        msgEl2.textContent = data.message;
        el.appendChild(msgEl2);
      }
    }
    wrap.appendChild(el);
    var c = getContainer(); if (!c) { showing = false; return; } c.appendChild(wrap);
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
    'subscription': 'subscription', 'resub': 'resub', 'redemption': 'redemption',
  };

  function handleEvent(kind, payload) {
    var evId = payload && (payload.id || (payload.payload && payload.payload._id));
    if (evId) {
      if (_seenIds.has(String(evId))) return;
      _seenIds.add(String(evId));
      if (_seenIds.size > 500) _seenIds.delete(_seenIds.values().next().value);
    }
    // Note: _test flag removed - test fires should always show in OBS
    // Only process known alert-worthy event types
    var alertType = TYPE_MAP[kind] || kind;
    var KNOWN_ALERT_TYPES = ['follow','subscription','resub','gift_sub','raid','tip','redemption',
      'donation','channel.followed','channel.subscription.new','channel.subscription.renewal',
      'channel.subscription.gifts','kicks.gifted','channel.reward.redemption.updated'];
    if (!kind || KNOWN_ALERT_TYPES.indexOf(kind) === -1 && KNOWN_ALERT_TYPES.indexOf(alertType) === -1) return;
    var p = payload || {};
    var raw = p.payload || p;
    var ec = getEventCfg(alertType);
    if (!ec.enabled && !p._testFire) return; // test fires bypass enabled check
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
      console.log('[alert-box] using shared SSE');
    } else {
      var es = new EventSource('/w/' + encodeURIComponent(token) + '/stream');
    }
    var types = ['channel.followed','channel.subscription.new','channel.subscription.renewal',
      'channel.subscription.gifts','kicks.gifted','raid','tip','donation',
      'channel.reward.redemption.updated','follow','subscribe','gift_sub',
      // Short-form types fired by editor test fire
      'subscription','resub','redemption'];
    types.forEach(function(t) {
      es.addEventListener(t, function(e) { try { handleEvent(t, JSON.parse(e.data)); } catch(err) {} });
    });
    
    // Handle test fire events from editor
    es.addEventListener('widget.test', function(e) {
      try {
        var data = JSON.parse(e.data);
        if (data.widgetId === 'alert-box-widget' && data.eventType) {
          var type = data.eventType;
          var vars = data.payload || {};
          
          // Use custom event config if provided, otherwise use getEventCfg
          var ec = data.eventConfig 
            ? Object.assign({}, getEventCfg(type), data.eventConfig, { enabled: true })
            : Object.assign({}, getEventCfg(type), { enabled: true });
          
          enqueue({
            type: type,
            title: renderTemplate(ec.template, vars),
            message: '',
            ttsText: ec.tts ? 'Test TTS message for ' + type : '',
            color: ec.color,
            bg: ec.bg,
            image: ec.image,  // Custom image from config
            sound: ec.sound,
            soundVol: ec.soundVol,
            soundUrl: ec.soundUrl || '',
            animation: ec.animation,
            duration: ec.duration,
            videoMuted: ec.videoMuted
          });
        }
      } catch (err) {
        console.warn('[alert-box] test event parse error:', err);
      }
    });

es.addEventListener('go.live', function() {
      queue = [];
      _seenIds.clear();
      console.log('[alert-box] go.live - state reset');
    });
    es.onmessage = function(e) {
      try { var d = JSON.parse(e.data); handleEvent(d.kind || d.type, d); } catch(err) {}
    };
    es.onerror = function() { es.close(); setTimeout(connect, 5000); };
    console.log('[alert-box] SSE connected');
  }

  // ── Editor preview ─────────────────────────────────────────────────────────
  function showDummyAlerts() {
    // No-op: editor uses __alertBoxTestFire directly per-event
  }

  // ── Test fire (called from inspector) ──────────────────────────────────────
  // Register per-instance test fire so inspector can target specific instance
  var _testFireKey = instanceId ? '__alertBoxTestFire_' + instanceId.replace(/-/g,'_') : '__alertBoxTestFire';
  window[_testFireKey] = function(type, overrides, eventConfigOverride) {
  // Also keep the shared key for backwards compat (last instance wins, acceptable)
  window.__alertBoxTestFire = window[_testFireKey];
    // Clear any stuck state so test fires always work
    queue.length = 0;
    showing = false;
    // Remove any leftover alert cards
    var liveContainer = getContainer();
    if (liveContainer) {
      container = liveContainer;
      var old = liveContainer.querySelectorAll('.ab-wrap');
      old.forEach(function(n) { n.remove(); });
    }
    var ec = Object.assign({}, getEventCfg(type), { enabled: true }); // test fires always show
    var ec = Object.assign({}, getEventCfg(type), eventConfigOverride || {}, { enabled: true }); // test fires always show, merge custom config
    enqueue({ type: type, title: renderTemplate(ec.template, vars), message: '',
      ttsText: ec.tts ? 'This is a test TTS message for ' + type : '',
      color: ec.color, bg: ec.bg, image: ec.image, sound: ec.sound,
      soundVol: ec.soundVol, soundUrl: ec.soundUrl || '', animation: ec.animation, duration: ec.duration,
      videoMuted: ec.videoMuted });
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
    // Use per-instance container when instanceId is set
    var editorRoot = instanceId
      ? (document.getElementById('widget-preview-' + instanceId) || document.querySelector('[data-widget-instance-id="' + instanceId + '"]'))
      : document.querySelector('[data-widget-editor-preview="alert-box-widget"]');
    var runtimeRoot = document.querySelector('[data-widget-id="alert-box-widget"]');
    var root = editorRoot || runtimeRoot;
    if (root) {
      container = root;
      // position managed by overlay runtime
      container.style.overflow = 'hidden';
      // Scale font size and padding with container width
      function applyContainerScale() {
        var w = container.offsetWidth || 300;
        var h = container.offsetHeight || 200;
        var base = Math.min(w, h);
        var fs = Math.max(10, Math.round(base * 0.072));
        var pad = Math.max(8, Math.round(base * 0.06));
        container.style.setProperty('--ab-fs', fs);
        container.style.setProperty('--ab-pad', pad);
      }
      applyContainerScale();
      if (typeof ResizeObserver !== 'undefined') {
        new ResizeObserver(applyContainerScale).observe(container);
      }
      init();
    } else if (_findAttempts < 300) {
      _findAttempts++;
      requestAnimationFrame(findAndInit);
    } else {
      // Fallback: create an invisible placeholder rather than a fixed-position div
      // that would ignore the OBS stage transform
      console.warn('[alert-box-widget] container not found after 300 frames - creating stage-relative fallback');
      var stageEl = document.querySelector('[style*="transformOrigin"]') || document.body;
      container = document.createElement('div');
      container.id = 'alert-box-root';
      container.setAttribute('data-widget-id', 'alert-box-widget');
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

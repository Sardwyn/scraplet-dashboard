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
  const fontFamily  = cfg.fontFamily  || 'Inter, system-ui, sans-serif';
  const fontSizePx  = parseInt(cfg.fontSizePx) || 20;
  const textColor   = cfg.textColor   || '#ffffff';
  const masterVol   = parseFloat(cfg.masterVolume) || 0.8;

  // ── Per-event config defaults ──────────────────────────────────────────────
  const EVENT_DEFAULTS = {
    follow:       { enabled: true,  template: '🎉 {username} just followed!',                    color: '#53fc18', bg: 'rgba(0,0,0,0.85)', duration: 5000, animation: 'bounce',    sound: 'pop',   soundVol: 0.8, image: '', minAmount: 0, tts: false },
    subscription: { enabled: true,  template: '⭐ {username} subscribed!',                        color: '#9146ff', bg: 'rgba(0,0,0,0.85)', duration: 6000, animation: 'scale-pop', sound: 'chime', soundVol: 0.8, image: '', minAmount: 0, tts: false },
    resub:        { enabled: true,  template: '🔄 {username} resubbed for {months} months!',      color: '#9146ff', bg: 'rgba(0,0,0,0.85)', duration: 6000, animation: 'scale-pop', sound: 'chime', soundVol: 0.8, image: '', minAmount: 0, tts: true  },
    gift_sub:     { enabled: true,  template: '🎁 {username} gifted {count} sub(s)!',             color: '#ff6b6b', bg: 'rgba(0,0,0,0.85)', duration: 6000, animation: 'shake',     sound: 'horn',  soundVol: 0.8, image: '', minAmount: 0, tts: false },
    raid:         { enabled: true,  template: '⚔️ {username} raided with {count} viewers!',       color: '#f59e0b', bg: 'rgba(0,0,0,0.85)', duration: 8000, animation: 'slide-down', sound: 'horn',  soundVol: 1.0, image: '', minAmount: 0, tts: false },
    tip:          { enabled: true,  template: '💰 {username} tipped {amount}!',                   color: '#fbbf24', bg: 'rgba(0,0,0,0.85)', duration: 7000, animation: 'bounce',    sound: 'coins', soundVol: 0.8, image: '', minAmount: 1, tts: true  },
    redemption:   { enabled: false, template: '✨ {username} redeemed {reward}!',                 color: '#a78bfa', bg: 'rgba(0,0,0,0.85)', duration: 5000, animation: 'fade',      sound: 'pop',   soundVol: 0.6, image: '', minAmount: 0, tts: false },
  };

  // Merge user config over defaults
  function getEventCfg(type) {
    const d = EVENT_DEFAULTS[type] || EVENT_DEFAULTS.follow;
    const u = cfg.alertTypes?.[type] || {};
    return { ...d, ...u };
  }

  // ── Sound library ──────────────────────────────────────────────────────────
  // Base64-encoded tiny sounds generated via Web Audio API at runtime
  const SOUNDS = {};
  function buildSounds() {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      SOUNDS._ctx = ctx;
    } catch { /* no audio */ }
  }

  function playSound(name, vol, customUrl) {
    if (customUrl) {
      const a = new Audio(customUrl);
      a.volume = Math.min(1, (vol || 0.8) * masterVol);
      a.play().catch(() => {});
      return;
    }
    if (!SOUNDS._ctx) return;
    const ctx = SOUNDS._ctx;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    gain.gain.value = Math.min(1, (vol || 0.8) * masterVol);

    const now = ctx.currentTime;
    const presets = {
      pop:   () => { osc.type = 'sine';     osc.frequency.setValueAtTime(880, now); osc.frequency.exponentialRampToValueAtTime(440, now + 0.1); gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15); osc.start(now); osc.stop(now + 0.15); },
      chime: () => { osc.type = 'triangle'; osc.frequency.setValueAtTime(1047, now); osc.frequency.setValueAtTime(1319, now + 0.1); osc.frequency.setValueAtTime(1568, now + 0.2); gain.gain.exponentialRampToValueAtTime(0.001, now + 0.5); osc.start(now); osc.stop(now + 0.5); },
      horn:  () => { osc.type = 'sawtooth'; osc.frequency.setValueAtTime(220, now); osc.frequency.exponentialRampToValueAtTime(440, now + 0.3); gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4); osc.start(now); osc.stop(now + 0.4); },
      coins: () => { osc.type = 'sine';     osc.frequency.setValueAtTime(1200, now); osc.frequency.setValueAtTime(1600, now + 0.05); osc.frequency.setValueAtTime(1200, now + 0.1); gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3); osc.start(now); osc.stop(now + 0.3); },
    };
    const fn = presets[name] || presets.pop;
    fn();
  }

  // ── Animation keyframes ────────────────────────────────────────────────────
  const ANIMATIONS = {
    'slide-down': { in: 'ab-slide-down-in', out: 'ab-slide-up-out' },
    'bounce':     { in: 'ab-bounce-in',     out: 'ab-fade-out'     },
    'scale-pop':  { in: 'ab-scale-pop-in',  out: 'ab-scale-out'    },
    'shake':      { in: 'ab-shake-in',      out: 'ab-fade-out'     },
    'fade':       { in: 'ab-fade-in',       out: 'ab-fade-out'     },
  };

  // ── DOM setup ──────────────────────────────────────────────────────────────
  let container;
  let _findAttempts = 0;

  function findAndInit() {
    const editorRoot  = document.querySelector('[data-widget-editor-preview="alert-box-widget"]');
    const runtimeRoot = document.querySelector('[data-widget-id="alert-box-widget"]');
    const root = editorRoot || runtimeRoot;
    if (root) {
      container = root;
      container.style.position = 'relative';
      container.style.overflow = 'hidden';
      init();
    } else if (_findAttempts < 60) {
      _findAttempts++;
      requestAnimationFrame(findAndInit);
    } else {
      // Fallback: full-screen fixed
      container = document.createElement('div');
      container.id = 'alert-box-root';
      container.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:9999;';
      document.body.appendChild(container);
      init();
    }
  }

  findAndInit();
  return;

  function init() {
    buildSounds();
    injectCSS();
    if (!editorPreview) connect();
    if (editorPreview) showDummyAlerts();
    console.log('[alert-box] v2 started');
  }

  // ── CSS ────────────────────────────────────────────────────────────────────
  function injectCSS() {
    const s = document.createElement('style');
    s.textContent = `
      .ab-wrap {
        position: absolute;
        inset: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        pointer-events: none;
      }
      .ab-alert {
        font-family: ${fontFamily};
        font-size: ${fontSizePx}px;
        color: ${textColor};
        text-align: center;
        padding: 20px 32px;
        border-radius: 16px;
        min-width: 300px;
        max-width: 90%;
        box-shadow: 0 8px 40px rgba(0,0,0,0.5);
        position: relative;
        overflow: hidden;
      }
      .ab-alert::before {
        content: '';
        position: absolute;
        inset: 0;
        border-radius: 16px;
        border: 2px solid var(--ab-color, #ffffff);
        box-shadow: 0 0 20px var(--ab-color, #ffffff), inset 0 0 20px rgba(255,255,255,0.05);
        pointer-events: none;
      }
      .ab-image { max-height: 120px; max-width: 100%; object-fit: contain; margin-bottom: 12px; display: block; margin-left: auto; margin-right: auto; }
      .ab-title { font-weight: 800; font-size: 1.3em; margin-bottom: 6px; text-shadow: 0 2px 8px rgba(0,0,0,0.8); }
      .ab-message { opacity: 0.9; font-size: 0.9em; text-shadow: 0 1px 4px rgba(0,0,0,0.8); }

      @keyframes ab-slide-down-in  { from { opacity:0; transform:translateY(-60px) scale(0.9); } to { opacity:1; transform:translateY(0) scale(1); } }
      @keyframes ab-bounce-in      { 0% { opacity:0; transform:scale(0.3); } 50% { transform:scale(1.1); } 70% { transform:scale(0.95); } 100% { opacity:1; transform:scale(1); } }
      @keyframes ab-scale-pop-in   { 0% { opacity:0; transform:scale(0.5) rotate(-5deg); } 80% { transform:scale(1.05) rotate(1deg); } 100% { opacity:1; transform:scale(1) rotate(0); } }
      @keyframes ab-shake-in       { 0%,100% { transform:translateX(0); } 10%,30%,50%,70%,90% { transform:translateX(-8px); } 20%,40%,60%,80% { transform:translateX(8px); } }
      @keyframes ab-fade-in        { from { opacity:0; } to { opacity:1; } }
      @keyframes ab-slide-up-out   { to { opacity:0; transform:translateY(-40px) scale(0.9); } }
      @keyframes ab-scale-out      { to { opacity:0; transform:scale(0.7); } }
      @keyframes ab-fade-out       { to { opacity:0; } }
    `;
    document.head.appendChild(s);
  }

  // ── Queue ──────────────────────────────────────────────────────────────────
  const queue = [];
  let showing = false;

  function enqueue(alertData) {
    queue.push(alertData);
    if (!showing) showNext();
  }

  function showNext() {
    if (!queue.length || showing) return;
    showing = true;
    const data = queue.shift();
    renderAlert(data);
  }

  function renderAlert({ type, title, message, color, bg, image, sound, soundVol, soundUrl, animation, duration }) {
    const anim = ANIMATIONS[animation] || ANIMATIONS.fade;

    const wrap = document.createElement('div');
    wrap.className = 'ab-wrap';

    const el = document.createElement('div');
    el.className = 'ab-alert';
    el.style.cssText = `background:${bg};--ab-color:${color};animation:${anim.in} 0.5s cubic-bezier(0.34,1.56,0.64,1) forwards;`;

    let html = '';
    if (image) html += `<img class="ab-image" src="${escHtml(image)}" alt="" />`;
    html += `<div class="ab-title" style="color:${escHtml(color)}">${escHtml(title)}</div>`;
    if (message) html += `<div class="ab-message">${escHtml(message)}</div>`;
    el.innerHTML = html;

    wrap.appendChild(el);
    container.appendChild(wrap);

    // Play sound
    if (sound && sound !== 'none') playSound(sound, soundVol, soundUrl);

    // Hide after duration
    const hideDelay = Math.max(1000, duration - 400);
    setTimeout(() => {
      el.style.animation = `${anim.out} 0.4s ease forwards`;
      setTimeout(() => {
        wrap.remove();
        showing = false;
        showNext();
      }, 400);
    }, hideDelay);
  }

  // ── Template rendering ─────────────────────────────────────────────────────
  function renderTemplate(template, vars) {
    return template.replace(/\{(\w+)\}/g, (_, k) => vars[k] || '');
  }

  // ── Event handlers ─────────────────────────────────────────────────────────
  function handleEvent(kind, payload) {
    const p = payload || {};
    const raw = p.payload || p;

    // Map event kind to alert type
    const typeMap = {
      'channel.followed':            'follow',
      'channel.subscription.new':    'subscription',
      'channel.subscription.renewal':'resub',
      'channel.subscription.gifts':  'gift_sub',
      'raid':                        'raid',
      'kicks.gifted':                'tip',
      'tip':                         'tip',
      'donation':                    'tip',
      'channel.reward.redemption.updated': 'redemption',
      // Legacy
      'follow':       'follow',
      'subscribe':    'subscription',
      'gift_sub':     'gift_sub',
    };

    const alertType = typeMap[kind] || kind;
    const ec = getEventCfg(alertType);
    if (!ec.enabled) return;

    // Extract vars
    const username = raw.actor?.username || raw.follower?.username || raw.sender?.username ||
                     p.actor_username || raw.username || 'Someone';
    const amount   = raw.amount || raw.kicks || raw.value || p.amount || '';
    const count    = raw.viewers || raw.gifts || raw.count || p.count || '';
    const months   = raw.months || raw.duration || '';
    const message  = raw.message?.text || raw.message || p.message || '';
    const reward   = raw.reward?.title || raw.title || '';

    // Min amount check
    if (ec.minAmount > 0 && parseFloat(amount) < ec.minAmount) return;

    const title = renderTemplate(ec.template, { username, amount, count, months, reward });

    enqueue({
      type: alertType,
      title,
      message: ec.tts ? message : '',
      color: ec.color,
      bg: ec.bg,
      image: ec.image,
      sound: ec.sound,
      soundVol: ec.soundVol,
      soundUrl: ec.soundUrl || '',
      animation: ec.animation,
      duration: ec.duration,
    });
  }

  // ── SSE connection ─────────────────────────────────────────────────────────
  function connect() {
    const es = new EventSource(`/w/${encodeURIComponent(token)}/stream`);

    const eventTypes = [
      'channel.followed', 'channel.subscription.new', 'channel.subscription.renewal',
      'channel.subscription.gifts', 'kicks.gifted', 'raid', 'tip', 'donation',
      'channel.reward.redemption.updated', 'follow', 'subscribe', 'gift_sub',
    ];

    eventTypes.forEach(type => {
      es.addEventListener(type, e => {
        try { handleEvent(type, JSON.parse(e.data)); } catch { /* ignore */ }
      });
    });

    es.onmessage = e => {
      try {
        const d = JSON.parse(e.data);
        if (d.kind) handleEvent(d.kind, d);
        else if (d.type) handleEvent(d.type, d);
      } catch { /* ignore */ }
    };

    es.onerror = () => { es.close(); setTimeout(connect, 5000); };
    console.log('[alert-box] SSE connected');
  }

  // ── Editor preview dummy alerts ────────────────────────────────────────────
  function showDummyAlerts() {
    const dummies = [
      { kind: 'channel.followed',         payload: { actor_username: 'StreamerFan99' } },
      { kind: 'channel.subscription.new', payload: { actor_username: 'NewSubber',    payload: { amount: 1 } } },
      { kind: 'kicks.gifted',             payload: { actor_username: 'BigTipper',    payload: { amount: 10 } } },
    ];
    dummies.forEach((d, i) => setTimeout(() => handleEvent(d.kind, d.payload), i * 2000));
  }

  // ── Test fire (called directly from inspector) ─────────────────────────────
  window.__alertBoxTestFire = function(type, overrides) {
    const ec = getEventCfg(type);
    const vars = { username: 'TestUser', amount: '5.00', count: '42', months: '3', reward: 'Test Reward', ...overrides };
    enqueue({
      type,
      title: renderTemplate(ec.template, vars),
      message: '',
      color: ec.color,
      bg: ec.bg,
      image: ec.image,
      sound: ec.sound,
      soundVol: ec.soundVol,
      soundUrl: ec.soundUrl || '',
      animation: ec.animation,
      duration: ec.duration,
    });
  };

  function escHtml(s) {
    return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

})();

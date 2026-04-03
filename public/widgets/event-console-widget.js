// public/widgets/event-console-widget.js
// Event Console v2 — persistent activity feed with per-event config, animations, avatars.

(function () {
  'use strict';

  var cfg = window.__WIDGET_CONFIG_EVENT_CONSOLE_WIDGET__ || {};
  var token = cfg.token || window.__WIDGET_TOKEN__ || '';
  var editorPreview = cfg.editorPreview === true || cfg.editorPreview === 'true';

  if (!token && !editorPreview) { console.warn('[event-console] No token'); return; }
  if (token) window.__WIDGET_TOKEN__ = token;

  // ── Config ─────────────────────────────────────────────────────────────────
  function n(v,d){ var x=Number(v); return isFinite(x)?x:d; }
  function b(v,d){ if(v===true||v===false)return v; var s=String(v||'').toLowerCase(); return ['1','true','yes','on'].includes(s)?true:['0','false','no','off'].includes(s)?false:d; }
  function s(v,d){ var x=String(v||'').trim(); return x||d; }

  var fontFamily    = s(cfg.fontFamily,   'Inter, system-ui, sans-serif');
  var fontSizePx    = n(cfg.fontSizePx,   14);
  var textColor     = s(cfg.textColor,    '#e2e8f0');
  var rowBg         = s(cfg.rowBg,        'rgba(0,0,0,0.4)');
  var rowBgAlt      = s(cfg.rowBgAlt,     '');
  var containerBg   = s(cfg.containerBg,  'rgba(0,0,0,0.0)');
  var borderRadius  = n(cfg.borderRadius, 8);
  var rowPadding    = n(cfg.rowPadding,   6);
  var maxEvents     = n(cfg.maxEvents,    12);
  var expireSec     = n(cfg.expireSec,    0);   // 0 = never
  var newestTop     = b(cfg.newestTop,    true);
  var showTimestamp = b(cfg.showTimestamp,false);
  var showAvatar    = b(cfg.showAvatar,   false);
  var showPlatform  = b(cfg.showPlatform, true);
  var entryAnim     = s(cfg.entryAnim,    'slide-left'); // slide-left|slide-right|fade|scale
  var accentWidth   = n(cfg.accentWidth,  3);

  // Per-event config
  var EVENT_DEFAULTS = {
    follow:       { enabled:true,  template:'{username} followed',                  color:'#53fc18' },
    subscription: { enabled:true,  template:'{username} subscribed',                color:'#9146ff' },
    resub:        { enabled:true,  template:'{username} resubbed ({months} months)', color:'#9146ff' },
    gift_sub:     { enabled:true,  template:'{username} gifted {count} sub(s)',      color:'#ff6b6b' },
    raid:         { enabled:true,  template:'{username} raided ({count} viewers)',   color:'#f59e0b' },
    tip:          { enabled:true,  template:'{username} tipped {amount}',            color:'#fbbf24' },
    redemption:   { enabled:false, template:'{username} redeemed {reward}',          color:'#a78bfa' },
    chat:         { enabled:false, template:'{username}: {message}',                 color:'#94a3b8' },
  };

  function getEventCfg(type) {
    var d = EVENT_DEFAULTS[type] || { enabled:true, template:'{username} — '+type, color:'#94a3b8' };
    var u = (cfg.eventTypes && cfg.eventTypes[type]) || {};
    return Object.assign({}, d, u);
  }

  var TYPE_MAP = {
    'channel.followed':'follow', 'channel.subscription.new':'subscription',
    'channel.subscription.renewal':'resub', 'channel.subscription.gifts':'gift_sub',
    'raid':'raid', 'kicks.gifted':'tip', 'tip':'tip', 'donation':'tip',
    'channel.reward.redemption.updated':'redemption',
    'chat.message.sent':'chat',
    'follow':'follow', 'subscribe':'subscription', 'gift_sub':'gift_sub',
  };

  var PLATFORM_COLORS = { kick:'#53fc18', youtube:'#ff0000', twitch:'#9146ff' };

  // ── DOM ────────────────────────────────────────────────────────────────────
  var container = null;
  var list = null;
  var _findAttempts = 0;
  var eventEls = [];

  function findAndInit() {
    var editorRoot  = document.querySelector('[data-widget-editor-preview="event-console-widget"]');
    var runtimeRoot = document.querySelector('[data-widget-id="event-console-widget"]');
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
      container.id = 'event-console-root';
      container.style.cssText = 'position:fixed;bottom:16px;left:16px;width:320px;max-height:400px;z-index:9999;pointer-events:none;';
      document.body.appendChild(container);
      build();
    }
  }

  function build() {
    injectCSS();
    container.innerHTML = '<div class="ec-wrap"><div class="ec-list"></div></div>';
    list = container.querySelector('.ec-list');
    if (!editorPreview) connect();
    else showPreview();
    console.log('[event-console] v2 started');
  }

  // ── CSS ────────────────────────────────────────────────────────────────────
  function injectCSS() {
    var st = document.createElement('style');
    st.textContent = [
      '.ec-wrap{width:100%;height:100%;background:'+containerBg+';border-radius:'+borderRadius+'px;overflow:hidden;display:flex;flex-direction:column;justify-content:'+(newestTop?'flex-start':'flex-end')+';}',
      '.ec-list{display:flex;flex-direction:column;gap:2px;padding:4px;overflow:hidden;'+(newestTop?'':'flex-direction:column-reverse;')+'}',
      '.ec-row{display:flex;align-items:center;gap:6px;padding:'+rowPadding+'px;border-radius:'+(borderRadius-2)+'px;font-family:'+fontFamily+';font-size:'+fontSizePx+'px;color:'+textColor+';border-left:'+accentWidth+'px solid var(--ec-color,#94a3b8);background:'+rowBg+';overflow:hidden;}',
      '.ec-avatar{width:22px;height:22px;border-radius:50%;object-fit:cover;flex-shrink:0;}',
      '.ec-avatar-ph{width:22px;height:22px;border-radius:50%;background:rgba(255,255,255,0.1);flex-shrink:0;}',
      '.ec-platform{font-size:11px;flex-shrink:0;}',
      '.ec-text{flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}',
      '.ec-time{font-size:10px;opacity:0.5;flex-shrink:0;margin-left:4px;}',
      '@keyframes ec-slide-left{from{opacity:0;transform:translateX(-20px)}to{opacity:1;transform:translateX(0)}}',
      '@keyframes ec-slide-right{from{opacity:0;transform:translateX(20px)}to{opacity:1;transform:translateX(0)}}',
      '@keyframes ec-fade{from{opacity:0}to{opacity:1}}',
      '@keyframes ec-scale{from{opacity:0;transform:scale(0.8)}to{opacity:1;transform:scale(1)}}',
      '@keyframes ec-expire{to{opacity:0;max-height:0;padding:0;margin:0;}}',
    ].join('');
    document.head.appendChild(st);
  }

  // ── Add event row ──────────────────────────────────────────────────────────
  function addRow(type, vars, platform, avatar) {
    var ec = getEventCfg(type);
    if (!ec.enabled) return;
    // Platform filter
    if (platform && ec['platform_' + platform] === false) return;

    var text = renderTemplate(ec.template, vars);
    var color = ec.color || PLATFORM_COLORS[platform] || '#94a3b8';
    var platColor = PLATFORM_COLORS[platform] || color;
    var platIcon = platform === 'kick' ? '🟢' : platform === 'youtube' ? '▶️' : platform === 'twitch' ? '💜' : '';

    var animMap = { 'slide-left':'ec-slide-left', 'slide-right':'ec-slide-right', 'fade':'ec-fade', 'scale':'ec-scale' };
    var anim = animMap[entryAnim] || 'ec-slide-left';

    var row = document.createElement('div');
    row.className = 'ec-row';
    row.style.cssText = '--ec-color:'+color+';animation:'+anim+' 0.3s ease forwards;';
    if (rowBgAlt && eventEls.length % 2 === 1) row.style.background = rowBgAlt;

    var html = '';
    if (showAvatar) {
      html += avatar
        ? '<img class="ec-avatar" src="'+escHtml(avatar)+'" alt="" onerror="this.outerHTML=\'<div class=ec-avatar-ph></div>\'" />'
        : '<div class="ec-avatar-ph"></div>';
    }
    if (showPlatform && platIcon) html += '<span class="ec-platform" style="color:'+platColor+'">'+platIcon+'</span>';
    html += '<span class="ec-text">'+escHtml(text)+'</span>';
    if (showTimestamp) {
      var now = new Date();
      html += '<span class="ec-time">'+pad(now.getHours())+':'+pad(now.getMinutes())+'</span>';
    }
    row.innerHTML = html;

    if (newestTop) {
      list.insertBefore(row, list.firstChild);
    } else {
      list.appendChild(row);
    }

    eventEls.push(row);
    if (eventEls.length > maxEvents) {
      var old = eventEls.shift();
      if (old) old.remove();
    }

    // Auto-expire
    if (expireSec > 0) {
      setTimeout(function() {
        row.style.animation = 'ec-expire 0.4s ease forwards';
        setTimeout(function() { row.remove(); var i = eventEls.indexOf(row); if (i>-1) eventEls.splice(i,1); }, 400);
      }, expireSec * 1000);
    }
  }

  // ── Event handler ──────────────────────────────────────────────────────────
  function handleEvent(kind, data) {
    var p = data || {};
    var raw = p.payload || p;
    var alertType = TYPE_MAP[kind] || kind;
    var platform = raw.platform || p.source || 'kick';
    var username = (raw.actor && raw.actor.username) || (raw.follower && raw.follower.username) ||
                   (raw.message && raw.message.raw && raw.message.raw.sender && raw.message.raw.sender.username) ||
                   p.actor_username || raw.username || 'Someone';
    var amount   = raw.amount || raw.kicks || raw.value || p.amount || '';
    var count    = raw.viewers || raw.gifts || raw.count || p.count || '';
    var months   = raw.months || raw.duration || '';
    var message  = (raw.message && raw.message.text) || raw.message || p.message || '';
    var reward   = (raw.reward && raw.reward.title) || raw.title || '';
    var avatar   = (raw.actor && raw.actor.avatar_url) ||
                   (raw.message && raw.message.raw && raw.message.raw.sender && raw.message.raw.sender.profile_picture) ||
                   raw.avatar_url || '';

    addRow(alertType, { username:username, amount:amount, count:count, months:months, message:message, reward:reward }, platform, avatar);
  }

  // ── SSE ────────────────────────────────────────────────────────────────────
  function connect() {
    // Use shared SSE multiplexer from overlay runtime
    if (window.__OVERLAY_PUBLIC_ID__) {
      var _sseListeners = [];
      var _handler = function(ev) { _sseListeners.forEach(function(l) { try { l({data:ev.data,type:ev.type}); } catch(e){} }); };
      window.addEventListener('scraplet:widget:sse', _handler);
      var es = { close: function() { window.removeEventListener('scraplet:widget:sse', _handler); }, addEventListener: function(t,fn) { _sseListeners.push(fn); window.addEventListener('scraplet:widget:event:'+t, fn); }, onerror: null };
      console.log('[event-console] using shared SSE');
    } else {
      var es = new EventSource('/w/'+encodeURIComponent(token)+'/stream');
    }
    var types = ['channel.followed','channel.subscription.new','channel.subscription.renewal',
      'channel.subscription.gifts','kicks.gifted','raid','tip','donation',
      'channel.reward.redemption.updated','chat.message.sent',
      'follow','subscribe','gift_sub'];
    types.forEach(function(t) {
      es.addEventListener(t, function(e) { try { handleEvent(t, JSON.parse(e.data)); } catch(err){} });
    });
    es.onmessage = function(e) {
      try { var d=JSON.parse(e.data); handleEvent(d.kind||d.type, d); } catch(err){}
    };
    es.onerror = function() { es.close(); setTimeout(connect, 5000); };
    console.log('[event-console] SSE connected');
  }

  // ── Editor preview ─────────────────────────────────────────────────────────
  function showPreview() {
    if (window.__eventConsoleDummyShown) return;
    window.__eventConsoleDummyShown = true;
    var dummies = [
      { kind:'channel.followed',         data:{ actor_username:'StreamerFan99', source:'kick' } },
      { kind:'channel.subscription.new', data:{ actor_username:'NewSubber',     source:'twitch' } },
      { kind:'raid',                     data:{ actor_username:'RaidLeader',    count:42, source:'kick' } },
      { kind:'kicks.gifted',             data:{ actor_username:'BigTipper',     amount:'10.00', source:'kick' } },
      { kind:'channel.followed',         data:{ actor_username:'YTViewer',      source:'youtube' } },
    ];
    dummies.forEach(function(d, i) {
      setTimeout(function() { handleEvent(d.kind, d.data); }, i * 600);
    });
  }

  // ── Test fire ──────────────────────────────────────────────────────────────
  window.__eventConsoleTestFire = function(type) {
    var vars = { username:'TestUser', amount:'5.00', count:'42', months:'3', message:'Hello!', reward:'Test Reward' };
    var ec = getEventCfg(type);
    addRow(type, vars, 'kick', '');
  };

  // ── Helpers ────────────────────────────────────────────────────────────────
  function renderTemplate(tmpl, vars) {
    return tmpl.replace(/\{(\w+)\}/g, function(_,k){ return vars[k]||''; });
  }
  function pad(n) { return n<10?'0'+n:n; }
  function escHtml(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

  findAndInit();

})();

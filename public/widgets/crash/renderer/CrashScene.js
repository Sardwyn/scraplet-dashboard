import { Scene } from "./Scene.js";

function clamp01(x) { return Math.max(0, Math.min(1, x)); }
function safeNum(x, fallback = 0) { const n = Number(x); return Number.isFinite(n) ? n : fallback; }
function isoToMs(iso) { if (!iso) return null; const t = Date.parse(iso); return Number.isFinite(t) ? t : null; }

function requirePixi() {
  const PIXI = window.PIXI;
  if (!PIXI) throw new Error("PIXI not found. Did the CDN script load?");
  return PIXI;
}

async function tryLoadAlias(PIXI, alias, src) {
  if (!src) return false;
  try {
    try { PIXI.Assets.add({ alias, src }); } catch (_) {}
    await PIXI.Assets.load(alias);
    return true;
  } catch (_) {
    // swallow 404s etc
    return false;
  }
}

export class CrashScene extends Scene {
  constructor({ skin }) {
    super();
    this.skin = skin;
    this.PIXI = null;
    this.app = null;
    this.hostEl = null;

    this.snapshot = null;
    this._lastServerNowMs = null;

    this.root = null;

    this.bg = null;
    this.rocket = null;
    this.flame = null;
    this.boom = null;
    this.hudText = null;
  }

  async mount(hostEl) {
    this.PIXI = requirePixi();
    this.hostEl = hostEl;

    const width = hostEl.clientWidth || 1280;
    const height = hostEl.clientHeight || 720;

    this.app = new this.PIXI.Application();
    await this.app.init({
      width,
      height,
      antialias: true,
      backgroundAlpha: 0,
      resolution: window.devicePixelRatio || 1,
      autoDensity: true,
    });

    hostEl.innerHTML = "";
    hostEl.appendChild(this.app.canvas);

    this.root = new this.PIXI.Container();
    this.app.stage.addChild(this.root);

    await this._loadAssetsNonFatal();
    this._buildScene(width, height);
  }

  async _loadAssetsNonFatal() {
    const PIXI = this.PIXI;
    const textures = (this.skin?.games?.crash?.textures) || {};
    const shared = (this.skin?.shared?.textures) || {};

    await tryLoadAlias(PIXI, "plate", shared.plate);
    await tryLoadAlias(PIXI, "rocket", textures.rocket);
    await tryLoadAlias(PIXI, "flame", textures.flame);
    await tryLoadAlias(PIXI, "boom", textures.boom);
  }

  _buildScene(width, height) {
    const PIXI = this.PIXI;
    const params = (this.skin?.games?.crash?.params) || {};

    // Dark background always visible
    this.bg = new PIXI.Graphics().rect(0, 0, width, height).fill({ color: 0x0b0f19, alpha: 1 });
    this.root.addChild(this.bg);

    // If plate texture exists, draw it on top (optional)
    const plateTex = PIXI.Assets.get("plate");
    if (plateTex) {
      const plate = new PIXI.Sprite(plateTex);
      plate.width = width;
      plate.height = height;
      this.root.addChild(plate);
    }

    // HUD always visible
    this.hudText = new PIXI.Text({
      text: "—",
      style: {
        fontFamily: "Arial",
        fontSize: safeNum(params.hudFontSize, 64),
        fontWeight: "800",
        fill: 0xE6EDF3,
        letterSpacing: 1,
      },
    });
    this.hudText.anchor.set(0.5, 0);
    this.hudText.x = width * 0.5;
    this.hudText.y = safeNum(params.hudOffsetY, 24);
    this.root.addChild(this.hudText);

    // Rocket: texture if available, otherwise triangle
    const rocketTex = PIXI.Assets.get("rocket");
    if (rocketTex) {
      const s = new PIXI.Sprite(rocketTex);
      s.anchor.set(0.5, 0.5);
      s.width = safeNum(params.rocketW, 140);
      s.height = safeNum(params.rocketH, 140);
      this.rocket = s;
    } else {
      const g = new PIXI.Graphics();
      g.moveTo(-30, -18).lineTo(30, 0).lineTo(-30, 18).closePath().fill({ color: 0x22c55e, alpha: 1 });
      this.rocket = g;
    }
    this.rocket.x = safeNum(params.rocketStartX, 160);
    this.rocket.y = height * 0.55;
    this.root.addChild(this.rocket);

    // Flame: texture if available, otherwise small circle
    const flameTex = PIXI.Assets.get("flame");
    if (flameTex) {
      const s = new PIXI.Sprite(flameTex);
      s.anchor.set(0.5, 0.1);
      s.width = safeNum(params.flameW, 70);
      s.height = safeNum(params.flameH, 120);
      this.flame = s;
    } else {
      const g = new PIXI.Graphics().circle(0, 0, 10).fill({ color: 0xfacc15, alpha: 0.9 });
      g.alpha = 0;
      this.flame = g;
    }
    this.flame.x = this.rocket.x - 25;
    this.flame.y = this.rocket.y + 25;
    this.root.addChild(this.flame);

    // Boom: texture if available, otherwise red circle
    const boomTex = PIXI.Assets.get("boom");
    if (boomTex) {
      const s = new PIXI.Sprite(boomTex);
      s.anchor.set(0.5, 0.5);
      s.width = safeNum(params.boomW, 260);
      s.height = safeNum(params.boomH, 260);
      s.alpha = 0;
      this.boom = s;
    } else {
      const g = new PIXI.Graphics().circle(0, 0, 60).fill({ color: 0xef4444, alpha: 0.85 });
      g.alpha = 0;
      this.boom = g;
    }
    this.boom.x = width * 0.5;
    this.boom.y = height * 0.5;
    this.root.addChild(this.boom);
  }

  applySnapshot(snapshot) {
    this.snapshot = snapshot || null;
    this._lastServerNowMs = isoToMs(snapshot?.server_now);
  }

  tick() {
    if (!this.app) return;

    const round = this.snapshot?.round || null;
    if (!round) {
      this.hudText.text = "—";
      this.flame.alpha = 0;
      this.boom.alpha = 0;
      return;
    }

    const status = String(round.status || "").toLowerCase();
    const startedMs = isoToMs(round.started_at);
    const endsMs = isoToMs(round.ends_at);
    const serverNowMs = this._lastServerNowMs ?? Date.now();

    let progress = 0;
    if (startedMs && endsMs && endsMs > startedMs) {
      progress = clamp01((serverNowMs - startedMs) / (endsMs - startedMs));
    }

    const crashMult = safeNum(round.crash_multiplier, 1.0);
    const cashMult = round.cashout_at_multiplier != null ? safeNum(round.cashout_at_multiplier, null) : null;

    let displayMult = 1.0;
    if (status === "cashed_out" && cashMult != null) displayMult = cashMult;
    else if (status === "exploded") displayMult = crashMult;
    else {
      displayMult = 1 + (crashMult - 1) * progress;
      displayMult = Math.floor(displayMult * 100) / 100;
      if (displayMult > crashMult) displayMult = crashMult;
      if (displayMult < 1.0) displayMult = 1.0;
    }

    this.hudText.text = `${displayMult.toFixed(2)}x`;

    const params = (this.skin?.games?.crash?.params) || {};
    const startX = safeNum(params.rocketStartX, 160);
    const endX = safeNum(params.rocketEndX, (this.app.renderer.width - 160));
    const x = startX + (endX - startX) * progress;

    const t = this.app.ticker.lastTime / 1000;
    const bob = status === "active" ? Math.sin(t * 4) * 6 : 0;

    this.rocket.x = x;
    this.rocket.y = this.app.renderer.height * 0.55 + bob;

    this.flame.x = x - 25;
    this.flame.y = this.rocket.y + 25;

    if (status === "active") {
      this.boom.alpha = 0;
      this.flame.alpha = 0.65 + Math.sin(t * 18) * 0.15;
    } else if (status === "exploded") {
      this.flame.alpha = 0;
      this.boom.alpha = 1;
    } else {
      this.flame.alpha = 0;
      this.boom.alpha = 0;
    }
  }

  unmount() {
    if (this.hostEl) this.hostEl.innerHTML = "";
    if (this.app) {
      try { this.app.destroy(true); } catch (_) {}
    }
    this.app = null;
    this.hostEl = null;
  }
}

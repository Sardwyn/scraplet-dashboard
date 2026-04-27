// public/js/colour-picker.js
// Self-contained visual colour picker component.
// No dependencies. Renders a hue slider + SL canvas + preview.
// Usage: new ColourPicker(containerEl, initialHex, onChange)

export class ColourPicker {
  constructor(container, initialHex, onChange) {
    this.container = container;
    this.onChange = onChange;
    this.hue = 220;
    this.sat = 0.7;
    this.lit = 0.3;
    this.draggingSL = false;
    this.draggingHue = false;

    if (initialHex) this._fromHex(initialHex);
    this._render();
    this._wire();
  }

  _render() {
    this.container.innerHTML = `
      <div class="cp-root">
        <!-- SL canvas -->
        <div class="cp-sl-wrap">
          <canvas class="cp-sl-canvas" width="220" height="140"></canvas>
          <div class="cp-sl-cursor"></div>
        </div>
        <!-- Hue slider -->
        <div class="cp-hue-wrap">
          <canvas class="cp-hue-canvas" width="220" height="16"></canvas>
          <div class="cp-hue-cursor"></div>
        </div>
        <!-- Preview + hex -->
        <div class="cp-bottom">
          <div class="cp-preview"></div>
          <div class="cp-hex-display"></div>
        </div>
      </div>
    `;
    this._drawSL();
    this._drawHue();
    this._updateCursors();
    this._updatePreview();
  }

  _wire() {
    const slCanvas = this.container.querySelector('.cp-sl-canvas');
    const hueCanvas = this.container.querySelector('.cp-hue-canvas');

    // SL canvas
    slCanvas.addEventListener('mousedown', e => { this.draggingSL = true; this._onSL(e); });
    slCanvas.addEventListener('touchstart', e => { this.draggingSL = true; this._onSL(e.touches[0]); }, { passive: true });
    document.addEventListener('mousemove', e => { if (this.draggingSL) this._onSL(e); });
    document.addEventListener('touchmove', e => { if (this.draggingSL) this._onSL(e.touches[0]); }, { passive: true });
    document.addEventListener('mouseup', () => { this.draggingSL = false; });
    document.addEventListener('touchend', () => { this.draggingSL = false; });

    // Hue slider
    hueCanvas.addEventListener('mousedown', e => { this.draggingHue = true; this._onHue(e); });
    hueCanvas.addEventListener('touchstart', e => { this.draggingHue = true; this._onHue(e.touches[0]); }, { passive: true });
    document.addEventListener('mousemove', e => { if (this.draggingHue) this._onHue(e); });
    document.addEventListener('touchmove', e => { if (this.draggingHue) this._onHue(e.touches[0]); }, { passive: true });
    document.addEventListener('mouseup', () => { this.draggingHue = false; });
    document.addEventListener('touchend', () => { this.draggingHue = false; });
  }

  _onSL(e) {
    const canvas = this.container.querySelector('.cp-sl-canvas');
    const rect = canvas.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const y = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
    this.sat = x;
    this.lit = 1 - y;
    this._updateCursors();
    this._updatePreview();
    this._emit();
  }

  _onHue(e) {
    const canvas = this.container.querySelector('.cp-hue-canvas');
    const rect = canvas.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    this.hue = Math.round(x * 360);
    this._drawSL();
    this._updateCursors();
    this._updatePreview();
    this._emit();
  }

  _drawSL() {
    const canvas = this.container.querySelector('.cp-sl-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const w = canvas.width, h = canvas.height;

    // White to hue gradient (horizontal)
    const gradH = ctx.createLinearGradient(0, 0, w, 0);
    gradH.addColorStop(0, `hsl(${this.hue},0%,100%)`);
    gradH.addColorStop(1, `hsl(${this.hue},100%,50%)`);
    ctx.fillStyle = gradH;
    ctx.fillRect(0, 0, w, h);

    // Transparent to black gradient (vertical)
    const gradV = ctx.createLinearGradient(0, 0, 0, h);
    gradV.addColorStop(0, 'rgba(0,0,0,0)');
    gradV.addColorStop(1, 'rgba(0,0,0,1)');
    ctx.fillStyle = gradV;
    ctx.fillRect(0, 0, w, h);
  }

  _drawHue() {
    const canvas = this.container.querySelector('.cp-hue-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const w = canvas.width, h = canvas.height;
    const grad = ctx.createLinearGradient(0, 0, w, 0);
    for (let i = 0; i <= 360; i += 30) {
      grad.addColorStop(i / 360, `hsl(${i},100%,50%)`);
    }
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
  }

  _updateCursors() {
    const slCanvas = this.container.querySelector('.cp-sl-canvas');
    const slCursor = this.container.querySelector('.cp-sl-cursor');
    const hueCursor = this.container.querySelector('.cp-hue-cursor');
    const hueCanvas = this.container.querySelector('.cp-hue-canvas');
    if (!slCanvas || !slCursor || !hueCursor || !hueCanvas) return;

    const slRect = slCanvas.getBoundingClientRect();
    const hueRect = hueCanvas.getBoundingClientRect();

    slCursor.style.left = (this.sat * slRect.width) + 'px';
    slCursor.style.top = ((1 - this.lit) * slRect.height) + 'px';
    hueCursor.style.left = ((this.hue / 360) * hueRect.width) + 'px';
  }

  _updatePreview() {
    const hex = this.toHex();
    const preview = this.container.querySelector('.cp-preview');
    const display = this.container.querySelector('.cp-hex-display');
    if (preview) preview.style.background = hex;
    if (display) display.textContent = hex;
  }

  _emit() {
    if (this.onChange) this.onChange(this.toHex());
  }

  // Convert HSL (sat 0-1, lit 0-1) to hex
  toHex() {
    // Convert to proper HSL: sat needs adjustment based on lightness
    const s = this.sat;
    const l = this.lit * (1 - this.sat / 2);
    const sAdj = l === 0 || l === 1 ? 0 : (this.lit - l) / Math.min(l, 1 - l);

    const hslToRgb = (h, s, l) => {
      const a = s * Math.min(l, 1 - l);
      const f = n => {
        const k = (n + h / 30) % 12;
        return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
      };
      return [Math.round(f(0) * 255), Math.round(f(8) * 255), Math.round(f(4) * 255)];
    };

    const [r, g, b] = hslToRgb(this.hue, sAdj, l);
    return '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');
  }

  _fromHex(hex) {
    const r = parseInt(hex.slice(1, 3), 16) / 255;
    const g = parseInt(hex.slice(3, 5), 16) / 255;
    const b = parseInt(hex.slice(5, 7), 16) / 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    const l = (max + min) / 2;
    const s = max === min ? 0 : (max - min) / (1 - Math.abs(2 * l - 1));
    let h = 0;
    if (max !== min) {
      if (max === r) h = ((g - b) / (max - min)) % 6;
      else if (max === g) h = (b - r) / (max - min) + 2;
      else h = (r - g) / (max - min) + 4;
      h = Math.round(h * 60);
      if (h < 0) h += 360;
    }
    this.hue = h;
    this.sat = s;
    this.lit = l;
  }

  setValue(hex) {
    if (!hex || !hex.startsWith('#')) return;
    this._fromHex(hex);
    this._drawSL();
    this._updateCursors();
    this._updatePreview();
  }
}

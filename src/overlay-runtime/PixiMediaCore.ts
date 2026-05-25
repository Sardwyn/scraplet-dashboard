import { Application, Container, Filter, GlProgram, Sprite, Texture, Ticker } from 'pixi.js';

export interface PixiMediaConfig {
  canvas: HTMLCanvasElement;
  width: number;
  height: number;
}

export class PixiMediaCore {
  private app: Application | null = null;
  private rootContainer: Container | null = null;
  private videoSprites = new Map<string, Sprite>();

  /**
   * Initializes the PixiJS v8 Application asynchronously on the target canvas
   */
  public async initialize(config: PixiMediaConfig): Promise<void> {
    if (this.app) {
      console.warn('[PixiMediaCore] Already initialized');
      return;
    }

    try {
      this.app = new Application();
      
      // PixiJS v8 Asynchronous initialization
      await this.app.init({
        canvas: config.canvas,
        width: config.width,
        height: config.height,
        resolution: window.devicePixelRatio || 1,
        autoDensity: true,
        backgroundAlpha: 0, // Keep transparent to stack over OBS background
        antialias: true,
      });

      this.rootContainer = new Container({
        isRenderGroup: true, // v8 RenderGroup: Offload transformations & updates to the GPU
      });
      this.app.stage.addChild(this.rootContainer);

      // Bind WebGL context loss listeners for OBS CEF stability
      const gl = this.app.renderer.gl;
      if (gl) {
        config.canvas.addEventListener('webglcontextlost', this.handleContextLost, false);
        config.canvas.addEventListener('webglcontextrestored', this.handleContextRestored, false);
      }

      console.log('[PixiMediaCore] Successfully initialized PixiJS v8 engine');
    } catch (err) {
      console.error('[PixiMediaCore] Initialization failed:', err);
      throw err;
    }
  }

  /**
   * Clears all assets and stops the rendering ticker
   */
  public destroy(): void {
    if (this.app) {
      const gl = this.app.renderer.gl;
      if (gl && this.app.canvas) {
        this.app.canvas.removeEventListener('webglcontextlost', this.handleContextLost);
        this.app.canvas.removeEventListener('webglcontextrestored', this.handleContextRestored);
      }

      // Cleanup videos and sprites
      this.videoSprites.forEach(sprite => {
        if (sprite.texture) {
          sprite.texture.destroy(true);
        }
        sprite.destroy();
      });
      this.videoSprites.clear();

      this.app.destroy(true, { children: true, texture: true });
      this.app = null;
      this.rootContainer = null;
      console.log('[PixiMediaCore] Destroyed PixiJS Application');
    }
  }

  /**
   * Removes a video element from the scene and destroys its texture
   */
  public removeVideoElement(id: string): void {
    const sprite = this.videoSprites.get(id);
    if (sprite) {
      if (sprite.texture) {
        sprite.texture.destroy(true);
      }
      sprite.destroy();
      this.videoSprites.delete(id);
      console.log(`[PixiMediaCore] Removed video sprite: ${id}`);
    }
  }

  /**
   * Adds or updates a video stream (camera / wallpaper) with active GPU chroma-keying
   */
  public updateVideoElement(
    id: string,
    videoEl: HTMLVideoElement,
    layout: { x: number; y: number; width: number; height: number },
    chromaConfig?: { keyColor: [number, number, number]; similarity: number; smoothness: number }
  ): void {
    if (!this.app || !this.rootContainer) return;

    let sprite = this.videoSprites.get(id);

    if (!sprite) {
      // Create v8 texture directly from the video element (uses VideoSource under the hood)
      const texture = Texture.from(videoEl);
      sprite = new Sprite(texture);
      this.rootContainer.addChild(sprite);
      this.videoSprites.set(id, sprite);
      console.log(`[PixiMediaCore] Created GPU video sprite: ${id}`);
    }

    // Apply layout positions
    sprite.x = layout.x;
    sprite.y = layout.y;
    sprite.width = layout.width;
    sprite.height = layout.height;

    // Apply custom chroma-key shader if configured
    if (chromaConfig) {
      this.applyChromaShader(sprite, chromaConfig);
    } else {
      sprite.filters = null;
    }
  }

  /**
   * Compiles and applies our GPU-accelerated Green-Screen filter to a target sprite
   */
  private applyChromaShader(
    sprite: Sprite,
    config: { keyColor: [number, number, number]; similarity: number; smoothness: number }
  ): void {
    // PixiJS v8 customized Filter model using GlProgram and資源 uniform structure
    const vertex = `
      in vec2 aPosition;
      out vec2 vTextureCoord;

      uniform vec4 uInputSize;
      uniform vec4 uOutputFrame;
      uniform vec4 uOutputTexture;

      vec4 filterVertexPosition( void )
      {
          vec2 position = aPosition * uOutputFrame.zw + uOutputFrame.xy;
          position.x = position.x * (2.0 / uOutputTexture.x) - 1.0;
          position.y = position.y * (2.0 * uOutputTexture.z / uOutputTexture.y) - uOutputTexture.z;
          return vec4(position, 0.0, 1.0);
      }

      vec2 filterTextureCoord( void )
      {
          return aPosition * (uOutputFrame.zw * uInputSize.zw);
      }

      void main(void)
      {
          gl_Position = filterVertexPosition();
          vTextureCoord = filterTextureCoord();
      }
    `;

    const fragment = `
      in vec2 vTextureCoord;
      uniform sampler2D uTexture;
      uniform vec3 uKeyColor;
      uniform float uSimilarity;
      uniform float uSmoothness;

      void main(void)
      {
          vec4 color = texture2D(uTexture, vTextureCoord);
          if (color.a == 0.0) {
              gl_FragColor = color;
              return;
          }

          // Calculate chroma key distance
          float distance = distance(color.rgb, uKeyColor);
          
          // Smoothstep thresholding on the GPU
          float alpha = smoothstep(uSimilarity, uSimilarity + uSmoothness, distance);
          
          gl_FragColor = vec4(color.rgb * alpha, color.a * alpha);
      }
    `;

    const chromaFilter = new Filter({
      glProgram: new GlProgram({
        fragment,
        vertex,
      }),
      resources: {
        chromaUniforms: {
          uKeyColor: { value: config.keyColor, type: 'vec3' },
          uSimilarity: { value: config.similarity, type: 'f32' },
          uSmoothness: { value: config.smoothness, type: 'f32' },
        },
      },
    });

    sprite.filters = [chromaFilter];
  }

  /**
   * Toggles the rendering ticker on/off to conserve CPU/GPU cycles during heavy interactions
   */
  public setTickerActive(active: boolean): void {
    if (!this.app) return;
    if (active) {
      this.app.ticker.start();
    } else {
      this.app.ticker.stop();
    }
  }

  /**
   * Context-loss handlers for system-recovery inside OBS Studio
   */
  private handleContextLost = (e: Event): void => {
    e.preventDefault();
    console.warn('[PixiMediaCore] WebGL Context lost. Pausing tickers and preserving source states.');
    if (this.app) {
      this.app.ticker.stop();
    }
  };

  private handleContextRestored = (): void => {
    console.log('[PixiMediaCore] WebGL Context restored. Re-initializing GPU pipelines.');
    if (this.app) {
      // Force all video texture sources to re-upload to the GPU
      this.videoSprites.forEach(sprite => {
        if (sprite.texture && sprite.texture.source) {
          sprite.texture.source.unload(); // Unload stale WebGL handle
        }
      });
      this.app.ticker.start();
    }
  };
}

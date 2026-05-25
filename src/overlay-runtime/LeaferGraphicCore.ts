import { Leafer, Rect, Ellipse, Path, Text, UI } from 'leafer-ui';

export interface LeaferGraphicConfig {
  canvas: HTMLCanvasElement;
  width: number;
  height: number;
}

export class LeaferGraphicCore {
  private app: Leafer | null = null;
  private elementsMap = new Map<string, UI>();

  /**
   * Initializes Leafer.js Canvas 2D layer on the target canvas viewport
   */
  public initialize(config: LeaferGraphicConfig): void {
    if (this.app) {
      console.warn('[LeaferGraphicCore] Already initialized');
      return;
    }

    try {
      // Create the core Leafer.js App and bind to the canvas element
      this.app = new Leafer({
        view: config.canvas,
        width: config.width,
        height: config.height,
      });

      console.log('[LeaferGraphicCore] Successfully initialized Leafer.js Engine');
    } catch (err) {
      console.error('[LeaferGraphicCore] Initialization failed:', err);
      throw err;
    }
  }

  /**
   * Cleans up all Leafer.js nodes and destroys the viewport app instance
   */
  public destroy(): void {
    if (this.app) {
      this.clearAll();
      this.app.destroy();
      this.app = null;
      console.log('[LeaferGraphicCore] Destroyed Leafer.js viewport');
    }
  }

  /**
   * Clears all canvas rendering nodes
   */
  public clearAll(): void {
    this.elementsMap.forEach(node => {
      node.remove();
    });
    this.elementsMap.clear();
  }

  /**
   * Dynamic shape router - parses database element type and draws onto Canvas 2D
   */
  public drawElement(
    id: string,
    type: 'rect' | 'circle' | 'ellipse' | 'path' | 'text',
    properties: Record<string, any>
  ): void {
    if (!this.app) return;

    let node = this.elementsMap.get(id);

    // If node already exists, we update its properties. Otherwise, we instantiate a new node.
    if (!node) {
      switch (type) {
        case 'rect':
          node = new Rect();
          break;
        case 'ellipse':
        case 'circle':
          node = new Ellipse();
          break;
        case 'path':
          node = new Path();
          break;
        case 'text':
          node = new Text();
          break;
        default:
          console.warn(`[LeaferGraphicCore] Unsupported element type: ${type}`);
          return;
      }
      this.app.add(node);
      this.elementsMap.set(id, node);
    }

    // Map properties from database JSON schema to LeaferJS properties
    const mappedProps: Record<string, any> = {
      x: properties.x ?? 0,
      y: properties.y ?? 0,
      width: properties.width ?? 0,
      height: properties.height ?? 0,
      opacity: properties.opacity ?? 1,
      rotation: properties.rotationDeg ?? 0,
      scaleX: properties.scaleX ?? 1,
      scaleY: properties.scaleY ?? 1,
    };

    if (type === 'rect') {
      mappedProps.fill = properties.fillColor || '#ffffff';
      mappedProps.cornerRadius = properties.cornerRadiusPx || 0;
      if (properties.strokeColor) {
        mappedProps.stroke = properties.strokeColor;
        mappedProps.strokeWidth = properties.strokeWidthPx || 1;
      }
    } else if (type === 'ellipse' || type === 'circle') {
      mappedProps.fill = properties.fillColor || '#ffffff';
      if (type === 'circle') {
        const radius = properties.radius || Math.min(mappedProps.width, mappedProps.height) / 2 || 50;
        mappedProps.width = radius * 2;
        mappedProps.height = radius * 2;
      }
    } else if (type === 'path') {
      mappedProps.fill = properties.fillColor || '#ffffff';
      mappedProps.path = properties.pathData || ''; // SVG Path string (commands)
    } else if (type === 'text') {
      mappedProps.text = properties.text || '';
      mappedProps.fill = properties.textColor || '#ffffff';
      mappedProps.fontSize = properties.fontSizePx || 24;
      mappedProps.fontFamily = properties.fontFamily || 'Inter, sans-serif';
      mappedProps.fontWeight = properties.fontWeight || 'normal';
      mappedProps.textAlign = properties.textAlign || 'left';
      mappedProps.verticalAlign = 'middle';
    }

    // Apply properties dynamically to the node
    node.set(mappedProps);
  }

  /**
   * Preloads custom fonts asynchronously using standard browser FontFaceSet before drawing
   */
  public async preloadFonts(fonts: string[]): Promise<void> {
    if (fonts.length === 0) return;
    try {
      const loadPromises = fonts.map(font => {
        // Attempt to trigger font loading via standard CSS Font Loading API
        return document.fonts.load(`1em ${font}`).catch(e => {
          console.warn(`[LeaferGraphicCore] Failed to preload font: ${font}`, e);
        });
      });
      await Promise.all(loadPromises);
    } catch (_) {
      // Fallback: Non-blocking
    }
  }

  /**
   * Cleans up any elements that are not in the active IDs set
   */
  public cleanupOrphanedElements(activeIds: Set<string>): void {
    this.elementsMap.forEach((node, id) => {
      if (!activeIds.has(id)) {
        node.remove();
        this.elementsMap.delete(id);
      }
    });
  }

  /**
   * Removes a single element from the render tree
   */
  public removeElement(id: string): void {
    const node = this.elementsMap.get(id);
    if (node) {
      node.remove();
      this.elementsMap.delete(id);
    }
  }
}

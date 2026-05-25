import { Leafer, Rect, Ellipse, Path, Text, UI } from 'leafer-ui';
import { elementToOverlayPath, svgPathFromCommands } from '../shared/geometry/pathUtils';

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
      mappedProps.fill = this.resolveLeaferFill(properties);
      mappedProps.cornerRadius = properties.cornerRadiusPx || properties.borderRadius || 0;
      if (properties.strokeColor) {
        mappedProps.stroke = properties.strokeColor;
        mappedProps.strokeWidth = properties.strokeWidthPx || 1;
      }
    } else if (type === 'ellipse' || type === 'circle') {
      mappedProps.fill = this.resolveLeaferFill(properties);
      if (type === 'circle') {
        const radius = properties.radius || Math.min(mappedProps.width, mappedProps.height) / 2 || 50;
        mappedProps.width = radius * 2;
        mappedProps.height = radius * 2;
      }
    } else if (type === 'path') {
      mappedProps.fill = this.resolveLeaferFill(properties);
      let pathStr = properties.pathData || '';
      if (!pathStr) {
        const overlayPath = elementToOverlayPath(properties as any);
        if (overlayPath) {
          pathStr = svgPathFromCommands(overlayPath);
        }
      }
      mappedProps.path = pathStr;
    } else if (type === 'text') {
      mappedProps.text = properties.text || '';
      mappedProps.fill = properties.textColor || properties.color || '#ffffff';
      mappedProps.fontSize = properties.fontSizePx || properties.fontSize || 24;
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

  /**
   * Helper to append alpha component to a hex/rgb color string
   */
  private resolveColorWithOpacity(colorStr: string, opacity: number): string {
    if (opacity === 1 || opacity === undefined) return colorStr;
    let color = colorStr.trim();
    if (color.startsWith('#')) {
      if (color.length === 4) {
        const r = parseInt(color[1] + color[1], 16);
        const g = parseInt(color[2] + color[2], 16);
        const b = parseInt(color[3] + color[3], 16);
        return `rgba(${r}, ${g}, ${b}, ${opacity})`;
      } else if (color.length === 7) {
        const r = parseInt(color.substring(1, 3), 16);
        const g = parseInt(color.substring(3, 5), 16);
        const b = parseInt(color.substring(5, 7), 16);
        return `rgba(${r}, ${g}, ${b}, ${opacity})`;
      }
    } else if (color.startsWith('rgb(')) {
      return color.replace('rgb(', 'rgba(').replace(')', `, ${opacity})`);
    }
    return color;
  }

  /**
   * Recreates the legacy fill stack for an element to match ElementRenderer.tsx fallback behavior
   */
  private getLegacyFillStack(properties: Record<string, any>): any[] {
    if (Array.isArray(properties.fills) && properties.fills.length > 0) {
      return properties.fills;
    }

    if (properties.type === 'box') {
      const fills: any[] = [];
      if (properties.backgroundColor) {
        fills.push({
          type: 'solid',
          color: properties.backgroundColor,
          opacity: 1,
          id: `${properties.id}-fill-solid`
        });
      }
      if (properties.pattern?.src) {
        fills.push({
          ...properties.pattern,
          type: 'pattern',
          id: `${properties.id}-fill-pattern`
        });
      }
      return fills;
    }

    const fills: any[] = [];
    if (properties.type === 'image' && properties.src) {
      fills.push({
        type: 'pattern',
        src: properties.src,
        fit: properties.fit || 'cover',
        opacity: properties.opacity ?? 1,
        id: `${properties.id}-fill-image`
      });
    }
    if (properties.fillColor) {
      fills.push({
        type: 'solid',
        color: properties.fillColor,
        opacity: typeof properties.fillOpacity === 'number' ? properties.fillOpacity : 1,
        id: `${properties.id}-fill-solid`,
      });
    }
    if (properties.pattern?.src) {
      fills.push({
        ...properties.pattern,
        type: 'pattern',
        id: `${properties.id}-fill-pattern`
      });
    }
    return fills;
  }

  /**
   * Resolves fill color, patterns, images, linear, and radial gradients into LeaferJS fill structure
   */
  private resolveLeaferFill(properties: Record<string, any>): any {
    const fills = this.getLegacyFillStack(properties);
    if (!fills || fills.length === 0) {
      return '#ffffff';
    }

    const mappedFills = fills.map((fill) => {
      if (fill.type === 'solid') {
        return this.resolveColorWithOpacity(fill.color || '#ffffff', fill.opacity ?? 1);
      }
      if (fill.type === 'linear') {
        return {
          type: 'linear',
          rotation: fill.angleDeg ?? 0,
          stops: (fill.stops || []).map((stop: any, index: number) => {
            const offset = stop.position !== undefined ? stop.position / 100 : (fill.stops.length <= 1 ? 0 : index / (fill.stops.length - 1));
            const stopOpacity = stop.opacity ?? 1;
            const color = this.resolveColorWithOpacity(stop.color || '#ffffff', stopOpacity);
            return { offset, color };
          })
        };
      }
      if (fill.type === 'radial') {
        return {
          type: 'radial',
          stops: (fill.stops || []).map((stop: any, index: number) => {
            const offset = stop.position !== undefined ? stop.position / 100 : (fill.stops.length <= 1 ? 0 : index / (fill.stops.length - 1));
            const stopOpacity = stop.opacity ?? 1;
            const color = this.resolveColorWithOpacity(stop.color || '#ffffff', stopOpacity);
            return { offset, color };
          })
        };
      }
      if (fill.type === 'pattern' || fill.type === 'texture') {
        const url = fill.src || fill.url;
        if (!url) return 'transparent';
        const fit = fill.fit ?? 'tile';
        let mode: 'repeat' | 'cover' | 'fit' | 'stretch' = 'repeat';
        if (fit === 'cover') mode = 'cover';
        else if (fit === 'contain') mode = 'fit';
        else if (fit === 'stretch' || fit === 'fill') mode = 'stretch';

        return {
          type: 'image',
          url,
          mode,
          opacity: fill.opacity ?? 1,
          crossOrigin: 'anonymous'
        };
      }
      return 'transparent';
    }).filter(f => f !== 'transparent');

    if (mappedFills.length === 0) return '#ffffff';
    if (mappedFills.length === 1) return mappedFills[0];
    return mappedFills;
  }
}

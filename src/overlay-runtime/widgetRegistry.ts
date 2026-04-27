// Widget Registry System - Bulletproof widget loading for production
// Guarantees containers exist before scripts load

type WidgetState = 'pending' | 'container-ready' | 'script-loading' | 'script-loaded' | 'initialized' | 'failed';

interface WidgetRegistration {
  widgetId: string;
  elementId: string;
  state: WidgetState;
  config: Record<string, any>;
  scriptUrl: string;
  requiresToken: boolean;
  token?: string;
  retryCount: number;
  error?: string;
}

class WidgetRegistry {
  private widgets = new Map<string, WidgetRegistration>();
  private loadedScripts = new Set<string>();
  private observer: MutationObserver | null = null;
  private checkInterval: number | null = null;
  
  private readonly MAX_RETRIES = 3;
  private readonly CHECK_INTERVAL_MS = 100;
  private readonly CONTAINER_TIMEOUT_MS = 5000;

  constructor() {
    console.log('[WidgetRegistry] Initialized');
  }

  /**
   * Register a widget for loading
   * Safe to call multiple times - idempotent
   */
  register(params: {
    widgetId: string;
    elementId: string;
    config: Record<string, any>;
    scriptUrl: string;
    requiresToken: boolean;
  }): void {
    const key = `${params.widgetId}-${params.elementId}`;
    
    // Skip if already registered and not failed
    if (this.widgets.has(key)) {
      const existing = this.widgets.get(key)!;
      if (existing.state !== 'failed') {
        console.log(`[WidgetRegistry] Widget ${key} already registered (${existing.state})`);
        return;
      }
    }

    const registration: WidgetRegistration = {
      ...params,
      state: 'pending',
      retryCount: 0,
    };

    this.widgets.set(key, registration);
    console.log(`[WidgetRegistry] Registered ${key}`);

    // Start checking for containers if not already running
    this.startContainerCheck();
  }

  /**
   * Start observing DOM for widget containers
   */
  private startContainerCheck(): void {
    if (this.checkInterval !== null) return;

    console.log('[WidgetRegistry] Starting container check');
    
    // Use MutationObserver for efficient DOM monitoring
    if (!this.observer) {
      this.observer = new MutationObserver(() => {
        this.checkContainers();
      });
      
      this.observer.observe(document.body, {
        childList: true,
        subtree: true,
      });
    }

    // Also poll periodically as backup
    this.checkInterval = window.setInterval(() => {
      this.checkContainers();
    }, this.CHECK_INTERVAL_MS);

    // Initial check
    this.checkContainers();
  }

  /**
   * Check which containers are ready and load their scripts
   */
  private checkContainers(): void {
    let allReady = true;

    for (const [key, widget] of this.widgets.entries()) {
      if (widget.state !== 'pending') continue;

      allReady = false;

      // Look for container
      const container = document.querySelector(`[data-widget-id="${widget.widgetId}"]`);
      
      if (container) {
        console.log(`[WidgetRegistry] Container ready for ${key}`);
        widget.state = 'container-ready';
        
        // Load script immediately
        this.loadScript(key, widget);
      }
    }

    // Stop checking if all widgets are ready or failed
    if (allReady && this.checkInterval !== null) {
      console.log('[WidgetRegistry] All containers ready, stopping check');
      window.clearInterval(this.checkInterval);
      this.checkInterval = null;
      
      if (this.observer) {
        this.observer.disconnect();
        this.observer = null;
      }
    }
  }

  /**
   * Load widget script
   */
  private async loadScript(key: string, widget: WidgetRegistration): Promise<void> {
    if (widget.state === 'script-loading' || widget.state === 'script-loaded') {
      return;
    }

    widget.state = 'script-loading';
    console.log(`[WidgetRegistry] Loading script for ${key}`);

    try {
      // Fetch token if required
      if (widget.requiresToken && !widget.token) {
        widget.token = await this.fetchToken(widget.widgetId);
      }

      // Set global config BEFORE loading script
      this.setWidgetConfig(widget);

      // Load script (only once per URL)
      await this.loadScriptTag(widget.scriptUrl, widget.widgetId);

      widget.state = 'script-loaded';
      console.log(`[WidgetRegistry] Script loaded for ${key}`);

      // Wait a frame for widget to initialize
      requestAnimationFrame(() => {
        widget.state = 'initialized';
        console.log(`[WidgetRegistry] Widget ${key} initialized`);
      });

    } catch (error) {
      console.error(`[WidgetRegistry] Failed to load ${key}:`, error);
      widget.error = String(error);
      widget.retryCount++;

      if (widget.retryCount < this.MAX_RETRIES) {
        console.log(`[WidgetRegistry] Retrying ${key} (${widget.retryCount}/${this.MAX_RETRIES})`);
        widget.state = 'pending';
        setTimeout(() => this.loadScript(key, widget), 1000 * widget.retryCount);
      } else {
        widget.state = 'failed';
        console.error(`[WidgetRegistry] Widget ${key} failed after ${this.MAX_RETRIES} retries`);
      }
    }
  }

  /**
   * Load script tag (with deduplication)
   */
  private loadScriptTag(url: string, widgetId: string): Promise<void> {
    return new Promise((resolve, reject) => {
      // Check if already loaded
      if (this.loadedScripts.has(url)) {
        console.log(`[WidgetRegistry] Script already loaded: ${url}`);
        resolve();
        return;
      }

      // Check if script tag already exists
      const existing = document.querySelector(`script[data-widget="${widgetId}"]`);
      if (existing) {
        console.log(`[WidgetRegistry] Script tag already exists for ${widgetId}`);
        this.loadedScripts.add(url);
        resolve();
        return;
      }

      const script = document.createElement('script');
      script.src = url;
      script.setAttribute('data-widget', widgetId);
      
      script.onload = () => {
        this.loadedScripts.add(url);
        resolve();
      };
      
      script.onerror = (error) => {
        reject(new Error(`Failed to load script: ${url}`));
      };

      document.head.appendChild(script);
    });
  }

  /**
   * Fetch widget token from server
   */
  private async fetchToken(widgetId: string): Promise<string> {
    const overlayPublicId = (window as any).__OVERLAY_PUBLIC_ID__ || '';
    
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);
    
    try {
      const response = await fetch(
        `/dashboard/api/widget-token/public?widgetId=${encodeURIComponent(widgetId)}&overlayPublicId=${encodeURIComponent(overlayPublicId)}`,
        { signal: controller.signal }
      );
      
      clearTimeout(timeout);
      
      if (!response.ok) {
        throw new Error(`Token fetch failed: ${response.status}`);
      }
      
      const data = await response.json();
      return data.token || '';
      
    } catch (error) {
      clearTimeout(timeout);
      console.warn(`[WidgetRegistry] Failed to fetch token for ${widgetId}:`, error);
      return '';
    }
  }

  /**
   * Set widget global config
   */
  private setWidgetConfig(widget: WidgetRegistration): void {
    const configKey = `__WIDGET_CONFIG_${widget.widgetId.replace(/-/g, '_').toUpperCase()}__`;
    
    const config = {
      ...widget.config,
      ...(widget.token && { token: widget.token }),
    };
    
    (window as any)[configKey] = config;
    
    // Also set legacy token global if present
    if (widget.token) {
      (window as any).__WIDGET_TOKEN__ = widget.token;
    }
    
    console.log(`[WidgetRegistry] Set config for ${widget.widgetId}`, Object.keys(config));
  }

  /**
   * Get registry status (for debugging)
   */
  getStatus(): Record<string, any> {
    const status: Record<string, any> = {};
    
    for (const [key, widget] of this.widgets.entries()) {
      status[key] = {
        state: widget.state,
        retryCount: widget.retryCount,
        error: widget.error,
      };
    }
    
    return status;
  }

  /**
   * Reset registry (for testing)
   */
  reset(): void {
    console.log('[WidgetRegistry] Resetting');
    
    if (this.checkInterval !== null) {
      window.clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
    
    if (this.observer) {
      this.observer.disconnect();
      this.observer = null;
    }
    
    this.widgets.clear();
    this.loadedScripts.clear();
  }
}

// Global singleton instance
const widgetRegistry = new WidgetRegistry();

// Expose for debugging
if (typeof window !== 'undefined') {
  (window as any).__WIDGET_REGISTRY__ = widgetRegistry;
}

export { widgetRegistry, type WidgetRegistration, type WidgetState };

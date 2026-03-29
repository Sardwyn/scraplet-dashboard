// src/shared/widgetRegistry.ts
// Central registry for all widget definitions.
// Importable by both overlay-editor and overlay-runtime bundles.
// No circular dependencies — imports only from overlayTypes.ts.

import type { WidgetManifest, OverlayComponentDef } from './overlayTypes.js';

export interface WidgetDef extends Omit<OverlayComponentDef, 'elements' | 'metadata'> {
  /** Widget-specific manifest — data pipeline, SSE, beacon, config schema */
  widgetManifest: WidgetManifest;
  /** Optional: base visual elements for visible widgets */
  elements?: OverlayComponentDef['elements'];
  /** Optional: widget-level metadata */
  metadata?: OverlayComponentDef['metadata'];
}

const WIDGET_REGISTRY = new Map<string, WidgetDef>();

/**
 * Register a widget definition.
 * Throws if a widget with the same widgetId is already registered.
 */
export function registerWidget(def: WidgetDef): void {
  const id = def.widgetManifest.widgetId;
  if (WIDGET_REGISTRY.has(id)) {
    throw new Error(`Widget already registered: ${id}`);
  }
  WIDGET_REGISTRY.set(id, def);
}

/**
 * Get a widget definition by widgetId.
 * Returns undefined for unknown ids.
 */
export function getWidgetDef(id: string): WidgetDef | undefined {
  return WIDGET_REGISTRY.get(id);
}

/**
 * Get all registered widget definitions.
 */
export function getAllWidgets(): WidgetDef[] {
  return Array.from(WIDGET_REGISTRY.values());
}

/**
 * Get all widgets in a given category.
 */
export function getWidgetsByCategory(category: WidgetManifest['category']): WidgetDef[] {
  return getAllWidgets().filter(w => w.widgetManifest.category === category);
}

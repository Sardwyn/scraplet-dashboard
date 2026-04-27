import type React from "react";
import type { BaseWidgetState } from "../../overlay-runtime/types/unifiedOverlayState";

export interface WidgetRendererProps<S extends BaseWidgetState = BaseWidgetState> {
  state: S;
  config: { instanceId: string };
  width: number;
  height: number;
}

export type WidgetRenderer<S extends BaseWidgetState = BaseWidgetState> =
  (props: WidgetRendererProps<S>) => React.ReactElement | null;

/**
 * Widget renderer registry.
 * Maps widgetId → React renderer function.
 */
export const widgetRenderers: Map<string, WidgetRenderer<any>> = new Map();

export function registerWidgetRenderer<S extends BaseWidgetState>(
  widgetId: string,
  renderer: WidgetRenderer<S>
): void {
  widgetRenderers.set(widgetId, renderer as WidgetRenderer<any>);
}

export function getWidgetRenderer(widgetId: string): WidgetRenderer<any> | undefined {
  return widgetRenderers.get(widgetId);
}

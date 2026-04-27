/**
 * AlertBoxWidget.tsx
 * Container provider for the Alert Box widget.
 * The alert-box.js script handles all rendering (WebGL chroma-key, animations, sound).
 * This component just provides the correctly-sized container div.
 */

import React from 'react';
import type { WidgetRendererProps } from '../../shared/overlayRenderer/widgetContract';

export function AlertBoxWidget({ width, height }: WidgetRendererProps) {
  return (
    <div
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        overflow: 'hidden',
      }}
    />
  );
}

/**
 * RandomNumberWidget.tsx
 * Container provider for the Random Number widget.
 * The random-number.js script handles all canvas/animation rendering.
 * This component provides the container div.
 */

import React from 'react';
import type { WidgetRendererProps } from '../../shared/overlayRenderer/widgetContract';

export function RandomNumberWidget({ state }: WidgetRendererProps) {
  const bgColor = (state as any)?.bgColor ?? 'transparent';
  return (
    <div
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        background: bgColor,
        overflow: 'hidden',
      }}
    />
  );
}

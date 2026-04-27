/**
 * SoundVisualizerWidget.tsx
 * Container provider for the Sound Visualizer widget.
 * The sound-visualizer.js script handles all canvas/Web Audio rendering.
 * This component provides the container div.
 */

import React from 'react';
import type { WidgetRendererProps } from '../../shared/overlayRenderer/widgetContract';

export function SoundVisualizerWidget({ state }: WidgetRendererProps) {
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

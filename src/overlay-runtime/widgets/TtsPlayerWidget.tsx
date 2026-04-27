/**
 * TtsPlayerWidget.tsx
 * Container provider for the TTS Player widget.
 * The tts-player.js script handles audio playback and optional notification UI.
 * This component provides the container div.
 */

import React from 'react';
import type { WidgetRendererProps } from '../../shared/overlayRenderer/widgetContract';

export function TtsPlayerWidget({ state }: WidgetRendererProps) {
  return (
    <div
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        overflow: 'hidden',
        pointerEvents: 'none',
      }}
    />
  );
}

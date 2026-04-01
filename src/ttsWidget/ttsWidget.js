// src/ttsWidget/ttsWidget.js
// Registers the TTS Player widget in the WIDGET_REGISTRY.
// Import this from the overlay editor and runtime entry points.

import { registerWidget } from '../shared/widgetRegistry.js';

export const TTS_PLAYER_WIDGET_ID = 'tts-player';

registerWidget({
  id: 'tts-player',
  name: 'TTS Player',
  schemaVersion: 1,
  propsSchema: {
    showNotification:  { type: 'boolean', label: 'Show notification bar',           default: true },
    notificationPos:   { type: 'text',    label: 'Notification position',            default: 'bottom-left' },
    notificationStyle: { type: 'text',    label: 'Notification style',               default: 'dark' },
    acceptFree:        { type: 'boolean', label: 'Play free TTS (!tts command)',     default: true },
    acceptPaid:        { type: 'boolean', label: 'Play paid TTS (profile page)',     default: true },
    volume:            { type: 'text',    label: 'Volume (0-100)',                   default: '100' },
    scrapbotNotify:    { type: 'boolean', label: 'Scrapbot notifies sender in chat', default: true },
  },
  metadata: {},
  widgetManifest: {
    widgetId:    'tts-player',
    category:    'utility',
    version:     '1.0.0',
    displayName: 'TTS Player',
    description: 'Plays TTS messages from the queue. Drag onto your overlay canvas — it runs as an invisible OBS browser source that plays audio when viewers send TTS messages.',
    icon:        'microphone',
    dataContract: {
      sseEventType: 'tts.ready',
      fields: [
        { key: 'audioUrl',       label: 'Audio URL',  type: 'string', fallback: null },
        { key: 'senderUsername', label: 'Sender',     type: 'string', fallback: null },
        { key: 'messageText',    label: 'Message',    type: 'string', fallback: null },
        { key: 'voiceName',      label: 'Voice',      type: 'string', fallback: null },
      ],
    },
    beaconEndpoint: null,
    invisible:      true,
    runtimeScript:  '/widgets/tts-player.js',
    configSchema: [
      { key: 'showNotification',  type: 'boolean', label: 'Show notification bar',           default: true },
      { key: 'notificationPos',   type: 'select',  label: 'Notification position',
        options: ['bottom-left','bottom-right','top-left','top-right'],                        default: 'bottom-left' },
      { key: 'notificationStyle', type: 'select',  label: 'Notification style',
        options: ['dark','light','neon'],                                                       default: 'dark' },
      { key: 'acceptFree',        type: 'boolean', label: 'Play free TTS',                   default: true },
      { key: 'acceptPaid',        type: 'boolean', label: 'Play paid TTS',                   default: true },
      { key: 'volume',            type: 'number',  label: 'Volume (0-100)',                   default: 100 },
      { key: 'scrapbotNotify',    type: 'boolean', label: 'Scrapbot notifies sender in chat', default: true },
    ],
    defaultProps:    { showNotification: true, notificationPos: 'bottom-left', notificationStyle: 'dark', acceptFree: true, acceptPaid: true, volume: 100, scrapbotNotify: true },
    previewImageUrl: null,
  },
});

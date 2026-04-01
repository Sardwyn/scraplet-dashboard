// src/widgets/allWidgets.ts
// Registers all overlay widgets in the WIDGET_REGISTRY.
// Import this from the overlay editor and runtime entry points.

import { registerWidget } from '../shared/widgetRegistry.js';

registerWidget({
  id: 'chat-overlay',
  name: 'Chat Overlay',
  schemaVersion: 1,
  propsSchema: {},
  metadata: {},
  widgetManifest: {
    widgetId:    'chat-overlay',
    category:    'display',
    version:     '1.0.0',
    displayName: 'Chat Overlay',
    description: 'Displays live Kick chat messages on your overlay. Fully customisable colours, fonts, and animation.',
    icon:        'monitor',
    dataContract: {
      sseEventType: 'chat_message',
      fields: [
        { key: 'username', label: 'Username', type: 'string', fallback: '' },
        { key: 'message',  label: 'Message',  type: 'string', fallback: '' },
        { key: 'type',     label: 'Event Type', type: 'string', fallback: '' },
      ],
    },
    beaconEndpoint: null,
    invisible:      false,
    runtimeScript:  '/widgets/chat-overlay.js',
    configSchema: [
      { key: 'maxMessages', type: 'number', label: 'Max messages on screen', default: 20 },
      { key: 'fontSize', type: 'text', label: 'Font size', default: '16px' },
      { key: 'fontFamily', type: 'text', label: 'Font family', default: 'system-ui, sans-serif' },
      { key: 'messageColor', type: 'color', label: 'Message colour', default: '#ffffff' },
      { key: 'nameColor', type: 'color', label: 'Name colour', default: '#a5b4fc' },
      { key: 'backgroundColor', type: 'color', label: 'Background', default: 'transparent' },
      { key: 'animateIn', type: 'boolean', label: 'Animate messages in', default: true }
    ],
    defaultProps: { token: '' },
    previewImageUrl: null,
  },
});

registerWidget({
  id: 'alert-box-widget',
  name: 'Alert Box',
  schemaVersion: 1,
  propsSchema: {},
  metadata: {},
  widgetManifest: {
    widgetId:    'alert-box-widget',
    category:    'display',
    version:     '1.0.0',
    displayName: 'Alert Box',
    description: 'Shows animated alerts for follows, subs, donations, and raids.',
    icon:        'monitor',
    dataContract: {
      sseEventType: 'follow',
      fields: [
        { key: 'username', label: 'Username', type: 'string', fallback: '' },
        { key: 'message',  label: 'Message',  type: 'string', fallback: '' },
        { key: 'type',     label: 'Event Type', type: 'string', fallback: '' },
      ],
    },
    beaconEndpoint: null,
    invisible:      false,
    runtimeScript:  '/widgets/alert-box-widget.js',
    configSchema: [
      { key: 'duration', type: 'number', label: 'Alert duration (ms)', default: 5000 },
      { key: 'position', type: 'select', label: 'Position', default: 'top-center', options: ['top-center', 'top-left', 'top-right', 'bottom-center', 'bottom-left', 'bottom-right'] },
      { key: 'backgroundColor', type: 'color', label: 'Background colour', default: 'rgba(99,102,241,0.9)' },
      { key: 'textColor', type: 'color', label: 'Text colour', default: '#ffffff' },
      { key: 'fontSize', type: 'text', label: 'Font size', default: '18px' }
    ],
    defaultProps: { token: '' },
    previewImageUrl: null,
  },
});

registerWidget({
  id: 'sub-counter',
  name: 'Sub Counter',
  schemaVersion: 1,
  propsSchema: {},
  metadata: {},
  widgetManifest: {
    widgetId:    'sub-counter',
    category:    'display',
    version:     '1.0.0',
    displayName: 'Sub Counter',
    description: 'Shows subscriber count with an optional goal progress bar.',
    icon:        'monitor',
    dataContract: {
      sseEventType: null,
      fields: [],
    },
    beaconEndpoint: null,
    invisible:      false,
    runtimeScript:  '/widgets/sub-counter.js',
    configSchema: [
      { key: 'label', type: 'text', label: 'Label', default: 'Subscribers' },
      { key: 'goal', type: 'number', label: 'Goal (0 = no goal)', default: 0 },
      { key: 'showNumbers', type: 'boolean', label: 'Show numbers', default: true }
    ],
    defaultProps: { token: '' },
    previewImageUrl: null,
  },
});

registerWidget({
  id: 'event-console-widget',
  name: 'Event Console',
  schemaVersion: 1,
  propsSchema: {},
  metadata: {},
  widgetManifest: {
    widgetId:    'event-console-widget',
    category:    'display',
    version:     '1.0.0',
    displayName: 'Event Console',
    description: 'Shows a scrolling log of stream events — follows, subs, donations, chat.',
    icon:        'monitor',
    dataContract: {
      sseEventType: 'follow',
      fields: [
        { key: 'username', label: 'Username', type: 'string', fallback: '' },
        { key: 'message',  label: 'Message',  type: 'string', fallback: '' },
        { key: 'type',     label: 'Event Type', type: 'string', fallback: '' },
      ],
    },
    beaconEndpoint: null,
    invisible:      false,
    runtimeScript:  '/widgets/event-console-widget.js',
    configSchema: [
      { key: 'maxEvents', type: 'number', label: 'Max events shown', default: 15 },
      { key: 'position', type: 'select', label: 'Position', default: 'bottom-left', options: ['bottom-left', 'bottom-right', 'top-left', 'top-right'] },
      { key: 'fontSize', type: 'text', label: 'Font size', default: '13px' },
      { key: 'backgroundColor', type: 'color', label: 'Background', default: 'rgba(0,0,0,0.7)' }
    ],
    defaultProps: { token: '' },
    previewImageUrl: null,
  },
});

registerWidget({
  id: 'raffle',
  name: 'Raffle',
  schemaVersion: 1,
  propsSchema: {},
  metadata: {},
  widgetManifest: {
    widgetId:    'raffle',
    category:    'interactive',
    version:     '1.0.0',
    displayName: 'Raffle',
    description: 'Live raffle widget — viewers enter via chat command, winner drawn on screen.',
    icon:        'monitor',
    dataContract: {
      sseEventType: 'raffle_update',
      fields: [
        { key: 'username', label: 'Username', type: 'string', fallback: '' },
        { key: 'message',  label: 'Message',  type: 'string', fallback: '' },
        { key: 'type',     label: 'Event Type', type: 'string', fallback: '' },
      ],
    },
    beaconEndpoint: null,
    invisible:      false,
    runtimeScript:  '/widgets/raffle.js',
    configSchema: [
      { key: 'command', type: 'text', label: 'Entry command', default: '!enter' },
      { key: 'backgroundColor', type: 'color', label: 'Background', default: 'rgba(0,0,0,0.8)' }
    ],
    defaultProps: { token: '' },
    previewImageUrl: null,
  },
});


// src/widgets/allWidgets.ts
// Registers all overlay widgets in the WIDGET_REGISTRY.
// Import this from the overlay editor and runtime entry points.

import { registerWidget } from '../shared/widgetRegistry.js';

registerWidget({
  id: 'chat-overlay',
  name: 'Chat Overlay',
  schemaVersion: 2,
  propsSchema: {},
  metadata: {},
  widgetManifest: {
    widgetId:    'chat-overlay',
    category:    'display',
    version:     '2.0.0',
    displayName: 'Chat Overlay',
    description: 'Displays live chat messages from Kick, YouTube, and Twitch. Fully customisable with bubble styles, avatars, and platform icons.',
    icon:        'monitor',
    dataContract: {
      sseEventType: 'chat_message',
      fields: [
        { key: 'username', label: 'Username',     type: 'string', fallback: '' },
        { key: 'message',  label: 'Message',      type: 'string', fallback: '' },
        { key: 'platform', label: 'Platform',     type: 'string', fallback: 'kick' },
        { key: 'avatar',   label: 'Avatar URL',   type: 'string', fallback: '' },
        { key: 'color',    label: 'Name Colour',  type: 'string', fallback: '' },
      ],
    },
    beaconEndpoint: null,
    invisible:      false,
    runtimeScript:  '/widgets/chat-overlay.js',
    configSchema: [
      // Typography
      { key: 'fontFamily', type: 'select', label: 'Font', default: 'Inter', options: ['Inter','Roboto','Open Sans','Oswald','Bebas Neue','Montserrat','Rajdhani','Exo 2','Barlow','Nunito','Poppins','Lato','Source Code Pro','Space Grotesk','DM Sans'] },
      { key: 'fontSizePx',      type: 'number',  label: 'Font size (px)',        default: 16 },
      { key: 'lineHeight',      type: 'number',  label: 'Line height',           default: 1.4 },
      { key: 'messageGapPx',    type: 'number',  label: 'Gap between messages (px)', default: 6 },
      // Colours
      { key: 'nameColor',       type: 'color',   label: 'Name colour',           default: '#a5b4fc' },
      { key: 'messageColor',    type: 'color',   label: 'Message colour',        default: '#ffffff' },
      // Display options
      { key: 'showAvatars',     type: 'boolean', label: 'Show avatars',          default: false },
      { key: 'showPlatformIcon',type: 'boolean', label: 'Show platform icon',    default: true },
      { key: 'shadow',          type: 'boolean', label: 'Text shadow',           default: true },
      { key: 'animateIn',       type: 'boolean', label: 'Animate messages in',   default: true },
      // Bubble style
      { key: 'bubbleEnabled',   type: 'boolean', label: 'Message bubbles',       default: false },
      { key: 'bubbleRadiusPx',  type: 'number',  label: 'Bubble corner radius',  default: 8 },
      { key: 'bubbleBg',        type: 'color',   label: 'Bubble background',     default: 'rgba(0,0,0,0.4)' },
      { key: 'bubbleBorder',    type: 'color',   label: 'Bubble border',         default: 'transparent' },
      // Limits
      { key: 'limitsMaxMessages', type: 'number', label: 'Max messages shown',   default: 20 },
      { key: 'limitsFadeMs',    type: 'number',  label: 'Fade out after (ms, 0=never)', default: 0 },
      // Limits (extended)
      { key: 'bufferMax',       type: 'number',  label: 'Memory buffer (max)',   default: 120 },
      // Visual effects
      { key: 'glowEnabled',     type: 'boolean', label: 'Name glow effect',      default: false },
      { key: 'glowColor',       type: 'color',   label: 'Glow colour',           default: '#a5b4fc' },
      { key: 'glowBlur',        type: 'number',  label: 'Glow blur (px)',        default: 8 },
      { key: 'depthEnabled',    type: 'boolean', label: 'Depth/3D effect',       default: false },
      { key: 'depthOffset',     type: 'number',  label: 'Depth offset (px)',     default: 2 },
      { key: 'depthColor',      type: 'color',   label: 'Depth colour',          default: 'rgba(0,0,0,0.5)' },
      // Platform filters
      { key: 'enableKick',      type: 'boolean', label: 'Show Kick chat',        default: true },
      { key: 'enableYoutube',   type: 'boolean', label: 'Show YouTube chat',     default: true },
      { key: 'enableTwitch',    type: 'boolean', label: 'Show Twitch chat',      default: true },
    ],
    defaultProps: {
      token: '',
      fontFamily: 'Inter, system-ui, sans-serif',
      fontSizePx: 16, lineHeight: 1.4, messageGapPx: 6,
      nameColor: '#a5b4fc', messageColor: '#ffffff',
      showAvatars: false, showPlatformIcon: true, shadow: true, animateIn: true,
      bubbleEnabled: false, bubbleRadiusPx: 8, bubbleBg: 'rgba(0,0,0,0.4)', bubbleBorder: 'transparent',
      limitsMaxMessages: 20, limitsFadeMs: 0,
      enableKick: true, enableYoutube: true, enableTwitch: true,
    },
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


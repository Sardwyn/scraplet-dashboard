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
      { key: 'nameColorMode', type: 'select', label: 'Name colour mode', default: 'custom', options: ['custom', 'platform', 'user'] },
      { key: 'nameColor', type: 'color', label: 'Name colour (custom)', default: '#a5b4fc', showWhen: { key: 'nameColorMode', value: 'custom' } },
      { key: 'messageColor',    type: 'color',   label: 'Message colour',        default: '#ffffff' },
      // Display options
      { key: 'showAvatars',     type: 'boolean', label: 'Show avatars',          default: false },
      { key: 'showBadges',      type: 'boolean', label: 'Show badges',           default: true },
      { key: 'gradientNames',   type: 'boolean', label: 'Gradient name colours', default: false },
      { key: 'showPlatformIcon',type: 'boolean', label: 'Show platform icon',    default: true },
      { key: 'shadow',          type: 'boolean', label: 'Text shadow',           default: true },
      { key: 'animateIn',       type: 'boolean', label: 'Animate messages in',   default: true },
      { key: 'stripEmotes',     type: 'boolean', label: 'Strip emote codes',      default: false },
      // Bubble style
      { key: 'bubbleEnabled',   type: 'boolean', label: 'Message bubbles',       default: false },
      { key: 'bubbleRadiusPx',  type: 'number',  label: 'Bubble corner radius',  default: 8 },
      { key: 'bubbleBg',        type: 'color',   label: 'Bubble background',     default: 'rgba(0,0,0,0.4)' },
      { key: 'bubbleBorder',    type: 'color',   label: 'Bubble border',         default: 'transparent' },
      // Limits
      { key: 'limitsMaxMessages', type: 'number', label: 'Max messages shown',   default: 20 },
      { key: 'limitsFadeMs',    type: 'number',  label: 'Fade out after (ms, 0=never)', default: 0 },
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
      // Global
      { key: 'fontFamily',    type: 'select', label: 'Font', default: 'Inter', options: ['Inter','Roboto','Open Sans','Oswald','Bebas Neue','Montserrat','Rajdhani','Exo 2','Barlow','Nunito','Poppins','Lato','Space Grotesk','DM Sans'] },
      { key: 'fontSizePx',    type: 'number', label: 'Font size (px)', default: 20 },
      { key: 'textColor',     type: 'color',  label: 'Text colour',    default: '#ffffff' },
      { key: 'masterVolume',  type: 'number', label: 'Master volume',  default: 0.8 },
      // Per-event config — rendered by alertConfig inspector
      { key: 'alertTypes', type: 'alertConfig', label: 'Alert Events', default: {} },
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
      // Display
      { key: 'displayMode',   type: 'select',  label: 'Display mode',      default: 'bar',   options: ['bar','ring','counter'] },
      { key: 'label',         type: 'text',    label: 'Label',             default: 'Sub Goal' },
      { key: 'fontFamily',    type: 'select',  label: 'Font',              default: 'Inter', options: ['Inter','Roboto','Open Sans','Oswald','Bebas Neue','Montserrat','Rajdhani','Exo 2','Barlow','Nunito','Poppins','Lato','Space Grotesk','DM Sans'] },
      { key: 'fontSizePx',    type: 'number',  label: 'Font size (px)',    default: 18 },
      { key: 'textColor',     type: 'color',   label: 'Text colour',       default: '#ffffff' },
      { key: 'fillColor',     type: 'color',   label: 'Bar fill colour',   default: '#6366f1' },
      { key: 'fillColor2',    type: 'color',   label: 'Bar fill gradient', default: '' },
      { key: 'trackColor',    type: 'color',   label: 'Bar track colour',  default: 'rgba(255,255,255,0.1)' },
      { key: 'bgColor',       type: 'color',   label: 'Background',        default: 'transparent' },
      // Goal
      { key: 'goal',          type: 'number',  label: 'Goal',              default: 100 },
      { key: 'startAt',       type: 'number',  label: 'Starting count',    default: 0 },
      { key: 'overfill',      type: 'boolean', label: 'Overfill bar',      default: true },
      { key: 'trackPoints',   type: 'boolean', label: 'Track sub points (tier-weighted)', default: false },
      { key: 'endDate',       type: 'text',    label: 'End date (ISO)',    default: '' },
      // Numbers
      { key: 'showNumbers',   type: 'boolean', label: 'Show numbers',      default: true },
      { key: 'showPercent',   type: 'boolean', label: 'Show percentage',   default: false },
      { key: 'showBreakdown', type: 'boolean', label: 'Show platform breakdown', default: false },
      // Milestone
      { key: 'milestoneAnim', type: 'select',  label: 'Milestone animation', default: 'pulse', options: ['pulse','shake','none'] },
      // Bar style
      { key: 'barHeight',     type: 'number',  label: 'Bar height (px)',   default: 12, showWhen: { key: 'displayMode', value: 'bar' } },
      { key: 'barRadius',     type: 'number',  label: 'Bar corner radius', default: 999, showWhen: { key: 'displayMode', value: 'bar' } },
      { key: 'barGlow',       type: 'boolean', label: 'Bar glow effect',   default: false, showWhen: { key: 'displayMode', value: 'bar' } },
      // Ring style
      { key: 'ringSize',      type: 'number',  label: 'Ring size (px)',    default: 120, showWhen: { key: 'displayMode', value: 'ring' } },
      { key: 'ringStroke',    type: 'number',  label: 'Ring stroke width', default: 10,  showWhen: { key: 'displayMode', value: 'ring' } },
      { key: 'ringGlow',      type: 'boolean', label: 'Ring glow effect',  default: false, showWhen: { key: 'displayMode', value: 'ring' } },
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
      { key: 'newestTop',     type: 'boolean', label: 'Newest at top',        default: true },
      { key: 'maxEvents',     type: 'number',  label: 'Max events shown',     default: 12 },
      { key: 'expireSec',     type: 'number',  label: 'Auto-expire after (s, 0=never)', default: 0 },
      { key: 'entryAnim',     type: 'select',  label: 'Entry animation',      default: 'slide-left', options: ['slide-left','slide-right','fade','scale'] },
      { key: 'fontFamily',    type: 'select',  label: 'Font',                 default: 'Inter', options: ['Inter','Roboto','Open Sans','Oswald','Bebas Neue','Montserrat','Rajdhani','Exo 2','Barlow','Nunito','Poppins','Lato','Space Grotesk','DM Sans'] },
      { key: 'fontSizePx',    type: 'number',  label: 'Font size (px)',       default: 14 },
      { key: 'textColor',     type: 'color',   label: 'Text colour',          default: '#e2e8f0' },
      { key: 'rowBg',         type: 'color',   label: 'Row background',       default: 'rgba(0,0,0,0.4)' },
      { key: 'rowBgAlt',      type: 'color',   label: 'Alternating row bg',   default: '' },
      { key: 'containerBg',   type: 'color',   label: 'Container background', default: 'transparent' },
      { key: 'borderRadius',  type: 'number',  label: 'Border radius (px)',   default: 8 },
      { key: 'rowPadding',    type: 'number',  label: 'Row padding (px)',     default: 6 },
      { key: 'accentWidth',   type: 'number',  label: 'Accent bar width (px)',default: 3 },
      { key: 'showTimestamp', type: 'boolean', label: 'Show timestamp',       default: false },
      { key: 'showAvatar',    type: 'boolean', label: 'Show avatars',         default: false },
      { key: 'showPlatform',  type: 'boolean', label: 'Show platform icon',   default: true },
      { key: 'eventTypes',    type: 'alertConfig', label: 'Event Types',      default: {} },
    ] },
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
      // Visual
      { key: 'fontFamily',   type: 'select',  label: 'Font',              default: 'Inter', options: ['Inter','Roboto','Open Sans','Oswald','Bebas Neue','Montserrat','Rajdhani','Exo 2','Barlow','Nunito','Poppins','Lato','Space Grotesk','DM Sans'] },
      { key: 'fontSizePx',   type: 'number',  label: 'Font size (px)',    default: 18 },
      { key: 'textColor',    type: 'color',   label: 'Text colour',       default: '#ffffff' },
      { key: 'accentColor',  type: 'color',   label: 'Accent colour',     default: '#6366f1' },
      { key: 'winnerColor',  type: 'color',   label: 'Winner colour',     default: '#fbbf24' },
      { key: 'bgColor',      type: 'color',   label: 'Background',        default: 'rgba(0,0,0,0.85)' },
      { key: 'borderRadius', type: 'number',  label: 'Border radius (px)',default: 16 },
      // Animation preference (empty = use server value)
      { key: 'prefAnim',     type: 'select',  label: 'Animation override',default: '', options: ['','wheel','slot','scramble'] },
      // Toggles
      { key: 'showStatus',   type: 'boolean', label: 'Show status dot',   default: true },
      { key: 'showCount',    type: 'boolean', label: 'Show entry count',  default: true },
      { key: 'showJoinCmd',  type: 'boolean', label: 'Show join command', default: true },
    ],
    defaultProps: { token: '' },
    previewImageUrl: null,
  },
});

// cache bust

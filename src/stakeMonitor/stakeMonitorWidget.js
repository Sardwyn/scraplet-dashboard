// src/stakeMonitor/stakeMonitorWidget.js
// Registers the Stake Monitor widget in the WIDGET_REGISTRY.
// Import this from the overlay editor and runtime entry points.

import { registerWidget } from '../shared/widgetRegistry.js';

export const STAKE_MONITOR_WIDGET_ID = 'stake-monitor';

registerWidget({
  id: 'stake-monitor',
  name: 'Stake Monitor',
  schemaVersion: 1,
  propsSchema: {
    showBalance:      { type: 'boolean', label: 'Show Balance',         default: true },
    showGame:         { type: 'boolean', label: 'Show Game Name',        default: true },
    bigWinThreshold:  { type: 'number',  label: 'Big Win Threshold ($)', default: 100 },
    theme:            { type: 'text',    label: 'Theme (dark/light/neon)', default: 'dark' },
  },
  metadata: {},
  widgetManifest: {
    widgetId:    'stake-monitor',
    category:    'data',
    version:     '1.0.0',
    displayName: 'Stake Monitor',
    description: 'Live Stake.com session data — balance, game, wins. Runs invisible in OBS.',
    icon:        'casino-chip',
    dataContract: {
      sseEventType: 'stake.update',
      fields: [
        { key: 'gameName',        label: 'Game Name',       type: 'string',  fallback: '—' },
        { key: 'currentBalance',  label: 'Balance',         type: 'number',  fallback: 0 },
        { key: 'lastWin',         label: 'Last Win',        type: 'number',  fallback: 0 },
        { key: 'betSize',         label: 'Bet Size',        type: 'number',  fallback: 0 },
        { key: 'multiplier',      label: 'Multiplier',      type: 'number',  fallback: 0 },
        { key: 'sessionPnl',      label: 'Session P&L',     type: 'number',  fallback: 0 },
      ],
    },
    beaconEndpoint: '/api/stake-monitor/beacon',
    sseEventType:   'stake.update',
    invisible:      true,
    runtimeScript:  '/widgets/stake-monitor/beaconLoop.js',
    configSchema: [
      { key: 'showBalance',     type: 'boolean', label: 'Show Balance',          default: true },
      { key: 'showGame',        type: 'boolean', label: 'Show Game Name',         default: true },
      { key: 'bigWinThreshold', type: 'number',  label: 'Big Win Threshold ($)',  default: 100 },
      { key: 'theme',           type: 'select',  label: 'Theme',
        options: ['dark', 'light', 'neon'],                                        default: 'dark' },
    ],
    defaultProps: { showBalance: true, showGame: true, bigWinThreshold: 100, theme: 'dark' },
    previewImageUrl: null,
  },
});

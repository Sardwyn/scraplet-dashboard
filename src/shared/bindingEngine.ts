// src/shared/bindingEngine.ts
import { SourceDef, DynamicBinding, BindingFormat, OverlayVariable, OverlayConfig } from "./overlayTypes";

/**
 * Formal Single Source of Truth for all dynamic data sources.
 * Maps friendly creator labels to internal canonical paths.
 */
export const SourceCatalog: SourceDef[] = [
    {
        id: "latest_chat",
        label: "Latest Chat",
        fields: [
            { id: "name", label: "Name", type: "text", path: "event.author.display" },
            { id: "text", label: "Message", type: "text", path: "event.message.text" },
            { id: "avatar", label: "Avatar", type: "image", path: "event.author.avatar_url" },
        ]
    },
    {
        id: "latest_alert",
        label: "Latest Alert",
        fields: [
            { id: "user", label: "User", type: "text", path: "event.actor.displayName" },
            { id: "message", label: "Message", type: "text", path: "event.message" },
            { id: "avatar", label: "Avatar", type: "image", path: "event.actor.avatar" },
            { id: "amount", label: "Amount", type: "text", path: "event.amount" },
            { id: "count", label: "Count", type: "number", path: "event.count" },
        ]
    },
    {
        id: "producer_card",
        label: "Producer Card",
        fields: [
            { id: "title", label: "Title", type: "text", path: "event.title" },
            { id: "body", label: "Body", type: "text", path: "event.text" },
            { id: "image", label: "Image", type: "image", path: "event.image" },
        ]
    },
    {
        id: "test_data",
        label: "Test Data",
        fields: [
            { id: "message", label: "Test Message", type: "text", path: "event.message" },
            { id: "random", label: "Random Num", type: "number", path: "event.random" },
        ]
    },

  {
    id: 'tts_player',
    label: 'TTS Player',
    fields: [
      { id: 'senderUsername', label: 'Sender Username', type: 'text', path: 'event.senderUsername' },
      { id: 'messageText', label: 'Message Text', type: 'text', path: 'event.messageText' },
      { id: 'voiceName', label: 'Voice Name', type: 'text', path: 'event.voiceName' },
      { id: 'isPlaying', label: 'Is Playing', type: 'text', path: 'event.isPlaying' },
    ],
  },

  {
    id: 'stake_monitor',
    label: 'Stake Monitor',
    fields: [
      { id: 'gameName', label: 'Game Name', type: 'text', path: 'event.gameName' },
      { id: 'currentBalance', label: 'Balance', type: 'number', path: 'event.currentBalance' },
      { id: 'lastWin', label: 'Last Win', type: 'number', path: 'event.lastWin' },
      { id: 'betSize', label: 'Bet Size', type: 'number', path: 'event.betSize' },
      { id: 'multiplier', label: 'Multiplier', type: 'number', path: 'event.multiplier' },
      { id: 'sessionPnl', label: 'Session P&L', type: 'number', path: 'event.sessionPnl' },
    ],
  },
  {
    id: "countdown",
    label: "Countdown Timer",
    fields: [
      { id: "remainingMs",  label: "Remaining (ms)",  type: "number", path: "event.remainingMs" },
      { id: "remainingSec", label: "Remaining (sec)", type: "number", path: "event.remainingSec" },
      { id: "isFinished",   label: "Is Finished",     type: "text",   path: "event.isFinished" },
    ]
  },
  {
    id: "custom_variables",
    label: "Custom Variables",
    description: "User-defined variables for this overlay",
    fields: [] // populated dynamically at bind time from config.variables
  },
];

/**
 * Resolves a dynamic binding against the current flattened event/state data.
 * Optionally accepts overlay config for custom_variables resolution.
 */
export function resolveBinding(binding: DynamicBinding, data: Record<string, any>, config?: { variables?: OverlayVariable[] }): any {
    // Handle custom_variables source
    if (binding.sourceId === "custom_variables") {
        const variables = config?.variables ?? [];
        const variable = variables.find(v => v.id === binding.fieldId || v.name === binding.fieldId);
        if (!variable) return binding.fallback;
        return applyFormat(variable.value, binding.format);
    }

    const source = SourceCatalog.find(s => s.id === binding.sourceId);
    if (!source) return binding.fallback;

    const field = source.fields.find(
      (f) => f.id === binding.fieldId || (f as { key?: string }).key === binding.fieldId
    );
    if (!field) return binding.fallback;

    // Access the canonical path in the flattened data record.
    const value = data[field.path];

    if (value === undefined || value === null) {
        return binding.fallback;
    }

    // Handle formatting and type safety
    return applyFormat(value, binding.format);
}

/**
 * Helper to partially update a single variable by name.
 * Returns a new array with the updated variable.
 */
export function partialUpdateVariable(
    variables: OverlayVariable[],
    name: string,
    value: string | number | boolean
): OverlayVariable[] {
    return variables.map(v => v.name === name ? { ...v, value } : v);
}

/**
 * Applies structured formatting to a resolved value.
 */
function applyFormat(value: any, format?: BindingFormat): any {
    if (!format) return value;

    let result = value;

    // 1. Basic type handling
    if (format.type === "number" || format.type === "currency") {
        const num = Number(value);
        if (!isNaN(num)) {
            result = format.precision !== undefined ? num.toFixed(format.precision) : num;
        }
    }

    // 2. String transforms
    if (typeof result === "string") {
        if (format.casing === "upper") result = result.toUpperCase();
        if (format.casing === "lower") result = result.toLowerCase();
    }

    // 3. Decorations
    return `${format.prefix || ""}${result}${format.suffix || ""}`;
}

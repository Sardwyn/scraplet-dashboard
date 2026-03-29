// src/shared/bindingEngine.ts
import { SourceDef, DynamicBinding, BindingFormat } from "./overlayTypes";

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
    id: 'stake_monitor',
    label: 'Stake Monitor',
    description: 'Live Stake.com session data from the Stake Monitor widget',
    fields: [
      { key: 'gameName',       label: 'Game Name',    type: 'string',  fallback: '—' },
      { key: 'currentBalance', label: 'Balance',      type: 'number',  fallback: 0 },
      { key: 'lastWin',        label: 'Last Win',     type: 'number',  fallback: 0 },
      { key: 'betSize',        label: 'Bet Size',     type: 'number',  fallback: 0 },
      { key: 'multiplier',     label: 'Multiplier',   type: 'number',  fallback: 0 },
      { key: 'sessionPnl',     label: 'Session P&L',  type: 'number',  fallback: 0 },
    ],
  },
];

/**
 * Resolves a dynamic binding against the current flattened event/state data.
 */
export function resolveBinding(binding: DynamicBinding, data: Record<string, any>): any {
    const source = SourceCatalog.find(s => s.id === binding.sourceId);
    if (!source) return binding.fallback;

    const field = source.fields.find(f => f.id === binding.fieldId);
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

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
    id: "room_intel",
    label: "Room Intelligence",
    fields: [
      { id: "engagement_index", label: "Engagement Index", type: "number", path: "event.engagement_index" },
      { id: "room_state", label: "Room State", type: "text", path: "event.room_state" },
      { id: "messages", label: "Messages", type: "number", path: "event.messages" },
      { id: "mpm", label: "Messages Per Minute", type: "number", path: "event.mpm" },
      { id: "pressure", label: "Pressure", type: "number", path: "event.pressure" },
      { id: "viewers", label: "Viewer Count", type: "number", path: "event.meta.viewers" },
      { id: "followers", label: "Followers Count", type: "number", path: "event.meta.followers" },
      { id: "likes", label: "Likes Count", type: "number", path: "event.meta.likes" },
      { id: "shares", label: "Shares Count", type: "number", path: "event.meta.shares" },
      { id: "r1", label: "Register r1 (Passive)", type: "number", path: "event.r1" },
      { id: "r2", label: "Register r2 (Casual)", type: "number", path: "event.r2" },
      { id: "r3", label: "Register r3 (Engaged)", type: "number", path: "event.r3" },
      { id: "r4", label: "Register r4 (Focused)", type: "number", path: "event.r4" },
      { id: "r5", label: "Register r5 (Hyped)", type: "number", path: "event.r5" }
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

/**
 * Evaluates whether a set of conditions matches the current state / packet payload data.
 */
export function evaluateConditions(conditions: any, data: Record<string, any>): boolean {
    if (!conditions) return true;

    // 1. Min Viewers Check
    if (conditions.minViewers !== undefined) {
        const viewers = Number(data["event.meta.viewers"]) || Number(data["viewers"]) || 0;
        if (viewers < conditions.minViewers) return false;
    }

    // 2. Only If Visible check (handled primarily by the renderer context, but initialized here)
    if (conditions.onlyIfVisible === true) {
        // Can be evaluated dynamically by layout triggers
    }

    return true;
}

/**
 * Parses and replaces placeholders like {actor} or {viewers} or {message.text}
 * with canonical values from the flattened packet data.
 * E.g., "RAID! {actor} brought {viewers} viewers!"
 */
export function substituteTemplateVariables(template: string, data: Record<string, any>): string {
    if (!template) return "";
    return template.replace(/\{([^}]+)\}/g, (match, path) => {
        // Check direct path first, e.g., "event.actor.displayName"
        let val = data[path];
        if (val === undefined || val === null) {
            // Check abbreviated alias names
            const aliases: Record<string, string> = {
                actor: "event.actor.displayName",
                displayName: "event.actor.displayName",
                viewers: "event.meta.viewers",
                amount: "event.amount",
                count: "event.count",
                message: "event.message.text",
                text: "event.message.text",
                avatar: "event.actor.avatar",
                avatar_url: "event.author.avatar_url"
            };
            const resolvedPath = aliases[path] || path;
            val = data[resolvedPath];
        }
        return val !== undefined && val !== null ? String(val) : "";
    });
}

// src/shared/bindingEngine.ts
import type { DynamicBindingV1, BindingFormatV1, SourceDefV1 } from "@scraplet/contracts/bindings";
import { SOURCE_CATALOG_V1 } from "@scraplet/contracts/bindings";

type DynamicBinding = DynamicBindingV1;
type BindingFormat = BindingFormatV1;
type SourceDef = SourceDefV1;

/**
 * Canonical Single Source of Truth for dynamic data source descriptors.
 */
export const SourceCatalog: SourceDef[] = [...SOURCE_CATALOG_V1];

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

// /utils/layout.js
// Helpers for normalising and working with profile layout JSON.
// Backed by users.layout (jsonb) in the database.
//
// Canonical shape:
//
//   {
//     sections: [
//       { type: "avatar",       visible: true, settings: { ... } },
//       { type: "socialLinks",  visible: true, settings: { ... } },
//       { type: "stats",        visible: true, settings: { ... } },
//       { type: "marketability",visible: false,settings: { ... } },
//       { type: "bio",          visible: true, settings: { ... } },
//       { type: "buttons",      visible: true, settings: { ... } },
//       { type: "sponsors",     visible: true, settings: { ... } }
//     ]
//   }
//
// Key rule: if sections[] exists, we **respect its order**. Legacy "order"
// is only used when there is no sections array at all.

const CORE_TYPES = [
  "avatar",
  "socialLinks",
  "stats",
  "marketability",
  "bio",
  "buttons",
  "sponsors",
  "tts",
  "tipJar",
  "contact",
];


/**
 * Normalise a section into { type, visible, settings }.
 */
function normaliseSection(section, type) {
  const t = type || (section && section.type) || null;
  if (!t) return null;

  let visible = true;
  if (section && typeof section.visible === "boolean") {
    visible = section.visible;
  }

  const settings =
    section && section.settings && typeof section.settings === "object"
      ? { ...section.settings }
      : {};

  return { type: t, visible, settings };
}

/**
 * Ensure we have a well-formed layout object using the canonical sections shape.
 * Handles both new and legacy shapes and is tolerant of partial data.
 *
 * IMPORTANT:
 *   - If layout.sections exists and is non-empty, we preserve its order.
 *   - Only when sections is missing/empty do we fall back to legacy ordering.
 */
export function ensureLayout(rawLayout) {
  const layout =
    rawLayout && typeof rawLayout === "object" ? { ...rawLayout } : {};

  const inputSections = Array.isArray(layout.sections)
    ? layout.sections
    : [];

  // ---------------------------------------------------------------------------
  // NEW MODEL: sections[] present -> trust its order
  // ---------------------------------------------------------------------------
  if (inputSections.length) {
    const seen = new Set();
    const sections = [];

    inputSections.forEach((raw) => {
      if (!raw || !raw.type) return;
      if (seen.has(raw.type)) return; // de-dupe by type, keep first occurrence
      seen.add(raw.type);

      const norm = normaliseSection(raw, raw.type);
      if (norm) {
        sections.push(norm);
      }
    });

    // For robustness, append any core types that are completely missing
    CORE_TYPES.forEach((t) => {
      if (seen.has(t)) return;
      const norm = normaliseSection(null, t);
      if (norm) {
        sections.push(norm);
      }
    });

    return {
      ...layout,
      sections,
    };
  }

  // ---------------------------------------------------------------------------
  // LEGACY MODEL: no sections[] -> derive from `order` or CORE_TYPES
  // ---------------------------------------------------------------------------
  const orderSource = Array.isArray(layout.order)
    ? layout.order
    : CORE_TYPES;

  const sections = [];
  const usedTypes = new Set();

  orderSource.forEach((type) => {
    if (!type) return;
    if (usedTypes.has(type)) return;
    usedTypes.add(type);

    const norm = normaliseSection(null, type);
    if (norm) {
      sections.push(norm);
    }
  });

  return {
    ...layout,
    sections,
  };
}

/**
 * Build a simple sectionVisibility map from a layout object.
 * This is primarily used as a compatibility layer for older code and
 * places in the frontend that still expect sectionVisibility.
 */
export function buildVisibilityMap(layout) {
  const visibility = {};
  const sections = Array.isArray(layout?.sections) ? layout.sections : [];

  sections.forEach((section) => {
    if (!section || !section.type) return;
    if (typeof section.visible === "boolean") {
      visibility[section.type] = section.visible;
    }
  });

  return visibility;
}

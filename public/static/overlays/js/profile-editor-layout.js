// /dashboard/profile-assets/js/profile-editor-layout.js
// Responsible for persisting layout.sections to the backend whenever
// section toggles or block ordering changes. Uses the canonical shape:
//   { type, visible, settings }
//
// Backend storage column: users.layout (jsonb)

import { editorState } from "/dashboard/profile-assets/js/profile-editor-core.js";

const toggles = document.querySelectorAll(".pe-section-toggle");

// Core types we always want present in some form
const CORE_TYPES = ["avatar", "socialLinks", "stats", "marketability", "bio", "buttons"];

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

// Normalise one section object
function normaliseSection(section, type) {
  const t = type || (section && section.type) || null;
  if (!t) return null;

  let visible = true;
  if (section && typeof section.visible === "boolean") {
    visible = section.visible;
  } else if (
    editorState.sectionVisibility &&
    Object.prototype.hasOwnProperty.call(editorState.sectionVisibility, t)
  ) {
    visible = editorState.sectionVisibility[t] !== false;
  }

  const settings =
    section && section.settings && typeof section.settings === "object"
      ? { ...section.settings }
      : {};

  return { type: t, visible, settings };
}

// Build the canonical sections array from:
// - existing editorState.layout.sections (for ordering + settings)
// - the current toggle states (for visibility)
function buildSectionsFromState() {
  editorState.layout = editorState.layout || {};

  const existingSections = Array.isArray(editorState.layout.sections)
    ? editorState.layout.sections
    : [];

  const sectionsByType = new Map();

  existingSections.forEach((raw) => {
    if (!raw || !raw.type) return;
    const norm = normaliseSection(raw, raw.type);
    if (!norm) return;
    if (!sectionsByType.has(norm.type)) {
      sectionsByType.set(norm.type, norm);
    }
  });

  // Determine base ordering from existing sections, falling back to CORE_TYPES
  const orderedTypes = [];

  existingSections.forEach((s) => {
    if (!s || !s.type) return;
    if (!orderedTypes.includes(s.type)) {
      orderedTypes.push(s.type);
    }
  });

  CORE_TYPES.forEach((t) => {
    if (!orderedTypes.includes(t)) {
      orderedTypes.push(t);
    }
  });

  const toggleList = Array.from(toggles || []);
  const sections = [];

  orderedTypes.forEach((type) => {
    const base = sectionsByType.get(type) || normaliseSection(null, type);
    if (!base) return;

    let visible = base.visible;

    // Toggle wins if present
    const toggle = toggleList.find((el) => el.dataset.section === type);
    if (toggle) {
      visible = toggle.checked;
    } else if (
      editorState.sectionVisibility &&
      Object.prototype.hasOwnProperty.call(editorState.sectionVisibility, type)
    ) {
      visible = editorState.sectionVisibility[type] !== false;
    }

    sections.push({
      ...base,
      type,
      visible,
    });

    sectionsByType.delete(type);
  });

  // Append any leftover/unknown sections in their existing form
  sectionsByType.forEach((section) => {
    sections.push(section);
  });

  return sections;
}

// Rebuild sectionVisibility from sections array
function rebuildSectionVisibilityFromSections(sections) {
  const visibility = {};

  sections.forEach((section) => {
    if (!section || !section.type) return;
    if (typeof section.visible === "boolean") {
      visibility[section.type] = section.visible;
    }
  });

  // Preserve existing keys that aren't represented by a section at all
  if (editorState.sectionVisibility) {
    Object.keys(editorState.sectionVisibility).forEach((key) => {
      if (!Object.prototype.hasOwnProperty.call(visibility, key)) {
        visibility[key] = editorState.sectionVisibility[key];
      }
    });
  }

  return visibility;
}

// -----------------------------------------------------------------------------
// Persist
// -----------------------------------------------------------------------------

export async function persistLayout() {
  try {
    const sections = buildSectionsFromState();

    editorState.layout = editorState.layout || {};
    editorState.layout.sections = sections;

    // Keep editorState.sectionVisibility in sync with the canonical layout
    editorState.sectionVisibility = rebuildSectionVisibilityFromSections(
      sections
    );

    const res = await fetch("/dashboard/api/profile/layout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        layout: { sections },
      }),
    });

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }

    const data = await res.json();
    if (data && data.layout) {
      editorState.layout = data.layout;
    }
    if (data && data.sectionVisibility) {
      editorState.sectionVisibility = data.sectionVisibility;
    }

    if (window.updatePreview) {
      window.updatePreview();
    }
  } catch (err) {
    console.error("[profile-editor-layout] Error saving layout", err);
  }
}

// Wire up the layout toggles
toggles.forEach((tog) => {
  tog.addEventListener("change", () => {
    persistLayout();
  });
});

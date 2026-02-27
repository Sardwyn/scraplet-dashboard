// /dashboard/profile-assets/js/profile-editor-card-sections-dnd.js
// Adds drag-and-drop for WHOLE SECTIONS on the phone preview
// without breaking existing tile DnD logic.

import { editorState } from "/dashboard/profile-assets/js/profile-editor-core.js";
import { persistLayout } from "/dashboard/profile-assets/js/profile-editor-layout.js";

/**
 * Map a DOM element in .pc-main back to a layout section type.
 */
function sectionTypeFromElement(el) {
  if (!el || !el.classList) return null;

  // Avatar / identity block
  if (el.classList.contains("pc-identity")) return "avatar";
  if (el.classList.contains("pc-header")) return "avatar";

  // Social links row
  if (el.classList.contains("pc-social-row")) return "socialLinks";

  // Stats pill row
  if (el.classList.contains("pc-stats-row")) return "stats";

  // Bio paragraph
  if (el.classList.contains("pc-bio")) return "bio";

  // Custom buttons section
  if (el.classList.contains("pc-buttons")) return "buttons";

  // Sponsors block
  if (el.classList.contains("pc-sponsors")) return "sponsors";

  // Tip Jar block
  if (el.classList.contains("pc-tipjar")) return "tipJar";

  // Contact block
  if (el.classList.contains("pc-contact")) return "contact";

  return null;
}

/**
 * Attach Sortable to the .pc-main section of the phone preview.
 * This lets you drag entire blocks up/down.
 */
function setupSectionDnD() {
  if (typeof window.Sortable !== "function") return;

  const root = document.getElementById("preview-root");
  if (!root) return;

  const main = root.querySelector(".pc-main");
  if (!main) return;

  // Destroy any older instance we created on this node
  if (main._sectionsSortable) {
    try {
      main._sectionsSortable.destroy();
    } catch (e) {
      console.warn(
        "[card-sections-dnd] Failed destroying previous Sortable instance",
        e
      );
    }
    main._sectionsSortable = null;
  }

  // Quick sanity: make sure there is at least one known section
  const children = Array.from(main.children || []);
  const hasKnownSection = children.some((el) => !!sectionTypeFromElement(el));
  if (!hasKnownSection) return;

  const sortable = window.Sortable.create(main, {
    animation: 150,
    // Only allow dragging known section roots, not random inner nodes
    draggable: [
      ".pc-identity",
      ".pc-header",
      ".pc-social-row",
      ".pc-stats-row",
      ".pc-bio",
      ".pc-buttons",
      ".pc-sponsors",
      ".pc-tipjar",
      ".pc-contact",
    ].join(", "),
    onEnd: async () => {
      try {
        const orderedTypes = Array.from(main.children || [])
          .map((el) => sectionTypeFromElement(el))
          .filter(Boolean);

        if (!orderedTypes.length) return;

        const existingSections = Array.isArray(editorState.layout?.sections)
          ? editorState.layout.sections
          : [];

        const byType = new Map();
        existingSections.forEach((s) => {
          if (!s || !s.type) return;
          if (!byType.has(s.type)) {
            byType.set(s.type, { ...s });
          }
        });

        const reordered = [];

        // New order dictated by the phone preview
        orderedTypes.forEach((type) => {
          let section = byType.get(type);
          if (!section) {
            // If not present yet, fabricate with sensible defaults
            let visible = true;
            if (
              editorState.sectionVisibility &&
              Object.prototype.hasOwnProperty.call(
                editorState.sectionVisibility,
                type
              )
            ) {
              visible = editorState.sectionVisibility[type] !== false;
            }
            section = { type, visible };
          }
          reordered.push(section);
          byType.delete(type);
        });

        // Any leftover/unknown sections get appended at the end
        byType.forEach((section) => {
          reordered.push(section);
        });

        editorState.layout = editorState.layout || {};
        editorState.layout.sections = reordered;

        await persistLayout();
      } catch (err) {
        console.error("[card-sections-dnd] Failed to persist section order", err);
      }
    },
  });

  main._sectionsSortable = sortable;
}

// -----------------------------------------------------------------------------
// Chain onto the existing onProfilePreviewRendered hook
// -----------------------------------------------------------------------------

const previousHook = window.onProfilePreviewRendered;

window.onProfilePreviewRendered = function () {
  // Preserve any existing behaviour (e.g. tile DnD)
  if (typeof previousHook === "function") {
    try {
      previousHook();
    } catch (err) {
      console.error(
        "[card-sections-dnd] previous onProfilePreviewRendered failed",
        err
      );
    }
  }

  // Then add section-level DnD
  setupSectionDnD();
};

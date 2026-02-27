// /dashboard/profile-assets/js/profile-editor-card-dnd.js
// Drag-and-drop reordering on the CARD itself (preview side).
// Uses SortableJS (already loaded globally in profile-editor.ejs).

import { editorState } from "/dashboard/profile-assets/js/profile-editor-core.js";
import { refreshButtonsUI } from "/dashboard/profile-assets/js/profile-editor-buttons.js";

/**
 * Apply an ID order array to editorState.customButtons
 * and keep sort_order in sync.
 */
function applyOrderToEditorState(idOrder) {
  if (!Array.isArray(editorState.customButtons)) return;

  const byId = new Map();
  editorState.customButtons.forEach((btn) => {
    if (!btn || typeof btn.id !== "number") return;
    byId.set(btn.id, btn);
  });

  const reordered = [];
  idOrder.forEach((id, index) => {
    const btn = byId.get(id);
    if (!btn) return;
    btn.sort_order = index;
    reordered.push(btn);
    byId.delete(id);
  });

  // Append any leftovers (just in case)
  byId.forEach((btn) => {
    btn.sort_order = reordered.length;
    reordered.push(btn);
  });

  editorState.customButtons = reordered;
}

function attachAddButtonTile(card) {
  const addTile = card.querySelector("#pc-add-button-card");
  if (!addTile) return;

  // Avoid stacking multiple listeners on re-render
  if (addTile.dataset.boundClick === "1") return;
  addTile.dataset.boundClick = "1";

  addTile.addEventListener("click", () => {
    // Reuse the existing sidebar "Add New Button" logic
    const sideAddBtn = document.getElementById("pe-add-button");
    if (sideAddBtn) {
      sideAddBtn.click();
    }

    // Optionally scroll editor panel into view
    const editorSide = document.querySelector(".pe-editor-side");
    if (editorSide) {
      editorSide.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  });
}

function attachCardDragAndDrop() {
  if (!window.Sortable) {
    console.warn("[profile-editor-card-dnd] window.Sortable not found");
    return;
  }

  const root = document.getElementById("preview-root");
  if (!root) return;

  const card = root.querySelector(".pc-card-root");
  if (!card) return;

  const buttonsContainer = card.querySelector(".pc-buttons");
  if (!buttonsContainer) return;

  // Attach click handler for "+" tile
  attachAddButtonTile(card);

  // Attach Sortable to the button cluster on the card
  window.Sortable.create(buttonsContainer, {
    animation: 120,
    handle: null, // entire button area is draggable
    onEnd: async () => {
      const tiles = Array.from(
        buttonsContainer.querySelectorAll("[data-button-id]")
      );
      const idOrder = tiles
        .map((el) => {
          const raw = el.getAttribute("data-button-id");
          const id = raw ? parseInt(raw, 10) : NaN;
          return Number.isFinite(id) ? id : null;
        })
        .filter((id) => id !== null);

      if (!idOrder.length) return;

      // 1) Update in-memory editor state so preview + side panel stay in sync
      applyOrderToEditorState(idOrder);

      // 2) Persist to backend (same endpoint used by side list)
      try {
        await fetch("/dashboard/api/profile/buttons/reorder", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ order: idOrder }),
        });
      } catch (err) {
        console.error(
          "[profile-editor-card-dnd] Failed to persist button order",
          err
        );
      }

      // 3) Rebuild side panel + re-render preview
      try {
        refreshButtonsUI();
      } catch (err) {
        console.error(
          "[profile-editor-card-dnd] refreshButtonsUI error",
          err
        );
      }

      if (window.updatePreview) {
        window.updatePreview();
      }
    },
  });
}

// Hook called by renderPreview() after each DOM mount
window.onProfilePreviewRendered = function () {
  try {
    attachCardDragAndDrop();
  } catch (err) {
    console.error("[profile-editor-card-dnd] attach error", err);
  }
};

// Also attempt once on DOM ready (in case preview was already rendered)
document.addEventListener("DOMContentLoaded", () => {
  try {
    attachCardDragAndDrop();
  } catch (err) {
    console.error("[profile-editor-card-dnd] initial attach error", err);
  }
});

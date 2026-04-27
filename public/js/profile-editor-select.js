// public/js/profile-editor-select.js
// Click-to-select wiring for the 3-panel profile editor.
// Attaches click handlers to preview sections and manages the selection highlight.
// Must be called inside window.onProfilePreviewRendered after each re-render.

import { setSelectedSection, getSelectedSection } from './profile-editor-core.js';

const SELECTED_CLASS = 'pe-section-selected';

/**
 * Attach click-to-select handlers to all [data-section-type] elements in the preview.
 * Call this inside onProfilePreviewRendered.
 */
export function attachSectionClickHandlers() {
  const root = document.getElementById('preview-root');
  if (!root) return;

  root.querySelectorAll('[data-section-type]').forEach(el => {
    // Remove existing listener to avoid duplicates
    el.removeEventListener('click', _handleSectionClick);
    el.addEventListener('click', _handleSectionClick);
    el.style.cursor = 'pointer';
  });

  // Re-apply highlight to currently selected section
  applySelectionHighlight(getSelectedSection());
}

function _handleSectionClick(e) {
  e.stopPropagation();
  const sectionType = this.dataset.sectionType;
  const current = getSelectedSection();

  // Toggle: clicking selected section deselects it
  if (sectionType === current) {
    setSelectedSection(null);
    applySelectionHighlight(null);
  } else {
    setSelectedSection(sectionType);
    applySelectionHighlight(sectionType);
  }
}

/**
 * Apply/remove the selection highlight class on preview sections.
 */
export function applySelectionHighlight(sectionType) {
  const root = document.getElementById('preview-root');
  if (!root) return;

  root.querySelectorAll('[data-section-type]').forEach(el => {
    el.classList.toggle(SELECTED_CLASS, el.dataset.sectionType === sectionType && sectionType !== null);
  });
}

/**
 * Set up the Escape key listener to deselect.
 * Call once on editor init.
 */
export function setupEscapeDeselect() {
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && getSelectedSection()) {
      setSelectedSection(null);
      applySelectionHighlight(null);
    }
  });
}

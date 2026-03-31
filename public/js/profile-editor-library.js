// public/js/profile-editor-library.js
// Section library panel for the 3-panel profile editor.
// Shows available section tiles, active/inactive state, click to select or add.

import { editorState, setSelectedSection } from './profile-editor-core.js';
import { getAllSectionTypes, getSectionSchema, toggleSectionVisibility } from './profile-editor-pure.js';

const LIBRARY_ID = 'pe-section-library';

export function setupSectionLibrary() {
  renderLibrary();

  // Re-render library when layout changes (section added/removed)
  window.addEventListener('pe:sectionSelected', () => {
    renderLibrary(); // update active states
  });
}

export function renderLibrary() {
  const container = document.getElementById(LIBRARY_ID);
  if (!container) return;

  const sections = editorState.layout?.sections || [];
  const types = getAllSectionTypes();

  container.innerHTML = types.map(type => {
    const schema = getSectionSchema(type);
    const section = sections.find(s => s.type === type);
    const isActive = section ? section.visible !== false : false;
    const isSelected = editorState.selectedSection === type;

    return `
      <div class="pe-library-tile ${isActive ? 'active' : 'inactive'} ${isSelected ? 'selected' : ''}"
           data-library-type="${type}"
           title="${isActive ? 'Click to edit' : 'Click to add'}">
        <span class="pe-library-icon">${schema.icon}</span>
        <span class="pe-library-label">${schema.label}</span>
        ${isActive ? '<span class="pe-library-badge">✓</span>' : '<span class="pe-library-badge pe-library-badge--add">+</span>'}
      </div>
    `;
  }).join('');

  // Wire click handlers
  container.querySelectorAll('[data-library-type]').forEach(tile => {
    tile.addEventListener('click', () => {
      const type = tile.dataset.libraryType;
      const sections = editorState.layout?.sections || [];
      const section = sections.find(s => s.type === type);
      const isActive = section ? section.visible !== false : false;

      // Canvas and background are special — they don't have layout visibility
      const noLayoutSections = ['canvas', 'background'];
      if (!isActive && !noLayoutSections.includes(type)) {
        // Add section
        editorState.layout = toggleSectionVisibility(editorState.layout, type, true);
        saveLayout();
        if (window.updatePreview) window.updatePreview();
      }

      // Select it
      setSelectedSection(type);
      renderLibrary();
    });
  });
}

async function saveLayout() {
  try {
    await fetch('/dashboard/api/profile/layout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ layout: editorState.layout }),
    });
  } catch { /* silent */ }
}

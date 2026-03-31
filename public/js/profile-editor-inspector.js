import { ColourPicker } from './colour-picker.js';
// public/js/profile-editor-inspector.js
// Properties inspector for the 3-panel profile editor.
// Renders contextual property forms based on the selected section.

import { editorState, setSelectedSection } from './profile-editor-core.js';
import { getSectionSchema } from './profile-editor-pure.js';

const INSPECTOR_ID = 'pe-inspector-content';

// ── Render ────────────────────────────────────────────────────────────────────

export function renderInspector(sectionType) {
  const container = document.getElementById(INSPECTOR_ID);
  if (!container) return;

  if (!sectionType) {
    container.innerHTML = renderGlobalSettings();
  } else {
    const schema = getSectionSchema(sectionType);
    if (!schema) {
      container.innerHTML = `<p class="pe-inspector-empty">No properties for this section.</p>`;
    } else {
      container.innerHTML = renderSectionInspector(sectionType, schema);
    }
  }

  wireInspector(sectionType);
}

// ── Global settings (no selection) ───────────────────────────────────────────

function renderGlobalSettings() {
  return `
    <div class="pe-inspector-global-hint">
      Click any section in the preview to edit its properties.<br/>
      Click the background area at the top to change the cover image.<br/>
      Use the theme buttons below the preview to hot-swap themes.
    </div>
  `;
}

// ── Section-specific inspectors ───────────────────────────────────────────────

function renderSectionInspector(sectionType, schema) {
  const profile = editorState.profile || {};
  const layout = editorState.layout || {};

  let html = `
    <div class="pe-inspector-header">
      <span class="pe-inspector-icon">${schema.icon}</span>
      <span class="pe-inspector-title">${schema.label}</span>
      ${sectionType !== 'avatar' ? `
        <button class="pe-inspector-remove" data-remove-section="${sectionType}" title="Remove section">✕</button>
      ` : ''}
    </div>
  `;

  switch (sectionType) {
    case 'avatar':
      html += renderAvatarInspector(profile);
      break;
    case 'bio':
      html += renderBioInspector(profile);
      break;
    case 'socialLinks':
      html += renderSocialLinksInspector(profile);
      break;
    case 'stats':
      html += renderStatsInspector(layout);
      break;
    case 'buttons':
      html += renderButtonsInspector();
      break;
    case 'sponsors':
      html += renderSponsorsInspector();
      break;
    case 'tipJar':
      html += renderTipJarInspector(layout);
      break;
    case 'tts':
      html += renderTtsInspector(layout);
      break;
    case 'contact':
      html += renderContactInspector(layout);
      break;
    case 'background':
      html += renderBackgroundInspector();
      break;
    case 'canvas':
      html += renderCanvasInspector();
      break;
    default:
      html += `<p class="pe-inspector-empty">Select a section to edit its properties.</p>`;
  }

  return html;
}

function renderAvatarInspector(profile) {
  return `
    <div class="pe-inspector-section">
      <div class="pe-inspector-label">Avatar</div>
      ${profile.avatar_url ? `<div class="pe-inspector-avatar-preview"><img src="${profile.avatar_url}" alt="Avatar" /></div>` : ''}
      <form method="POST" action="/dashboard/api/profile/avatar" enctype="multipart/form-data" class="pe-inspector-upload-form">
        <div class="pe-inspector-upload-row">
          <input type="file" name="avatar" accept="image/*" class="pe-inspector-file" onchange="this.closest('form').submit()" />
        </div>
      </form>
    </div>
    <div class="pe-inspector-section">
      <label class="pe-inspector-label">Display Name</label>
      <input type="text" class="pe-inspector-input" id="pi-display-name"
             value="${escHtml(profile.display_name || '')}" maxlength="80"
             data-save-basic="display_name" />
    </div>
  `;
}

function renderBioInspector(profile) {
  const bio = profile.bio || '';
  return `
    <div class="pe-inspector-section">
      <label class="pe-inspector-label">Bio <span class="pe-inspector-counter" id="pi-bio-counter">${bio.length}/280</span></label>
      <textarea class="pe-inspector-textarea" id="pi-bio" maxlength="280"
                data-save-basic="bio"
                oninput="document.getElementById('pi-bio-counter').textContent=this.value.length+'/280'"
      >${escHtml(bio)}</textarea>
    </div>
  `;
}

function renderSocialLinksInspector(profile) {
  const fields = [
    { key: 'x', label: 'X (handle or URL)', placeholder: '@handle' },
    { key: 'youtube', label: 'YouTube URL', placeholder: 'https://youtube.com/...' },
    { key: 'twitch', label: 'Twitch URL', placeholder: 'https://twitch.tv/...' },
    { key: 'kick', label: 'Kick URL', placeholder: 'https://kick.com/...' },
  ];
  return fields.map(f => `
    <div class="pe-inspector-section">
      <label class="pe-inspector-label">${f.label}</label>
      <input type="text" class="pe-inspector-input" id="pi-${f.key}"
             value="${escHtml(profile[f.key] || '')}"
             placeholder="${f.placeholder}"
             data-save-social="${f.key}" />
    </div>
  `).join('');
}

function renderStatsInspector(layout) {
  const statsSection = (layout.sections || []).find(s => s.type === 'stats') || {};
  const settings = statsSection.settings || {};
  return `
    <div class="pe-inspector-section">
      <label class="pe-inspector-toggle-row">
        <input type="checkbox" id="pi-stats-breakdown" ${settings.enableBreakdown ? 'checked' : ''}
               data-save-section-setting="stats:enableBreakdown" />
        <span>Show stats breakdown</span>
      </label>
    </div>
  `;
}

function renderButtonsInspector() {
  const buttons = editorState.customButtons || [];
  const buttonRows = buttons.map((btn, idx) => `
    <div class="pe-btn-row ${btn.visible === false ? 'pe-btn-row--hidden' : ''}"
         data-btn-idx="${idx}" data-btn-id="${btn.id}">
      <div class="pe-btn-row-header">
        <span class="pe-btn-row-label">${escHtml(btn.label || 'Button')}</span>
        <div class="pe-btn-row-actions">
          <button class="pe-btn-row-toggle" data-btn-toggle="${btn.id}"
                  title="${btn.visible === false ? 'Show' : 'Hide'}">
            ${btn.visible === false ? '👁️' : '🙈'}
          </button>
          <button class="pe-btn-row-edit" data-btn-edit="${btn.id}">✏️</button>
          <button class="pe-btn-row-delete" data-btn-delete="${btn.id}">🗑️</button>
        </div>
      </div>
      <div class="pe-btn-editor" id="pe-btn-editor-${btn.id}" style="display:none;">
        <div class="pe-inspector-section">
          <label class="pe-inspector-label">Label</label>
          <input type="text" class="pe-inspector-input" data-btn-field="label" value="${escHtml(btn.label || '')}" />
        </div>
        <div class="pe-inspector-section">
          <label class="pe-inspector-label">URL</label>
          <input type="text" class="pe-inspector-input" data-btn-field="url" value="${escHtml(btn.url || '')}" />
        </div>
        <div class="pe-inspector-section">
          <label class="pe-inspector-label">Shape</label>
          <div class="pe-btn-shape-row">
            ${['pill','soft','square'].map(s => `
              <button class="pe-shape-btn ${(btn.shape || 'pill') === s ? 'active' : ''}"
                      data-btn-shape="${s}" data-btn-id="${btn.id}">${s}</button>
            `).join('')}
          </div>
        </div>
        <div class="pe-inspector-section">
          <label class="pe-inspector-label">Size</label>
          <div class="pe-btn-shape-row">
            <button class="pe-shape-btn ${(btn.size || 'md') === 'sm' ? 'active' : ''}"
                    data-btn-size="sm" data-btn-id="${btn.id}">Small</button>
            <button class="pe-shape-btn ${(btn.size || 'md') === 'md' ? 'active' : ''}"
                    data-btn-size="md" data-btn-id="${btn.id}">Medium</button>
            <button class="pe-shape-btn ${(btn.size || 'md') === 'lg' ? 'active' : ''}"
                    data-btn-size="lg" data-btn-id="${btn.id}">Large Tile</button>
          </div>
        </div>
        <div class="pe-inspector-section">
          <label class="pe-inspector-label">Accent Colour</label>
          <div class="pe-colour-picker-row">
            <input type="color" class="pe-colour-input" data-btn-accent-colour="${btn.id}"
                   value="${btn.accent_color || '#6366f1'}" />
            <input type="text" class="pe-inspector-input pe-colour-hex" data-btn-accent-hex="${btn.id}"
                   value="${escHtml(btn.accent_color || '')}" placeholder="none" />
          </div>
          <div class="pe-btn-shape-row" style="margin-top:6px;">
            <button class="pe-shape-btn ${(btn.accent_target || 'button') === 'button' ? 'active' : ''}"
                    data-btn-accent-target="button" data-btn-id="${btn.id}">Fill button</button>
            <button class="pe-shape-btn ${(btn.accent_target || 'button') === 'label' ? 'active' : ''}"
                    data-btn-accent-target="label" data-btn-id="${btn.id}">Colour label</button>
          </div>
        </div>
        <div class="pe-inspector-section">
          <label class="pe-inspector-label">Featured Image ${btn.size === 'lg' ? '' : '(Large Tile only)'}</label>
          ${btn.featured_image_url ? `
            <div class="pe-btn-img-preview">
              <img src="${escHtml(btn.featured_image_url)}" alt="" />
            </div>
          ` : ''}
          <form method="POST" action="/dashboard/api/profile/buttons/${btn.id}/image"
                enctype="multipart/form-data" class="pe-inspector-upload-form">
            <div class="pe-inspector-upload-row">
              <input type="file" name="image" accept="image/*" class="pe-inspector-file"
                     onchange="this.closest('form').submit()" />
            </div>
          </form>
        </div>
        <div class="pe-inspector-section">
          <button class="pe-btn pe-btn-sm pe-btn-save" data-btn-save="${btn.id}">Save Changes</button>
        </div>
      </div>
    </div>
  `).join('');

  return `
    <div class="pe-inspector-section">
      <div class="pe-inspector-hint">Click ✏️ to edit a button. Drag buttons on the preview to reorder.</div>
    </div>
    <div id="pi-buttons-list">
      ${buttonRows || '<p class="pe-inspector-empty">No buttons yet.</p>'}
    </div>
    <button class="pe-btn pe-btn-sm" id="pi-add-button" style="margin-top:8px;">+ Add Button</button>
  `;
}

function renderSponsorsInspector() {
  return `
    <div class="pe-inspector-section">
      <div class="pe-inspector-hint">Manage your sponsors below.</div>
      <div id="pi-sponsors-list"></div>
      <button class="pe-btn pe-btn-sm" id="pi-add-sponsor">+ Add Sponsor</button>
    </div>
  `;
}

function renderTipJarInspector(layout) {
  const section = (layout.sections || []).find(s => s.type === 'tipJar') || {};
  const s = section.settings || {};
  return `
    <div class="pe-inspector-section">
      <label class="pe-inspector-label">Headline</label>
      <input type="text" class="pe-inspector-input" value="${escHtml(s.headline || 'Tip Jar')}"
             data-save-section-setting="tipJar:headline" />
    </div>
    <div class="pe-inspector-section">
      <label class="pe-inspector-label">Primary URL</label>
      <input type="text" class="pe-inspector-input" value="${escHtml(s.primaryUrl || '')}"
             data-save-section-setting="tipJar:primaryUrl" />
    </div>
    <div class="pe-inspector-section">
      <label class="pe-inspector-label">Primary Label</label>
      <input type="text" class="pe-inspector-input" value="${escHtml(s.primaryLabel || '')}"
             data-save-section-setting="tipJar:primaryLabel" />
    </div>
    <div class="pe-inspector-section">
      <label class="pe-inspector-label">Secondary URL</label>
      <input type="text" class="pe-inspector-input" value="${escHtml(s.secondaryUrl || '')}"
             data-save-section-setting="tipJar:secondaryUrl" />
    </div>
    <div class="pe-inspector-section">
      <label class="pe-inspector-label">Secondary Label</label>
      <input type="text" class="pe-inspector-input" value="${escHtml(s.secondaryLabel || '')}"
             data-save-section-setting="tipJar:secondaryLabel" />
    </div>
  `;
}

function renderTtsInspector(layout) {
  const section = (layout.sections || []).find(s => s.type === 'tts') || {};
  const visible = section.visible !== false;
  return `
    <div class="pe-inspector-section">
      <label class="pe-inspector-toggle-row">
        <input type="checkbox" id="pi-tts-enabled" ${visible ? 'checked' : ''}
               data-save-section-visible="tts" />
        <span>Show TTS button on profile</span>
      </label>
    </div>
  `;
}

function renderContactInspector(layout) {
  const section = (layout.sections || []).find(s => s.type === 'contact') || {};
  const s = section.settings || {};
  return `
    <div class="pe-inspector-section">
      <label class="pe-inspector-label">Headline</label>
      <input type="text" class="pe-inspector-input" value="${escHtml(s.headline || 'Stay in touch')}"
             data-save-section-setting="contact:headline" />
    </div>
    <div class="pe-inspector-section">
      <label class="pe-inspector-label">Description</label>
      <textarea class="pe-inspector-textarea" data-save-section-setting="contact:description">${escHtml(s.description || '')}</textarea>
    </div>
    <div class="pe-inspector-section">
      <label class="pe-inspector-label">Button Label</label>
      <input type="text" class="pe-inspector-input" value="${escHtml(s.buttonLabel || 'Notify me')}"
             data-save-section-setting="contact:buttonLabel" />
    </div>
  `;
}

function renderBackgroundInspector() {
  const coverUrl = editorState.profile?.cover_image_url;
  return `
    <div class="pe-inspector-section">
      <div class="pe-inspector-label">Cover / Background Image</div>
      <div class="pe-inspector-cover-zone" id="pe-cover-drop-zone">
        ${coverUrl ? `
          <img src="${coverUrl}" alt="Cover" class="pe-inspector-cover-img" />
          <div class="pe-inspector-cover-overlay"><span>Change image</span></div>
        ` : `
          <div class="pe-inspector-cover-placeholder">
            <span class="pe-inspector-cover-icon">🖼️</span>
            <span>Upload cover image</span>
            <span class="pe-inspector-hint">Wide banner · Max 8MB · JPG, PNG, WebP</span>
          </div>
        `}
        <form method="POST" action="/dashboard/api/profile/cover" enctype="multipart/form-data"
              id="pe-cover-form" style="display:none;">
          <input type="file" name="cover" accept="image/*" id="pe-cover-file-input"
                 onchange="this.closest('form').submit()" />
        </form>
      </div>
      <div class="pe-inspector-hint" style="margin-top:8px;">
        This image appears as the hero banner at the top of your profile card.
        Future: gradients, solid colours, and video backgrounds.
      </div>
    </div>
  `;
}

function renderCanvasInspector() {
  const appearance = editorState.appearance || {};
  const canvasBg = appearance.canvasBg || '';
  const canvasVideo = appearance.canvasVideo || '';
  const qrEnabled = appearance.qrEnabled !== false;

  // Detect if current bg is a gradient or solid colour
  const isGradient = canvasBg.includes('gradient');
  const solidColour = (!isGradient && canvasBg) ? canvasBg : '#0f172a';

  return `
    <div class="pe-inspector-section">
      <div class="pe-inspector-label">Background Type</div>
      <div class="pe-bg-type-tabs">
        <button class="pe-bg-tab ${!isGradient ? 'active' : ''}" data-bg-tab="solid">Solid</button>
        <button class="pe-bg-tab ${isGradient ? 'active' : ''}" data-bg-tab="gradient">Gradient</button>
      </div>
    </div>

    <!-- Solid colour picker -->
    <div class="pe-inspector-section pe-bg-panel" id="pe-bg-solid" style="${isGradient ? 'display:none' : ''}">
      <div class="pe-inspector-label">Colour</div>
      <div id="pe-colour-picker-mount"></div>
    </div>

    <!-- Gradient builder -->
    <div class="pe-inspector-section pe-bg-panel" id="pe-bg-gradient" style="${!isGradient ? 'display:none' : ''}">
      <div class="pe-inspector-label">Gradient</div>
      <div class="pe-inspector-label" style="margin-bottom:4px;">From colour</div>
      <div id="pe-grad-from-mount"></div>
      <div class="pe-inspector-label" style="margin-top:10px;margin-bottom:4px;">To colour</div>
      <div id="pe-grad-to-mount"></div>
      <div class="pe-inspector-label" style="margin-top:8px;">Direction</div>
      <div class="pe-canvas-presets">
        <button class="pe-canvas-preset pe-grad-dir active" data-dir="135deg">↘ Diagonal</button>
        <button class="pe-canvas-preset pe-grad-dir" data-dir="180deg">↓ Down</button>
        <button class="pe-canvas-preset pe-grad-dir" data-dir="90deg">→ Right</button>
        <button class="pe-canvas-preset pe-grad-dir" data-dir="45deg">↗ Up-right</button>
      </div>
      <div class="pe-canvas-presets" style="margin-top:8px;">
        <button class="pe-canvas-preset" data-gradient="linear-gradient(135deg,#0f172a,#1e1b4b)">Indigo</button>
        <button class="pe-canvas-preset" data-gradient="linear-gradient(135deg,#0f172a,#1a0a2e)">Purple</button>
        <button class="pe-canvas-preset" data-gradient="linear-gradient(135deg,#0c1a0c,#0f2a1a)">Forest</button>
        <button class="pe-canvas-preset" data-gradient="linear-gradient(135deg,#1a0a0a,#2a0f0f)">Crimson</button>
        <button class="pe-canvas-preset" data-gradient="linear-gradient(135deg,#0a0a1a,#1a1a0a)">Olive</button>
        <button class="pe-canvas-preset" data-gradient="linear-gradient(135deg,#0f172a,#0a2a2a)">Teal</button>
      </div>
    </div>

    <div class="pe-inspector-section">
      <div class="pe-inspector-label">Background Video URL</div>
      <div class="pe-inspector-hint">YouTube URL or direct .mp4/.webm link. Plays muted and looped.</div>
      <input type="text" class="pe-inspector-input" id="pi-canvas-video"
             value="${escHtml(canvasVideo)}"
             placeholder="https://youtube.com/watch?v=... or video.mp4" />
    </div>
    <div class="pe-inspector-section">
      <label class="pe-inspector-toggle-row">
        <input type="checkbox" id="pi-qr-enabled" ${qrEnabled ? 'checked' : ''} />
        <span>Show QR code on public profile</span>
      </label>
    </div>
  `;
}

function wireButtonsInspector(container) {
  if (!container) return;

  // Toggle edit panel
  container.querySelectorAll('[data-btn-edit]').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.btnEdit;
      const editor = container.querySelector(`#pe-btn-editor-${id}`);
      if (editor) editor.style.display = editor.style.display === 'none' ? '' : 'none';
    });
  });

  // Delete button
  container.querySelectorAll('[data-btn-delete]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.btnDelete;
      if (!confirm('Delete this button?')) return;
      await fetch(`/dashboard/api/profile/buttons/${id}`, {
        method: 'DELETE', credentials: 'same-origin'
      });
      editorState.customButtons = (editorState.customButtons || []).filter(b => String(b.id) !== String(id));
      renderButtonListInInspector();
      if (window.updatePreview) window.updatePreview();
    });
  });

  // Toggle visibility
  container.querySelectorAll('[data-btn-toggle]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.btnToggle;
      const button = (editorState.customButtons || []).find(b => String(b.id) === String(id));
      if (!button) return;
      button.visible = button.visible === false ? true : false;
      await fetch(`/dashboard/api/profile/buttons/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ ...button, visible: button.visible }),
      });
      renderButtonListInInspector();
      if (window.updatePreview) window.updatePreview();
    });
  });

  // Shape buttons
  container.querySelectorAll('[data-btn-shape]').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.btnId;
      const shape = btn.dataset.btnShape;
      const button = (editorState.customButtons || []).find(b => String(b.id) === String(id));
      if (button) button.shape = shape;
      container.querySelectorAll(`[data-btn-shape][data-btn-id="${id}"]`).forEach(b => b.classList.toggle('active', b === btn));
      debounceSaveButton(id);
      if (window.updatePreview) window.updatePreview();
    });
  });

  // Size buttons
  container.querySelectorAll('[data-btn-size]').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.btnId;
      const size = btn.dataset.btnSize;
      const button = (editorState.customButtons || []).find(b => String(b.id) === String(id));
      if (button) button.size = size;
      container.querySelectorAll(`[data-btn-size][data-btn-id="${id}"]`).forEach(b => b.classList.toggle('active', b === btn));
      debounceSaveButton(id);
      if (window.updatePreview) window.updatePreview();
    });
  });

  // Accent colour
  container.querySelectorAll('[data-btn-accent-colour]').forEach(input => {
    input.addEventListener('input', () => {
      const id = input.dataset.btnAccentColour;
      const button = (editorState.customButtons || []).find(b => String(b.id) === String(id));
      if (button) button.accent_color = input.value;
      const hexInput = container.querySelector(`[data-btn-accent-hex="${id}"]`);
      if (hexInput) hexInput.value = input.value;
      debounceSaveButton(id);
      if (window.updatePreview) window.updatePreview();
    });
  });

  container.querySelectorAll('[data-btn-accent-hex]').forEach(input => {
    input.addEventListener('blur', () => {
      const id = input.dataset.btnAccentHex;
      const button = (editorState.customButtons || []).find(b => String(b.id) === String(id));
      if (button) button.accent_color = input.value;
      const colourInput = container.querySelector(`[data-btn-accent-colour="${id}"]`);
      if (colourInput && input.value.startsWith('#')) colourInput.value = input.value;
      debounceSaveButton(id);
      if (window.updatePreview) window.updatePreview();
    });
  });

  // Accent target
  container.querySelectorAll('[data-btn-accent-target]').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.btnId;
      const target = btn.dataset.btnAccentTarget;
      const button = (editorState.customButtons || []).find(b => String(b.id) === String(id));
      if (button) button.accent_target = target;
      container.querySelectorAll(`[data-btn-accent-target][data-btn-id="${id}"]`).forEach(b => b.classList.toggle('active', b === btn));
      debounceSaveButton(id);
      if (window.updatePreview) window.updatePreview();
    });
  });

  // Save button
  container.querySelectorAll('[data-btn-save]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.btnSave;
      const editor = container.querySelector(`#pe-btn-editor-${id}`);
      if (!editor) return;
      const button = (editorState.customButtons || []).find(b => String(b.id) === String(id));
      if (!button) return;
      // Read label and url from inputs
      const labelInput = editor.querySelector('[data-btn-field="label"]');
      const urlInput = editor.querySelector('[data-btn-field="url"]');
      if (labelInput) button.label = labelInput.value;
      if (urlInput) button.url = urlInput.value;
      await saveButton(id, button);
      renderButtonListInInspector();
      if (window.updatePreview) window.updatePreview();
      btn.textContent = 'Saved ✓';
      setTimeout(() => { btn.textContent = 'Save Changes'; }, 1500);
    });
  });

  // Add button
  const addBtn = container.querySelector('#pi-add-button');
  if (addBtn) {
    addBtn.addEventListener('click', () => {
      const sidebarBtn = document.getElementById('pe-add-button');
      if (sidebarBtn) sidebarBtn.click();
    });
  }
}

const _btnSaveTimers = {};
function debounceSaveButton(id) {
  clearTimeout(_btnSaveTimers[id]);
  _btnSaveTimers[id] = setTimeout(() => {
    const button = (editorState.customButtons || []).find(b => String(b.id) === String(id));
    if (button) saveButton(id, button);
  }, 800);
}

async function saveButton(id, button) {
  try {
    await fetch(`/dashboard/api/profile/buttons/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({
        label: button.label,
        url: button.url,
        visible: button.visible !== false,
        shape: button.shape || 'pill',
        size: button.size || 'md',
        accent_color: button.accent_color || '',
        accent_target: button.accent_target || 'button',
        icon: button.icon || '',
      }),
    });
  } catch { /* silent */ }
}

// ── Wiring ────────────────────────────────────────────────────────────────────

let basicSaveTimer = null;
let socialSaveTimer = null;
let layoutSaveTimer = null;

function wireInspector(sectionType) {
  const container = document.getElementById(INSPECTOR_ID);
  if (!container) return;

  // Basic field saves (display_name, bio)
  container.querySelectorAll('[data-save-basic]').forEach(el => {
    el.addEventListener('input', () => {
      const key = el.dataset.saveBasic;
      editorState.profile = editorState.profile || {};
      editorState.profile[key] = el.value;
      clearTimeout(basicSaveTimer);
      basicSaveTimer = setTimeout(() => saveBasic(), 600);
      if (window.updatePreview) window.updatePreview();
    });
  });

  // Social field saves
  container.querySelectorAll('[data-save-social]').forEach(el => {
    el.addEventListener('input', () => {
      const key = el.dataset.saveSocial;
      editorState.profile = editorState.profile || {};
      editorState.profile[key] = el.value;
      clearTimeout(socialSaveTimer);
      socialSaveTimer = setTimeout(() => saveSocials(), 600);
      if (window.updatePreview) window.updatePreview();
    });
  });

  // Section setting saves (e.g. stats:enableBreakdown)
  container.querySelectorAll('[data-save-section-setting]').forEach(el => {
    el.addEventListener('change', () => {
      const [type, key] = el.dataset.saveSectionSetting.split(':');
      const sections = editorState.layout?.sections || [];
      const section = sections.find(s => s.type === type);
      if (section) {
        section.settings = section.settings || {};
        section.settings[key] = el.type === 'checkbox' ? el.checked : el.value;
      }
      clearTimeout(layoutSaveTimer);
      layoutSaveTimer = setTimeout(() => saveLayout(), 600);
      if (window.updatePreview) window.updatePreview();
    });
    el.addEventListener('input', () => {
      const [type, key] = el.dataset.saveSectionSetting.split(':');
      const sections = editorState.layout?.sections || [];
      const section = sections.find(s => s.type === type);
      if (section) {
        section.settings = section.settings || {};
        section.settings[key] = el.value;
      }
      clearTimeout(layoutSaveTimer);
      layoutSaveTimer = setTimeout(() => saveLayout(), 800);
      if (window.updatePreview) window.updatePreview();
    });
  });

  // Section visible toggles
  container.querySelectorAll('[data-save-section-visible]').forEach(el => {
    el.addEventListener('change', () => {
      const type = el.dataset.saveSectionVisible;
      const sections = editorState.layout?.sections || [];
      const section = sections.find(s => s.type === type);
      if (section) section.visible = el.checked;
      clearTimeout(layoutSaveTimer);
      layoutSaveTimer = setTimeout(() => saveLayout(), 400);
      if (window.updatePreview) window.updatePreview();
    });
  });

  // Canvas background type tabs
  container.querySelectorAll('[data-bg-tab]').forEach(tab => {
    tab.addEventListener('click', () => {
      const type = tab.dataset.bgTab;
      container.querySelectorAll('[data-bg-tab]').forEach(t => t.classList.toggle('active', t === tab));
      const solidPanel = container.querySelector('#pe-bg-solid');
      const gradPanel = container.querySelector('#pe-bg-gradient');
      if (solidPanel) solidPanel.style.display = type === 'solid' ? '' : 'none';
      if (gradPanel) gradPanel.style.display = type === 'gradient' ? '' : 'none';
    });
  });

  // Visual colour pickers
  function applyColour(val) {
    editorState.appearance = editorState.appearance || {};
    editorState.appearance.canvasBg = val;
    saveAppearance({ canvasBg: val });
  }

  // Solid colour picker
  const solidMount = container.querySelector('#pe-colour-picker-mount');
  let solidPicker = null;
  if (solidMount) {
    const appearance = editorState.appearance || {};
    const currentBg = appearance.canvasBg || '#0f172a';
    const initColour = (!currentBg.includes('gradient') && currentBg.startsWith('#')) ? currentBg : '#0f172a';
    solidPicker = new ColourPicker(solidMount, initColour, (hex) => {
      applyColour(hex);
    });
  }

  // Gradient builder with visual pickers
  let gradDir = '135deg';
  let gradFrom = '#0f172a';
  let gradTo = '#1e1b4b';

  function buildGradient() {
    applyColour(`linear-gradient(${gradDir},${gradFrom},${gradTo})`);
  }

  const gradFromMount = container.querySelector('#pe-grad-from-mount');
  const gradToMount = container.querySelector('#pe-grad-to-mount');
  if (gradFromMount) {
    new ColourPicker(gradFromMount, gradFrom, (hex) => { gradFrom = hex; buildGradient(); });
  }
  if (gradToMount) {
    new ColourPicker(gradToMount, gradTo, (hex) => { gradTo = hex; buildGradient(); });
  }

  container.querySelectorAll('[data-dir]').forEach(btn => {
    btn.addEventListener('click', () => {
      gradDir = btn.dataset.dir;
      container.querySelectorAll('[data-dir]').forEach(b => b.classList.toggle('active', b === btn));
      buildGradient();
    });
  });

  // Gradient presets
  container.querySelectorAll('[data-gradient]').forEach(btn => {
    btn.addEventListener('click', () => {
      applyColour(btn.dataset.gradient);
    });
  });

  // Solid colour presets
  container.querySelectorAll('[data-preset]').forEach(btn => {
    btn.addEventListener('click', () => {
      const val = btn.dataset.preset;
      if (solidPicker && !val.includes('gradient')) solidPicker.setValue(val);
      applyColour(val);
    });
  });
  const canvasVideoInput = container.querySelector('#pi-canvas-video');
  if (canvasVideoInput) {
    canvasVideoInput.addEventListener('blur', () => {
      editorState.appearance = editorState.appearance || {};
      editorState.appearance.canvasVideo = canvasVideoInput.value;
      saveAppearance({ canvasVideo: canvasVideoInput.value });
    });
  }
  const qrToggle = container.querySelector('#pi-qr-enabled');
  if (qrToggle) {
    qrToggle.addEventListener('change', () => {
      editorState.appearance = editorState.appearance || {};
      editorState.appearance.qrEnabled = qrToggle.checked;
      saveAppearance({ qrEnabled: qrToggle.checked });
    });
  }

  // Cover zone click → open file picker
  const coverZone = container.querySelector('#pe-cover-drop-zone');
  if (coverZone) {
    coverZone.addEventListener('click', () => {
      const fi = document.getElementById('pe-cover-file-input');
      if (fi) fi.click();
    });
  }

  // Remove section button
  container.querySelectorAll('[data-remove-section]').forEach(btn => {
    btn.addEventListener('click', () => {
      const type = btn.dataset.removeSection;
      const sections = editorState.layout?.sections || [];
      const section = sections.find(s => s.type === type);
      if (section) section.visible = false;
      saveLayout();
      setSelectedSection(null);
      if (window.updatePreview) window.updatePreview();
    });
  });

  // Buttons inspector — wire the full button editor
  if (sectionType === 'buttons') {
    wireButtonsInspector(container);
  }
}

function renderButtonListInInspector() {
  // Buttons inspector is now self-contained in renderButtonsInspector
  // Re-render the full inspector when buttons change
  const selected = editorState.selectedSection;
  if (selected === 'buttons') {
    const container = document.getElementById('pe-inspector-content');
    if (container) {
      container.innerHTML = renderSectionInspector('buttons', getSectionSchema('buttons'));
      wireButtonsInspector(container);
    }
  }
}

// ── Persistence helpers ───────────────────────────────────────────────────────

async function saveBasic() {
  const p = editorState.profile || {};
  try {
    await fetch('/dashboard/api/profile/basic', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ display_name: p.display_name, bio: p.bio, tags: p.tags }),
    });
  } catch { /* silent */ }
}

async function saveSocials() {
  const p = editorState.profile || {};
  try {
    await fetch('/dashboard/api/profile/socials', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ x: p.x, youtube: p.youtube, twitch: p.twitch, kick: p.kick }),
    });
  } catch { /* silent */ }
}

async function saveAppearance(updates) {
  try {
    await fetch('/dashboard/api/profile/appearance', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(updates),
    });
  } catch { /* silent */ }
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

// ── Setup ─────────────────────────────────────────────────────────────────────

export function setupInspector() {
  // Listen for section selection events
  window.addEventListener('pe:sectionSelected', (e) => {
    renderInspector(e.detail.sectionType);
  });

  // Initial render (no selection = global settings)
  renderInspector(null);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function escHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

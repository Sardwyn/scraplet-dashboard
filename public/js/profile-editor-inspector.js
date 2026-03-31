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
  return `
    <div class="pe-inspector-section">
      <div class="pe-inspector-hint">Manage your buttons below. Drag to reorder on the preview.</div>
      <div id="pi-buttons-list"></div>
      <button class="pe-btn pe-btn-sm" id="pi-add-button">+ Add Button</button>
    </div>
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
      <div class="pe-colour-picker-row">
        <input type="color" id="pi-canvas-colour" value="${solidColour.startsWith('#') ? solidColour : '#0f172a'}"
               class="pe-colour-input" />
        <input type="text" id="pi-canvas-colour-hex" class="pe-inspector-input pe-colour-hex"
               value="${escHtml(solidColour)}" placeholder="#0f172a" />
      </div>
      <div class="pe-canvas-presets">
        <button class="pe-canvas-preset" data-preset="#0f172a" style="background:#0f172a;">Dark</button>
        <button class="pe-canvas-preset" data-preset="#1a1a2e" style="background:#1a1a2e;">Navy</button>
        <button class="pe-canvas-preset" data-preset="#0d1117" style="background:#0d1117;">Black</button>
        <button class="pe-canvas-preset" data-preset="#1a0a2e" style="background:#1a0a2e;">Purple</button>
        <button class="pe-canvas-preset" data-preset="#0a1a0a" style="background:#0a1a0a;">Green</button>
        <button class="pe-canvas-preset" data-preset="#1a0a0a" style="background:#1a0a0a;">Red</button>
      </div>
    </div>

    <!-- Gradient builder -->
    <div class="pe-inspector-section pe-bg-panel" id="pe-bg-gradient" style="${!isGradient ? 'display:none' : ''}">
      <div class="pe-inspector-label">Gradient</div>
      <div class="pe-gradient-row">
        <input type="color" id="pi-grad-from" value="#0f172a" class="pe-colour-input" />
        <span class="pe-gradient-arrow">→</span>
        <input type="color" id="pi-grad-to" value="#1e1b4b" class="pe-colour-input" />
      </div>
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

  // Solid colour picker
  const colourInput = container.querySelector('#pi-canvas-colour');
  const colourHex = container.querySelector('#pi-canvas-colour-hex');
  function applyColour(val) {
    editorState.appearance = editorState.appearance || {};
    editorState.appearance.canvasBg = val;
    saveAppearance({ canvasBg: val });
  }
  if (colourInput) {
    colourInput.addEventListener('input', () => {
      if (colourHex) colourHex.value = colourInput.value;
      applyColour(colourInput.value);
    });
  }
  if (colourHex) {
    colourHex.addEventListener('blur', () => {
      if (colourInput) colourInput.value = colourHex.value;
      applyColour(colourHex.value);
    });
  }

  // Gradient builder
  let gradDir = '135deg';
  container.querySelectorAll('[data-dir]').forEach(btn => {
    btn.addEventListener('click', () => {
      gradDir = btn.dataset.dir;
      container.querySelectorAll('[data-dir]').forEach(b => b.classList.toggle('active', b === btn));
      buildGradient();
    });
  });
  function buildGradient() {
    const from = container.querySelector('#pi-grad-from')?.value || '#0f172a';
    const to = container.querySelector('#pi-grad-to')?.value || '#1e1b4b';
    const val = `linear-gradient(${gradDir},${from},${to})`;
    applyColour(val);
  }
  container.querySelector('#pi-grad-from')?.addEventListener('input', buildGradient);
  container.querySelector('#pi-grad-to')?.addEventListener('input', buildGradient);

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
      if (colourInput && !val.includes('gradient')) colourInput.value = val;
      if (colourHex && !val.includes('gradient')) colourHex.value = val;
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

  // Buttons inspector — delegate to existing buttons module
  const addBtnBtn = container.querySelector('#pi-add-button');
  if (addBtnBtn) {
    addBtnBtn.addEventListener('click', () => {
      const sidebarBtn = document.getElementById('pe-add-button');
      if (sidebarBtn) sidebarBtn.click();
    });
    // Render button list in inspector
    renderButtonListInInspector();
  }
}

function renderButtonListInInspector() {
  const list = document.getElementById('pi-buttons-list');
  if (!list) return;
  const buttons = editorState.customButtons || [];
  list.innerHTML = buttons.map(btn => `
    <div class="pe-inspector-button-row" data-button-id="${btn.id}">
      <span class="pe-inspector-button-label">${escHtml(btn.label || 'Button')}</span>
      <span class="pe-inspector-button-url">${escHtml(btn.url || '')}</span>
    </div>
  `).join('') || '<p class="pe-inspector-hint">No buttons yet.</p>';
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

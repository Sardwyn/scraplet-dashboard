// public/js/profile-editor-pure.js
// Pure functions for the profile editor redesign.
// No side effects. No DOM access. No imports.

// ── Section schemas ───────────────────────────────────────────────────────────

const SECTION_SCHEMAS = {
  avatar: {
    label: 'Avatar & Name',
    icon: '👤',
    fields: [
      { key: 'avatar_url', type: 'image-upload', label: 'Avatar', endpoint: '/dashboard/api/profile/avatar', fieldName: 'avatar' },
      { key: 'display_name', type: 'text', label: 'Display Name', maxLength: 80, endpoint: '/dashboard/api/profile/basic' },
    ],
  },
  bio: {
    label: 'Bio',
    icon: '📝',
    fields: [
      { key: 'bio', type: 'textarea', label: 'Bio', maxLength: 280, counter: true, endpoint: '/dashboard/api/profile/basic' },
    ],
  },
  socialLinks: {
    label: 'Social Links',
    icon: '🔗',
    fields: [
      { key: 'x', type: 'text', label: 'X (handle or URL)', placeholder: '@handle', endpoint: '/dashboard/api/profile/socials' },
      { key: 'youtube', type: 'text', label: 'YouTube URL', placeholder: 'https://youtube.com/...', endpoint: '/dashboard/api/profile/socials' },
      { key: 'twitch', type: 'text', label: 'Twitch URL', placeholder: 'https://twitch.tv/...', endpoint: '/dashboard/api/profile/socials' },
      { key: 'kick', type: 'text', label: 'Kick URL', placeholder: 'https://kick.com/...', endpoint: '/dashboard/api/profile/socials' },
    ],
  },
  stats: {
    label: 'Stats',
    icon: '📊',
    fields: [
      { key: 'enableBreakdown', type: 'toggle', label: 'Show stats breakdown', settingsKey: true },
      { key: 'marketability', type: 'toggle', label: 'Show marketability grade', sectionKey: 'marketability' },
    ],
  },
  buttons: {
    label: 'Buttons',
    icon: '🔘',
    fields: [
      { key: 'buttons', type: 'button-list', label: 'Custom Buttons' },
    ],
  },
  sponsors: {
    label: 'Sponsors',
    icon: '🤝',
    fields: [
      { key: 'sponsors', type: 'sponsor-list', label: 'Sponsors' },
    ],
  },
  tipJar: {
    label: 'Tip Jar',
    icon: '💰',
    fields: [
      { key: 'headline', type: 'text', label: 'Headline', settingsKey: true, endpoint: '/dashboard/api/profile/layout' },
      { key: 'primaryUrl', type: 'text', label: 'Primary URL', settingsKey: true, endpoint: '/dashboard/api/profile/layout' },
      { key: 'primaryLabel', type: 'text', label: 'Primary Label', settingsKey: true, endpoint: '/dashboard/api/profile/layout' },
      { key: 'secondaryUrl', type: 'text', label: 'Secondary URL', settingsKey: true, endpoint: '/dashboard/api/profile/layout' },
      { key: 'secondaryLabel', type: 'text', label: 'Secondary Label', settingsKey: true, endpoint: '/dashboard/api/profile/layout' },
    ],
  },
  tts: {
    label: 'TTS',
    icon: '🎙️',
    fields: [
      { key: 'tts_enabled', type: 'toggle', label: 'Enable TTS on profile', settingsKey: true, endpoint: '/dashboard/api/profile/layout' },
    ],
  },
  background: {
    label: 'Background',
    icon: '🖼️',
    fields: [
      { key: 'cover_image_url', type: 'image-upload', label: 'Cover / Background Image' },
    ],
  },
  contact: {
    label: 'Contact',
    icon: '✉️',
    fields: [
      { key: 'headline', type: 'text', label: 'Headline', settingsKey: true, endpoint: '/dashboard/api/profile/layout' },
      { key: 'description', type: 'textarea', label: 'Description', settingsKey: true, endpoint: '/dashboard/api/profile/layout' },
      { key: 'placeholder', type: 'text', label: 'Input placeholder', settingsKey: true, endpoint: '/dashboard/api/profile/layout' },
      { key: 'buttonLabel', type: 'text', label: 'Button label', settingsKey: true, endpoint: '/dashboard/api/profile/layout' },
    ],
  },
};

/**
 * Get the property schema for a section type.
 * Pure function — no side effects.
 * @param {string} sectionType
 * @returns {object|null}
 */
export function getSectionSchema(sectionType) {
  return SECTION_SCHEMAS[sectionType] || null;
}

/**
 * Get all section types in default order.
 * @returns {string[]}
 */
export function getAllSectionTypes() {
  return Object.keys(SECTION_SCHEMAS);
}

// ── Selection state ───────────────────────────────────────────────────────────

/**
 * Compute the next selection state.
 * Pure function — no side effects.
 * @param {string|null} currentSelected
 * @param {{ type: 'select'|'deselect', sectionType?: string }} action
 * @returns {string|null}
 */
export function applySelectionAction(currentSelected, action) {
  if (!action) return currentSelected;
  if (action.type === 'deselect') return null;
  if (action.type === 'select') {
    // Toggle: selecting the same section deselects it
    if (action.sectionType === currentSelected) return null;
    return action.sectionType || null;
  }
  return currentSelected;
}

// ── Layout mutations ──────────────────────────────────────────────────────────

/**
 * Return a new layout with the given section's visibility updated.
 * Pure function — does NOT mutate the input layout.
 * @param {object} layout
 * @param {string} sectionType
 * @param {boolean} visible
 * @returns {object}
 */
export function toggleSectionVisibility(layout, sectionType, visible) {
  const sections = Array.isArray(layout?.sections) ? layout.sections : [];
  const exists = sections.some(s => s.type === sectionType);

  const newSections = exists
    ? sections.map(s => s.type === sectionType ? { ...s, visible } : s)
    : [...sections, { type: sectionType, visible, settings: {} }];

  return { ...layout, sections: newSections };
}

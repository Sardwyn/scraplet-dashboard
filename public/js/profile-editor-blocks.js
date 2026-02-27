// /dashboard/profile-assets/js/profile-editor-blocks.js
// Handles the "Sections & Order" (blocks) list + per-block settings.
// Schema-driven via BLOCK_DEFS and stores per-block settings
// under layout.sections[].settings.

import { editorState } from "/dashboard/profile-assets/js/profile-editor-core.js";
import { persistLayout } from "/dashboard/profile-assets/js/profile-editor-layout.js";

const listEl = document.getElementById("pe-blocks-list");
const settingsEl = document.getElementById("pe-block-settings");
const settingsBodyEl = document.getElementById("pe-block-settings-body");

// Remember which block is "selected" for settings
let activeBlockType = null;

if (!listEl) {
  console.warn("[profile-editor-blocks] #pe-blocks-list not found");
}

// -----------------------------------------------------------------------------
// Block registry (v1 + Sponsors + Tip Jar + Contact)
// -----------------------------------------------------------------------------

const BLOCK_DEFS = {
  avatar: {
    key: "avatar",
    title: "Avatar",
    hasSettings: false,
  },
  socialLinks: {
    key: "socialLinks",
    title: "Social Links",
    hasSettings: false,
  },
  stats: {
    key: "stats",
    title: "Stats",
    hasSettings: true, // owns the breakdown flip setting
  },
  marketability: {
    key: "marketability",
    title: "Marketability Score",
    hasSettings: false,
  },
  bio: {
    key: "bio",
    title: "Bio",
    hasSettings: false,
  },
  buttons: {
    key: "buttons",
    title: "Buttons",
    hasSettings: false,
  },
  sponsors: {
    key: "sponsors",
    title: "Sponsors",
    hasSettings: true, // simple headline setting for now
  },
  tipJar: {
    key: "tipJar",
    title: "Tip Jar",
    hasSettings: true,
  },
  contact: {
    key: "contact",
    title: "Contact",
    hasSettings: true,
  },
  tts: {
    key: 'tts',
    title: 'TTS',
    hasSettings: true,
  },
};

// Core types we always care about and want to expose as blocks
const CORE_TYPES = Object.keys(BLOCK_DEFS);

// Internal-only section types that should never appear as independent
// rows in the inspector (owned by other blocks' settings).
const INTERNAL_TYPES = ["statsBreakdown"];

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

function getBlockDef(type) {
  return BLOCK_DEFS[type] || null;
}

function defaultBlockTitle(type) {
  const def = getBlockDef(type);
  if (def) return def.title;
  if (!type) return "Section";
  return type.charAt(0).toUpperCase() + type.slice(1);
}

// Normalise one section object to the canonical shape:
// { type, visible, settings }
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

// Get the sections array out of editorState in a normalised way
function getNormalisedSections() {
  const rawSections = Array.isArray(editorState.layout?.sections)
    ? editorState.layout.sections
    : [];

  const sectionsByType = new Map();

  rawSections.forEach((raw) => {
    if (!raw || !raw.type) return;
    const norm = normaliseSection(raw, raw.type);
    if (!norm) return;
    if (!sectionsByType.has(norm.type)) {
      sectionsByType.set(norm.type, norm);
    }
  });

  return sectionsByType;
}

// -----------------------------------------------------------------------------
// Blocks list model
// -----------------------------------------------------------------------------

// Build UI-facing blocks from layout + meta.
// This guarantees that core sections always appear, and hides INTERNAL_TYPES.
function getBlocksFromState() {
  const sectionsByType = getNormalisedSections();
  const blocksByType = new Map();

  if (Array.isArray(editorState.blocks)) {
    editorState.blocks.forEach((b) => {
      if (!b || !b.type) return;
      if (!blocksByType.has(b.type)) {
        blocksByType.set(b.type, b);
      }
    });
  }

  const typesToShow = [];

  // Always show core sections (ensures "buttons", "sponsors", "tipJar", "contact" are present)
  CORE_TYPES.forEach((t) => {
    if (INTERNAL_TYPES.includes(t)) return;
    if (!typesToShow.includes(t)) typesToShow.push(t);
  });

  // Then append any extra layout-defined, non-internal sections
  sectionsByType.forEach((_, t) => {
    if (INTERNAL_TYPES.includes(t)) return;
    if (!typesToShow.includes(t)) typesToShow.push(t);
  });

  return typesToShow.map((type, index) => {
    const section = sectionsByType.get(type) || null;
    const blockMeta = blocksByType.get(type) || {};
    const def = getBlockDef(type);

    const visible = section ? section.visible : true;

    return {
      id: (section && section.id) || type,
      type,
      title: blockMeta.title || (def && def.title) || defaultBlockTitle(type),
      visible,
      order: index,
    };
  });
}

// -----------------------------------------------------------------------------
// Block settings UI
// -----------------------------------------------------------------------------

// Find (or create) a section object for a given type and return it.
function ensureSectionForType(type) {
  editorState.layout = editorState.layout || {};
  const sections = Array.isArray(editorState.layout.sections)
    ? editorState.layout.sections
    : [];

  let section = sections.find((s) => s && s.type === type) || null;

  if (!section) {
    const norm = normaliseSection(null, type);
    section = norm || { type, visible: true, settings: {} };
    sections.push(section);
    editorState.layout.sections = sections;
  } else {
    // Make sure it has the canonical shape
    const norm = normaliseSection(section, type);
    section.type = norm.type;
    section.visible = norm.visible;
    section.settings = norm.settings;
  }

  return section;
}

// Right-hand / inline block settings UI
function renderBlockSettings(block) {
  if (!settingsEl || !settingsBodyEl) return;

  if (!block) {
    settingsEl.classList.add("hidden");
    settingsBodyEl.innerHTML = "";
    return;
  }

  settingsEl.classList.remove("hidden");

  // --- Stats block: control stats breakdown flip ---
  if (block.type === "stats") {
    const enabled =
      !editorState.sectionVisibility ||
      editorState.sectionVisibility.statsBreakdown !== false;

    settingsBodyEl.innerHTML = `
      <div class="pe-block-settings-group">
        <p class="pe-block-settings-description">
          Control the extra stats breakdown flip on your public card.
        </p>
        <label class="pe-block-settings-toggle">
          <input type="checkbox" id="pe-stats-breakdown-toggle" ${enabled ? "checked" : ""}>
          <span>Enable stats breakdown flip</span>
        </label>
        <p class="pe-block-settings-hint">
          When enabled, viewers can tap the stats pill on your public profile to flip the card
          and see a more detailed breakdown.
        </p>
      </div>
    `;

    const checkbox = document.getElementById("pe-stats-breakdown-toggle");
    if (checkbox) {
      checkbox.addEventListener("change", async () => {
        const checked = checkbox.checked;

        // Ensure visibility map exists
        editorState.sectionVisibility = editorState.sectionVisibility || {};
        editorState.sectionVisibility.statsBreakdown = checked;

        // Keep the underlying layout toggle in sync if it exists
        const layoutToggle = document.querySelector(
          '.pe-section-toggle[data-section="statsBreakdown"]'
        );
        if (layoutToggle) {
          layoutToggle.checked = checked;
        }

        try {
          await persistLayout();
        } catch (err) {
          console.error(
            "[profile-editor-blocks] Failed to persist stats block settings",
            err
          );
        }

        if (window.updatePreview) {
          window.updatePreview();
        }
      });
    }

  // --- Sponsors block: control headline text (stored in layout.sections.settings) ---
  } else if (block.type === "sponsors") {
    const sponsorsSection = ensureSectionForType("sponsors");
    const sponsorsSettings = sponsorsSection.settings || {};
    const currentHeadline = sponsorsSettings.headline || "Sponsors";

    settingsBodyEl.innerHTML = `
      <div class="pe-block-settings-group">
        <p class="pe-block-settings-description">
          Control how the sponsors section is labeled on your public card.
        </p>
        <label class="block mb-2">
          <span class="pe-block-settings-label">Sponsors headline</span>
          <input
            type="text"
            id="pe-sponsors-headline"
            class="w-full rounded bg-slate-700 border border-slate-600 px-2 py-1 text-sm"
            value="${currentHeadline.replace(/"/g, "&quot;")}"
          />
        </label>
        <p class="pe-block-settings-hint">
          This text appears above your sponsor logos / banners on the card.
        </p>
      </div>
    `;

    const headlineInput = document.getElementById("pe-sponsors-headline");
    if (headlineInput) {
      const saveHeadline = async () => {
        const value = headlineInput.value.trim() || "Sponsors";

        const sectionNow = ensureSectionForType("sponsors");
        sectionNow.settings = sectionNow.settings || {};
        sectionNow.settings.headline = value;

        try {
          await persistLayout();
        } catch (err) {
          console.error(
            "[profile-editor-blocks] Failed to persist sponsors block settings",
            err
          );
        }

        if (window.updatePreview) {
          window.updatePreview();
        }
      };

      // Save on blur + Enter key
      headlineInput.addEventListener("blur", saveHeadline);
      headlineInput.addEventListener("keydown", (evt) => {
        if (evt.key === "Enter") {
          evt.preventDefault();
          headlineInput.blur();
        }
      });
    }

  // --- Tip Jar block: headline + primary / secondary CTAs ---
  } else if (block.type === "tipJar") {
    const tipSection = ensureSectionForType("tipJar");
    tipSection.settings = tipSection.settings || {};
    const settings = tipSection.settings;

    const headline = settings.headline || "Tip Jar";
    const primaryLabel = settings.primaryLabel || "Tip on Kick";
    const primaryUrl = settings.primaryUrl || "";
    const secondaryLabel = settings.secondaryLabel || "";
    const secondaryUrl = settings.secondaryUrl || "";

    settingsBodyEl.innerHTML = `
      <div class="pe-block-settings-group">
        <p class="pe-block-settings-description">
          Add one or two calls-to-action for viewers who want to tip you.
        </p>

        <label class="block mb-2">
          <span class="pe-block-settings-label">Headline</span>
          <input
            type="text"
            id="pe-tip-headline"
            class="w-full rounded bg-slate-700 border border-slate-600 px-2 py-1 text-sm"
            value="${headline.replace(/"/g, "&quot;")}"
          />
        </label>

        <label class="block mb-2">
          <span class="pe-block-settings-label">Primary button label</span>
          <input
            type="text"
            id="pe-tip-primary-label"
            class="w-full rounded bg-slate-700 border border-slate-600 px-2 py-1 text-sm"
            value="${primaryLabel.replace(/"/g, "&quot;")}"
          />
        </label>

        <label class="block mb-2">
          <span class="pe-block-settings-label">Primary URL</span>
          <input
            type="text"
            id="pe-tip-primary-url"
            class="w-full rounded bg-slate-700 border border-slate-600 px-2 py-1 text-sm"
            value="${primaryUrl.replace(/"/g, "&quot;")}"
          />
        </label>

        <label class="block mb-2">
          <span class="pe-block-settings-label">Secondary button label (optional)</span>
          <input
            type="text"
            id="pe-tip-secondary-label"
            class="w-full rounded bg-slate-700 border border-slate-600 px-2 py-1 text-sm"
            value="${secondaryLabel.replace(/"/g, "&quot;")}"
          />
        </label>

        <label class="block mb-2">
          <span class="pe-block-settings-label">Secondary URL (optional)</span>
          <input
            type="text"
            id="pe-tip-secondary-url"
            class="w-full rounded bg-slate-700 border border-slate-600 px-2 py-1 text-sm"
            value="${secondaryUrl.replace(/"/g, "&quot;")}"
          />
        </label>

        <p class="pe-block-settings-hint">
          URLs can be Kick, PayPal, Ko-fi, Stripe payment links, or anything else. In V2 you'll be able to hook Stripe directly.
        </p>
      </div>
    `;

    const ids = [
      "pe-tip-headline",
      "pe-tip-primary-label",
      "pe-tip-primary-url",
      "pe-tip-secondary-label",
      "pe-tip-secondary-url",
    ];

    const save = async () => {
      const get = (id) => {
        const el = document.getElementById(id);
        return el ? el.value.trim() : "";
      };

      tipSection.settings = {
        headline: get("pe-tip-headline") || "Tip Jar",
        primaryLabel: get("pe-tip-primary-label") || "Tip on Kick",
        primaryUrl: get("pe-tip-primary-url"),
        secondaryLabel: get("pe-tip-secondary-label"),
        secondaryUrl: get("pe-tip-secondary-url"),
      };

      try {
        await persistLayout();
      } catch (err) {
        console.error(
          "[profile-editor-blocks] Failed to persist tipJar settings",
          err
        );
      }

      if (window.updatePreview) {
        window.updatePreview();
      }
    };

    ids.forEach((id) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.addEventListener("blur", save);
      el.addEventListener("keydown", (evt) => {
        if (evt.key === "Enter") {
          evt.preventDefault();
          el.blur();
        }
      });
    });



  // --- TTS block: headline + subtext + max chars + (future) product/price wiring ---
  } else if (block.type === "tts") {
    const ttsSection = ensureSectionForType("tts");
    ttsSection.settings = ttsSection.settings || {};
    const settings = ttsSection.settings;

    const headline = settings.headline || "Send TTS";
    const subtext = settings.subtext || "Max 250 chars • Plays in queue";
    const badge = settings.badge || settings.priceLabel || "SOON";
    const placeholder = settings.placeholder || "Say something fun…";

    const maxCharsRaw = settings.maxChars || settings.max_chars || 250;
    const maxCharsNum = Number(maxCharsRaw);
    const maxChars = Number.isFinite(maxCharsNum)
      ? Math.max(10, Math.min(500, Math.floor(maxCharsNum)))
      : 250;

    const productId = settings.productId || settings.product_id || "default";

    settingsBodyEl.innerHTML = `
      <div class="pe-block-settings-group">
        <p class="pe-block-settings-description">
          This block shows a big “Send TTS” button on your public profile. For now it’s UI-only (paid flow comes next).
        </p>

        <label class="block mb-2">
          <span class="pe-block-settings-label">Button label</span>
          <input
            type="text"
            id="pe-tts-headline"
            class="w-full rounded bg-slate-700 border border-slate-600 px-2 py-1 text-sm"
            value="${headline.replace(/\"/g, '&quot;')}"
          />
        </label>

        <label class="block mb-2">
          <span class="pe-block-settings-label">Subtext</span>
          <input
            type="text"
            id="pe-tts-subtext"
            class="w-full rounded bg-slate-700 border border-slate-600 px-2 py-1 text-sm"
            value="${subtext.replace(/\"/g, '&quot;')}"
          />
        </label>

        <div class="grid grid-cols-2 gap-3">
          <label class="block mb-2">
            <span class="pe-block-settings-label">Badge text</span>
            <input
              type="text"
              id="pe-tts-badge"
              class="w-full rounded bg-slate-700 border border-slate-600 px-2 py-1 text-sm"
              value="${String(badge).replace(/\"/g, '&quot;')}"
            />
          </label>

          <label class="block mb-2">
            <span class="pe-block-settings-label">Max characters</span>
            <input
              type="number"
              id="pe-tts-maxchars"
              min="10"
              max="500"
              class="w-full rounded bg-slate-700 border border-slate-600 px-2 py-1 text-sm"
              value="${Number(maxChars)}"
            />
          </label>
        </div>

        <label class="block mb-2">
          <span class="pe-block-settings-label">Textarea placeholder</span>
          <input
            type="text"
            id="pe-tts-placeholder"
            class="w-full rounded bg-slate-700 border border-slate-600 px-2 py-1 text-sm"
            value="${String(placeholder).replace(/\"/g, '&quot;')}"
          />
        </label>

        <label class="block mb-2">
          <span class="pe-block-settings-label">Product ID (future Stripe mapping)</span>
          <input
            type="text"
            id="pe-tts-productid"
            class="w-full rounded bg-slate-700 border border-slate-600 px-2 py-1 text-sm"
            value="${String(productId).replace(/\"/g, '&quot;')}"
          />
        </label>

        <p class="pe-block-settings-hint">
          Next step: we’ll wire this to Stripe (or Kick tips) so viewers pay first, then the TTS queues.
        </p>
      </div>
    `;

    const ids = [
      "pe-tts-headline",
      "pe-tts-subtext",
      "pe-tts-badge",
      "pe-tts-maxchars",
      "pe-tts-placeholder",
      "pe-tts-productid",
    ];

    const save = async () => {
      const get = (id) => {
        const el = document.getElementById(id);
        return el ? el.value : "";
      };

      const maxV = Number(get("pe-tts-maxchars"));
      const maxSafe = Number.isFinite(maxV)
        ? Math.max(10, Math.min(500, Math.floor(maxV)))
        : 250;

      ttsSection.settings = {
        headline: (get("pe-tts-headline") || "").trim() || "Send TTS",
        subtext: (get("pe-tts-subtext") || "").trim() || `Max ${maxSafe} chars • Plays in queue`,
        badge: (get("pe-tts-badge") || "").trim() || "SOON",
        maxChars: maxSafe,
        placeholder: (get("pe-tts-placeholder") || "").trim() || "Say something fun…",
        productId: (get("pe-tts-productid") || "").trim() || "default",
      };

      try {
        await persistLayout();
      } catch (err) {
        console.error("[profile-editor-blocks] Failed to persist tts settings", err);
      }

      if (window.updatePreview) {
        window.updatePreview();
      }
    };

    ids.forEach((id) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.addEventListener("blur", save);
      el.addEventListener("keydown", (evt) => {
        if (evt.key === "Enter") {
          evt.preventDefault();
          el.blur();
        }
      });
    });
  // --- Contact block: headline + description + email placeholder/button ---
  } else if (block.type === "contact") {
    const contactSection = ensureSectionForType("contact");
    contactSection.settings = contactSection.settings || {};
    const settings = contactSection.settings;

    const headline =
      settings.headline || "Stay in touch";
    const description =
      settings.description || "Drop your email to get updates when I go live.";
    const placeholder =
      settings.placeholder || "you@example.com";
    const buttonLabel =
      settings.buttonLabel || "Notify me";

    settingsBodyEl.innerHTML = `
      <div class="pe-block-settings-group">
        <p class="pe-block-settings-description">
          Configure the contact form shown on your public card. Later this will feed into your dashboard for email notifications.
        </p>

        <label class="block mb-2">
          <span class="pe-block-settings-label">Headline</span>
          <input
            type="text"
            id="pe-contact-headline"
            class="w-full rounded bg-slate-700 border border-slate-600 px-2 py-1 text-sm"
            value="${headline.replace(/"/g, "&quot;")}"
          />
        </label>

        <label class="block mb-2">
          <span class="pe-block-settings-label">Description</span>
          <textarea
            id="pe-contact-description"
            rows="2"
            class="w-full rounded bg-slate-700 border border-slate-600 px-2 py-1 text-sm"
          >${description.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</textarea>
        </label>

        <label class="block mb-2">
          <span class="pe-block-settings-label">Email placeholder</span>
          <input
            type="text"
            id="pe-contact-placeholder"
            class="w-full rounded bg-slate-700 border border-slate-600 px-2 py-1 text-sm"
            value="${placeholder.replace(/"/g, "&quot;")}"
          />
        </label>

        <label class="block mb-2">
          <span class="pe-block-settings-label">Button label</span>
          <input
            type="text"
            id="pe-contact-button-label"
            class="w-full rounded bg-slate-700 border border-slate-600 px-2 py-1 text-sm"
            value="${buttonLabel.replace(/"/g, "&quot;")}"
          />
        </label>

        <p class="pe-block-settings-hint">
          In V2, submissions here will be saved under your account for email marketing and go-live notifications.
        </p>
      </div>
    `;

    const ids = [
      "pe-contact-headline",
      "pe-contact-description",
      "pe-contact-placeholder",
      "pe-contact-button-label",
    ];

    const save = async () => {
      const get = (id) => {
        const el = document.getElementById(id);
        return el ? el.value.trim() : "";
      };

      contactSection.settings = {
        headline: get("pe-contact-headline") || "Stay in touch",
        description: get("pe-contact-description") || "",
        placeholder: get("pe-contact-placeholder") || "you@example.com",
        buttonLabel: get("pe-contact-button-label") || "Notify me",
      };

      try {
        await persistLayout();
      } catch (err) {
        console.error(
          "[profile-editor-blocks] Failed to persist contact settings",
          err
        );
      }

      if (window.updatePreview) {
        window.updatePreview();
      }
    };

    ids.forEach((id) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.addEventListener("blur", save);
      el.addEventListener("keydown", (evt) => {
        if (evt.key === "Enter") {
          evt.preventDefault();
          el.blur();
        }
      });
    });

  } else {
    // Placeholder for other blocks (we'll flesh these out in later phases)
    settingsBodyEl.innerHTML = `
      <p class="pe-block-settings-description">
        No specific options for this block yet.
      </p>
    `;
  }
}

// -----------------------------------------------------------------------------
// Blocks list rendering
// -----------------------------------------------------------------------------

function renderBlocksList() {
  if (!listEl) return;

  const blocks = getBlocksFromState();
  listEl.innerHTML = "";

  let currentActiveBlock = null;

  if (!blocks.length) {
    if (settingsEl && settingsBodyEl) {
      settingsEl.classList.add("hidden");
      settingsBodyEl.innerHTML = "";
    }

    const empty = document.createElement("div");
    empty.className = "text-xs text-slate-500";
    empty.textContent =
      "Sections will appear here once layout is initialised.";
    listEl.appendChild(empty);
    return;
  }

  blocks.forEach((block) => {
    const row = document.createElement("div");
    row.className = "pe-block-row";
    row.dataset.blockType = block.type;

    // Default first block as active if nothing selected yet
    if (activeBlockType === null) {
      activeBlockType = block.type;
    }

    if (activeBlockType === block.type) {
      row.classList.add("pe-block-row--active");
      currentActiveBlock = block;
    }

    // Clicking row selects block + shows settings
    row.addEventListener("click", () => {
      activeBlockType = block.type;
      renderBlocksList();
      renderBlockSettings(block);
    });

    const left = document.createElement("div");
    left.className = "pe-block-row-main";

    const handle = document.createElement("span");
    handle.className = "pe-block-row-handle";
    handle.textContent = "☰";

    const title = document.createElement("span");
    title.className = "pe-block-row-title";
    title.textContent = block.title;

    left.appendChild(handle);
    left.appendChild(title);

    const meta = document.createElement("span");
    meta.className = "pe-block-row-meta";
    meta.textContent = block.visible ? "Visible" : "Hidden";

    row.appendChild(left);
    row.appendChild(meta);

    listEl.appendChild(row);
  });

  // Ensure the settings panel matches the current active block
  renderBlockSettings(currentActiveBlock);
}

// -----------------------------------------------------------------------------
// Drag-reorder blocks -> update layout.sections
// -----------------------------------------------------------------------------

function setupSortableBlocks() {
  if (!listEl || !window.Sortable) return;

  window.Sortable.create(listEl, {
    animation: 120,
    handle: ".pe-block-row-handle",
    onEnd: async () => {
      const items = Array.from(listEl.children);
      const newOrderTypes = items
        .map((el) => el.dataset.blockType)
        .filter((t) => !!t);

      if (!newOrderTypes.length) return;

      const existingSections = Array.isArray(editorState.layout?.sections)
        ? editorState.layout.sections
        : [];

      const byType = new Map();
      existingSections.forEach((s) => {
        if (!s || !s.type) return;
        const norm = normaliseSection(s, s.type);
        if (!norm) return;
        if (!byType.has(norm.type)) {
          byType.set(norm.type, norm);
        }
      });

      const reordered = [];

      // First, follow the new order dictated by the inspector
      newOrderTypes.forEach((type) => {
        let section = byType.get(type);
        if (!section) {
          section = normaliseSection(null, type) || {
            type,
            visible: true,
            settings: {},
          };
        }
        reordered.push(section);
        byType.delete(type);
      });

      // Then append leftover (unknown/legacy/internal) sections
      byType.forEach((section) => {
        reordered.push(section);
      });

      editorState.layout = editorState.layout || {};
      editorState.layout.sections = reordered;

      try {
        await persistLayout();
      } catch (err) {
        console.error(
          "[profile-editor-blocks] Failed to persist reordered layout",
          err
        );
      }
    },
  });
}

// -----------------------------------------------------------------------------
// Entry point used from profile-editor.ejs
// -----------------------------------------------------------------------------

export function setupBlocksModule() {
  if (!listEl) return;

  renderBlocksList();
  setupSortableBlocks();

  // Re-render list (and thus settings) whenever a layout section toggle changes
  const toggles = document.querySelectorAll(".pe-section-toggle");
  toggles.forEach((tog) => {
    tog.addEventListener("change", () => {
      renderBlocksList();
    });
  });
}

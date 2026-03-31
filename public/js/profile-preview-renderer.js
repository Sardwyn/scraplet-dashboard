// /dashboard/profile-assets/js/profile-preview-renderer.js
// Editor preview card.
// V2: driven entirely by layout.sections + sectionVisibility.
// Includes full button logic: tiles, sizes, pairing, + add link tile.

export let rendererState = {};

/**
 * Replace the in-memory renderer state.
 */
export function updateRendererState(next) {
  if (typeof structuredClone === "function") {
    rendererState = structuredClone(next || {});
  } else {
    rendererState = JSON.parse(JSON.stringify(next || {}));
  }
}

// =====================================================
// Helpers
// =====================================================

function isSectionVisible(sectionVisibility, key) {
  if (!sectionVisibility) return true;
  if (Object.prototype.hasOwnProperty.call(sectionVisibility, key)) {
    return sectionVisibility[key] !== false;
  }
  return true;
}

function getSections(layout) {
  const raw = layout && Array.isArray(layout.sections) ? layout.sections : [];
  if (raw.length) return raw;

  // Fallback legacy ordering if nothing in layout
  const types = ["avatar", "bio", "socialLinks", "stats", "buttons"];
  return types.map((type) => ({ type, visible: true }));
}

// =====================================================
// Section builders
// =====================================================

function buildAvatar(profile = {}) {
  const displayName =
    profile.display_name ||
    profile.username ||
    "Your name";

  const username = profile.username || "";

  const avatarUrl =
    profile.avatar_url ||
    "/dashboard/profile-assets/img/default-avatar.png";

  return `
    <div class="pc-identity">
      <div class="pc-avatar-shell">
        ${
          avatarUrl
            ? `<img src="${escapeAttribute(avatarUrl)}" class="pc-avatar" alt="" />`
            : `<div class="pc-avatar pc-avatar-placeholder"></div>`
        }
      </div>

      <div>
        <div class="pc-display-name">
          ${escapeHtml(displayName)}
        </div>
        ${
          username
            ? `<div class="pc-username">@${escapeHtml(username)}</div>`
            : ""
        }
      </div>
    </div>
  `;
}

function buildSocialRow(profile = {}) {
  const x = (profile.x_username || profile.x || "").trim();
  const youtube = (profile.youtube_url || profile.youtube || "").trim();
  const twitch = (profile.twitch_url || profile.twitch || "").trim();
  const kick = (profile.kick_url || profile.kick || "").trim();

  const pills = [];

  if (x) {
    const cleaned = x.replace(/^@/, "");
    const href = cleaned.startsWith("http")
      ? cleaned
      : `https://x.com/${encodeURIComponent(cleaned)}`;
    pills.push(
      `<a class="pc-social-pill" href="${escapeAttribute(
        href
      )}" target="_blank" rel="noopener noreferrer">X</a>`
    );
  }

  if (youtube) {
    const href = youtube.startsWith("http")
      ? youtube
      : `https://youtube.com/${escapeAttribute(youtube)}`;
    pills.push(
      `<a class="pc-social-pill" href="${escapeAttribute(
        href
      )}" target="_blank" rel="noopener noreferrer">YT</a>`
    );
  }

  if (twitch) {
    const cleaned = twitch.replace(/^@/, "");
    const href = cleaned.startsWith("http")
      ? cleaned
      : `https://twitch.tv/${escapeAttribute(cleaned)}`;
    pills.push(
      `<a class="pc-social-pill" href="${escapeAttribute(
        href
      )}" target="_blank" rel="noopener noreferrer">Tw</a>`
    );
  }

  if (kick) {
    const cleaned = kick.replace(/^@/, "");
    const href = cleaned.startsWith("http")
      ? cleaned
      : `https://kick.com/${escapeAttribute(cleaned)}`;
    pills.push(
      `<a class="pc-social-pill" href="${escapeAttribute(
        href
      )}" target="_blank" rel="noopener noreferrer">K</a>`
    );
  }

  if (!pills.length) return "";

  return `
    <div class="pc-social-row">
      ${pills.join("\n")}
    </div>
  `;
}

function buildStats(stats = {}) {
  const totalFollowers =
    typeof stats.totalFollowers === "number" ? stats.totalFollowers : null;

  const label = totalFollowers
    ? `${totalFollowers.toLocaleString()} Total Followers`
    : "Total Followers";

  return `
    <div class="pc-stats-row">
      <div class="pc-stats-pill">
        <span class="pc-stats-dot"></span>
        <span class="pc-stats-label">${escapeHtml(label)}</span>
      </div>
    </div>
  `;
}

function buildBio(profile = {}) {
  if (!profile.bio) return "";
  return `<p class="pc-bio">${escapeHtml(profile.bio)}</p>`;
}

function buildTipJarSection(section = {}) {
  const settings = (section && section.settings) || {};
  const headline =
    settings.headline && settings.headline.trim()
      ? settings.headline
      : "Tip Jar";

  const primaryLabel = (settings.primaryLabel || "").trim();
  const primaryUrl = (settings.primaryUrl || "").trim();
  const secondaryLabel = (settings.secondaryLabel || "").trim();
  const secondaryUrl = (settings.secondaryUrl || "").trim();

  const hasPrimary = primaryLabel && primaryUrl;
  const hasSecondary = secondaryLabel && secondaryUrl;

  if (!hasPrimary && !hasSecondary) return "";

  const buttons = [];

  if (hasPrimary) {
    buttons.push(`
      <a
        href="${escapeAttribute(primaryUrl)}"
        target="_blank"
        rel="noopener noreferrer"
        class="pc-button pc-button--shape-pill pc-button--size-md"
      >
        <span class="pc-button-label">${escapeHtml(primaryLabel)}</span>
      </a>
    `);
  }

  if (hasSecondary) {
    buttons.push(`
      <a
        href="${escapeAttribute(secondaryUrl)}"
        target="_blank"
        rel="noopener noreferrer"
        class="pc-button pc-button--shape-pill pc-button--size-md"
      >
        <span class="pc-button-label">${escapeHtml(secondaryLabel)}</span>
      </a>
    `);
  }

  return `
    <section class="pc-tipjar">
      <div class="pc-tipjar-title">${escapeHtml(headline)}</div>
      <div class="pc-tipjar-buttons">
        ${buttons.join("\n")}
      </div>
    </section>
  `;
}

function buildContactSection(section = {}) {
  const settings = (section && section.settings) || {};
  const headline =
    settings.headline && settings.headline.trim()
      ? settings.headline
      : "Stay in touch";
  const description = (settings.description || "").trim();
  const placeholder =
    settings.placeholder && settings.placeholder.trim()
      ? settings.placeholder
      : "you@example.com";
  const buttonLabel =
    settings.buttonLabel && settings.buttonLabel.trim()
      ? settings.buttonLabel
      : "Notify me";

  return `
    <section class="pc-contact">
      <div class="pc-contact-title">${escapeHtml(headline)}</div>
      ${description
        ? `<p class="pc-contact-text">${escapeHtml(description)}</p>`
        : ""}
      <form class="pc-contact-form" data-contact-form="true">
        <input
          type="email"
          name="email"
          class="pc-contact-input"
          placeholder="${escapeAttribute(placeholder)}"
          required
        />
        <button type="button" class="pc-contact-button">
          ${escapeHtml(buttonLabel)}
        </button>
      </form>
      <div class="pc-contact-feedback" hidden>
        Thanks — you’re on the list.
      </div>
    </section>
  `;
}

function buildTtsSection(section = {}, profile = {}) {
  const settings = (section && section.settings) || {};

  const headline = (settings.headline || "Send TTS").trim() || "Send TTS";
  const subtext  = (settings.subtext || "Max 250 chars • Plays in queue").trim();
  const badge    = String(settings.badge || settings.priceLabel || "SOON").trim();
  const productId = String(settings.productId || settings.product_id || "default").trim() || "default";

  const placeholder = String(settings.placeholder || "Say something fun…");
  const maxCharsRaw = settings.maxChars || settings.max_chars || 250;
  const maxCharsNum = Number(maxCharsRaw);
  const maxChars = Number.isFinite(maxCharsNum)
    ? Math.max(10, Math.min(500, Math.floor(maxCharsNum)))
    : 250;

  const username =
    (profile && (profile.username || profile.slug)) ? String(profile.username || profile.slug) : "";

  const label = `🎙️ ${headline}${badge ? " " + badge : ""}`;

  return `
    <!-- Use Tip Jar wrapper for consistent spacing + sizing -->
    <section class="pc-tipjar">
      <!-- Title matches Tip Jar / block headers -->
      <div class="pc-tipjar-title">${escapeHtml(headline)}</div>

      <!-- Button inside the same buttons wrapper as Tip Jar -->
      <div class="pc-tipjar-buttons">
        <button
          type="button"
          class="pc-button pc-button--shape-pill pc-button--size-md"
          data-tts-open="true"
          data-tts-creator="${escapeAttribute(username)}"
          data-tts-product="${escapeAttribute(productId)}"
          aria-label="${escapeAttribute(headline)}"
        >
          <span class="pc-button-label">${escapeHtml(label)}</span>
        </button>
      </div>

      ${subtext ? `<p class="pc-contact-text">${escapeHtml(subtext)}</p>` : ""}

      <!-- Inline panel scaffold (hidden by default; wired in views/public-profile.ejs) -->
      <div data-tts-panel="true" hidden>
        <!-- Treat the panel like a Contact block so it inherits spacing/typography -->
        <div class="pc-contact-title">${escapeHtml(headline)}</div>
        <p class="pc-contact-text" data-tts-note="true">Paid TTS coming soon.</p>

        <!-- Keep using existing input class; no inline styles -->
        <textarea
          class="pc-contact-input"
          data-tts-input="true"
          rows="3"
          maxlength="${maxChars}"
          placeholder="${escapeAttribute(placeholder)}"
        ></textarea>

        <!-- Reuse the contact form row layout -->
        <div class="pc-contact-form">
          <div class="pc-contact-text" data-tts-counter="true">0 / ${maxChars}</div>
          <button type="button" class="pc-contact-button" data-tts-submit="true" disabled>Send</button>
          <button type="button" class="pc-contact-button" data-tts-close="true">Close</button>
        </div>

        <p class="pc-contact-text">
          Plays once on stream. No refunds after it enters the queue.
        </p>
      </div>
    </section>
  `;
}




// =====================================================
// Buttons (full logic: tiles, sizes, pairing, + add tile)
// =====================================================

function accentMeta(btn) {
  const color = (btn && btn.accent_color) || "";
  let target = ((btn && btn.accent_target) || "button").toLowerCase();
  if (target === "title") target = "label";
  if (target !== "label" && target !== "button") target = "button";

  const style = color ? `--accent-color:${color};` : "";
  return { color, target, style };
}

function renderButtonPill(btn) {
  if (!btn || !btn.url || !btn.label) return "";

  const id = btn.id;
  const size = (btn.size || "sm").toLowerCase();
  const accent = accentMeta(btn);

  const idAttr =
    typeof id === "number" || typeof id === "string"
      ? ` data-button-id="${String(id)}"`
      : "";

  const sizeClass =
    size === "lg"
      ? "pc-button--size-lg"
      : size === "md"
      ? "pc-button--size-md"
      : "pc-button--size-sm";

  const styleAttr = accent.style ? ` style="${accent.style}"` : "";

  return `
    <a
      href="${escapeAttribute(btn.url)}"
      target="_blank"
      class="pc-button pc-button--shape-pill ${sizeClass}"
      data-accent-target="${accent.target}"${idAttr}${styleAttr}
    >
      <span class="pc-button-label">${escapeHtml(btn.label)}</span>
    </a>
  `;
}

function renderButtonTile(btn) {
  if (!btn || !btn.url || !btn.label) return "";

  const id = btn.id;
  const accent = accentMeta(btn);
  const imageUrl = btn.featured_image_url || "";
  const size = (btn.size || "lg").toLowerCase();
  const sizeClass = size === "md" ? "pc-button-tile--md" : "pc-button-tile--lg";

  const idAttr =
    typeof id === "number" || typeof id === "string"
      ? ` data-button-id="${String(id)}"`
      : "";

  const styleParts = [];
  if (imageUrl) {
    styleParts.push(`background-image:url('${escapeAttribute(imageUrl)}')`);
  }
  if (accent.style) {
    styleParts.push(accent.style.replace(/;$/, ""));
  }

  const styleAttr = styleParts.length
    ? ` style="${styleParts.join(";")}"`
    : "";

  return `
    <a
      href="${escapeAttribute(btn.url)}"
      target="_blank"
      class="pc-button-tile ${sizeClass}"
      data-accent-target="${accent.target}"${idAttr}${styleAttr}
    >
      <div class="pc-button-overlay">
        <span class="pc-button-label">${escapeHtml(btn.label)}</span>
      </div>
    </a>
  `;
}

function renderAddButtonTile() {
  return `
    <button
      type="button"
      class="pc-button pc-button--shape-pill pc-button--add pc-button--size-sm"
      id="pc-add-button-card"
    >
      <span class="pc-button-add-icon">+</span>
      <span class="pc-button-add-label">Add another link</span>
    </button>
  `;
}

function renderButtonsSection(customButtons = []) {
  const visibleButtons = (customButtons || []).filter(
    (b) => b && b.visible !== false && b.url && b.label
  );

  const rows = [];
  let i = 0;

  while (i < visibleButtons.length) {
    const btn = visibleButtons[i];
    if (!btn) {
      i++;
      continue;
    }

    const size = (btn.size || "sm").toLowerCase();
    const hasImage = !!btn.featured_image_url;

    // 1) Large with image => full-width tile
    if (size === "lg" && hasImage) {
      rows.push(renderButtonTile(btn));
      i++;
      continue;
    }

    // 2) Medium with image => half-width tiles when paired, otherwise single tile
    if (size === "md" && hasImage) {
      const next = visibleButtons[i + 1];
      const nextIsMdWithImage =
        next &&
        (next.size || "sm").toLowerCase() === "md" &&
        !!next.featured_image_url;

      if (nextIsMdWithImage) {
        const a = renderButtonTile(btn);
        const b = renderButtonTile(next);
        rows.push(`
          <div class="pc-buttons-row pc-buttons-row-md">
            ${a}
            ${b}
          </div>
        `);
        i += 2;
        continue;
      }

      // lone md+image => single tile row
      rows.push(renderButtonTile(btn));
      i++;
      continue;
    }

    // 3) Medium without image => paired pills if possible
    if (size === "md" && !hasImage) {
      const next = visibleButtons[i + 1];
      const nextIsMdNoImage =
        next &&
        (next.size || "sm").toLowerCase() === "md" &&
        !next.featured_image_url;

      if (nextIsMdNoImage) {
        const a = renderButtonPill(btn);
        const b = renderButtonPill(next);
        rows.push(`
          <div class="pc-buttons-row pc-buttons-row-md">
            ${a}
            ${b}
          </div>
        `);
        i += 2;
        continue;
      }

      // lone md => single pill
      rows.push(renderButtonPill(btn));
      i++;
      continue;
    }

    // 4) Everything else (sm, lg without image) => normal pill
    rows.push(renderButtonPill(btn));
    i++;
  }

  // Editor-only: add button tile
  rows.push(renderAddButtonTile());

  if (!rows.length) return "";

  return `
    <div class="pc-buttons">
      ${rows.join("\n")}
    </div>
  `;
}


// =====================================================
// Theme helpers
// =====================================================

function getThemeClasses(appearance = {}) {
  const themeName = (appearance.theme || "midnight").toLowerCase();
  const bgName = (appearance.background || "hero-dark").toLowerCase();
  const btnStyle = (appearance.buttonStyle || "solid").toLowerCase();
  const cardStyle = (appearance.cardStyle || "glass").toLowerCase();

  return [
    `pc-theme-${themeName}`,
    `pc-bg-${bgName}`,
    `pc-btn-${btnStyle}`,
    `pc-card-${cardStyle}`,
  ].join(" ");
}

// =====================================================
// Sponsors (size-aware, Option C behaviour)
// =====================================================

function buildSponsorsSection(section, sponsorsInput) {
  const sponsors = Array.isArray(sponsorsInput)
    ? sponsorsInput.filter((sp) => {
        if (!sp) return false;
        const v = sp.is_active;
        // Treat undefined/null/true/"true"/1/"1" as active
        if (
          v === false ||
          v === "false" ||
          v === 0 ||
          v === "0"
        ) {
          return false;
        }
        return true;
      })
    : [];

  if (!sponsors.length) return "";

  const headline =
    (section &&
      section.settings &&
      section.settings.headline) ||
    "Sponsors";

  const pillsHtml = sponsors
    .map((sp) => {
      if (!sp) return "";

      const href = sp.url || "#";
      const name = sp.name || "";

      const logoUrl = sp.logoUrl || sp.banner_url || null;
      const hasLogo = !!logoUrl;

      // Normalise size: sm/md/lg only.
      const sizeRaw = (sp.size || "sm").toString().toLowerCase();
      const baseSize =
        sizeRaw === "md" || sizeRaw === "lg" ? sizeRaw : "sm";

      // Option C: md/lg with NO image fall back to small pill visually.
      const size = hasLogo ? baseSize : "sm";

      const pillClasses =
        size === "lg"
          ? "pc-sponsor-pill pc-sponsor-pill--lg"
          : size === "md"
          ? "pc-sponsor-pill pc-sponsor-pill--md"
          : "pc-sponsor-pill pc-sponsor-pill--sm";

      const logoClasses =
        size === "lg"
          ? "pc-sponsor-logo pc-sponsor-logo-lg"
          : size === "md"
          ? "pc-sponsor-logo pc-sponsor-logo-md"
          : "pc-sponsor-logo pc-sponsor-logo-sm";

      const logoHtml = hasLogo
        ? `<img src="${escapeAttribute(
            logoUrl
          )}" alt="${escapeAttribute(name)}" class="${logoClasses}" />`
        : "";

      const nameHtml = name
        ? `<span class="pc-sponsor-name">${escapeHtml(
            name
          )}</span>`
        : "";

      return `
        <a
          class="${pillClasses}"
          href="${escapeAttribute(href)}"
          target="${sp.url ? "_blank" : "_self"}"
          rel="${sp.url ? "noopener noreferrer" : ""}"
        >
          ${logoHtml}${nameHtml}
        </a>
      `;
    })
    .join("\n");

  return `
    <section class="pc-sponsors">
      <div class="pc-sponsors-title">${escapeHtml(
        headline
      )}</div>
      <div class="pc-sponsors-strip">
        ${pillsHtml}
      </div>
    </section>
  `;
}


// =====================================================
// Card HTML (for preview)
// =====================================================

export function buildPublicCardHTML(state) {
  const profile = state.profile || {};
  const appearance = state.appearance || {};
  const layout = state.layout || {};
  const sectionVisibility = state.sectionVisibility || {};
  const stats = state.stats || {};
  const customButtons = Array.isArray(state.customButtons)
    ? state.customButtons
    : [];
  const sponsors = Array.isArray(state.sponsors)
    ? state.sponsors
    : [];

  const classNames = getThemeClasses(appearance);
  const sections = getSections(layout);

  const heroImg = profile.cover_image_url || "";

  const heroHTML = `
    <header class="pc-hero">
      ${
        heroImg
          ? `<img src="${escapeAttribute(
              heroImg
            )}" alt="" class="pc-hero-media" />`
          : ""
      }
      <div class="pc-hero-fade"></div>
    </header>
  `;

  const bodyPieces = [];

sections.forEach((section) => {
  const type = section.type;
  if (!type) return;
  if (!isSectionVisible(sectionVisibility, type)) return;

  switch (type) {
    case "avatar":
      bodyPieces.push(buildAvatar(profile));
      break;
    case "socialLinks":
      bodyPieces.push(buildSocialRow(profile));
      break;
    case "stats":
      bodyPieces.push(buildStats(stats));
      break;
    case "bio":
      bodyPieces.push(buildBio(profile));
      break;
    case "buttons":
      bodyPieces.push(renderButtonsSection(customButtons));
      break;
    case "sponsors":
      bodyPieces.push(buildSponsorsSection(section, sponsors));
      break;
    case "tipJar":
      bodyPieces.push(buildTipJarSection(section));
      break;
    case "contact":
      bodyPieces.push(buildContactSection(section));
      break;
    case "tts":
      bodyPieces.push(buildTtsSection(section, profile));
      break;
    default:
      // ignore unknown sections for now
      break;
  }
});


  return `
<article class="pc-card-root ${classNames}">
  ${heroHTML}
  <section class="pc-main">
    ${bodyPieces.join("\n")}
  </section>
</article>
`;
}


/**
 * Mount into #preview-root
 */
// Debounce timer for server-render calls
let _renderDebounceTimer = null;

export function renderPreview() {
  const root = document.getElementById("preview-root");
  if (!root) return;

  // Debounce rapid calls (e.g. while typing)
  clearTimeout(_renderDebounceTimer);
  _renderDebounceTimer = setTimeout(() => _doServerRender(root), 120);
}

async function _doServerRender(root) {
  try {
    const resp = await fetch("/dashboard/api/profile/preview-render", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(rendererState),
    });

    if (!resp.ok) {
      console.warn("[profile-preview-renderer] server render failed:", resp.status);
      // Fallback to client-side render
      root.innerHTML = buildPublicCardHTML(rendererState);
    } else {
      const data = await resp.json();
      if (data.ok && data.html) {
        root.innerHTML = data.html;
      } else {
        root.innerHTML = buildPublicCardHTML(rendererState);
      }
    }
  } catch (err) {
    console.warn("[profile-preview-renderer] fetch error, falling back:", err.message);
    root.innerHTML = buildPublicCardHTML(rendererState);
  }

  // Wire the "+" tile on the card to the sidebar "Add button" control
  const addTile = root.querySelector("#pc-add-button-card");
  if (addTile && !addTile.dataset.boundClick) {
    addTile.dataset.boundClick = "1";
    addTile.addEventListener("click", () => {
      const panelBtn = document.getElementById("pe-add-button");
      if (panelBtn) panelBtn.click();
      const editorSide = document.querySelector(".pe-editor-side");
      if (editorSide) {
        editorSide.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    });
  }

  // Let card DnD module hook into .pc-buttons / [data-button-id]
  if (typeof window.onProfilePreviewRendered === "function") {
    try {
      window.onProfilePreviewRendered();
    } catch (err) {
      console.error("[profile-preview-renderer] onProfilePreviewRendered error", err);
    }
  }
}

// =====================================================
// HTML escaping helpers
// =====================================================

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeAttribute(str) {
  return escapeHtml(str).replace(/'/g, "&#39;");
}

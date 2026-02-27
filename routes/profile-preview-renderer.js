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
      class="pc-button-tile pc-button-tile--lg"
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

    // Large with image => tile
    if (size === "lg" && hasImage) {
      rows.push(renderButtonTile(btn));
      i++;
      continue;
    }

    // Pair two medium buttons if possible (no image)
    if (size === "md" && !hasImage) {
      const next = visibleButtons[i + 1];
      const nextIsMd =
        next &&
        (next.size || "sm").toLowerCase() === "md" &&
        !next.featured_image_url;

      if (nextIsMd) {
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

      rows.push(renderButtonPill(btn));
      i++;
      continue;
    }

    // Default: pill
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

  const classNames = getThemeClasses(appearance);
  const sections = getSections(layout);

  const heroImg = profile.cover_image_url || "";

  const heroHTML = `
    <header class="pc-hero">
      ${
        heroImg
          ? `<img src="${escapeAttribute(heroImg)}" alt="" class="pc-hero-media" />`
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
export function renderPreview() {
  const root = document.getElementById("preview-root");
  if (!root) return;

  root.innerHTML = buildPublicCardHTML(rendererState);

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
      console.error(
        "[profile-preview-renderer] onProfilePreviewRendered error",
        err
      );
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

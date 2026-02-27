// public/dashboard/profile-assets/js/profile-editor-core.js

export let editorState = {};

let basicSaveTimeout = null;
let socialSaveTimeout = null;

export function editorInitState(initial) {
  // Deep clone so we don't mutate the original object
  editorState = structuredClone(initial || {});

  // Ensure layout + sectionVisibility objects exist
  editorState.layout = editorState.layout || {};
  editorState.sectionVisibility = editorState.sectionVisibility || {};

  // Normalise blocks array
  if (!Array.isArray(editorState.blocks)) {
    editorState.blocks = Array.isArray(initial?.blocks) ? initial.blocks : [];
  }

  // --- BASIC FIELDS ---
  const displayInput = document.getElementById("pe-display-name");
  const bioInput = document.getElementById("pe-bio");
  const coverInput = document.getElementById("pe-cover-image");

  if (displayInput) {
    displayInput.value = editorState.profile?.display_name || "";
    displayInput.addEventListener("input", (e) => {
      if (!editorState.profile) editorState.profile = {};
      editorState.profile.display_name = e.target.value;
      saveBasic();
    });
  }

  if (bioInput) {
    bioInput.value = editorState.profile?.bio || "";
    bioInput.addEventListener("input", (e) => {
      if (!editorState.profile) editorState.profile = {};
      editorState.profile.bio = e.target.value;
      saveBasic();
    });
  }

  if (coverInput) {
    coverInput.value = editorState.profile?.cover_image_url || "";
    coverInput.addEventListener("input", (e) => {
      if (!editorState.profile) editorState.profile = {};
      editorState.profile.cover_image_url = e.target.value;
      saveBasic();
    });
  }

  // --- SOCIALS (with OAuth locks) ---
  initSocialInputs();
}

/**
 * Wire up social inputs with lock awareness.
 * If a platform is OAuth-connected (external_accounts row exists),
 * the corresponding input is disabled and not editable.
 */
async function initSocialInputs() {
  const xInput       = document.getElementById("pe-x");
  const youtubeInput = document.getElementById("pe-youtube");
  const twitchInput  = document.getElementById("pe-twitch");
  const kickInput    = document.getElementById("pe-kick");

  // Seed values from state first
  if (xInput) {
    xInput.value = editorState.profile?.x || "";
  }
  if (youtubeInput) {
    youtubeInput.value = editorState.profile?.youtube || "";
  }
  if (twitchInput) {
    twitchInput.value = editorState.profile?.twitch || "";
  }
  if (kickInput) {
    kickInput.value = editorState.profile?.kick || "";
  }

  // Ask the backend which platforms are locked
  let locks = null;
  try {
    const res = await fetch("/dashboard/api/profile/socials", {
      method: "GET",
      headers: { Accept: "application/json" },
    });

    if (res.ok) {
      const data = await res.json();
      locks = data.locks || null;
    }
  } catch (err) {
    console.warn("Failed to load social lock status", err);
  }

  const isLocked = (key) => Boolean(locks && locks[key]);

  const decorateLocked = (input, platformLabel) => {
    if (!input) return;
    input.disabled = true;
    input.classList.add("opacity-60", "cursor-not-allowed");
    input.title =
      `${platformLabel} is managed via your connected account. ` +
      `Disconnect it on the Account tab to edit manually.`;
  };

  const wireEditable = (input, key) => {
    if (!input) return;
    input.disabled = false;
    input.classList.remove("opacity-60", "cursor-not-allowed");
    input.addEventListener("input", (e) => {
      if (!editorState.profile) editorState.profile = {};
      editorState.profile[key] = e.target.value;
      saveSocials();
    });
  };

  // X
  if (isLocked("x")) {
    decorateLocked(xInput, "X");
  } else {
    wireEditable(xInput, "x");
  }

  // YouTube
  if (isLocked("youtube")) {
    decorateLocked(youtubeInput, "YouTube");
  } else {
    wireEditable(youtubeInput, "youtube");
  }

  // Twitch
  if (isLocked("twitch")) {
    decorateLocked(twitchInput, "Twitch");
  } else {
    wireEditable(twitchInput, "twitch");
  }

  // Kick
  if (isLocked("kick")) {
    decorateLocked(kickInput, "Kick");
  } else {
    wireEditable(kickInput, "kick");
  }
}

/**
 * Debounced basic profile save.
 */
function saveBasic() {
  clearTimeout(basicSaveTimeout);
  basicSaveTimeout = setTimeout(async () => {
    try {
      await fetch("/dashboard/api/profile/basic", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editorState.profile || {}),
      });
    } catch (err) {
      console.error("Failed saving basic info", err);
    }
    window.updatePreview && window.updatePreview();
  }, 500);
}

/**
 * Debounced socials save.
 */
function saveSocials() {
  clearTimeout(socialSaveTimeout);
  socialSaveTimeout = setTimeout(async () => {
    try {
      await fetch("/dashboard/api/profile/socials", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          x: editorState.profile?.x,
          youtube: editorState.profile?.youtube,
          twitch: editorState.profile?.twitch,
          kick: editorState.profile?.kick,
        }),
      });
    } catch (err) {
      console.error("Failed saving social links", err);
    }
    window.updatePreview && window.updatePreview();
  }, 500);
}

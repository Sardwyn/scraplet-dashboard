// /dashboard/profile-assets/js/profile-editor-sponsors.js
// Handles the "Sponsors" panel in the profile editor.

import { editorState } from "/dashboard/profile-assets/js/profile-editor-core.js";

// -----------------------------------------------------------------------------
// DOM references
// -----------------------------------------------------------------------------

const listEl = document.getElementById("pe-sponsors-list");
const addBtn = document.getElementById("pe-add-sponsor");

if (!listEl) {
  console.warn("[profile-editor-sponsors] #pe-sponsors-list not found");
}
if (!addBtn) {
  console.warn("[profile-editor-sponsors] #pe-add-sponsor not found");
}

// Helper: safe bool from wire formats
function toBool(raw) {
  return !(
    raw === false ||
    raw === "false" ||
    raw === 0 ||
    raw === "0" ||
    raw === null ||
    typeof raw === "undefined"
  );
}

// -----------------------------------------------------------------------------
// API helpers
// -----------------------------------------------------------------------------

async function apiGetSponsors() {
  const res = await fetch("/dashboard/api/profile/sponsors", {
    method: "GET",
    headers: {
      "Accept": "application/json",
    },
  });

  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }
  return res.json();
}

async function apiCreateSponsor(payload) {
  const res = await fetch("/dashboard/api/profile/sponsors", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Accept": "application/json",
    },
    body: JSON.stringify(payload || {}),
  });

  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }
  return res.json();
}

async function apiUpdateSponsor(id, payload) {
  const res = await fetch(`/dashboard/api/profile/sponsors/${id}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      "Accept": "application/json",
    },
    body: JSON.stringify(payload || {}),
  });

  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }
  return res.json();
}

async function apiDeleteSponsor(id) {
  const res = await fetch(`/dashboard/api/profile/sponsors/${id}`, {
    method: "DELETE",
    headers: {
      "Accept": "application/json",
    },
  });

  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }
  return res.json();
}

async function apiReorderSponsors(order) {
  const res = await fetch("/dashboard/api/profile/sponsors/reorder", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Accept": "application/json",
    },
    body: JSON.stringify({ order }),
  });

  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }
  return res.json();
}

async function apiUploadBanner(id, file) {
  const form = new FormData();
  form.append("banner", file);

  const res = await fetch(`/dashboard/api/profile/sponsors/${id}/banner`, {
    method: "POST",
    body: form,
  });

  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }
  return res.json();
}

// -----------------------------------------------------------------------------
// State sync helpers
// -----------------------------------------------------------------------------

function setSponsorsInState(sponsors) {
  if (!Array.isArray(sponsors)) return;
  editorState.sponsors = sponsors;
  if (typeof window.updatePreview === "function") {
    window.updatePreview();
  }
}

// -----------------------------------------------------------------------------
// Rendering
// -----------------------------------------------------------------------------

function createSponsorRow(sponsor) {
  const sponsorId = sponsor.id;

  const row = document.createElement("div");
  row.className =
    "pe-sponsor-row flex items-start gap-3 rounded border border-slate-700 bg-slate-800/70 px-3 py-2";
  row.dataset.sponsorId = sponsorId;

  // Drag handle
  const handle = document.createElement("div");
  handle.className =
    "pe-sponsor-row-handle cursor-move text-slate-500 select-none mt-1";
  handle.textContent = "⋮⋮";

  // Fields container
  const fields = document.createElement("div");
  fields.className = "flex-1 flex flex-col gap-2";

  // ---------- Name ----------
  const nameLabel = document.createElement("label");
  nameLabel.className = "block text-xs text-slate-300";
  nameLabel.textContent = "Name";

  const nameInput = document.createElement("input");
  nameInput.type = "text";
  nameInput.className =
    "mt-1 w-full rounded bg-slate-700 border border-slate-600 px-2 py-1 text-sm";
  nameInput.value = sponsor.name || "";

  nameLabel.appendChild(nameInput);

  // ---------- URL ----------
  const urlLabel = document.createElement("label");
  urlLabel.className = "block text-xs text-slate-300";
  urlLabel.textContent = "URL";

  const urlInput = document.createElement("input");
  urlInput.type = "text";
  urlInput.className =
    "mt-1 w-full rounded bg-slate-700 border border-slate-600 px-2 py-1 text-sm";
  urlInput.value = sponsor.url || "";

  urlLabel.appendChild(urlInput);

  // ---------- Bottom line: size + active + upload/delete ----------
  const bottomLine = document.createElement("div");
  bottomLine.className = "flex items-center justify-between gap-2 mt-1";

  const leftControls = document.createElement("div");
  leftControls.className = "flex items-center gap-3";

  // --- Size selector (sm / md / lg) ---
  const allowedSizes = ["sm", "md", "lg"];
  const initialSizeRaw = (sponsor.size || "sm").toString().toLowerCase();
  const initialSize = allowedSizes.includes(initialSizeRaw)
    ? initialSizeRaw
    : "sm";

  const sizeLabel = document.createElement("label");
  sizeLabel.className =
    "inline-flex items-center gap-1 text-xs text-slate-300";

  const sizeText = document.createElement("span");
  sizeText.textContent = "Size";

  const sizeSelect = document.createElement("select");
  sizeSelect.className =
    "pe-sponsor-size-select rounded bg-slate-900 border border-slate-700 text-xs px-1 py-0.5";

  allowedSizes.forEach((opt) => {
    const optEl = document.createElement("option");
    optEl.value = opt;
    optEl.textContent = opt.toUpperCase();
    sizeSelect.appendChild(optEl);
  });
  sizeSelect.value = initialSize;

  sizeLabel.appendChild(sizeText);
  sizeLabel.appendChild(sizeSelect);

  // --- Active toggle ---
  const activeLabel = document.createElement("label");
  activeLabel.className =
    "inline-flex items-center gap-2 text-xs text-slate-300";

  const activeCheckbox = document.createElement("input");
  activeCheckbox.type = "checkbox";
  activeCheckbox.checked = toBool(sponsor.is_active);

  const activeSpan = document.createElement("span");
  activeSpan.textContent = "Active";

  activeLabel.appendChild(activeCheckbox);
  activeLabel.appendChild(activeSpan);

  leftControls.appendChild(sizeLabel);
  leftControls.appendChild(activeLabel);

  // --- Right controls: logo + delete ---
  const rightControls = document.createElement("div");
  rightControls.className = "flex items-center gap-3";

  const logoWrapper = document.createElement("div");
  logoWrapper.className = "flex items-center gap-2";

  const logoPreview = document.createElement("div");
  logoPreview.className =
    "h-8 w-8 rounded bg-slate-700 flex items-center justify-center overflow-hidden text-[10px] text-slate-400";
  logoPreview.textContent = "Logo";

  if (sponsor.banner_url) {
    const img = document.createElement("img");
    img.src = sponsor.banner_url;
    img.alt = sponsor.name || "";
    img.className = "h-full w-full object-contain";
    logoPreview.innerHTML = "";
    logoPreview.appendChild(img);
  }

  const uploadButton = document.createElement("button");
  uploadButton.type = "button";
  uploadButton.className =
    "text-xs px-2 py-1 rounded bg-slate-700 hover:bg-slate-600 text-slate-100";
  uploadButton.textContent = "Upload logo";

  logoWrapper.appendChild(logoPreview);
  logoWrapper.appendChild(uploadButton);

  const deleteButton = document.createElement("button");
  deleteButton.type = "button";
  deleteButton.className =
    "pe-sponsor-delete text-xs text-red-400 hover:text-red-300";
  deleteButton.textContent = "Delete";

  rightControls.appendChild(logoWrapper);
  rightControls.appendChild(deleteButton);

  bottomLine.appendChild(leftControls);
  bottomLine.appendChild(rightControls);

  fields.appendChild(nameLabel);
  fields.appendChild(urlLabel);
  fields.appendChild(bottomLine);

  row.appendChild(handle);
  row.appendChild(fields);

  // ---------- Wire image upload ----------
  uploadButton.addEventListener("click", () => {
    openSponsorLogoDialog(sponsorId, (newUrl) => {
      if (!newUrl) return;
      const img = document.createElement("img");
      img.src = newUrl;
      img.alt = sponsor.name || "";
      img.className = "h-full w-full object-contain";
      logoPreview.innerHTML = "";
      logoPreview.appendChild(img);

      // keep local state in sync
      updateSponsorInState(sponsorId, { banner_url: newUrl });
      renderSponsorList();
    });
  });

  // ---------- Commit updates ----------
  const commitUpdate = async () => {
    try {
      const payload = {
        name: nameInput.value || "",
        url: urlInput.value || "",
        is_active: activeCheckbox.checked,
        size: sizeSelect.value || "sm",
      };
      const json = await apiUpdateSponsor(sponsorId, payload);
      if (json && json.ok && Array.isArray(json.sponsors)) {
        setSponsorsInState(json.sponsors);
        renderSponsorList();
      }
    } catch (err) {
      console.error("[sponsors] update failed", err);
    }
  };

  nameInput.addEventListener("blur", commitUpdate);
  urlInput.addEventListener("blur", commitUpdate);
  activeCheckbox.addEventListener("change", commitUpdate);
  sizeSelect.addEventListener("change", commitUpdate);

  deleteButton.addEventListener("click", () => {
    deleteSponsor(sponsorId);
  });

  return row;
}


function renderSponsorList() {
  if (!listEl) return;

  listEl.innerHTML = "";

  const sponsors = Array.isArray(editorState.sponsors)
    ? editorState.sponsors
    : [];

  if (!sponsors.length) {
    const empty = document.createElement("div");
    empty.className = "text-xs text-slate-500 italic";
    empty.textContent = "No sponsors added yet.";
    listEl.appendChild(empty);
    return;
  }

  sponsors.forEach((sp) => {
    listEl.appendChild(createSponsorRow(sp));
  });
}

// -----------------------------------------------------------------------------
// Sortable (drag to reorder)
// -----------------------------------------------------------------------------

function setupSortableSponsors() {
  if (!window.Sortable || !listEl) {
    if (!window.Sortable) {
      console.warn("[profile-editor-sponsors] SortableJS not found on window");
    }
    return;
  }

  new Sortable(listEl, {
    animation: 120,
    handle: ".pe-sponsor-row-handle",
    onEnd: async () => {
      try {
        const items = Array.from(listEl.children);
        const order = items
          .map((el) => parseInt(el.dataset.sponsorId, 10))
          .filter((id) => Number.isFinite(id));

        if (!order.length) return;

        const json = await apiReorderSponsors(order);
        if (json && json.ok && Array.isArray(json.sponsors)) {
          setSponsorsInState(json.sponsors);
          renderSponsorList();
        }
      } catch (err) {
        console.error("[sponsors] reorder failed", err);
      }
    },
  });
}

// -----------------------------------------------------------------------------
// Creation
// -----------------------------------------------------------------------------

function setupSponsorCreation() {
  if (!addBtn) return;

  addBtn.addEventListener("click", async () => {
    try {
      // Minimal flow: create with placeholder name, let user edit inline.
      const json = await apiCreateSponsor({
        name: "New Sponsor",
        url: "",
      });

      if (json && json.ok && Array.isArray(json.sponsors)) {
        setSponsorsInState(json.sponsors);
        renderSponsorList();
      }
    } catch (err) {
      console.error("[sponsors] create failed", err);
    }
  });
}

// -----------------------------------------------------------------------------
// Public API
// -----------------------------------------------------------------------------

export async function setupSponsorsModule() {
  if (!listEl) return;

  try {
    // If editorState already has sponsors from initial JSON, use that.
    if (!Array.isArray(editorState.sponsors)) {
      const json = await apiGetSponsors();
      if (json && json.ok && Array.isArray(json.sponsors)) {
        setSponsorsInState(json.sponsors);
      }
    }
  } catch (err) {
    console.error("[sponsors] initial load failed", err);
  }

  renderSponsorList();
  setupSponsorCreation();
  setupSortableSponsors();
}

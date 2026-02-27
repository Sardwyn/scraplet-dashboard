// /dashboard/profile-assets/js/profile-editor-buttons.js
// Handles the "Custom Buttons" panel in the profile editor.
// v2: includes per-button image upload for tile images.

import { editorState } from "/dashboard/profile-assets/js/profile-editor-core.js";

// -----------------------------------------------------------------------------
// DOM references
// -----------------------------------------------------------------------------

const listEl = document.getElementById("pe-buttons-list");
const addBtn = document.getElementById("pe-add-button");

if (!listEl) {
  console.warn("[profile-editor-buttons] #pe-buttons-list not found");
}
if (!addBtn) {
  console.warn("[profile-editor-buttons] #pe-add-button not found");
}

// -----------------------------------------------------------------------------
// Free vs Pro limits
// -----------------------------------------------------------------------------

const FREE_BUTTON_LIMIT = 3;

function isProUser() {
  return Boolean(editorState.isPro);
}

function currentButtonCount() {
  const buttons = editorState.customButtons || [];
  return buttons.length;
}

function getButtonsFromState() {
  return Array.isArray(editorState.customButtons)
    ? editorState.customButtons
    : [];
}

/**
 * Flash a short “premium feature” warning on the sidebar Add button
 * and the "+" tile in the preview.
 */
function flashPremiumWarning() {
  // Sidebar Add button
  if (addBtn) {
    const originalText =
      addBtn.dataset.originalText || addBtn.textContent || "Add New Button";
    addBtn.dataset.originalText = originalText;

    addBtn.textContent = "Premium feature – upgrade to add more";
    addBtn.classList.add("pe-add-button--limit");
    addBtn.disabled = true;
  }

  // Card "+" tile in the preview
  const cardTile = document.getElementById("pc-add-button-card");
  if (cardTile) {
    const labelSpan = cardTile.querySelector(".pc-button-add-label");
    const iconSpan = cardTile.querySelector(".pc-button-add-icon");

    const originalLabel =
      cardTile.dataset.originalLabel ||
      (labelSpan ? labelSpan.textContent : "Add button");
    const originalIcon =
      cardTile.dataset.originalIcon ||
      (iconSpan ? iconSpan.textContent : "+");

    cardTile.dataset.originalLabel = originalLabel;
    cardTile.dataset.originalIcon = originalIcon;

    if (labelSpan) labelSpan.textContent = "Premium feature";
    if (iconSpan) iconSpan.textContent = "★";

    cardTile.classList.add("pc-button--add-limit");
  }

  setTimeout(() => {
    if (addBtn) {
      const originalText =
        addBtn.dataset.originalText || "Add New Button";
      addBtn.textContent = originalText;
      addBtn.classList.remove("pe-add-button--limit");
      addBtn.disabled = false;
    }

    const cardTileNow = document.getElementById("pc-add-button-card");
    if (cardTileNow) {
      const labelSpan = cardTileNow.querySelector(".pc-button-add-label");
      const iconSpan = cardTileNow.querySelector(".pc-button-add-icon");

      const originalLabel =
        cardTileNow.dataset.originalLabel || "Add button";
      const originalIcon =
        cardTileNow.dataset.originalIcon || "+";

      if (labelSpan) labelSpan.textContent = originalLabel;
      if (iconSpan) iconSpan.textContent = originalIcon;

      cardTileNow.classList.remove("pc-button--add-limit");
    }
  }, 1800);
}

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

function hexOrDefault(value, fallback) {
  const v = String(value || "").trim();
  if (!v) return fallback;
  if (/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(v)) return v;
  return v;
}

// -----------------------------------------------------------------------------
// Image upload helper – uses existing backend route:
// POST /dashboard/api/profile/buttons/:id/image  (field: "image")
// -----------------------------------------------------------------------------

async function uploadButtonImage(button, file) {
  if (!button || !button.id) {
    console.warn(
      "[profile-editor-buttons] Cannot upload image, button has no id yet."
    );
    return null;
  }

  const formData = new FormData();
  formData.append("image", file);

  const res = await fetch(
    `/dashboard/api/profile/buttons/${encodeURIComponent(
      button.id
    )}/image`,
    {
      method: "POST",
      body: formData,
    }
  );

  if (!res.ok) {
    console.error(
      "[profile-editor-buttons] Failed to upload image",
      await res.text()
    );
    return null;
  }

  const data = await res.json();

  // Existing route returns: { ok: true, button: {...} }
  if (data && data.button) {
    const updatedBtn = data.button;
    const list = getButtonsFromState();
    const idx = list.findIndex(
      (b) => String(b.id) === String(updatedBtn.id)
    );
    if (idx !== -1) {
      list[idx] = updatedBtn;
      editorState.customButtons = list;
    } else {
      editorState.customButtons = [...list, updatedBtn];
    }
    return updatedBtn;
  }

  return null;
}

// -----------------------------------------------------------------------------
// Render one button row in the sidebar
// -----------------------------------------------------------------------------

function renderButtonRow(button) {
  const row = document.createElement("div");
  row.setAttribute("data-button-id", button.id);
  row.className =
    "mb-4 rounded-lg border border-slate-700 bg-slate-900/60 p-3 space-y-2";

  // Row 1: label + URL
  const row1 = document.createElement("div");
  row1.className = "flex gap-2";

  const labelInput = document.createElement("input");
  labelInput.type = "text";
  labelInput.className =
    "flex-1 bg-slate-800 border border-slate-700 rounded px-2 py-1 text-sm";
  labelInput.placeholder = "Button label";
  labelInput.value = button.label || "";

  const urlInput = document.createElement("input");
  urlInput.type = "text";
  urlInput.className =
    "flex-1 bg-slate-800 border border-slate-700 rounded px-2 py-1 text-sm";
  urlInput.placeholder = "https://example.com";
  urlInput.value = button.url || "";

  row1.appendChild(labelInput);
  row1.appendChild(urlInput);

  // Row 2: size + visibility
  const row2 = document.createElement("div");
  row2.className = "flex items-center justify-between gap-3";

  const sizeWrap = document.createElement("div");
  sizeWrap.className = "flex items-center gap-2 text-xs text-slate-300";

  const sizeLabel = document.createElement("span");
  sizeLabel.textContent = "Size";

  const sizeSelect = document.createElement("select");
  sizeSelect.className =
    "bg-slate-800 border border-slate-600 rounded px-2 py-1 text-xs";

  ["sm", "md", "lg"].forEach((sz) => {
    const opt = document.createElement("option");
    opt.value = sz;
    opt.textContent = sz.toUpperCase();
    if ((button.size || "sm").toLowerCase() === sz) opt.selected = true;
    sizeSelect.appendChild(opt);
  });

  sizeWrap.appendChild(sizeLabel);
  sizeWrap.appendChild(sizeSelect);

  const visWrap = document.createElement("label");
  visWrap.className = "flex items-center gap-2 text-xs text-slate-300";

  const visCheckbox = document.createElement("input");
  visCheckbox.type = "checkbox";
  visCheckbox.checked = button.visible !== false;

  const visText = document.createElement("span");
  visText.textContent = "Show";

  visWrap.appendChild(visCheckbox);
  visWrap.appendChild(visText);

  row2.appendChild(sizeWrap);
  row2.appendChild(visWrap);

  // Row 3: accent colour + target
  const row3 = document.createElement("div");
  row3.className =
    "flex items-center justify-between gap-3 text-xs text-slate-300";

  const accentLeft = document.createElement("div");
  accentLeft.className = "flex items-center gap-2 flex-1";

  const accentLabel = document.createElement("span");
  accentLabel.textContent = "Accent";

  const accentInput = document.createElement("input");
  accentInput.type = "text";
  accentInput.className =
    "flex-1 bg-slate-800 border border-slate-700 rounded px-2 py-1 text-xs";
  accentInput.placeholder = "#ff53bb";
  accentInput.value = hexOrDefault(button.accent_color, "");

  accentLeft.appendChild(accentLabel);
  accentLeft.appendChild(accentInput);

  const accentRight = document.createElement("div");
  accentRight.className = "flex items-center gap-2";

  const targetLabel = document.createElement("span");
  targetLabel.textContent = "Target";

  const targetSelect = document.createElement("select");
  targetSelect.className =
    "bg-slate-800 border border-slate-600 rounded px-2 py-1 text-xs";

  const targetOptions = [
    { value: "button", label: "Button" },
    { value: "label", label: "Label" },
  ];
  const currentTarget = (button.accent_target || "button").toLowerCase();

  targetOptions.forEach((optMeta) => {
    const opt = document.createElement("option");
    opt.value = optMeta.value;
    opt.textContent = optMeta.label;
    if (optMeta.value === currentTarget) opt.selected = true;
    targetSelect.appendChild(opt);
  });

  accentRight.appendChild(targetLabel);
  accentRight.appendChild(targetSelect);

  row3.appendChild(accentLeft);
  row3.appendChild(accentRight);

  // Row 4: tile image upload
  const row4 = document.createElement("div");
  row4.className =
    "flex items-center justify-between gap-3 text-xs text-slate-300";

  const imageInfo = document.createElement("div");
  imageInfo.className = "flex items-center gap-2 flex-1";

  const imageLabel = document.createElement("span");
  imageLabel.textContent = "Tile image";

  const imagePreview = document.createElement("div");
  imagePreview.className =
    "w-10 h-10 rounded bg-slate-800 border border-slate-700 bg-cover bg-center flex-shrink-0";

  if (button.featured_image_url) {
    imagePreview.style.backgroundImage = `url('${button.featured_image_url}')`;
  }

  const imageStatus = document.createElement("span");
  imageStatus.className =
    "text-[11px] text-slate-400 truncate max-w-[140px]";
  imageStatus.textContent = button.featured_image_url ? "Image set" : "No image";

  imageInfo.appendChild(imageLabel);
  imageInfo.appendChild(imagePreview);
  imageInfo.appendChild(imageStatus);

  const imageActions = document.createElement("div");
  imageActions.className = "flex items-center gap-2";

  const uploadBtn = document.createElement("button");
  uploadBtn.type = "button";
  uploadBtn.className =
    "px-2 py-1 rounded bg-slate-700 hover:bg-slate-600 text-[11px]";
  uploadBtn.textContent = "Upload";

  const clearBtn = document.createElement("button");
  clearBtn.type = "button";
  clearBtn.className =
    "px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-[11px]";
  clearBtn.textContent = "Clear";

  // hidden file input for this row
  const fileInput = document.createElement("input");
  fileInput.type = "file";
  fileInput.accept = "image/*";
  fileInput.className = "hidden";

  uploadBtn.addEventListener("click", () => {
    fileInput.click();
  });

  fileInput.addEventListener("change", async () => {
    const file = fileInput.files && fileInput.files[0];
    if (!file) return;

    imageStatus.textContent = "Uploading…";

    try {
      const updated = await uploadButtonImage(button, file);
      const btnAfter = updated || button;

      if (btnAfter && btnAfter.featured_image_url) {
        imagePreview.style.backgroundImage = `url('${btnAfter.featured_image_url}')`;
        imageStatus.textContent = "Image set";
      } else {
        imagePreview.style.backgroundImage = "";
        imageStatus.textContent = "No image";
      }

      if (window.updatePreview) window.updatePreview();
    } catch (err) {
      console.error("[profile-editor-buttons] upload failed", err);
      imageStatus.textContent = "Upload failed";
    } finally {
      fileInput.value = "";
    }
  });

  clearBtn.addEventListener("click", async () => {
    const list = getButtonsFromState();
    const idx = list.findIndex((b) => String(b.id) === String(button.id));
    if (idx !== -1) {
      list[idx].featured_image_url = "";
      editorState.customButtons = list;
    } else {
      button.featured_image_url = "";
    }

    imagePreview.style.backgroundImage = "";
    imageStatus.textContent = "No image";

    await saveButton({
      id: button.id,
      label: labelInput.value.trim(),
      url: urlInput.value.trim(),
      size: sizeSelect.value,
      visible: visCheckbox.checked,
      accent_color: accentInput.value.trim(),
      accent_target: targetSelect.value,
      featured_image_url: "",
    });

    if (window.updatePreview) window.updatePreview();
  });

  imageActions.appendChild(uploadBtn);
  imageActions.appendChild(clearBtn);

  row4.appendChild(imageInfo);
  row4.appendChild(imageActions);
  row4.appendChild(fileInput);

  // Footer: Save + Delete
  const footer = document.createElement("div");
  footer.className = "flex justify-end gap-2 pt-1";

  const saveBtn = document.createElement("button");
  saveBtn.type = "button";
  saveBtn.textContent = "Save";
  saveBtn.className =
    "px-3 py-1 bg-emerald-600 hover:bg-emerald-500 rounded text-xs";

  const deleteBtn = document.createElement("button");
  deleteBtn.type = "button";
  deleteBtn.textContent = "Delete";
  deleteBtn.className =
    "px-3 py-1 bg-red-600 hover:bg-red-500 rounded text-xs";

  footer.appendChild(saveBtn);
  footer.appendChild(deleteBtn);

  // Assemble
  row.appendChild(row1);
  row.appendChild(row2);
  row.appendChild(row3);
  row.appendChild(row4);
  row.appendChild(footer);

  // Wiring – Save
  saveBtn.addEventListener("click", async () => {
    const list = getButtonsFromState();
    const idx = list.findIndex((b) => String(b.id) === String(button.id));
    const currentImage =
      idx !== -1
        ? list[idx].featured_image_url || ""
        : button.featured_image_url || "";

    await saveButton({
      id: button.id,
      label: labelInput.value.trim(),
      url: urlInput.value.trim(),
      size: sizeSelect.value,
      visible: visCheckbox.checked,
      accent_color: accentInput.value.trim(),
      accent_target: targetSelect.value,
      featured_image_url: currentImage,
    });
  });

  // Wiring – Delete
  deleteBtn.addEventListener("click", async () => {
    if (!button.id) return;
    const ok = window.confirm("Delete this button?");
    if (!ok) return;
    await deleteButton(button.id);
  });

  return row;
}

// -----------------------------------------------------------------------------
// Render list
// -----------------------------------------------------------------------------

function renderButtonList() {
  if (!listEl) return;

  listEl.innerHTML = "";

  const buttons = getButtonsFromState();
  if (!buttons.length) {
    const empty = document.createElement("p");
    empty.className = "text-xs text-slate-400";
    empty.textContent = "No custom buttons yet.";
    listEl.appendChild(empty);
    return;
  }

  const sorted = buttons.slice().sort((a, b) => {
    const ao = a.sort_order ?? 0;
    const bo = b.sort_order ?? 0;
    return ao - bo;
  });

  sorted.forEach((btn) => {
    listEl.appendChild(renderButtonRow(btn));
  });
}

// -----------------------------------------------------------------------------
// Network helpers – CRUD for buttons
// -----------------------------------------------------------------------------

async function saveButton(payload) {
  const { id, ...rest } = payload;
  const method = id ? "PUT" : "POST";
  const url = id
    ? `/dashboard/api/profile/buttons/${encodeURIComponent(id)}`
    : "/dashboard/api/profile/buttons";

  const res = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(rest),
  });

  if (!res.ok) {
    console.error(
      "[profile-editor-buttons] Failed saving button",
      await res.text()
    );
    return;
  }

  const data = await res.json();

  // Be tolerant of shapes: {buttons:[...]} or {ok:true, button:{...}}
  if (Array.isArray(data.buttons)) {
    editorState.customButtons = data.buttons;
  } else if (data.button && id) {
    const list = getButtonsFromState();
    const idx = list.findIndex(
      (b) => String(b.id) === String(data.button.id)
    );
    if (idx !== -1) {
      list[idx] = data.button;
      editorState.customButtons = list;
    }
  }

  renderButtonList();
  if (window.updatePreview) window.updatePreview();
}

async function deleteButton(id) {
  const res = await fetch(
    `/dashboard/api/profile/buttons/${encodeURIComponent(id)}`,
    {
      method: "DELETE",
    }
  );

  if (!res.ok) {
    console.error(
      "[profile-editor-buttons] Failed deleting button",
      await res.text()
    );
    return;
  }

  const data = await res.json();

  if (Array.isArray(data.buttons)) {
    editorState.customButtons = data.buttons;
  } else {
    const list = getButtonsFromState().filter(
      (b) => String(b.id) !== String(id)
    );
    editorState.customButtons = list;
  }

  renderButtonList();
  if (window.updatePreview) window.updatePreview();
}

// -----------------------------------------------------------------------------
// Creation + Sortable
// -----------------------------------------------------------------------------

function setupButtonCreation() {
  if (!addBtn) return;

  addBtn.addEventListener("click", async () => {
    const pro = isProUser();
    const count = currentButtonCount();

    if (!pro && count >= FREE_BUTTON_LIMIT) {
      flashPremiumWarning();
      return;
    }

    const res = await fetch("/dashboard/api/profile/buttons", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        label: "New button",
        url: "https://example.com",
        size: "lg",
        visible: true,
        accent_color: "#ff53bb",
        accent_target: "button",
        featured_image_url: "",
      }),
    });

    if (!res.ok) {
      console.error(
        "[profile-editor-buttons] Failed creating button",
        await res.text()
      );
      return;
    }

    const data = await res.json();
    if (Array.isArray(data.buttons)) {
      editorState.customButtons = data.buttons;
      renderButtonList();
      if (window.updatePreview) window.updatePreview();
    }
  });
}

function setupSortable() {
  if (!listEl || !window.Sortable) return;

  window.Sortable.create(listEl, {
    animation: 120,
    handle: null,
    onEnd: async () => {
      const items = Array.from(listEl.children);
      const order = items
        .map((el) => el.getAttribute("data-button-id"))
        .filter((id) => id != null)
        .map((id) => parseInt(id, 10))
        .filter((id) => Number.isFinite(id));

      if (!order.length) return;

      try {
        await fetch("/dashboard/api/profile/buttons/reorder", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ order }),
        });
      } catch (err) {
        console.error(
          "[profile-editor-buttons] Failed to reorder buttons",
          err
        );
      }

      if (window.updatePreview) window.updatePreview();
    },
  });
}

// -----------------------------------------------------------------------------
// Public API
// -----------------------------------------------------------------------------

export function refreshButtonsUI() {
  renderButtonList();
}

export function setupButtonsModule() {
  renderButtonList();
  setupButtonCreation();
  setupSortable();
}

// public/dashboard/profile-assets/js/profile-editor-theme.js

import { editorState } from "./profile-editor-core.js";

const themeButtons = document.querySelectorAll(".pe-theme-btn");

function setActiveThemeButton(theme) {
  themeButtons.forEach((btn) => {
    if (btn.dataset.theme === theme) {
      btn.classList.add("ring-2", "ring-emerald-500");
    } else {
      btn.classList.remove("ring-2", "ring-emerald-500");
    }
  });
}

themeButtons.forEach((btn) => {
  btn.addEventListener("click", async () => {
    const theme = btn.dataset.theme;
    if (!editorState.appearance) editorState.appearance = {};

    editorState.appearance.theme = theme;

    try {
      const res = await fetch("/dashboard/api/profile/appearance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editorState.appearance),
      });

      if (!res.ok) {
        console.error(
          "[profile-editor-theme] Failed to save appearance",
          res.status
        );
        return;
      }

      const data = await res.json();
      if (data && data.appearance) {
        editorState.appearance = data.appearance;
        setActiveThemeButton(editorState.appearance.theme);
      } else {
        setActiveThemeButton(theme);
      }
    } catch (err) {
      console.error("[profile-editor-theme] Error saving appearance", err);
    }

    window.updatePreview && window.updatePreview();
  });
});

// Initialise active button on load
if (editorState.appearance && editorState.appearance.theme) {
  setActiveThemeButton(editorState.appearance.theme);
}

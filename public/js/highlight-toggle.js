// public/js/highlight-toggle.js
// Toggle for enabling/disabling highlight detection per channel

(function () {
  const toggle = document.getElementById('highlight_detection_toggle');
  if (!toggle) return;

  const container = document.getElementById('pulse_graph_container');
  if (!container) return;

  const platform = container.dataset.platform || 'kick';
  const channel = container.dataset.channel;

  if (!channel) {
    console.warn('[highlight-toggle] no channel slug found');
    return;
  }

  let currentState = true; // Default to enabled

  // Fetch current setting
  async function fetchSetting() {
    try {
      const resp = await fetch(`/dashboard/api/highlight-settings?platform=${platform}&channel_slug=${channel}`, {
        credentials: 'include'
      });
      if (resp.ok) {
        const data = await resp.json();
        currentState = data.enabled !== false;
        updateUI();
      }
    } catch (err) {
      console.error('[highlight-toggle] fetch failed:', err);
    }
  }

  // Update setting
  async function updateSetting(enabled) {
    try {
      const resp = await fetch('/dashboard/api/highlight-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ platform, channel_slug: channel, enabled })
      });
      if (resp.ok) {
        const data = await resp.json();
        currentState = data.enabled;
        updateUI();
        showFeedback(enabled ? 'Highlight detection enabled' : 'Highlight detection disabled');
      } else {
        showFeedback('Failed to update setting', true);
      }
    } catch (err) {
      console.error('[highlight-toggle] update failed:', err);
      showFeedback('Failed to update setting', true);
    }
  }

  // Update UI to reflect current state
  function updateUI() {
    if (currentState) {
      toggle.classList.add('highlight-toggle--on');
      toggle.classList.remove('highlight-toggle--off');
      toggle.title = 'Highlight detection enabled - Click to disable';
    } else {
      toggle.classList.add('highlight-toggle--off');
      toggle.classList.remove('highlight-toggle--on');
      toggle.title = 'Highlight detection disabled - Click to enable';
    }
  }

  // Show feedback message
  function showFeedback(message, isError = false) {
    const feedback = document.createElement('div');
    feedback.className = `fixed top-4 right-4 px-4 py-2 rounded text-sm font-medium z-50 transition-opacity ${
      isError ? 'bg-red-500/90 text-white' : 'bg-emerald-500/90 text-white'
    }`;
    feedback.textContent = message;
    document.body.appendChild(feedback);

    setTimeout(() => {
      feedback.style.opacity = '0';
      setTimeout(() => feedback.remove(), 300);
    }, 2000);
  }

  // Handle toggle click
  toggle.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    updateSetting(!currentState);
  });

  // Initialize
  fetchSetting();
})();

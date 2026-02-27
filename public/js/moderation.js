// public/js/moderation.js
// V9: Persistence fixes
// - Treats {ok:false} as an error even on HTTP 200 (so broken saves aren't silent)
// - Explicit apply mode (no autosave); Save Settings is the only persistence
// - Intensity applies preset to knobs and stages changes for Save Settings
// - Cache-bust friendly (pair with moderation.ejs v param bump)

function qs(sel) { return document.querySelector(sel); }
function qsa(sel) { return Array.from(document.querySelectorAll(sel)); }

function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function fmtTime(s) {
  if (!s) return '';
  return String(s).replace('T', ' ').replace('Z', '');
}

function shortText(t, n = 140) {
  const s = String(t || '').trim();
  if (s.length <= n) return s;
  return s.slice(0, n - 1) + '...';
}

function isTimeout(action) {
  return String(action || '').toLowerCase() === 'timeout';
}

let showAdvancedRuleFields = false;
let lastLoadedSettings = {};

// Post-save UI hooks (used by intensity slider etc.)
let postSaveHooks = [];
function addPostSaveHook(fn) {
  if (typeof fn === 'function') postSaveHooks.push(fn);
}

// =====================================================
// API helper
// =====================================================
async function api(path, init = {}) {
  const r = await fetch(path, {
    credentials: 'same-origin',
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
  });

  const text = await r.text();
  let data = null;
  try { data = text ? JSON.parse(text) : {}; }
  catch { data = { ok: false, error: text || 'Invalid JSON' }; }

  if (!r.ok) {
    const msg = data?.error || `HTTP ${r.status}`;
    throw new Error(msg);
  }
  // Some endpoints return HTTP 200 with {ok:false,...}
  if (data && data.ok === false) {
    throw new Error(data.error || 'Request failed');
  }
  return data;
}

function platform() {
  return (qs('#m_platform')?.value || 'kick').toLowerCase();
}

// =====================================================
// Status
// =====================================================
let settingsStatusTimer = null;
function setSettingsStatus(msg, { autoClear = false, delay = 2000 } = {}) {
  const el = qs('#m_settings_status');
  if (!el) return;

  el.textContent = msg || '';

  if (settingsStatusTimer) {
    clearTimeout(settingsStatusTimer);
    settingsStatusTimer = null;
  }

  if (autoClear) {
    settingsStatusTimer = setTimeout(() => {
      el.textContent = '';
      settingsStatusTimer = null;
    }, delay);
  }
}

// =====================================================
// Explain modal
// =====================================================
function showExplainModal() {
  const m = qs('#m_explain_modal');
  if (!m) return;
  m.classList.remove('hidden');
  m.classList.add('flex');
}
function hideExplainModal() {
  const m = qs('#m_explain_modal');
  if (!m) return;
  m.classList.add('hidden');
  m.classList.remove('flex');
}

qs('#m_close_explain')?.addEventListener('click', hideExplainModal);
qs('#m_explain_modal')?.addEventListener('click', (e) => {
  if (e.target?.id === 'm_explain_modal') hideExplainModal();
});

async function explainText(text, ctx = {}) {
  showExplainModal();

  const summaryEl = document.getElementById('m_explain_summary');
  const jsonEl = document.getElementById('m_explain_json');

  if (summaryEl) summaryEl.textContent = 'Explaining…';
  if (jsonEl) jsonEl.textContent = '';

  try {
    const res = await fetch('/dashboard/api/moderation/explain', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        platform: platform(),
        text: String(text || ''),
        senderUsername: ctx.senderUsername || 'unknown',
        userRole: ctx.userRole || 'everyone',
        channelSlug: ctx.channelSlug || '',
      }),
    });

    const out = await res.json();
    if (!out?.ok) throw new Error(out?.error || 'Explain failed');

    if (out.matched) {
      summaryEl.textContent = out.explain?.summary || 'Matched a rule';
      jsonEl.textContent = JSON.stringify(out, null, 2);
    } else {
      summaryEl.textContent = out.explain?.summary || 'No match';
      jsonEl.textContent = JSON.stringify(out, null, 2);
    }
  } catch (err) {
    if (summaryEl) summaryEl.textContent = err.message || 'Explain failed';
    if (jsonEl) jsonEl.textContent = '';
  }
}

// =====================================================
// Save plumbing (explicit mode)
// =====================================================
let saveTimer = null;
let saveInFlight = false;
let savePending = false;

// Autosave OFF (explicit apply)
const AUTO_SAVE_ANY_SETTINGS_CHANGE = false;

let suppressAutoSave = false;

function scheduleSave(reason = '') {
  // Explicit apply mode: stage only. Saving happens via the Save Settings button.
  if (!AUTO_SAVE_ANY_SETTINGS_CHANGE) {
    setSettingsStatus('Unsaved changes');
    return;
  }

  if (saveTimer) clearTimeout(saveTimer);

  saveTimer = setTimeout(async () => {
    if (saveInFlight) {
      savePending = true;
      return;
    }

    saveInFlight = true;
    savePending = false;

    try {
      await saveSettingsNow();
    } catch (err) {
      setSettingsStatus(err.message || 'Save failed');
    } finally {
      saveInFlight = false;

      if (savePending) {
        savePending = false;
        scheduleSave('pending');
      }
    }
  }, 450);
}

async function saveNowImmediate() {
  if (saveTimer) clearTimeout(saveTimer);

  if (saveInFlight) {
    savePending = true;
    setSettingsStatus('Saving...');
    return;
  }

  saveInFlight = true;
  savePending = false;

  try {
    await saveSettingsNow();
  } catch (err) {
    setSettingsStatus(err.message || 'Save failed');
    throw err;
  } finally {
    saveInFlight = false;

    if (savePending) {
      savePending = false;
      scheduleSave('pending');
    }
  }
}

// =====================================================
// Tabs
// =====================================================
function setActiveTab(tab) {
  qsa('[data-tab]').forEach(b => (b.dataset.active = (b.dataset.tab === tab ? 'true' : 'false')));
  qsa('[data-pane]').forEach(p => p.classList.toggle('hidden', p.dataset.pane !== tab));
}

qsa('[data-tab]').forEach(btn => btn.addEventListener('click', () => setActiveTab(btn.dataset.tab)));

qs('#m_jump_incidents')?.addEventListener('click', (e) => {
  e.preventDefault();
  setActiveTab('incidents');
});


// =====================================================
// Rules presets + table
// =====================================================
const PRESETS = {
  contains: { label: 'Block phrase', valueKind: 'text' },
  blacklist_word: { label: 'Block word', valueKind: 'text' },
  link_posting: { label: 'Block links', valueKind: 'none' },
  caps_ratio: { label: 'Caps spam', valueKind: 'number', defaultValue: '0.7' },
  equals: { label: 'Exact match (advanced)', valueKind: 'text', advancedOnly: true },
};

function presetMeta(ruleType) {
  const t = String(ruleType || '').toLowerCase();
  return PRESETS[t] || { label: t || 'Unknown', valueKind: 'text' };
}

function actionOptions(current) {
  const a = String(current || 'timeout').toLowerCase();
  const opts = [
    { v: 'timeout', label: 'Timeout' },
    { v: 'ban', label: 'Ban' },
    { v: 'delete', label: 'Delete message' },
    { v: 'ignore', label: 'Ignore (short-circuit)' },
    { v: 'none', label: 'Do nothing' },
  ];
  return opts.map(o => `<option value="${o.v}" ${a === o.v ? 'selected' : ''}>${o.label}</option>`).join('');
}



function ruleRow(rule) {
  const tr = document.createElement('tr');
  tr.dataset.id = rule.id;

  const enabledChecked = rule.enabled ? 'checked' : '';
  const ignoreModsChecked = rule.ignore_mods ? 'checked' : '';
  const t = String(rule.rule_type || 'contains').toLowerCase();
  const a = String(rule.action || 'timeout').toLowerCase();
  const dur = String(rule.duration_seconds ?? 0);

  const meta = presetMeta(t);
  const advancedBits = showAdvancedRuleFields ? `
    <div class="mt-2 text-xs text-gray-500">
      channel: <span class="font-mono">${escapeHtml(rule.channel_slug || '—')}</span>
      • ignore mods: <span class="font-mono">${escapeHtml(String(!!rule.ignore_mods))}</span>
      • id: <span class="font-mono">${escapeHtml(rule.id)}</span>
    </div>` : '';

  tr.innerHTML = `
    <td class="p-3 align-top">
      <input type="checkbox" data-k="enabled" ${enabledChecked}>
    </td>

    <td class="p-3 align-top">
      <div class="font-semibold">${escapeHtml(meta.label)}</div>
      <div class="text-xs text-gray-500">${escapeHtml(t)}</div>
      ${advancedBits}
    </td>

    <td class="p-3 align-top">
      ${meta.valueKind === 'none'
        ? `<span class="text-xs text-gray-500">—</span>`
        : `<div class="font-mono text-xs break-all">${escapeHtml(rule.rule_value || '')}</div>`}
    </td>

    <td class="p-3 align-top">
      <div class="flex items-center gap-2">
        <select class="border border-gray-800 bg-gray-950 rounded px-2 py-1 text-sm" data-k="action">
          ${actionOptions(a)}
        </select>

        <input class="w-24 border border-gray-800 bg-gray-950 rounded px-2 py-1 text-sm"
               data-k="duration_seconds"
               type="number" min="0"
               value="${escapeHtml(dur)}"
               ${isTimeout(a) ? '' : 'disabled'}>
      </div>
    </td>

    <td class="p-3 align-top text-right">
      <div class="inline-flex items-center gap-2">
        <button class="border border-gray-800 bg-gray-950 hover:bg-gray-800 rounded px-3 py-1.5 text-sm" data-act="save">Save</button>
        <button class="border border-red-800 bg-red-950/40 hover:bg-red-900/50 text-red-200 rounded px-3 py-1.5 text-sm" data-act="del">Delete</button>
      </div>
    </td>
  `;

  // wire action/duration toggle
  tr.querySelector('[data-k="action"]')?.addEventListener('change', () => {
    const action = String(tr.querySelector('[data-k="action"]')?.value || '').toLowerCase();
    const durEl = tr.querySelector('[data-k="duration_seconds"]');
    if (durEl) durEl.disabled = !isTimeout(action);
  });

  tr.querySelector('[data-act="del"]')?.addEventListener('click', async () => {
    if (!confirm('Delete this rule?')) return;
    const id = tr.dataset.id;
    await api(`/dashboard/api/moderation/rules/${id}`, { method: 'DELETE' });
    await loadRules();
  });

  tr.querySelector('[data-act="save"]')?.addEventListener('click', async () => {
    const id = tr.dataset.id;

    const payload = {
      enabled: !!tr.querySelector('[data-k="enabled"]')?.checked,
      action: String(tr.querySelector('[data-k="action"]')?.value || 'timeout').toLowerCase(),
      duration_seconds: Number(tr.querySelector('[data-k="duration_seconds"]')?.value || 0) || 0,
    };

    if (!isTimeout(payload.action)) payload.duration_seconds = 0;

    await api(`/dashboard/api/moderation/rules/${id}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
    await loadRules();
  });

  return tr;
}

// --- Rules cache for quick toggles ---
let lastLoadedRules = [];

function normalizeSlug(s) {
  const x = String(s || '').trim().toLowerCase();
  return x || '';
}

function findGlobalRuleByType(type) {
  const t = String(type || '').toLowerCase();
  // Prefer rules with no channel slug (global)
  const globals = lastLoadedRules.filter(r => String(r.rule_type || '').toLowerCase() === t && !normalizeSlug(r.channel_slug));
  if (globals.length) return globals[0];
  // fallback: any rule of that type
  const any = lastLoadedRules.find(r => String(r.rule_type || '').toLowerCase() === t);
  return any || null;
}

async function setRuleEnabled(ruleId, enabled) {
  await api(`/dashboard/api/moderation/rules/${ruleId}`, {
    method: 'PUT',
    body: JSON.stringify({ enabled: !!enabled }),
  });
}

async function createRuleIfMissing(type, defaults) {
  const existing = findGlobalRuleByType(type);
  if (existing) {
    // Just enable it
    await setRuleEnabled(existing.id, true);
    return;
  }

  await api('/dashboard/api/moderation/rules', {
    method: 'POST',
    body: JSON.stringify({
      platform: platform(),
      rule_type: String(type).toLowerCase(),
      rule_value: defaults.rule_value ?? null,
      action: String(defaults.action || 'timeout').toLowerCase(),
      duration_seconds: Number(defaults.duration_seconds || 0) || 0,
      enabled: true,
      ignore_mods: defaults.ignore_mods ?? true,
      channel_slug: null,
    }),
  });
}

function syncQuickToggleUI() {
  const linkEl = qs('#m_quick_linkblock');
  const capsEl = qs('#m_quick_caps');

  if (linkEl) {
    const r = findGlobalRuleByType('link_posting');
    linkEl.checked = !!(r && r.enabled);
  }
  if (capsEl) {
    const r = findGlobalRuleByType('caps_ratio');
    capsEl.checked = !!(r && r.enabled);
  }
}

function wireQuickTogglesOnce() {
  const linkEl = qs('#m_quick_linkblock');
  const capsEl = qs('#m_quick_caps');

  if (linkEl && !linkEl.dataset.wired) {
    linkEl.dataset.wired = '1';
    linkEl.addEventListener('change', async () => {
      try {
        if (linkEl.checked) {
          await createRuleIfMissing('link_posting', { rule_value: null, action: 'timeout', duration_seconds: 30, ignore_mods: true });
        } else {
          const r = findGlobalRuleByType('link_posting');
          if (r) await setRuleEnabled(r.id, false);
        }
        await loadRules();
      } catch (err) {
        // roll back UI to actual state
        await loadRules();
        alert(err.message || 'Failed to update Block links');
      }
    });
  }

  if (capsEl && !capsEl.dataset.wired) {
    capsEl.dataset.wired = '1';
    capsEl.addEventListener('change', async () => {
      try {
        if (capsEl.checked) {
          await createRuleIfMissing('caps_ratio', { rule_value: '0.7', action: 'timeout', duration_seconds: 30, ignore_mods: true });
        } else {
          const r = findGlobalRuleByType('caps_ratio');
          if (r) await setRuleEnabled(r.id, false);
        }
        await loadRules();
      } catch (err) {
        await loadRules();
        alert(err.message || 'Failed to update Caps spam');
      }
    });
  }
}


async function loadRules() {
  const tbody = qs('#m_rules_tbody');
  if (!tbody) return;

  const out = await api(`/dashboard/api/moderation/rules?platform=${platform()}`);

  lastLoadedRules = (out.rules || []);
  tbody.innerHTML = '';
  lastLoadedRules.forEach(r => tbody.appendChild(ruleRow(r)));

  // Quick toggles (if present on page)
  wireQuickTogglesOnce();
  syncQuickToggleUI();
}


qs('#m_toggle_advanced')?.addEventListener('click', async (e) => {
  e.preventDefault();
  showAdvancedRuleFields = !showAdvancedRuleFields;
  qs('#m_toggle_advanced').textContent = showAdvancedRuleFields ? 'Hide advanced fields' : 'Show advanced fields';
  await loadRules();
});

// =====================================================
// Add rule modal
// =====================================================
function modalShow(show) {
  const m = qs('#m_add_rule_modal');
  if (!m) return;
  m.classList.toggle('hidden', !show);
  m.classList.toggle('flex', show);
}

function openAddRuleModalPrefill({ preset = 'contains', value = '', action = 'timeout', duration = 30 } = {}) {
  const statusEl = qs('#m_add_rule_status');
  if (statusEl) statusEl.textContent = '';

  const presetEl = qs('#m_new_rule_preset');
  if (presetEl) presetEl.value = preset;

  const actionEl = qs('#m_new_rule_action');
  if (actionEl) actionEl.value = action;

  const durEl = qs('#m_new_rule_duration');
  if (durEl) {
    durEl.value = duration;
    durEl.disabled = !isTimeout(action);
  }

  const valueEl = qs('#m_new_rule_value');
  if (valueEl) valueEl.value = value || '';

  const enabledEl = qs('#m_new_rule_enabled');
  if (enabledEl) enabledEl.checked = true;

  const ignoreModsEl = qs('#m_new_rule_ignore_mods');
  if (ignoreModsEl) ignoreModsEl.checked = true;

  const channelEl = qs('#m_new_rule_channel');
  if (channelEl) channelEl.value = '';

  modalShow(true);

  const meta = presetMeta(preset);

  const wrapEl = qs('#m_new_rule_value_wrap');
  if (wrapEl) wrapEl.classList.toggle('hidden', meta.valueKind === 'none');

  const helpEl = qs('#m_new_rule_value_hint');
  if (helpEl) {
    helpEl.textContent = (meta.valueKind === 'none')
      ? 'No value required.'
      : (meta.valueKind === 'number'
        ? 'Enter a number threshold.'
        : 'Enter the text to match.');
  }
}

// --- Add Rule modal wiring (open/close/create + dynamic fields) ---
function updateNewRuleValueUI() {
  const preset = String(qs('#m_new_rule_preset')?.value || 'contains').toLowerCase();
  const meta = presetMeta(preset);

  const wrapEl = qs('#m_new_rule_value_wrap');
  if (wrapEl) wrapEl.classList.toggle('hidden', meta.valueKind === 'none');

  // Your EJS uses these IDs:
  const labelEl = qs('#m_new_rule_value_label');
  const hintEl  = qs('#m_new_rule_value_hint');
  const inputEl = qs('#m_new_rule_value');

  if (labelEl) {
    labelEl.textContent =
      meta.valueKind === 'number' ? 'Threshold' :
      preset === 'blacklist_word' ? 'Word to match' :
      'Phrase to match';
  }

  if (hintEl) {
    hintEl.textContent =
      meta.valueKind === 'none' ? 'No value required.' :
      meta.valueKind === 'number' ? 'Example: 0.7 (70% caps). Higher = stricter.' :
      preset === 'equals' ? 'Must match the message exactly.' :
      'Matches anywhere in the message.';
  }

  if (inputEl) {
    if (meta.valueKind === 'number') inputEl.placeholder = 'e.g. 0.7';
    else if (preset === 'blacklist_word') inputEl.placeholder = 'e.g. followers';
    else inputEl.placeholder = 'e.g. free followers';
  }
}

function updateNewRuleDurationUI() {
  const action = String(qs('#m_new_rule_action')?.value || 'timeout').toLowerCase();

  const durEl = qs('#m_new_rule_duration');
  if (durEl) {
    durEl.disabled = !isTimeout(action);
    if (!isTimeout(action)) durEl.value = '0';
  }

  // UX: make the primary button describe what will happen
  const btn = qs('#m_create_rule');
  if (btn) {
    const label =
      action === 'ignore' ? 'Create exception (ignore)' :
      action === 'timeout' ? 'Create timeout rule' :
      action === 'ban' ? 'Create ban rule' :
      action === 'delete' ? 'Create delete rule' :
      'Create rule';
    btn.textContent = label;
  }

  // UX: surface a tiny hint when "ignore" is selected (uses the existing status line)
  const statusEl = qs('#m_add_rule_status');
  if (statusEl) {
    statusEl.textContent = (action === 'ignore')
      ? 'Ignore rules short-circuit: put them above punish rules to create safe exceptions.'
      : '';
  }
}

qs('#m_open_add_rule')?.addEventListener('click', () => {
  openAddRuleModalPrefill({ preset: 'contains', value: '', action: 'timeout', duration: 30 });
  updateNewRuleValueUI();
  updateNewRuleDurationUI();
});

qs('#m_close_add_rule')?.addEventListener('click', () => modalShow(false));

qs('#m_add_rule_modal')?.addEventListener('click', (e) => {
  if (e.target?.id === 'm_add_rule_modal') modalShow(false);
});

qs('#m_new_rule_preset')?.addEventListener('change', () => updateNewRuleValueUI());
qs('#m_new_rule_action')?.addEventListener('change', () => updateNewRuleDurationUI());

qs('#m_create_rule')?.addEventListener('click', async () => {
  const statusEl = qs('#m_add_rule_status');
  if (statusEl) statusEl.textContent = 'Creating…';

  try {
    const rule_type = String(qs('#m_new_rule_preset')?.value || 'contains').toLowerCase();
    const meta = presetMeta(rule_type);

    const action = String(qs('#m_new_rule_action')?.value || 'timeout').toLowerCase();
    let duration_seconds = Number(qs('#m_new_rule_duration')?.value || 0) || 0;
    if (!isTimeout(action)) duration_seconds = 0;

    const enabled = !!qs('#m_new_rule_enabled')?.checked;
    const ignore_mods = !!qs('#m_new_rule_ignore_mods')?.checked;

    const channel_slug_raw = String(qs('#m_new_rule_channel')?.value || '').trim();
    const channel_slug = channel_slug_raw || null;

    let rule_value = null;
    if (meta.valueKind !== 'none') {
      rule_value = String(qs('#m_new_rule_value')?.value || '').trim();
      if (!rule_value) throw new Error('Enter a value for this preset.');
    } else {
      rule_value = null;
    }

    await api('/dashboard/api/moderation/rules', {
      method: 'POST',
      body: JSON.stringify({
        platform: platform(),
        rule_type,
        rule_value,
        action,
        duration_seconds,
        enabled,
        ignore_mods,
        channel_slug,
      }),
    });

    if (statusEl) statusEl.textContent = 'Created.';
    modalShow(false);
    await loadRules();
  } catch (err) {
    if (statusEl) statusEl.textContent = err.message || 'Create failed';
  }
});

// Ensure correct initial UI if modal is already in DOM
updateNewRuleValueUI();
updateNewRuleDurationUI();

// =====================================================
// Test
// =====================================================

qs('#m_run_test')?.addEventListener('click', async () => {
  const outEl = qs('#m_test_out');
  if (!outEl) return;
  outEl.textContent = 'Running...';

  try {
    const payload = {
      platform: platform(),
      text: String(qs('#m_test_text')?.value || ''),
      senderUsername: String(qs('#m_test_sender')?.value || 'tester'),
      userRole: String(qs('#m_test_role')?.value || 'everyone'),
      channelSlug: '',
    };

    const out = await api('/dashboard/api/moderation/test', { method: 'POST', body: JSON.stringify(payload) });
    outEl.textContent = JSON.stringify(out, null, 2);
  } catch (err) {
    outEl.textContent = JSON.stringify({ ok: false, error: err.message || 'Error' }, null, 2);
  }
});

// =====================================================
// Shield panel (incidents + hot intel + overrides)
// =====================================================
function badgeSet(id, kind, text) {
  const el = qs('#' + id);
  if (!el) return;

  el.textContent = text;

  const cls = {
    neutral: 'bg-gray-800 text-gray-300',
    good: 'bg-emerald-900/60 text-emerald-200',
    warn: 'bg-amber-900/60 text-amber-200',
    bad: 'bg-red-900/60 text-red-200',
  }[kind] || 'bg-gray-800 text-gray-300';

  el.className = `text-xs px-2 py-1 rounded ${cls}`;
}

async function putOverride(signature_hash, mode) {
  const payload = { platform: platform(), signature_hash, mode, enabled: true, note: `Shield panel ${mode}` };
  await api('/dashboard/api/moderation/overrides', { method: 'PUT', body: JSON.stringify(payload) });
}

function renderHot(items) {
  const list = qs('#m_hot_list');
  const empty = qs('#m_hot_empty');
  if (!list || !empty) return;

  if (!items?.length) {
    empty.classList.remove('hidden');
    list.innerHTML = '';
    return;
  }

  empty.classList.add('hidden');
  list.innerHTML = items.slice(0, 10).map(h => `
    <div class="border border-gray-800 rounded-lg p-3 bg-black/20">
      <div class="text-sm font-semibold">${escapeHtml(h.signature || '')}</div>
      <div class="mt-1 text-xs text-gray-500">
        score: ${escapeHtml(h.score ?? '')} • seen: ${escapeHtml(h.count ?? '')}
      </div>
      <div class="mt-2 flex gap-2">
        <button class="text-xs px-2 py-1 rounded bg-gray-800 hover:bg-gray-700" data-ov="${escapeHtml(h.signature_hash)}" data-mode="allow">Allow</button>
        <button class="text-xs px-2 py-1 rounded bg-gray-800 hover:bg-gray-700" data-ov="${escapeHtml(h.signature_hash)}" data-mode="deny">Deny</button>
      </div>
    </div>
  `).join('');

  qsa('[data-ov]').forEach(b => b.addEventListener('click', async () => {
    const sig = b.getAttribute('data-ov');
    const mode = b.getAttribute('data-mode');
    await putOverride(sig, mode);
    await refreshShield();
  }));
}

function renderIncidents(items) {
  const list = qs('#m_incidents_list');
  const empty = qs('#m_incidents_empty');
  const tbody = qs('#m_incidents_tbody');

  if (list && empty) {
    if (!items?.length) {
      empty.classList.remove('hidden');
      list.innerHTML = '';
    } else {
      empty.classList.add('hidden');
      list.innerHTML = items.slice(0, 6).map(it => `
        <div class="border border-gray-800 rounded-lg p-3 bg-black/20">
          <div class="text-sm font-semibold">${escapeHtml(it.signature || '')}</div>
          <div class="mt-1 text-xs text-gray-500">
            users: ${escapeHtml(it.unique_users ?? '')}
            • repeats: ${escapeHtml(it.repeats ?? '')}
            • action: ${escapeHtml(it.action ?? '')}
          </div>
        </div>
      `).join('');
    }
  }

  if (tbody) {
    tbody.innerHTML = items?.length ? items.map(it => `
      <tr class="border-t border-gray-800">
        <td class="p-3 text-xs text-gray-400">${escapeHtml(fmtTime(it.created_at || it.ts || ''))}</td>
        <td class="p-3 text-sm font-mono">${escapeHtml(it.signature || '')}</td>
        <td class="p-3 text-sm">${escapeHtml(it.unique_users ?? '')}</td>
        <td class="p-3 text-sm">${escapeHtml(it.window_seconds ?? '')}</td>
        <td class="p-3 text-sm">${escapeHtml(it.action ?? '')}</td>
        <td class="p-3 text-right"></td>
      </tr>
    `).join('') : `
      <tr class="border-t border-gray-800">
        <td colspan="6" class="p-6 text-sm text-gray-500">No incidents yet.</td>
      </tr>
    `;
  }
}

async function refreshShield() {
  badgeSet('m_shield_status_badge', 'neutral', 'Refreshing…');

  const [inc, hot] = await Promise.all([
    api(`/dashboard/api/moderation/incidents?platform=${platform()}&limit=10`),
    api(`/dashboard/api/moderation/intel/hot?platform=${platform()}&limit=10`),
  ]);

  renderIncidents(inc.items || inc.incidents || []);
  renderHot(hot.items || hot.hot || []);

  badgeSet('m_shield_status_badge', 'good', 'Ready');
}

qs('#m_shield_refresh')?.addEventListener('click', refreshShield);
qs('#m_refresh_incidents')?.addEventListener('click', async () => {
  const out = await api(`/dashboard/api/moderation/incidents?platform=${platform()}&limit=50`);
  renderIncidents(out.items || out.incidents || []);
});

// =====================================================
// Activity (optional panel)
// =====================================================
async function loadActivity() {
  const tbody = qs('#m_activity_tbody');
  if (!tbody) return;

  const onlyMatched = !!qs('#m_only_matched')?.checked;
  const out = await api(`/dashboard/api/moderation/activity?platform=${platform()}&limit=200&onlyMatched=${onlyMatched}`);
  const items = out.items || [];

  tbody.innerHTML = items.length ? items.map(ev => `
    <tr class="border-t border-gray-800">
      <td class="p-3 text-xs text-gray-400">${escapeHtml(fmtTime(ev.created_at || ev.ts || ''))}</td>
      <td class="p-3 text-sm">${escapeHtml(ev.sender_username || ev.senderUsername || '')}</td>
      <td class="p-3 text-sm">${escapeHtml(shortText(ev.text || ''))}</td>
      <td class="p-3 text-sm">${escapeHtml(ev.decision || ev.action || '')}</td>
      <td class="p-3 text-right">
        <button class="text-xs px-2 py-1 rounded bg-gray-800 hover:bg-gray-700" data-explain="${escapeHtml(ev.text || '')}" data-user="${escapeHtml(ev.sender_username || ev.senderUsername || '')}">
          Explain
        </button>
      </td>
    </tr>
  `).join('') : `
    <tr class="border-t border-gray-800">
      <td colspan="5" class="p-6 text-sm text-gray-500">No activity yet.</td>
    </tr>
  `;

  qsa('[data-explain]').forEach(b => b.addEventListener('click', () => {
    const text = b.getAttribute('data-explain') || '';
    const user = b.getAttribute('data-user') || 'unknown';
    explainText(text, { senderUsername: user, userRole: 'everyone', channelSlug: '' });
  }));
}

qs('#m_refresh_activity')?.addEventListener('click', loadActivity);
qs('#m_only_matched')?.addEventListener('change', loadActivity);

// =====================================================
// Settings + Intensity
// =====================================================
function setVal(id, v) {
  const el = qs('#' + id);
  if (!el || v == null) return;
  el.value = String(v);
}

function setChecked(id, v) {
  const el = qs('#' + id);
  if (!el || v == null) return;
  el.checked = !!v;
}

function refreshBoundLabels() {
  // Optional: if you have any <span data-bind="..."> labels, update them here.
}

const INTENSITY_NAMES = ['Lite', 'Balanced', 'Strong', 'Heavy', 'Nuclear'];

const INTENSITY_PRESETS = [
  // Lite
  {
    swarm_enabled: true,
    swarm_window_seconds: 12,
    swarm_min_unique_users: 8,
    swarm_min_repeats: 10,
    swarm_action: 'timeout',
    swarm_duration_seconds: 30,
    swarm_cooldown_seconds: 180,

    sig_lowercase: true,
    sig_strip_punct: true,
    sig_collapse_ws: true,
    sig_strip_emojis: false,

    swarm_escalate: true,
    swarm_escalate_repeat_threshold: 2,
    swarm_escalate_action: 'ban',

    flood_enabled: true,
    flood_window_seconds: 10,
    flood_max_messages: 8,
    flood_action: 'timeout',
    flood_duration_seconds: 10,
    flood_escalate: true,
    flood_escalate_multiplier: 2,
    flood_max_duration_seconds: 600,
    flood_cooldown_seconds: 60,

    swarm_promote_global: true,
    swarm_promote_confidence: 0.75,
  },

  // Balanced
  {
    swarm_enabled: true,
    swarm_window_seconds: 10,
    swarm_min_unique_users: 6,
    swarm_min_repeats: 8,
    swarm_action: 'ban',
    swarm_duration_seconds: 0,
    swarm_cooldown_seconds: 120,

    sig_lowercase: true,
    sig_strip_punct: true,
    sig_collapse_ws: true,
    sig_strip_emojis: false,

    swarm_escalate: true,
    swarm_escalate_repeat_threshold: 2,
    swarm_escalate_action: 'ban',

    flood_enabled: true,
    flood_window_seconds: 10,
    flood_max_messages: 5,
    flood_action: 'timeout',
    flood_duration_seconds: 30,
    flood_escalate: true,
    flood_escalate_multiplier: 2,
    flood_max_duration_seconds: 600,
    flood_cooldown_seconds: 120,

    swarm_promote_global: true,
    swarm_promote_confidence: 0.75,
  },

  // Strong
  {
    swarm_enabled: true,
    swarm_window_seconds: 8,
    swarm_min_unique_users: 5,
    swarm_min_repeats: 7,
    swarm_action: 'ban',
    swarm_duration_seconds: 0,
    swarm_cooldown_seconds: 120,

    sig_lowercase: true,
    sig_strip_punct: true,
    sig_collapse_ws: true,
    sig_strip_emojis: false,

    swarm_escalate: true,
    swarm_escalate_repeat_threshold: 2,
    swarm_escalate_action: 'ban',

    flood_enabled: true,
    flood_window_seconds: 8,
    flood_max_messages: 4,
    flood_action: 'timeout',
    flood_duration_seconds: 60,
    flood_escalate: true,
    flood_escalate_multiplier: 2,
    flood_max_duration_seconds: 900,
    flood_cooldown_seconds: 120,

    swarm_promote_global: true,
    swarm_promote_confidence: 0.75,
  },

  // Heavy
  {
    swarm_enabled: true,
    swarm_window_seconds: 6,
    swarm_min_unique_users: 4,
    swarm_min_repeats: 6,
    swarm_action: 'ban',
    swarm_duration_seconds: 0,
    swarm_cooldown_seconds: 90,

    sig_lowercase: true,
    sig_strip_punct: true,
    sig_collapse_ws: true,
    sig_strip_emojis: false,

    swarm_escalate: true,
    swarm_escalate_repeat_threshold: 2,
    swarm_escalate_action: 'ban',

    flood_enabled: true,
    flood_window_seconds: 6,
    flood_max_messages: 3,
    flood_action: 'timeout',
    flood_duration_seconds: 120,
    flood_escalate: true,
    flood_escalate_multiplier: 2,
    flood_max_duration_seconds: 1200,
    flood_cooldown_seconds: 180,

    swarm_promote_global: true,
    swarm_promote_confidence: 0.75,
  },

  // Nuclear
  {
    swarm_enabled: true,
    swarm_window_seconds: 5,
    swarm_min_unique_users: 3,
    swarm_min_repeats: 5,
    swarm_action: 'ban',
    swarm_duration_seconds: 0,
    swarm_cooldown_seconds: 60,

    sig_lowercase: true,
    sig_strip_punct: true,
    sig_collapse_ws: true,
    sig_strip_emojis: false,

    swarm_escalate: true,
    swarm_escalate_repeat_threshold: 2,
    swarm_escalate_action: 'ban',

    flood_enabled: true,
    flood_window_seconds: 5,
    flood_max_messages: 2,
    flood_action: 'ban',
    flood_duration_seconds: 0,
    flood_escalate: true,
    flood_escalate_multiplier: 2,
    flood_max_duration_seconds: 1800,
    flood_cooldown_seconds: 300,

    swarm_promote_global: true,
    swarm_promote_confidence: 0.75,
  },
];

function setIntensityLabel(idx) {
  const el = qs('#m_guard_intensity_label');
  if (!el) return;
  el.textContent = INTENSITY_NAMES[idx] || 'Custom';
}

function resetIntensityUIBeforeSnap() {
  const r = qs('#m_guard_intensity');
  if (!r) return;
  const prev = suppressAutoSave;
  suppressAutoSave = true;
  try {
    r.value = '3';
    setIntensityLabel(3);
  } finally {
    suppressAutoSave = prev;
  }
}

function snapIntensityToClosestPreset() {
  const prev = suppressAutoSave;
  suppressAutoSave = true;

  try {
    const current = buildSettingsPayloadFromControls();

    let bestIdx = 1;
    let bestScore = Infinity;

    for (let i = 0; i < INTENSITY_PRESETS.length; i++) {
      const preset = INTENSITY_PRESETS[i];
      const score = presetDistance(preset, current);
      if (score < bestScore) {
        bestScore = score;
        bestIdx = i;
      }
    }

    const r = qs('#m_guard_intensity');
    if (r) r.value = String(bestIdx);
    setIntensityLabel(bestIdx);
  } finally {
    suppressAutoSave = prev;
  }
}

function presetDistance(preset, current) {
  let score = 0;

  const num = (a, b, w = 1) => { score += (Math.abs(Number(a ?? 0) - Number(b ?? 0)) * w); };
  const bool = (a, b, w = 1) => { score += ((!!a === !!b) ? 0 : w); };
  const str = (a, b, w = 1) => { score += (String(a ?? '') === String(b ?? '') ? 0 : w); };

  bool(preset.swarm_enabled, current.swarm_enabled, 6);
  num(preset.swarm_window_seconds, current.swarm_window_seconds, 1);
  num(preset.swarm_min_unique_users, current.swarm_min_unique_users, 3);
  num(preset.swarm_min_repeats, current.swarm_min_repeats, 3);
  num(preset.swarm_cooldown_seconds, current.swarm_cooldown_seconds, 1);
  str(preset.swarm_action, current.swarm_action, 8);
  num(preset.swarm_duration_seconds, current.swarm_duration_seconds, 0.2);

  bool(preset.swarm_promote_global, current.swarm_promote_global, 2);
  num(preset.swarm_promote_confidence, current.swarm_promote_confidence, 0.2);

  bool(preset.sig_lowercase, current.sig_lowercase, 2);
  bool(preset.sig_strip_punct, current.sig_strip_punct, 2);
  bool(preset.sig_collapse_ws, current.sig_collapse_ws, 2);
  bool(preset.sig_strip_emojis, current.sig_strip_emojis, 2);

  bool(preset.swarm_escalate, current.swarm_escalate, 4);
  num(preset.swarm_escalate_repeat_threshold, current.swarm_escalate_repeat_threshold, 2);
  str(preset.swarm_escalate_action, current.swarm_escalate_action, 6);

  bool(preset.flood_enabled, current.flood_enabled, 6);
  num(preset.flood_window_seconds, current.flood_window_seconds, 1);
  num(preset.flood_max_messages, current.flood_max_messages, 3);
  str(preset.flood_action, current.flood_action, 8);
  num(preset.flood_duration_seconds, current.flood_duration_seconds, 0.2);
  bool(preset.flood_escalate, current.flood_escalate, 2);
  num(preset.flood_escalate_multiplier, current.flood_escalate_multiplier, 1);
  num(preset.flood_max_duration_seconds, current.flood_max_duration_seconds, 0.05);
  num(preset.flood_cooldown_seconds, current.flood_cooldown_seconds, 0.2);

  return score;
}

function applyPresetToControls(preset) {
  const prev = suppressAutoSave;
  suppressAutoSave = true;

  try {
    setChecked('m_swarm_enabled', preset.swarm_enabled);
    setVal('m_swarm_window_seconds', preset.swarm_window_seconds);
    setVal('m_swarm_min_unique_users', preset.swarm_min_unique_users);
    setVal('m_swarm_min_repeats', preset.swarm_min_repeats);
    setVal('m_swarm_cooldown_seconds', preset.swarm_cooldown_seconds);
    if (qs('#m_swarm_action')) qs('#m_swarm_action').value = String(preset.swarm_action || 'timeout').toLowerCase();
    setVal('m_swarm_duration_seconds', preset.swarm_duration_seconds);

    setChecked('m_swarm_promote_global', preset.swarm_promote_global);
    setVal('m_swarm_promote_confidence', preset.swarm_promote_confidence);

    setChecked('m_sig_lowercase', preset.sig_lowercase);
    setChecked('m_sig_strip_punct', preset.sig_strip_punct);
    setChecked('m_sig_collapse_ws', preset.sig_collapse_ws);
    setChecked('m_sig_strip_emojis', preset.sig_strip_emojis);

    setChecked('m_swarm_escalate', preset.swarm_escalate);
    setVal('m_swarm_escalate_repeat_threshold', preset.swarm_escalate_repeat_threshold);
    if (qs('#m_swarm_escalate_action')) qs('#m_swarm_escalate_action').value = String(preset.swarm_escalate_action || 'ban').toLowerCase();

    setChecked('m_flood_enabled', preset.flood_enabled);
    setVal('m_flood_window_seconds', preset.flood_window_seconds);
    setVal('m_flood_max_messages', preset.flood_max_messages);
    if (qs('#m_flood_action')) qs('#m_flood_action').value = String(preset.flood_action || 'timeout').toLowerCase();
    setVal('m_flood_duration_seconds', preset.flood_duration_seconds);
    setChecked('m_flood_escalate', preset.flood_escalate);
    setVal('m_flood_escalate_multiplier', preset.flood_escalate_multiplier);
    setVal('m_flood_max_duration_seconds', preset.flood_max_duration_seconds);
    setVal('m_flood_cooldown_seconds', preset.flood_cooldown_seconds);

    if (qs('#m_swarm_duration_seconds')) qs('#m_swarm_duration_seconds').disabled = !isTimeout(qs('#m_swarm_action')?.value);
    if (qs('#m_flood_duration_seconds')) qs('#m_flood_duration_seconds').disabled = !isTimeout(qs('#m_flood_action')?.value);

    refreshBoundLabels();
  } finally {
    suppressAutoSave = prev;
  }
}

function buildSettingsPayloadFromControls() {
  const payload = {
    platform: platform(),

    swarm_enabled: !!qs('#m_swarm_enabled')?.checked,
    swarm_window_seconds: Number(qs('#m_swarm_window_seconds')?.value || 10) || 10,
    swarm_min_unique_users: Number(qs('#m_swarm_min_unique_users')?.value || 6) || 6,
    swarm_min_repeats: Number(qs('#m_swarm_min_repeats')?.value || 8) || 8,
    swarm_cooldown_seconds: Number(qs('#m_swarm_cooldown_seconds')?.value || 120) || 120,
    swarm_action: String(qs('#m_swarm_action')?.value || 'timeout').toLowerCase(),
    swarm_duration_seconds: Number(qs('#m_swarm_duration_seconds')?.value || 30) || 30,

    swarm_promote_global: !!qs('#m_swarm_promote_global')?.checked,
    swarm_promote_confidence: Number(qs('#m_swarm_promote_confidence')?.value || 0.75) || 0.75,

    sig_lowercase: !!qs('#m_sig_lowercase')?.checked,
    sig_strip_punct: !!qs('#m_sig_strip_punct')?.checked,
    sig_collapse_ws: !!qs('#m_sig_collapse_ws')?.checked,
    sig_strip_emojis: !!qs('#m_sig_strip_emojis')?.checked,

    swarm_escalate: !!qs('#m_swarm_escalate')?.checked,
    swarm_escalate_repeat_threshold: Number(qs('#m_swarm_escalate_repeat_threshold')?.value || 2) || 2,
    swarm_escalate_action: String(qs('#m_swarm_escalate_action')?.value || 'ban').toLowerCase(),

    flood_enabled: !!qs('#m_flood_enabled')?.checked,
    flood_window_seconds: Number(qs('#m_flood_window_seconds')?.value || 10) || 10,
    flood_max_messages: Number(qs('#m_flood_max_messages')?.value || 5) || 5,
    flood_action: String(qs('#m_flood_action')?.value || 'timeout').toLowerCase(),
    flood_duration_seconds: Number(qs('#m_flood_duration_seconds')?.value || 30) || 30,
    flood_escalate: !!qs('#m_flood_escalate')?.checked,
    flood_escalate_multiplier: Number(qs('#m_flood_escalate_multiplier')?.value || 2) || 2,
    flood_max_duration_seconds: Number(qs('#m_flood_max_duration_seconds')?.value || 600) || 600,
    flood_cooldown_seconds: Number(qs('#m_flood_cooldown_seconds')?.value || 120) || 120,
  };

  if (!isTimeout(payload.swarm_action)) payload.swarm_duration_seconds = 0;
  if (!isTimeout(payload.flood_action)) payload.flood_duration_seconds = 0;

  return payload;
}

async function saveSettingsNow() {
  setSettingsStatus('Saving...');
  const payload = buildSettingsPayloadFromControls();

  await api(`/dashboard/api/moderation/settings?platform=${encodeURIComponent(platform())}`, {
  method: 'PUT',
  body: JSON.stringify(payload),
});


  await loadSettings();

  setSettingsStatus('Saved.', { autoClear: true });

  if (postSaveHooks.length) {
    const hooks = postSaveHooks;
    postSaveHooks = [];
    try { hooks.forEach(fn => fn()); } catch (_) {}
  }

  const shield = qs('#m_shield_status_line');
  if (shield && /auto-saving/i.test(shield.textContent || '')) {
    shield.textContent = '';
  }
}

qs('#m_save_settings')?.addEventListener('click', async () => {
  try { await saveNowImmediate(); } catch (_) {}
});

async function loadSettings() {
  const prev = suppressAutoSave;
  suppressAutoSave = true;

  try {
    const out = await api(`/dashboard/api/moderation/settings?platform=${platform()}`);
    const s = out.settings || out || {};
    lastLoadedSettings = s;

    setChecked('m_swarm_enabled', s.swarm_enabled);
    if (s.swarm_window_seconds != null) setVal('m_swarm_window_seconds', s.swarm_window_seconds);
    if (s.swarm_min_unique_users != null) setVal('m_swarm_min_unique_users', s.swarm_min_unique_users);
    if (s.swarm_min_repeats != null) setVal('m_swarm_min_repeats', s.swarm_min_repeats);
    if (s.swarm_cooldown_seconds != null) setVal('m_swarm_cooldown_seconds', s.swarm_cooldown_seconds);
    if (qs('#m_swarm_action') && s.swarm_action != null) qs('#m_swarm_action').value = String(s.swarm_action).toLowerCase();
    if (s.swarm_duration_seconds != null) setVal('m_swarm_duration_seconds', s.swarm_duration_seconds);

    setChecked('m_swarm_promote_global', s.swarm_promote_global);
    if (s.swarm_promote_confidence != null) setVal('m_swarm_promote_confidence', s.swarm_promote_confidence);

    setChecked('m_sig_lowercase', s.sig_lowercase);
    setChecked('m_sig_strip_punct', s.sig_strip_punct);
    setChecked('m_sig_collapse_ws', s.sig_collapse_ws);
    setChecked('m_sig_strip_emojis', s.sig_strip_emojis);

    setChecked('m_swarm_escalate', s.swarm_escalate);
    if (s.swarm_escalate_repeat_threshold != null) setVal('m_swarm_escalate_repeat_threshold', s.swarm_escalate_repeat_threshold);
    if (qs('#m_swarm_escalate_action') && s.swarm_escalate_action != null) qs('#m_swarm_escalate_action').value = String(s.swarm_escalate_action).toLowerCase();

    setChecked('m_flood_enabled', s.flood_enabled);
    if (s.flood_window_seconds != null) setVal('m_flood_window_seconds', s.flood_window_seconds);
    if (s.flood_max_messages != null) setVal('m_flood_max_messages', s.flood_max_messages);
    if (qs('#m_flood_action') && s.flood_action != null) qs('#m_flood_action').value = String(s.flood_action).toLowerCase();
    if (s.flood_duration_seconds != null) setVal('m_flood_duration_seconds', s.flood_duration_seconds);
    setChecked('m_flood_escalate', s.flood_escalate);
    if (s.flood_escalate_multiplier != null) setVal('m_flood_escalate_multiplier', s.flood_escalate_multiplier);
    if (s.flood_max_duration_seconds != null) setVal('m_flood_max_duration_seconds', s.flood_max_duration_seconds);
    if (s.flood_cooldown_seconds != null) setVal('m_flood_cooldown_seconds', s.flood_cooldown_seconds);

    if (qs('#m_swarm_duration_seconds')) qs('#m_swarm_duration_seconds').disabled = !isTimeout(qs('#m_swarm_action')?.value);
    if (qs('#m_flood_duration_seconds')) qs('#m_flood_duration_seconds').disabled = !isTimeout(qs('#m_flood_action')?.value);

    refreshBoundLabels();
    snapIntensityToClosestPreset();
  } finally {
    suppressAutoSave = prev;
  }
}

function wireIntensitySlider() {
  const r = qs('#m_guard_intensity');
  if (!r) return;

  resetIntensityUIBeforeSnap();

  r.addEventListener('input', () => {
    setIntensityLabel(Number(r.value) || 0);
  });

  r.addEventListener('change', async () => {
    if (suppressAutoSave) return;

    const idx = Math.max(0, Math.min(4, Number(r.value) || 0));
    setIntensityLabel(idx);

    // Apply preset to underlying controls
    applyPresetToControls(INTENSITY_PRESETS[idx]);

    // ✅ Easter egg: only when transitioning INTO Nuclear
    if (idx === 4 && lastIntensityIdx !== 4) {
      triggerNuclearFlash();
    }
    lastIntensityIdx = idx;

    // ✅ Autosave ONLY for the main slider (as agreed)
    try {
      setSettingsStatus('Saving intensity...');
      await saveNowImmediate();
      setSettingsStatus('Intensity saved.', { autoClear: true });
    } catch (err) {
      setSettingsStatus(err.message || 'Failed to save intensity');
    }
  });

  setIntensityLabel(Number(r.value) || 0);
}


let lastIntensityIdx = null;

function shouldReduceMotion() {
  try {
    return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

function triggerNuclearFlash() {
  if (shouldReduceMotion()) return;

  const el = qs('#m_nuclear_flash');
  if (!el) return;

  // Restart animation reliably
  el.classList.remove('is-flashing');
  void el.offsetWidth;
  el.classList.add('is-flashing');

  window.setTimeout(() => {
    el.classList.remove('is-flashing');
  }, 2000);
}



function wireSettingsAutoSave() {
  if (!AUTO_SAVE_ANY_SETTINGS_CHANGE) return;

  const ids = [
    'm_swarm_enabled','m_swarm_window_seconds','m_swarm_min_unique_users','m_swarm_min_repeats','m_swarm_cooldown_seconds',
    'm_swarm_action','m_swarm_duration_seconds','m_swarm_promote_global','m_swarm_promote_confidence',

    'm_sig_lowercase','m_sig_strip_punct','m_sig_collapse_ws','m_sig_strip_emojis',
    'm_swarm_escalate','m_swarm_escalate_repeat_threshold','m_swarm_escalate_action',

    'm_flood_enabled','m_flood_window_seconds','m_flood_max_messages','m_flood_action','m_flood_duration_seconds',
    'm_flood_escalate','m_flood_escalate_multiplier','m_flood_max_duration_seconds','m_flood_cooldown_seconds',
  ];

  ids.forEach(id => {
    const el = qs('#' + id);
    if (!el) return;
    const ev = (el.type === 'checkbox') ? 'change' : 'input';

    el.addEventListener(ev, () => {
      if (suppressAutoSave) return;
      scheduleSave('settings');
    });
  });
}

// =====================================================
// Platform change
// =====================================================
qs('#m_platform')?.addEventListener('change', async () => {
  try {
    await Promise.all([
      loadRules(),
      refreshShield(),
      loadActivity(),
      loadSettings(),
    ]);
  } catch (err) {
    setSettingsStatus(err.message || 'Failed to reload');
  }
});

// =====================================================
// Boot
// =====================================================
(async function boot() {
  try {
    setActiveTab('rules');
    wireIntensitySlider();
    wireSettingsAutoSave();

    await Promise.all([
      loadRules(),
      refreshShield(),
      loadActivity(),
      loadSettings(),
    ]);

    setSettingsStatus('');
  } catch (err) {
    setSettingsStatus(err.message || 'Boot failed');
    console.error('[moderation] boot failed', err);
  }
})();

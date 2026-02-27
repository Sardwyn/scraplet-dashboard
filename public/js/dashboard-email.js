// /public/js/dashboard-email.js
// Tabs + Pro gating + Template View modal (module-safe).

function setActiveEmailTab(tabName) {
  const tabButtons = Array.from(document.querySelectorAll('[data-email-tab]'));
  const panels = Array.from(document.querySelectorAll('[data-email-panel]'));

  tabButtons.forEach((btn) => {
    const name = btn.getAttribute('data-email-tab');
    const active = name === tabName;

    btn.setAttribute('aria-selected', active ? 'true' : 'false');
    btn.classList.toggle('border-emerald-500', active);
    btn.classList.toggle('text-emerald-300', active);
    btn.classList.toggle('font-medium', active);

    btn.classList.toggle('border-transparent', !active);
    btn.classList.toggle('text-gray-400', !active);
  });

  panels.forEach((panel) => {
    panel.hidden = panel.getAttribute('data-email-panel') !== tabName;
  });
}

function initEmailTabs() {
  const tabButtons = document.querySelectorAll('[data-email-tab]');
  const panels = document.querySelectorAll('[data-email-panel]');
  if (!tabButtons.length || !panels.length) return;

  document.addEventListener('click', (e) => {
    const btn = e.target?.closest?.('[data-email-tab]');
    if (!btn) return;
    e.preventDefault();
    setActiveEmailTab(btn.getAttribute('data-email-tab') || 'overview');
  });

  setActiveEmailTab('overview');
}

function initProGating() {
  const root = document.getElementById('email-root');
  const isPro = root?.dataset?.isPro === 'true';
  if (isPro) return;

  document.querySelectorAll('[data-pro-only="true"]').forEach((el) => {
    el.setAttribute('disabled', 'true');
    el.classList.add('cursor-not-allowed');
    el.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      alert('This feature is part of Scraplet Pro.');
    });
  });
}

async function fetchJson(url) {
  const res = await fetch(url, { credentials: 'include' });
  const ct = res.headers.get('content-type') || '';
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`);
  }
  if (!ct.includes('application/json')) {
    const text = await res.text();
    throw new Error(`Expected JSON but got: ${ct}. Body starts: ${text.slice(0, 120)}`);
  }
  return res.json();
}

function initTemplateModal() {
  const modal = document.getElementById('template-modal');
  if (!modal) return;

  const backdrop = document.getElementById('template-modal-backdrop');
  const closeBtn = document.getElementById('template-modal-close');

  const titleEl = document.getElementById('template-modal-title');
  const metaEl = document.getElementById('template-modal-meta');
  const subjEl = document.getElementById('template-modal-subject');
  const htmlEl = document.getElementById('template-modal-html');
  const textEl = document.getElementById('template-modal-text');

  function open() {
    modal.classList.remove('hidden');
    modal.setAttribute('aria-hidden', 'false');
  }
  function close() {
    modal.classList.add('hidden');
    modal.setAttribute('aria-hidden', 'true');
  }

  backdrop?.addEventListener('click', close);
  closeBtn?.addEventListener('click', close);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') close();
  });

  async function loadTemplate(id) {
    titleEl.textContent = 'Template';
    metaEl.textContent = 'Loading…';
    subjEl.textContent = '—';
    htmlEl.textContent = '—';
    textEl.textContent = '—';

    open();

    const data = await fetchJson(`/profile/email/templates/${id}.json`);
    if (!data.ok) throw new Error(data.error || 'Unknown error');

    const t = data.template;
    titleEl.textContent = t.name || `Template #${t.id}`;
    metaEl.textContent = `${t.kind || '—'} • ${t.user_id ? 'Custom' : 'System'} • Updated: ${t.updated_at || '—'}`;
    subjEl.textContent = t.subject || '—';
    htmlEl.textContent = t.html_body || '(empty)';
    textEl.textContent = t.text_body || '(empty)';
  }

  document.addEventListener('click', async (e) => {
    const btn = e.target?.closest?.('[data-template-view]');
    if (!btn) return;

    e.preventDefault();
    const id = btn.getAttribute('data-template-id');
    if (!id) return;

    try {
      await loadTemplate(id);
    } catch (err) {
      console.error('[template-modal] failed:', err);
      metaEl.textContent = 'Failed to load template.';
      htmlEl.textContent = String(err?.message || err);
      textEl.textContent = '';
    }
  });
}

function initEmailPage() {
  initEmailTabs();
  initProGating();
  initTemplateModal();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initEmailPage);
} else {
  initEmailPage();
}

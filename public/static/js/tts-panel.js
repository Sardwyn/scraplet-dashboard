// public/static/js/tts-panel.js
// Handles the TTS panel on public profile pages.
// Fetches voices, shows voice picker + price, handles Stripe payment.

(function () {
  'use strict';

  const STRIPE_PK = window.STRIPE_PUBLISHABLE_KEY || '';

  function initTtsPanel() {
    const openBtns = document.querySelectorAll('[data-tts-open]');
    if (!openBtns.length) return;

    openBtns.forEach(function (btn) {
      const creator = btn.getAttribute('data-tts-creator') || '';
      const panel = btn.closest('section')?.querySelector('[data-tts-panel]');
      if (!panel) return;

      btn.addEventListener('click', function () {
        panel.hidden = false;
        btn.hidden = true;
        loadVoices(creator, panel);
      });

      const closeBtn = panel.querySelector('[data-tts-close]');
      if (closeBtn) {
        closeBtn.addEventListener('click', function () {
          panel.hidden = true;
          btn.hidden = false;
          resetPanel(panel);
        });
      }
    });
  }

  function resetPanel(panel) {
    const voicePicker = panel.querySelector('[data-tts-voice-picker]');
    const paymentSection = panel.querySelector('[data-tts-payment]');
    const textarea = panel.querySelector('[data-tts-input]');
    const note = panel.querySelector('[data-tts-note]');
    if (voicePicker) voicePicker.innerHTML = '';
    if (paymentSection) paymentSection.hidden = true;
    if (textarea) textarea.value = '';
    if (note) note.textContent = '';
  }

  async function loadVoices(channelSlug, panel) {
    const note = panel.querySelector('[data-tts-note]');
    if (note) note.textContent = 'Loading voices...';

    try {
      const resp = await fetch('/api/tts/voices/' + channelSlug);
      const data = await resp.json();

      if (!data.ok || data.disabled) {
        if (note) note.textContent = 'TTS is not enabled for this streamer.';
        return;
      }

      const voices = data.voices || [];
      if (!voices.length) {
        if (note) note.textContent = 'No voices available.';
        return;
      }

      renderVoicePicker(voices, channelSlug, panel, data.userId);
      if (note) note.textContent = '';
    } catch (e) {
      if (note) note.textContent = 'Failed to load voices. Try again.';
    }
  }

  function renderVoicePicker(voices, channelSlug, panel, userId) {
    // Build or find voice picker container
    let picker = panel.querySelector('[data-tts-voice-picker]');
    if (!picker) {
      picker = document.createElement('div');
      picker.setAttribute('data-tts-voice-picker', '');
      picker.style.cssText = 'margin: 10px 0; display: flex; flex-wrap: wrap; gap: 8px;';
      const textarea = panel.querySelector('[data-tts-input]');
      if (textarea) panel.insertBefore(picker, textarea);
      else panel.appendChild(picker);
    }
    picker.innerHTML = '';

    let selectedVoice = null;

    voices.forEach(function (voice) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.style.cssText = 'padding: 6px 12px; border-radius: 20px; border: 1px solid rgba(255,255,255,0.2); background: rgba(255,255,255,0.05); color: #fff; cursor: pointer; font-size: 13px; transition: all 0.15s;';
      const price = voice.price_cents === 0 ? 'Free' : '$' + (voice.price_cents / 100).toFixed(2);
      btn.textContent = voice.name + ' — ' + price;
      btn.setAttribute('data-voice-id', voice.voice_id);
      btn.setAttribute('data-voice-tier', voice.tier);
      btn.setAttribute('data-price-cents', voice.price_cents);

      btn.addEventListener('click', function () {
        // Deselect all
        picker.querySelectorAll('button').forEach(function (b) {
          b.style.background = 'rgba(255,255,255,0.05)';
          b.style.borderColor = 'rgba(255,255,255,0.2)';
        });
        // Select this
        btn.style.background = 'rgba(99,102,241,0.3)';
        btn.style.borderColor = '#6366f1';
        selectedVoice = voice;
        updateSubmitState(panel, selectedVoice);
      });

      picker.appendChild(btn);
    });

    // Wire submit button
    const submitBtn = panel.querySelector('[data-tts-submit]');
    const textarea = panel.querySelector('[data-tts-input]');

    if (textarea) {
      textarea.addEventListener('input', function () {
        updateSubmitState(panel, selectedVoice);
        const counter = panel.querySelector('[data-tts-counter]');
        if (counter) counter.textContent = textarea.value.length + ' / 500';
      });
    }

    if (submitBtn) {
      submitBtn.addEventListener('click', function () {
        if (!selectedVoice || !textarea?.value.trim()) return;
        if (selectedVoice.tier === 'free') {
          // Free tier — show instruction
          const note = panel.querySelector('[data-tts-note]');
          if (note) note.textContent = 'Free TTS: type !tts ' + textarea.value.trim() + ' in chat.';
        } else {
          // Paid tier — initiate Stripe payment
          initStripePayment(selectedVoice, textarea.value.trim(), channelSlug, panel);
        }
      });
    }
  }

  function updateSubmitState(panel, selectedVoice) {
    const submitBtn = panel.querySelector('[data-tts-submit]');
    const textarea = panel.querySelector('[data-tts-input]');
    if (!submitBtn) return;
    const hasText = textarea?.value.trim().length > 0;
    const hasVoice = !!selectedVoice;
    submitBtn.disabled = !(hasText && hasVoice);
    if (selectedVoice && selectedVoice.price_cents > 0) {
      submitBtn.textContent = 'Pay $' + (selectedVoice.price_cents / 100).toFixed(2) + ' & Send';
    } else if (selectedVoice) {
      submitBtn.textContent = 'Send (Free — use !tts in chat)';
    } else {
      submitBtn.textContent = 'Select a voice';
    }
  }

  async function initStripePayment(voice, text, channelSlug, panel) {
    const note = panel.querySelector('[data-tts-note]');
    if (note) note.textContent = 'Preparing payment...';

    try {
      // Create PaymentIntent
      const resp = await fetch('/api/tts/paid/intent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channelSlug, voiceId: voice.voice_id, text }),
      });
      const data = await resp.json();
      if (!data.ok) {
        if (note) note.textContent = 'Payment setup failed: ' + (data.error || 'unknown error');
        return;
      }

      if (!STRIPE_PK) {
        if (note) note.textContent = 'Stripe not configured.';
        return;
      }

      // Mount Stripe Elements
      const stripeObj = Stripe(STRIPE_PK);
      const elements = stripeObj.elements({ clientSecret: data.clientSecret });
      const paymentElement = elements.create('payment');

      // Create payment container
      let paymentDiv = panel.querySelector('[data-tts-payment]');
      if (!paymentDiv) {
        paymentDiv = document.createElement('div');
        paymentDiv.setAttribute('data-tts-payment', '');
        panel.appendChild(paymentDiv);
      }
      paymentDiv.innerHTML = '';
      paymentDiv.hidden = false;
      paymentElement.mount(paymentDiv);

      // Add confirm button
      const confirmBtn = document.createElement('button');
      confirmBtn.type = 'button';
      confirmBtn.className = 'pc-contact-button';
      confirmBtn.style.marginTop = '10px';
      confirmBtn.textContent = 'Confirm Payment — $' + (data.priceCents / 100).toFixed(2);
      paymentDiv.appendChild(confirmBtn);

      if (note) note.textContent = 'Enter your card details below.';

      confirmBtn.addEventListener('click', async function () {
        confirmBtn.disabled = true;
        confirmBtn.textContent = 'Processing...';

        const result = await stripeObj.confirmPayment({
          elements,
          redirect: 'if_required',
        });

        if (result.error) {
          if (note) note.textContent = 'Payment failed: ' + result.error.message;
          confirmBtn.disabled = false;
          confirmBtn.textContent = 'Try Again';
          return;
        }

        // Payment succeeded — confirm with server
        const confirmResp = await fetch('/api/tts/paid/confirm', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            intentId: data.intentId,
            channelSlug,
            voiceId: voice.voice_id,
            text,
          }),
        });
        const confirmData = await confirmResp.json();

        if (confirmData.ok) {
          paymentDiv.hidden = true;
          if (note) note.textContent = '✅ TTS queued! It will play on stream shortly.';
          panel.querySelector('[data-tts-input]').value = '';
        } else {
          if (note) note.textContent = 'Something went wrong. Contact support with ref: ' + data.intentId;
        }
      });
    } catch (e) {
      if (note) note.textContent = 'Error: ' + e.message;
    }
  }

  // Init on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initTtsPanel);
  } else {
    initTtsPanel();
  }
})();

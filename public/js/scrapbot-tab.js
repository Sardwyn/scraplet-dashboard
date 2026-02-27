// public/js/scrapbot-tab.js
// Dynamic rendering logic for the Scrapbot dashboard tab.

(function () {
    const container = document.getElementById('scrapbot_moderation_review');
    const dataEl = document.getElementById('scrapbot_moderation_data');
    if (!container || !dataEl) return;

    try {
        const reviews = JSON.parse(dataEl.textContent || '[]');
        if (reviews.length === 0) {
            container.innerHTML = '<div class="text-xs text-white/30 italic">No recent moderation decisions found.</div>';
            return;
        }

        let html = '';
        reviews.forEach(r => {
            const ts = new Date(r.ts).toLocaleString();
            const action = r.moderation?.action || r.flood?.action || r.swarm?.action || 'passed';
            const actionColor = action === 'passed' ? 'text-green-400' : 'text-red-400';
            const reason = r.moderation?.reason || r.flood?.reason || r.swarm?.reason || '';

            html += `
        <div class="p-3 bg-white/5 border border-white/5 rounded-lg">
          <div class="flex items-center justify-between mb-2">
            <div class="flex items-center gap-2">
              <span class="text-xs font-bold font-mono ${actionColor} uppercase">${action}</span>
              <span class="text-[10px] text-white/30 font-mono">${ts}</span>
            </div>
            <div class="text-[10px] text-white/50">@${r.senderUsername || 'unknown'}</div>
          </div>
          <div class="text-sm text-white/80 mb-1">"${r.text_preview || ''}"</div>
          ${reason ? `<div class="text-[10px] text-white/40 italic">Reason: ${reason}</div>` : ''}
        </div>
      `;
        });

        container.innerHTML = html;
    } catch (e) {
        console.error('[scrapbot-tab] Failed to render moderation reviews', e);
        container.innerHTML = '<div class="text-xs text-red-500 italic">Error loading reviews.</div>';
    }
})();

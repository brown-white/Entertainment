'use strict';
/* AUREA · pages/assistant.js — staff page: Assistant (only when the hotel set an assistant address).
   Uses: core/state · translations/languages · core/utils · core/actions · core/router */
/* ---------- Assistant (only if the hotel set an assistant address) ---------- */
page('assistant', {
  perm: 'myday', icon: 'sparkle', group: 'team', show: () => !!S.settings.ai_endpoint,
  render: async () => `<div class="card"><form onsubmit="return false"><textarea id="ai-q" rows="3" aria-label="${esc(t('your_question'))}" placeholder="${esc(t('your_question'))}"></textarea><button class="btn" data-act="ai_ask">${esc(t('ask'))}</button></form><div id="ai-a" class="prose"></div></div>`
});
ACT.ai_ask = async el => {
  const q = $('#ai-q').value.trim(); if (!q) return; el.disabled = true; $('#ai-a').textContent = t('loading');
  try {
    const r = await fetch(S.settings.ai_endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ question: q, lang: S.lang, hotel: S.hotel?.name, team: S.team?.name }) });
    const txt = await r.text(); let a = txt; try { const j = JSON.parse(txt); a = j.answer || j.text || j.message || txt; } catch { /* plain text */ }
    $('#ai-a').innerHTML = nl2br(a);
  } catch { $('#ai-a').textContent = t('err_offline'); } finally { el.disabled = false; }
};

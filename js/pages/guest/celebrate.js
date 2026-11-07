'use strict';
/* Mr Hassan · pages/guest/celebrate.js — guest app: CELEBRATE WITH US – a birthday, an anniversary, a proposal, a honeymoon surprise, any
   celebration: what, when, where, what should be there (cake, music, a song, decoration …), a note. ONE structured request (who: the
   signed-in stay – nothing to type about oneself); the guest follows it in simple steps (Submitted · Under review · Confirmed ·
   Completed · Unable to fulfil), answers the team's question, can cancel it. Never the team's notes, people or costs.
   Uses: core/state · translations/languages · supabase · core/utils · icons/icons · components/modals · core/actions · components/cards ·
         core/router · components/forms · systems/guest-lifecycle · systems/operations */
let gCel = { type: 'birthday', place: '', wants: [] };
page('g_celebrate', {
  mode: 'guest', title: 'celebrate',
  render: async () => {
    if (gSet().f_events !== true) return empty(t('not_found'));
    if (!signedIn()) return empty(t('sign_in_for_celebrate'), `<a class="btn" href="#/g_stay">${esc(t('sign_in'))}</a>`);
    const st = S.g.me.stay, mine = S.g.me.requests || [], today = D.today(), max = st.departure;
    const pick = (k, list, cur, lab, multi) => `<div class="chips pick" role="group" data-pick="${k}">${list.map(x => `<button type="button" class="chip-btn ${(multi ? cur.includes(x) : cur === x) ? 'on' : ''}" data-act="g_cel_pick" data-k="${k}" data-v="${x}" aria-pressed="${multi ? cur.includes(x) : cur === x}">${esc(lab(x))}</button>`).join('')}</div>`;
    const form = S.g.me.active ? `<form class="card cel-form" id="g-cel" onsubmit="return false"><p class="muted">${esc(t('cel_intro'))}</p>
      <h3>${esc(t('cel_what'))}</h3>${pick('type', REQ_TYPES, gCel.type, x => t('rq_' + x))}
      <h3>${esc(t('cel_when'))}</h3><div class="grid2">${fieldHtml({ k: 'date', type: 'date', label: t('date'), req: true, min: today, max }, gCel.date || '')}${fieldHtml({ k: 'time', type: 'time', label: t('cel_time') }, gCel.time || '')}</div>
      <h3>${esc(t('cel_where'))}</h3>${pick('place', REQ_PLACES.concat(['other']), gCel.place, placeLabel2)}${gCel.place === 'other' ? fieldHtml({ k: 'other', label: t('place_other') }, gCel.other || '') : ''}
      <h3>${esc(t('cel_wants'))}</h3>${pick('wants', REQ_WANTS, gCel.wants, x => t('want_' + x), true)}
      ${gCel.wants.includes('music') || gCel.wants.includes('song') ? fieldHtml({ k: 'song', label: t('cel_song') }, gCel.song || '') : ''}
      ${fieldHtml({ k: 'notes', type: 'textarea', rows: 3, label: t('cel_notes'), hint: t('cel_notes_hint') }, gCel.notes || '')}
      <button class="btn wide" data-act="g_cel_send">${ico('gift')} ${esc(t('cel_send'))}</button></form>` : '';
    return form + (mine.length ? `<section><h2>${esc(t('cel_mine'))}</h2><div class="list">${mine.map(r => `<div class="li cel-req"><div class="row"><b class="grow">${esc(t('rq_' + r.type))}</b>${gStep(r.status)}</div>
        <small class="muted">${esc([D.short(r.date) + (r.time ? ' ' + r.time : ''), placeLabel(r.location), (r.wants || []).map(w => t('want_' + w)).join(', ')].filter(Boolean).join(' · '))}</small>
        ${r.message ? `<p class="hint-box">${ico('chat')}<span>${nl2br(r.message)}</span></p>` : ''}${r.reply ? `<p class="reply">${esc(r.reply)}</p>` : ''}
        ${r.question ? `<form class="row cel-reply" onsubmit="return false"><input name="reply" placeholder="${esc(t('cel_answer_ph'))}" aria-label="${esc(t('cel_answer_ph'))}"><button class="btn small" data-act="g_cel_reply" data-id="${r.id}">${esc(t('send'))}</button></form>` : ''}
        ${['submitted', 'review', 'confirmed'].includes(r.status) ? `<div class="actions"><button class="btn secondary small" data-act="g_cel_cancel" data-id="${r.id}">${esc(t('cel_cancel'))}</button></div>` : ''}</div>`).join('')}</div></section>` : '');
  }
});
const placeLabel2 = p => (p === 'other' ? t('place_other') : placeLabel(p));
// keep what was typed while choosing (the page draws again)
const gCelKeep = () => { const f = $('#g-cel'); if (!f) return; ['date', 'time', 'other', 'song', 'notes'].forEach(k => { const i = f.querySelector(`[name=${k}]`); if (i) gCel[k] = i.value; }); };
ACT.g_cel_pick = el => { gCelKeep(); const k = el.dataset.k, v = el.dataset.v;
  if (k === 'wants') gCel.wants = gCel.wants.includes(v) ? gCel.wants.filter(x => x !== v) : gCel.wants.concat(v); else gCel[k] = gCel[k] === v && k === 'place' ? '' : v; route(); };
ACT.g_cel_send = async () => {
  gCelKeep();
  if (!gCel.date) throw new ApiError('required', { field: t('date') });
  const loc = gCel.place === 'other' ? (gCel.other || '').trim() : gCel.place;
  await rpc('guest_event_request', { p_key: S.g.key, p_row: { type: gCel.type, date: gCel.date, time: gCel.time || null, location: loc || null, wants: gCel.wants, song: gCel.song || null, notes: gCel.notes || '' } });
  toast(t('cel_sent')); gCel = { type: 'birthday', place: '', wants: [] }; await gRefreshMe(); route();
};
ACT.g_cel_reply = async el => { const v = el.closest('form').reply.value.trim(); if (!v) return; await rpc('guest_request_update', { p_key: S.g.key, p_id: +el.dataset.id, p_action: 'reply', p_text: v }); toast(t('cel_reply_sent')); await gRefreshMe(); route(); };
ACT.g_cel_cancel = async el => { if (!await confirmBox(t('cel_cancel_q'))) return; await rpc('guest_request_update', { p_key: S.g.key, p_id: +el.dataset.id, p_action: 'cancel' }); await gRefreshMe(); route(); };

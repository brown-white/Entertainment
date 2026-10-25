'use strict';
/* AUREA · pages/requests.js — staff page: Requests (day off, vacation …; managers decide here too).
   Uses: translations/languages · supabase · core/utils · icons/icons · core/permissions · components/modals · core/actions ·
         components/cards · core/router · components/forms */
/* ---------- Requests (self-service; managers decide here too) ---------- */
const REQ_KINDS = ['day_off', 'vacation', 'move_day_off', 'other'];
page('requests', {
  perm: 'requests,m_team', icon: 'mail', group: 'my',
  render: async () => {
    // (the decider sees the team's requests; anyone else – also in Preview Staff App – only their own)
    const rows = (await list('staff_requests')).filter(r => can('m_team') || r.staff_id === meId());
    const team = can('m_team') ? (await api('team_members')).staff : [];
    const nm = id => team.find(x => x.id === id)?.display_name || '';
    const pend = rows.filter(r => r.status === 'pending');
    return `${can('requests') ? `<button class="btn" data-act="rq_new">${esc(t('new_request'))}</button>` : ''}
      ${can('m_team') && pend.length ? `<section><h2>${esc(t('waiting_decision'))}</h2>${reqList(pend, nm, true)}</section>` : ''}
      <section><h2>${esc(can('m_team') ? t('all_requests') : t('my_requests'))}</h2>${rows.length ? reqList(rows.filter(r => !can('m_team') || r.status !== 'pending'), nm, false) : empty(t('no_requests'))}</section>`;
  }
});
function reqList(rows, nm, decide) {
  return `<div class="list">${rows.map(r => `<div class="li"><b>${esc(t('rk_' + r.kind))}</b> ${chip(t('rs_' + r.status), r.status === 'approved' ? 'ok' : r.status === 'rejected' ? 'bad' : '')}
    ${nm(r.staff_id) ? `<span class="muted"> · ${esc(nm(r.staff_id))}</span>` : ''}<p>${r.date_from ? esc(D.short(r.date_from)) : ''}${r.date_to && r.date_to !== r.date_from ? ' → ' + esc(D.short(r.date_to)) : ''}${r.note ? ' · ' + esc(r.note) : ''}</p>
    <div class="actions">${decide ? `<button class="btn small" data-act="rq_dec" data-id="${r.id}" data-s="approved">${esc(t('approve'))}</button><button class="btn ghost small" data-act="rq_dec" data-id="${r.id}" data-s="rejected">${esc(t('reject'))}</button>` : ''}
    ${r.status === 'pending' && r.staff_id === meId() ? `<button class="btn ghost small" data-act="rq_del" data-id="${r.id}">${esc(t('withdraw'))}</button>` : ''}</div></div>`).join('')}</div>`;
}
const RQ_ICON = { day_off: 'moon', vacation: 'sun', move_day_off: 'swap', other: 'mail' };
const rqFields = k => (k === 'day_off' ? [{ k: 'date_from', type: 'date', label: t('rq_which_day'), req: true }]
  : k === 'vacation' ? [{ k: 'date_from', type: 'date', label: t('rq_first_day'), req: true }, { k: 'date_to', type: 'date', label: t('rq_last_day'), req: true }]
  : k === 'move_day_off' ? [{ k: 'date_from', type: 'date', label: t('rq_current_day_off'), req: true }, { k: 'date_to', type: 'date', label: t('rq_new_day_off'), req: true }]
  : [{ k: 'date_from', type: 'date', label: t('date') }]).concat([{ k: 'note', type: 'textarea', label: t('note'), rows: 3, req: k === 'other' }]);
ACT.rq_new = () => modal(t('new_request'), `<p class="muted">${esc(t('rq_choose'))}</p><div class="choice-grid">${REQ_KINDS.map(k => `<button class="choice" data-act="rq_kind" data-k="${k}">${ico(RQ_ICON[k] || 'mail')}<b>${esc(t('rk_' + k))}</b><small>${esc(t('rkh_' + k))}</small></button>`).join('')}</div>`, {});
ACT.rq_kind = el => { const k = el.dataset.k; closeModals();
  editForm(t('rk_' + k), rqFields(k), {}, async r => { if (k === 'day_off') r.date_to = r.date_from; if (r.date_to && r.date_from && k === 'vacation' && r.date_to < r.date_from) throw new ApiError('dates'); await save('staff_requests', Object.assign({ kind: k }, r)); route(); }); };
ACT.rq_dec = async el => { await api('request_decide', { p_id: +el.dataset.id, p_status: el.dataset.s }); toast(t('saved')); route(); };
ACT.rq_del = async el => { if (await confirmBox(t('withdraw_q'))) { await del('staff_requests', +el.dataset.id); route(); } };

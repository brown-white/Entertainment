'use strict';
/* AUREA · pages/activity-log.js — Activity log.
   Uses: translations/languages · supabase · core/utils · icons/icons · core/permissions · components/modals · core/actions ·
         components/cards · core/router · components/tables */
/* ---------- Activity log ---------- */
let lgFrom = null, lgTo = null;
page('log', {
  perm: 'm_log', icon: 'clock', group: 'admin', title: 'activity_log',
  render: async () => {
    lgFrom = lgFrom || D.today(); lgTo = lgTo || lgFrom;
    const rows = await list('activity_log', { _from: lgFrom, _to: lgTo, _limit: 1000 }), dl = can('log_delete');
    const what = r => (r.action === 'log_delete' ? t('log_deleted_n', { n: r.detail?.n || 0 }) : t('la_' + r.action) !== 'la_' + r.action ? t('la_' + r.action) : r.action)
      + (r.detail?.codes?.length ? ' · ' + r.detail.codes.slice(0, 6).join(', ') + (r.detail.codes.length > 6 ? ' …' : '') : r.detail?.label ? ' · ' + r.detail.label : '');
    return `<div class="row"><input type="date" value="${lgFrom}" data-act-change="lg_from" aria-label="${esc(t('date_from'))}"><input type="date" value="${lgTo}" data-act-change="lg_to" aria-label="${esc(t('date_to'))}"><span class="grow"></span><span class="muted">${rows.length}${rows.length >= 1000 ? '+' : ''}</span></div>`
      + (dl && rows.length ? selHead('lg', rows.map(r => r.id), `<button class="btn ghost small danger" data-act="lg_del" data-sel-need ${sel('lg').size ? '' : 'disabled'}>${ico('trash')} ${esc(t('delete_selected'))}</button><button class="btn ghost small danger" data-act="lg_del" data-w="range">${esc(t('delete_all_shown_days'))}</button>`) : '')
      + (rows.length ? `<div class="list log">${rows.map(r => `<div class="li ${dl ? 'sel-li' : ''}">${dl ? selBox('lg', r.id) : ''}<span><small class="muted">${esc(D.stamp(r.at))}</small> <b>${esc(r.actor_name || (r.actor_kind === 'guest' ? t('guest') : t('system')))}</b> · ${esc(what(r))} · ${esc(r.entity || '')}${r.entity_id ? ' #' + r.entity_id : ''}</span></div>`).join('')}</div>` : empty(t('nothing_yet')))
      + (dl ? `<p class="row"><span class="grow"></span><button class="btn ghost small danger" data-act="lg_del" data-w="all">${ico('trash')} ${esc(t('clear_log'))}</button></p>` : '');
  }
});
ACT.lg_from = el => { lgFrom = el.value; if (lgTo < lgFrom) lgTo = lgFrom; route(); };
ACT.lg_to = el => { lgTo = el.value; if (lgTo < lgFrom) lgFrom = lgTo; route(); };
// delete log entries: the chosen ones, all of the days shown, or the whole log (counted first; the log keeps one line that entries were deleted)
ACT.lg_del = async el => {
  const w = el.dataset.w, more = w === 'all' ? { p_filter: {} } : w === 'range' ? { p_filter: { _from: lgFrom, _to: lgTo } } : { p_ids: selIds('lg') };
  if (!w && !more.p_ids.length) return;
  const pv = await delMany('activity_log', Object.assign({ p_preview: true }, more)), n = pv.n;
  if (!n) return toast(t('nothing_found'), 'bad');
  if (n > 1 && !can('bulk_delete')) return toast(t('err_bulk_needed'), 'bad');
  const r = await delAsk({ title: w === 'all' ? t('clear_log_q', { n }) : t('delete_logs_q', { n }), n, strong: w === 'all',
    facts: [w === 'range' ? t('del_log_days', { from: D.short(lgFrom), to: D.short(lgTo) }) : ''].filter(Boolean), text: t('delete_logs_text') });
  if (!r) return;
  const j = await delMany('activity_log', more); sel('lg').clear(); toast(t('deleted_n', { n: j.deleted })); route();
};

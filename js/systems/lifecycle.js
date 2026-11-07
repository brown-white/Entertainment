'use strict';
/* Mr Hassan · systems/lifecycle.js — when a person or a supplier stops: ONE dialog with the manager's choices (never one "Delete"):
   deactivate · take out of future work · take out of attendance · delete a part of the history · delete the profile and keep the
   history · delete from everywhere. Each choice first shows what WILL change or go and what will NOT (counted by the database);
   removing data needs the name typed. Nothing happens by itself, nothing goes that was not chosen.
   Uses: translations/languages · supabase · core/utils · icons/icons · core/permissions · components/modals · core/router ·
         components/forms */
const lifeLi = (n, key, vars) => (n ? `<li>${esc(t(key, Object.assign({ n }, vars || {})))}</li>` : '');
// the choices for a PERSON (c: the database's counts)
function lifeStaff(j) {
  const c = j.counts, s = j.staff, att = c.att_days + c.att_future, kept = c.tickets + c.games + c.guest_records;
  const history = () => lifeLi(c.att_days, 'lf_n_att') + lifeLi(c.clock, 'lf_n_clock') + lifeLi(c.assign_past, 'lf_n_assign_past') + lifeLi(c.tasks_done, 'lf_n_tasks_done')
    + lifeLi(c.payroll, 'lf_n_payroll') + lifeLi(c.requests, 'lf_n_requests') + lifeLi(c.messages, 'lf_n_messages') + lifeLi(c.tickets, 'lf_n_tickets') + lifeLi(c.games, 'lf_n_games') + lifeLi(c.guest_records, 'lf_n_guest');
  const future = () => lifeLi(c.assign_future, 'lf_n_assign_future') + lifeLi(c.att_future, 'lf_n_att_future') + lifeLi(c.tasks_open, 'lf_n_tasks_open') + lifeLi(c.reminders, 'lf_n_reminders');
  const cats = [['attendance', att + c.clock, 'att_delete'], ['assignments', c.assign_past + c.assign_future, 'staff_history_delete'], ['tasks', c.tasks_open + c.tasks_done, 'staff_history_delete'],
    ['payroll', c.payroll, 'staff_history_delete'], ['requests', c.requests, 'staff_history_delete'], ['messages', c.messages, 'staff_history_delete']];
  return [
    !s.deleted && { v: 'deactivate', perm: 'staff_deactivate', label: t('lf_deactivate'), hint: t('lf_deactivate_hint'),
      will: () => `<li>${esc(t('lf_w_no_login'))}</li>`, keep: () => `<li>${esc(t('lf_k_work'))}</li>` + history() },
    !s.deleted && { v: 'remove_future', perm: 'staff_deactivate', label: t('lf_remove_future'), hint: t('lf_remove_future_hint'), date: true,
      will: () => `<li>${esc(t('lf_w_no_login'))}</li><li>${esc(t('lf_w_end'))}</li>` + future(), keep: () => history() },
    !s.deleted && { v: 'remove_attendance', perm: 'staff_deactivate', label: t('lf_remove_att'), hint: t('lf_remove_att_hint'), date: true,
      extra: can('att_delete') && att + c.clock ? `<label class="del-opt"><input type="checkbox" data-life="delete_history"><span><b>${esc(t('lf_also_att'))}</b><small class="muted">${esc(t('lf_n_att', { n: c.att_days + c.att_future }) + ' · ' + t('lf_n_clock', { n: c.clock }))}</small></span></label>` : '',
      will: o => `<li>${esc(t('lf_w_att_end'))}</li>` + future() + (o.delete_history ? lifeLi(att, 'lf_n_att') + lifeLi(c.clock, 'lf_n_clock') : ''), keep: o => (o.delete_history ? '' : lifeLi(c.att_days, 'lf_n_att') + lifeLi(c.clock, 'lf_n_clock')) + `<li>${esc(t('lf_k_app'))}</li>`,
      danger: o => o.delete_history },
    { v: 'delete_attendance', perm: 'att_delete', label: t('lf_delete_att'), hint: t('lf_delete_att_hint'), range: true, danger: () => true,
      will: () => lifeLi(att, 'lf_n_att_upto') + lifeLi(c.clock, 'lf_n_clock_upto'), keep: () => `<li>${esc(t('lf_k_profile'))}</li>` + lifeLi(c.assign_past, 'lf_n_assign_past') + lifeLi(c.payroll, 'lf_n_payroll') + lifeLi(c.tickets, 'lf_n_tickets') },
    !s.deleted && { v: 'delete_keep', act: 'delete', perm: 'staff_delete', label: t('lf_delete_keep'), hint: t('lf_delete_keep_hint'), danger: () => true,
      will: () => `<li>${esc(t('lf_w_profile'))}</li>` + future(), keep: () => history() + `<li>${esc(t('lf_k_name'))}</li>` },
    { v: 'delete_all', act: 'delete', perm: 'staff_delete', label: t('lf_delete_all'), hint: t('lf_delete_all_hint'), danger: () => true,
      extra: `<fieldset class="field life-cats"><legend>${esc(t('lf_parts'))}</legend>${cats.map(([k, n, p]) => `<label class="del-opt ${can(p) ? '' : 'dim'}"><input type="checkbox" data-cat="${k}" ${can(p) ? 'checked' : 'disabled'}><span><b>${esc(t('lf_cat_' + k))}</b><small class="muted">${esc(t('lf_records_n', { n }))}${can(p) ? '' : ' · ' + esc(t('lf_no_perm'))}</small></span></label>`).join('')}</fieldset>`,
      will: o => `<li>${esc(t('lf_w_profile'))}</li>` + (o.delete || []).map(k => `<li>${esc(t('lf_cat_' + k))}: ${esc(t('lf_records_n', { n: cats.find(x => x[0] === k)[1] }))}</li>`).join(''),
      keep: o => cats.filter(x => x[1] && !(o.delete || []).includes(x[0])).map(x => `<li>${esc(t('lf_cat_' + x[0]))}: ${esc(t('lf_records_n', { n: x[1] }))}</li>`).join('')
        + lifeLi(c.tickets, 'lf_n_tickets') + lifeLi(c.games, 'lf_n_games') + lifeLi(c.guest_records, 'lf_n_guest') + (kept ? `<li>${esc(t('lf_k_kept_profile'))}</li>` : '') }
  ].filter(Boolean);
}
// the choices for a SUPPLIER
function lifeSupplier(j) {
  const c = j.counts, s = j.supplier, cur = (c.currencies || []).join(', ');
  const history = () => lifeLi(c.dates_past, 'lf_n_dates_past') + lifeLi(c.records, 'lf_n_records', { p: c.P, m: c.M, a: c.A }) + lifeLi(c.memos, 'lf_n_memos', { f: c.memos_final }) + (cur ? `<li>${esc(t('lf_currencies', { list: cur }))}</li>` : '');
  return [
    !s.deleted && s.active && { v: 'deactivate', perm: 'sup_manage', label: t('lf_sup_deactivate'), hint: t('lf_sup_deactivate_hint'),
      will: () => `<li>${esc(t('lf_w_sup_new'))}</li>`, keep: () => lifeLi(c.series, 'lf_n_series') + lifeLi(c.dates_future, 'lf_n_dates_future') + history() },
    !s.deleted && !s.active && { v: 'reactivate', perm: 'sup_manage', label: t('lf_sup_reactivate'), hint: t('lf_sup_reactivate_hint'), will: () => `<li>${esc(t('lf_w_sup_again'))}</li>`, keep: () => history() },
    !s.deleted && { v: 'remove_future', perm: 'sup_manage', label: t('lf_sup_future'), hint: t('lf_sup_future_hint'),
      will: () => lifeLi(c.series, 'lf_n_series') + lifeLi(c.dates_future, 'lf_n_dates_future') + lifeLi(c.only_future, 'lf_n_only_future'), keep: () => history() },
    !s.deleted && { v: 'delete_profile', perm: 'sup_delete', label: t('lf_sup_profile'), hint: t('lf_sup_profile_hint'), danger: () => true,
      will: () => `<li>${esc(t('lf_w_sup_profile'))}</li>` + lifeLi(c.series, 'lf_n_series') + lifeLi(c.dates_future, 'lf_n_dates_future'), keep: () => history() + `<li>${esc(t('lf_k_docs'))}</li>` },
    (c.records || c.memos) && { v: 'delete_history', perm: 'sup_history_delete', label: t('lf_sup_history'), hint: t('lf_sup_history_hint'), danger: () => true,
      extra: `<fieldset class="field life-cats"><legend>${esc(t('lf_parts'))}</legend>${[['attendance', t('lf_n_records', { n: c.records, p: c.P, m: c.M, a: c.A }), true], ['memos', t('lf_n_memos', { n: c.memos, f: c.memos_final }), true], ['finance', t('lf_finance_hint'), can('sup_pricing')]]
        .map(([k, h, ok]) => `<label class="del-opt ${ok ? '' : 'dim'}"><input type="checkbox" data-life="${k}" ${ok ? '' : 'disabled'}><span><b>${esc(t('lf_sup_' + k))}</b><small class="muted">${esc(h)}</small></span></label>`).join('')}</fieldset>`,
      will: o => (o.attendance ? lifeLi(c.records, 'lf_n_records', { p: c.P, m: c.M, a: c.A }) : '') + (o.memos ? lifeLi(c.memos, 'lf_n_memos', { f: c.memos_final }) : '') + (o.finance && !o.attendance ? `<li>${esc(t('lf_finance_hint'))}</li>` : ''),
      keep: o => `<li>${esc(t('lf_k_sup_profile'))}</li>` + (o.attendance ? '' : lifeLi(c.records, 'lf_n_records', { p: c.P, m: c.M, a: c.A })) + (o.memos ? '' : lifeLi(c.memos, 'lf_n_memos', { f: c.memos_final })) + lifeLi(c.dates_past, 'lf_n_dates_past') },
    { v: 'delete', perm: 'sup_delete', label: t('lf_sup_delete'), hint: t('lf_sup_delete_hint'), danger: () => true,
      will: () => `<li>${esc(t('lf_w_sup_all'))}</li>` + lifeLi(c.items, 'lf_n_items') + lifeLi(c.records, 'lf_n_records', { p: c.P, m: c.M, a: c.A }) + lifeLi(c.memos, 'lf_n_memos', { f: c.memos_final }),
      keep: () => `<li>${esc(t('lf_k_programme'))}</li>` + lifeLi(c.dates_past + c.dates_future, 'lf_n_dates_all') }
  ].filter(Boolean);
}
const LIFE = { staff: { impact: id => api('staff_impact', { p_staff: id }), act: (id, a, o) => api('staff_lifecycle', { p_staff: id, p_action: a, p_opts: o }), name: j => j.staff.display_name, choices: lifeStaff },
  supplier: { impact: id => api('supplier_impact', { p_supplier: id }), act: (id, a, o) => api('supplier_lifecycle', { p_supplier: id, p_action: a, p_opts: o }), name: j => j.supplier.name, choices: lifeSupplier } };
// THE dialog: the choices, then for the one chosen what will change / go and what stays, then (removing data) the name typed
async function lifeDialog(kind, id, after) {
  const L = LIFE[kind], j = await L.impact(id), name = L.name(j), all = L.choices(j).filter(o => can(o.perm));
  if (!all.length) return toast(t('err_forbidden'), 'bad');
  let cur = all[0];
  const optsOf = root => { const o = {}; $$('[data-life]', root).forEach(i => { o[i.dataset.life] = i.checked; }); if (cur.v === 'delete_all') o.delete = $$('[data-cat]', root).filter(i => i.checked).map(i => i.dataset.cat); return o; };
  // what the choice asks (a date, dates, the parts) – drawn when the choice changes; what it does – drawn on every change
  const drawIn = root => {
    $('#life-in', root).innerHTML = `${cur.extra || ''}${cur.date ? fieldHtml({ k: 'life_date', type: 'date', label: t('lf_date'), hint: t('lf_date_hint') }, D.today()) : ''}
      ${cur.range ? fieldHtml({ k: 'life_from', type: 'date', label: t('sch_from') }, '') + fieldHtml({ k: 'life_to', type: 'date', label: t('sch_to'), hint: t('att_remove_dates_hint') }, '') : ''}`;
    drawOut(root);
  };
  const drawOut = root => {
    const o = optsOf(root), danger = cur.danger ? !!cur.danger(o) : false, will = cur.will(o), keep = cur.keep(o), typed = $('#life-n', root)?.value || '';
    $('#life-out', root).innerHTML = `<div class="life-pv"><div class="life-col will ${danger ? 'bad' : ''}"><h3>${ico(danger ? 'trash' : 'info')} ${esc(t(danger ? 'lf_will_delete' : 'lf_will_change'))}</h3><ul>${will || `<li class="muted">${esc(t('lf_nothing'))}</li>`}</ul></div>
        <div class="life-col keep"><h3>${ico('check')} ${esc(t('lf_will_not'))}</h3><ul>${keep || `<li class="muted">${esc(t('lf_nothing'))}</li>`}</ul></div></div>
      ${danger ? `<div class="field del-strong"><label for="life-n">${esc(t('lf_type_name', { n: name }))}</label><input id="life-n" autocomplete="off" value="${esc(typed)}"></div>` : ''}`;
    const btn = root.closest('.modal').querySelector('[data-save]');
    btn.textContent = danger ? t('delete_permanently') : t('lf_apply'); btn.className = 'btn ' + (danger ? 'danger' : '');
  };
  modal(t('lf_title', { name }), `<p class="muted">${esc(t('lf_intro'))}</p><fieldset class="field del-opts life-opts"><legend>${esc(t('lf_choose'))}</legend>${all.map((o, i) => `<label class="del-opt"><input type="radio" name="life_c" value="${o.v}" ${i ? '' : 'checked'}><span><b>${esc(o.label)}</b><small class="muted">${esc(o.hint)}</small></span></label>`).join('')}</fieldset><div id="life-in"></div><div id="life-out"></div>`, {
    cancel: true, wide: true, noFocus: true, saveLabel: t('lf_apply'),
    mount: root => {
      drawIn(root);
      root.addEventListener('change', ev => {
        if (ev.target.name === 'life_c') { cur = all.find(o => o.v === ev.target.value); drawIn(root); }
        else if (ev.target.matches('[data-life],[data-cat]')) drawOut(root);
      });
    },
    save: async root => {
      const o = optsOf(root), danger = cur.danger ? !!cur.danger(o) : false;
      if (danger && ($('#life-n', root)?.value || '').trim().toLowerCase() !== name.trim().toLowerCase()) { toast(t('type_n_wrong', { n: name }), 'bad'); return false; }
      if (danger) o.confirm = name;
      if (cur.date) o.date = $('[name=life_date]', root)?.value || null;
      if (cur.range) { o.from = $('[name=life_from]', root)?.value || null; o.to = $('[name=life_to]', root)?.value || null; }
      if (cur.act === 'delete' && !o.delete) o.delete = [];
      const r = await L.act(id, cur.act || cur.v, o);
      toast(r.deleted === 'profile' ? t('lf_done_profile') : r.deleted === 'all' ? t('lf_done_all') : t('saved'), danger ? 'warn' : 'ok');
      closeModals(); after ? after(r, cur.act || cur.v) : route();
    }
  });
}

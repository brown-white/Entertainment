'use strict';
/* AUREA · pages/assignments.js — Assignments: the period's items and their staff, Smart plan (plans A / B / C), the bulk control (clear, remove,
   replace, copy last week), print.
   Uses: core/state · translations/languages · supabase · core/utils · icons/icons · core/permissions · components/modals · core/actions ·
         components/cards · core/router · components/forms · components/tables · systems/exports · systems/team-schedule ·
         systems/smart-planner · systems/assignment-system */
/* ---------- Assignments + Smart Planner ---------- */
let plFrom = null, plDays = 7;
async function plannerData() {
  plFrom = plFrom || D.today();
  const to = D.add(plFrom, plDays - 1);
  // the day board + the database's answer from the ONE eligibility rule list
  const [b, chk] = await Promise.all([board(plFrom, to, !!S.settings.cross_team_assign), api('planner_check', { p_from: plFrom, p_to: to })]);
  return Object.assign(b, { check: chk, from: plFrom, span: plDays });
}
/* balance per type: only people who may be planned for that type */
const balanceHtml = (res, b) => Object.entries(res.balance).map(([ty, list2]) => `<div class="bal"><b>${esc(typeLabel(ty))}</b><div class="loadbar">${list2.map(x => `<span>${esc(b.staff.find(s => s.id === x.staff_id)?.display_name || '')} <b>${x.n}</b></span>`).join('')}</div></div>`).join('') || `<p class="muted">${esc(t('balance_none'))}</p>`;
page('planner', {
  perm: 'm_planner', icon: 'sliders', group: 'manage',
  render: async () => {
    if (!S.team) return empty(t('no_team_selected'));
    const b = await plannerData(); plCache = b; asgShow(b);
    const its = b.items.filter(i => i.status === 'scheduled' && i.staff_needed > 0 && (!i.team_id || i.team_id === S.team.id));
    const now = planAssignments(Object.assign(plInput(b), { dryRun: true }));   // today's state: balance + rules broken by existing assignments
    const warn = new Map(now.warnings.map(w => [w.item_id + '|' + w.staff_id, w.reason]));
    return `<div class="row"><button class="btn ghost small" data-act="pl_move" data-n="-${plDays}">‹</button><b>${esc(D.dm(plFrom))} – ${esc(D.dm(D.add(plFrom, plDays - 1)))}</b><button class="btn ghost small" data-act="pl_move" data-n="${plDays}">›</button>
        <select data-act-change="pl_days" aria-label="${esc(t('range'))}">${[[1, t('one_day')], [7, t('one_week')], [14, t('two_weeks')]].map(([v, l]) => `<option value="${v}" ${plDays === v ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>
        <span class="grow"></span>${plFrom < D.today() && b.items.some(i => i.date < D.today() && i.staff.length) ? `<button class="btn ghost small danger" data-act="pl_hist_del">${ico('trash')} ${esc(t('delete_past_assignments'))}</button>` : ''}</div>
      ${plSelecting ? plSelBar(its) : `<div class="wv-act pl-act"><button class="btn small" data-act="pl_smart">${ico('sparkle')} ${esc(t('smart_plan'))}</button>
        <button class="btn ghost small" data-act="pl_select">${ico('check')} ${esc(t('select'))}</button><button class="btn ghost small" data-act="asg_remove">${ico('minus')} ${esc(t('asg_remove'))}</button>
        <button class="btn ghost small" data-act="asg_replace">${ico('swap')} ${esc(t('asg_replace'))}</button><button class="btn ghost small danger" data-act="asg_clear">${ico('trash')} ${esc(t('asg_clear'))}</button>
        <button class="btn ghost small" data-act="pl_copy">${ico('copy')} ${esc(t('copy_last_week'))}</button><button class="btn ghost small" data-act="pl_print">${ico('download')} ${esc(t('print_pdf'))}</button></div>`}
      <details class="balance"><summary>${esc(t('balance'))}</summary>${balanceHtml(now, b)}</details>
      ${now.warnings.length ? `<p class="hint-box warn">${ico('flag')}<span>${esc(t('plan_warnings_n', { n: now.warnings.length }))}</span></p>` : ''}
      ${D.range(plFrom, plDays).map(d => { const di = its.filter(i => i.date === d); return di.length ? `<section><h2>${esc(D.long(d))}</h2><div class="items">${di.map(i => `<button class="item ${i.staff.length < i.staff_needed ? 'short' : ''} ${plSelecting && sel('pl').has(i.id) ? 'picked' : ''}" ${plSelecting ? 'data-act="pl_pick_i"' : 'data-act="pl_item"'} data-id="${i.id}" ${plSelecting ? `aria-pressed="${sel('pl').has(i.id)}"` : ''}>
        <time>${esc(hm(i.start_time))}</time><div><b>${esc(itemName(i))}</b><span class="meta">${chip(typeLabel(i.type), 'ty-' + i.type)} ${chip(roleNames(i.assign_roles).join(' + ') || t('asg_any_role'), 'rule')} ${i.staff.length}/${i.staff_needed}</span>
        <span class="names">${i.staff.map(s => { const w = warn.get(i.id + '|' + s.staff_id); return `<span class="name-tag ${s.source} ${w ? 'warn' : ''}" ${w ? `title="${esc(whyText(w, i, b, s.staff_id))}"` : ''}>${w ? ico('flag') + ' ' : ''}${esc(s.name)}</span>`; }).join(' ') || `<span class="muted">${esc(t('nobody_yet'))}</span>`}</span></div></button>`).join('')}</div></section>` : ''; }).join('') || empty(t('nothing_to_plan'))}`;
  }
});
let plCache = null, plSelecting = false;
/* ---------- ASSIGNMENTS – the manager's bulk control. One assignment table, one database change (assignment_bulk): clear (a day,
   a week, a period or chosen items; everything, only the Smart plan's, only some people), remove one person, replace one person by
   another (every item checked with the ONE rule list – what is not possible is named with its reason, never forced), mark as manual.
   Only assignments change – never the programme. A preview first, then the manager confirms. ---------- */
const plShownIds = its => its.map(i => i.id);
function plSelBar(its) {
  const ids = plShownIds(its), s = selKeep('pl', ids), need = `data-sel-need ${s.size ? '' : 'disabled'}`;
  return `<div class="wv-selbar sel-bar" data-selk="pl" data-ids="${ids.join(',')}"><div class="wv-selrow"><label><input type="checkbox" data-act-change="sel_all" data-k="pl" ${ids.length && ids.every(id => s.has(id)) ? 'checked' : ''}> ${esc(t('select_all'))} (${ids.length})</label>
    <span class="grow"></span><b class="sel-n">${s.size ? esc(t('selected_n', { n: s.size })) : ''}</b></div>
    <div class="wv-selrow"><button class="btn ghost small" data-act="asg_remove" data-w="sel" ${need}>${ico('minus')} ${esc(t('asg_remove'))}</button><button class="btn ghost small" data-act="asg_replace" data-w="sel" ${need}>${ico('swap')} ${esc(t('asg_replace'))}</button>
    <button class="btn ghost small danger" data-act="asg_clear" data-w="sel" ${need}>${ico('trash')} ${esc(t('asg_clear'))}</button><span class="grow"></span><button class="btn small" data-act="pl_sel_done">${esc(t('bk_cancel_sel'))}</button></div></div>`;
}
ACT.pl_select = () => { plSelecting = true; sel('pl').clear(); route(); };
ACT.pl_sel_done = () => { plSelecting = false; sel('pl').clear(); route(); };
ACT.pl_pick_i = el => { const s = sel('pl'), id = +el.dataset.id; if (s.has(id)) s.delete(id); else s.add(id); selUpdate('pl'); };
SEL_ON.pl = s => { $$('.item[data-act=pl_pick_i]').forEach(c => { const on = s.has(+c.dataset.id); c.classList.toggle('picked', on); c.setAttribute('aria-pressed', on); }); };
// which assignments: this day, this week, a period – or the items chosen (Select)
const asgWeek = () => { const m = D.add(plFrom, -D.wd(plFrom)); return [m, D.add(m, 6)]; };
function asgScope(selN) {
  return [{ k: 'scope', type: 'choice', label: t('asg_scope'), options: [selN ? ['sel', t('asg_sc_sel', { n: selN })] : null, ['day', t('asg_sc_day')], ['week', t('asg_sc_week')], ['range', t('asg_sc_range')]].filter(Boolean) },
    { k: 'day', type: 'date', label: t('date') }, { k: 'from', type: 'date', label: t('date_from') }, { k: 'to', type: 'date', label: t('date_to') }];
}
const asgScopeRow = selN => { const [m, e] = asgWeek(), d0 = plFrom <= D.today() && D.today() <= D.add(plFrom, plDays - 1) ? D.today() : plFrom; return { scope: selN ? 'sel' : plDays === 1 ? 'day' : 'week', day: d0, from: d0, to: D.add(d0, 6) }; };
const asgScopeMount = root => { const sync = () => { const v = $('[data-choice=scope] input:checked', root)?.value; [['day', v === 'day'], ['from', v === 'range'], ['to', v === 'range']].forEach(([k, on]) => { const b = $(`[name=${k}]`, root)?.closest('.field'); if (b) b.hidden = !on; }); };
  $$('[data-choice=scope] input', root).forEach(i => i.addEventListener('change', sync)); sync(); };
function asgScopeArgs(r) {
  if (r.scope === 'sel') return { items: selIds('pl') };
  if (r.scope === 'day') { if (!r.day) throw new ApiError('required', { field: t('date') }); return { from: r.day, to: r.day, what: D.long(r.day) }; }
  if (r.scope === 'week') { const [m, e] = asgWeek(); return { from: m, to: e, what: D.dm(m) + ' – ' + D.dm(e) }; }
  if (!r.from || !r.to) throw new ApiError('required', { field: t('date_from') + ' / ' + t('date_to') });
  if (r.to < r.from || D.diff(r.from, r.to) > 93) throw new ApiError('range');
  return { from: r.from, to: r.to, what: D.dm(r.from) + ' – ' + D.dm(r.to) };
}
const asgPeople = () => (plCache?.staff || []).filter(x => !x.is_manager && x.status !== 'left').map(x => [x.id, (x.staff_number ? '#' + x.staff_number + ' ' : '') + x.display_name]);
const asgWho = x => (x.number ? '#' + x.number + ' ' : '') + (x.staff || '');
const asgLine = x => `${D.short(x.date)} ${x.time} · ${tx(x.name_i18n, x.name)}`;
ACT.asg_clear = el => {
  const selN = el?.dataset?.w === 'sel' ? sel('pl').size : 0;
  const f = asgScope(selN).concat([{ k: 'source', type: 'choice', label: t('asg_which'), options: [['planner', t('asg_src_planner')], ['all', t('asg_src_all')]] },
    { k: 'staff', type: 'multi', label: t('asg_only_staff'), options: asgPeople(), hint: t('asg_only_staff_h') }]);
  formBox(t('asg_clear'), f, Object.assign(asgScopeRow(selN), { source: 'planner' }), r => {
    const a = Object.assign(asgScopeArgs(r), { source: r.source, staff: (r.staff || []).map(Number) });
    setTimeout(() => asgRun('clear', a, t('asg_clear')).catch(fail), 30);
  }, { saveLabel: t('next'), mount: asgScopeMount, after: `<p class="muted small">${esc(t('asg_programme_stays'))}</p>` });
};
ACT.asg_remove = el => {
  const selN = el?.dataset?.w === 'sel' ? sel('pl').size : 0;
  const f = [{ k: 'staff_id', type: 'select', label: t('staff'), num: true, req: true, options: asgPeople() }].concat(asgScope(selN));
  formBox(t('asg_remove'), f, Object.assign(asgScopeRow(selN), { staff_id: el?.dataset?.s ? +el.dataset.s : null }), r => {
    if (!r.staff_id) throw new ApiError('required', { field: t('staff') });
    const a = Object.assign(asgScopeArgs(r), { source: 'all', staff: [r.staff_id] });
    setTimeout(() => asgRun('clear', a, t('asg_remove')).catch(fail), 30);
  }, { saveLabel: t('next'), mount: asgScopeMount, after: `<p class="muted small">${esc(t('asg_programme_stays'))}</p>` });
};
ACT.asg_replace = el => {
  const selN = el?.dataset?.w === 'sel' ? sel('pl').size : 0, P = asgPeople();
  const f = [{ k: 'staff_from', type: 'select', label: t('asg_replace_who'), num: true, req: true, options: P }, { k: 'staff_to', type: 'select', label: t('asg_replace_by'), num: true, req: true, options: P }].concat(asgScope(selN));
  formBox(t('asg_replace'), f, Object.assign(asgScopeRow(selN), { staff_from: el?.dataset?.s ? +el.dataset.s : P[0]?.[0], staff_to: P.find(x => x[0] !== (el?.dataset?.s ? +el.dataset.s : P[0]?.[0]))?.[0] }), r => {
    if (!r.staff_from || !r.staff_to) throw new ApiError('required', { field: t('staff') });
    if (r.staff_from === r.staff_to) throw new ApiError('asg_same');
    const a = Object.assign(asgScopeArgs(r), { staff_from: r.staff_from, staff_to: r.staff_to, mode: 'empty' });
    setTimeout(() => asgReplace(a).catch(fail), 30);
  }, { saveLabel: t('asg_check'), mount: asgScopeMount, after: `<p class="muted small">${esc(t('asg_replace_hint'))}</p>` });
};
// clear / remove: what goes (the database's own list), then confirmed; afterwards: run the Smart plan again
async function asgRun(action, a, title) {
  const pv = await api('assignment_bulk', { p_action: action, p_args: a, p_preview: true });
  if (!pv.n) return toast(pv.past ? t('asg_only_past', { n: pv.past }) : t('nothing_found'), 'bad');
  const rows = pv.rows, people = uniq(rows.map(asgWho)), list2 = rows.slice(0, 30).map(x => `<li>${esc(asgLine(x))} · <b>${esc(asgWho(x))}</b>${x.source === 'manual' ? ' ' + chip(t('src_manual')) : ''}</li>`).join('');
  const facts = [a.what ? t('asg_fact_scope', { what: a.what }) : t('asg_sc_sel', { n: (a.items || []).length }), t('asg_fact_people', { n: people.length }), pv.past ? t('asg_fact_past', { n: pv.past }) : ''].filter(Boolean);
  const ok = await delAsk({ title: t('asg_clear_q', { n: pv.n }), n: pv.n, facts, text: t('asg_clear_text'), extra: `<ul class="chg-list">${list2}${rows.length > 30 ? `<li class="muted">… +${rows.length - 30}</li>` : ''}</ul>` });
  if (!ok) return;
  const j = await api('assignment_bulk', { p_action: action, p_args: a, p_preview: false });
  sel('pl').clear(); plSelecting = false; await route(); asgDone(t('asg_cleared', { n: j.n }), a);
}
// after a change: what happened, and the clean way on – the Smart plan for the same days
function asgDone(text, a) {
  choiceBox(t('done'), `<p class="hint-box ok">${ico('check')}<span>${esc(text)}</span></p><p class="muted">${esc(t('asg_replan_hint'))}</p>`, [{ k: 'plan', label: t('asg_run_again') }])
    .then(k => { if (k === 'plan') { if (a.from && (a.from < plFrom || a.to > D.add(plFrom, plDays - 1))) { plFrom = a.from; plDays = a.from === a.to ? 1 : D.diff(a.from, a.to) < 7 ? 7 : 14; return route().then(() => ACT.pl_smart()); } ACT.pl_smart(); } });
}
// replace: every item checked; what is not possible is named with its reason – replace the valid ones (the others stay empty, or
// keep the person who was there), or cancel
async function asgReplace(a) {
  const pv = await api('assignment_bulk', { p_action: 'replace', p_args: a, p_preview: true });
  if (!pv.rows.length) return toast(pv.past ? t('asg_only_past', { n: pv.past }) : t('asg_nothing_replace'), 'bad');
  const nm = id => asgPeople().find(x => x[0] === id)?.[1] || '', ok = pv.rows.filter(x => x.ok), bad = pv.rows.filter(x => !x.ok);
  const html = `<p><b>${esc(nm(a.staff_from))}</b> → <b>${esc(nm(a.staff_to))}</b>${a.what ? ' · ' + esc(a.what) : ''}</p>
    ${ok.length ? `<p class="hint-box ok">${ico('check')}<span>${esc(t('asg_can_n', { n: ok.length }))}</span></p><ul class="chg-list">${ok.slice(0, 20).map(x => `<li>${esc(asgLine(x))}</li>`).join('')}${ok.length > 20 ? `<li class="muted">… +${ok.length - 20}</li>` : ''}</ul>` : ''}
    ${bad.length ? `<p class="hint-box warn">${ico('flag')}<span>${esc(t('asg_cannot_n', { n: bad.length }))}</span></p><ul class="chg-list asg-bad">${bad.map(x => `<li><b>${esc(t('asg_cannot_on'))}</b> ${esc(tx(x.name_i18n, x.name))} — ${esc(D.short(x.date))} ${esc(x.time)}<br><small>${esc(t('asg_reason'))}: ${esc(asgWhy(x, a.staff_to))}</small></li>`).join('')}</ul>` : ''}
    ${pv.past ? `<p class="muted small">${esc(t('asg_fact_past', { n: pv.past }))}</p>` : ''}`;
  const choices = !ok.length ? [] : bad.length ? [{ k: 'keep', label: t('asg_rep_keep') }, { k: 'empty', label: t('asg_rep_empty') }] : [{ k: 'empty', label: t('asg_rep_all', { n: ok.length }) }];
  const k = await choiceBox(t('asg_replace'), html, choices); if (!k) return;
  const j = await api('assignment_bulk', { p_action: 'replace', p_args: Object.assign({}, a, { mode: k }), p_preview: false });
  sel('pl').clear(); plSelecting = false; await route();
  toast(t('asg_replaced', { n: j.n, s: j.not_possible }), j.not_possible ? 'warn' : 'ok');
}
ACT.pl_days = el => { plDays = +el.value; route(); };
ACT.pl_move = el => { plFrom = D.add(plFrom, +el.dataset.n); route(); };
ACT.pl_smart = () => {
  modal(t('smart_plan'), `<p>${esc(t('smart_intro'))}</p><div class="field"><label><input type="radio" name="m" value="fill" checked> ${esc(t('plan_fill'))}</label><label><input type="radio" name="m" value="replan"> ${esc(t('plan_replan'))}</label></div>`, {
    saveLabel: t('make_proposal'),
    save: root => { const mode = $('input[name=m]:checked', root).value; setTimeout(() => plMake(mode), 30); }
  });
};
/* planning a long period for a big team takes a moment on a phone: say so first, then plan */
function plMake(mode) {
  const wait = modal(t('smart_plan'), `<div class="loading" aria-label="${esc(t('loading'))}"><span></span><span></span><span></span></div>`, {});
  setTimeout(() => { const o = planOptions(Object.assign(plInput(plCache), { mode })); wait.close(); plCompare(o, o.plans.A.replace); }, 60);
}
/* the three plans side by side: the same rules in all, a different order among eligible people; only the chosen one is saved */
let plOpts = null, plSel = 'A', plShown = null;
const planCard = p => { const r = plOpts.o.plans[p], sc = r.score, same = plOpts.o.same[p], k = p.toLowerCase();
  return `<button class="plan-card ${plSel === p ? 'on' : ''}" data-act="pl_pick" data-p="${p}" role="tab" aria-selected="${plSel === p}"><b>${esc(t('plan_' + k))}</b><small>${esc(t('plan_' + k + '_d'))}</small>
    <span class="sc"><i>${esc(t('sc_coverage'))}</i><b>${sc.coverage}%</b></span><span class="sc"><i>${esc(t('sc_rotation'))}</i><b>${sc.rotation}%</b></span>
    <span class="sc"><i>${esc(t('sc_fairness'))}</i><b>${sc.fairness}%</b></span><span class="sc"><i>${esc(t('sc_repetition'))}</i><b>${esc(t('rep_' + sc.repetition))}</b></span>${same ? `<small class="same">${esc(t('sc_same_as', { p: same }))}</small>` : ''}</button>`; };
function plCompare(o, replaceIds) {
  plOpts = { o, replaceIds }; plSel = 'A';
  modal(t('smart_plan'), `<p class="muted small">${esc(t('plans_intro'))}</p><div class="plan-pick" role="tablist">${['A', 'B', 'C'].map(planCard).join('')}</div><div id="plan-body">${planBody(o.plans.A)}</div>`, {
    wide: true, saveLabel: t('apply_plan'), save: () => plSave(plOpts.o.plans[plSel].rows, plOpts.replaceIds)
  });
}
ACT.pl_pick = el => { plSel = el.dataset.p; const box = el.closest('.modal');
  $$('.plan-card', box).forEach(c => { c.classList.toggle('on', c.dataset.p === plSel); c.setAttribute('aria-selected', String(c.dataset.p === plSel)); });
  $('#plan-body', box).innerHTML = planBody(plOpts.o.plans[plSel]); };
/* why this person: the engine's reasons in words */
const whyChosenText = (x, it, who) => x.k === 'eligible' ? t('wc_eligible', { time: x.time }) : x.k === 'load' ? t('wc_load', { n: x.n, avg: x.avg }) : x.k === 'op_free' ? t('wc_op_' + x.op)
  : x.k === 'scarce' ? t('wc_scarce', { n: x.n })
  // the MANAGER'S RULE, said as such – never "chosen for fairness" where the rule left no choice
  : x.k === 'mgr_rule' ? t('wc_mgr_rule', { roles: roleNames(x.roles).join(' + '), who: who || '', role: roleNames([x.role])[0] || '', time: x.time })
  : x.k === 'repeat_rule' ? t('wc_repeat_rule', { name: itemName(it), roles: roleNames(x.roles).join(' + ') })
  : t('wc_' + x.k, { name: itemName(it), n: x.n });
ACT.pl_whyc = el => { const it = plCache.items.find(i => i.id === +el.dataset.i), sid = +el.dataset.s, list = plShown?.explain?.get(it.id + '|' + sid) || [];
  modal(t('why_chosen'), `<p><b>${esc(plCache.staff.find(x => x.id === sid)?.display_name || '')}</b> · ${esc(itemName(it))} · ${esc(D.short(it.date))} ${esc(hm(it.start_time))}</p><ul class="why-list">${list.map(x => `<li>${esc(whyChosenText(x, it, staffTag(plCache, sid) || plCache.staff.find(z => z.id === sid)?.display_name))}</li>`).join('')}</ul>`, {}); };
/* copy last week: same weekly items, same people, re-checked against this week's days off, duties and times */
ACT.pl_copy = async () => {
  const b = plCache; const prev = await board(D.add(plFrom, -7), D.add(plFrom, plDays - 8), !!S.settings.cross_team_assign);
  // every copied row is checked against the plan as it grows (two overlapping activities never both go to one person)
  const ctx = planAssignments(Object.assign(plInput(b), { dryRun: true, mode: 'fill' })); const rows = [];
  for (const it of b.items.filter(i => i.status === 'scheduled' && i.template_id && (!i.team_id || i.team_id === S.team.id))) {
    const src = prev.items.find(p => p.template_id === it.template_id && (p.slot_date || p.date) === D.add(it.slot_date || it.date, -7)); if (!src) continue;   // (a moved date: its weekly date)
    const have = new Set(it.staff.map(s => s.staff_id));
    for (const s of src.staff) {
      const sm = b.staff.find(x => x.id === s.staff_id);
      if (!sm || sm.is_manager || sm.status === 'left' || have.has(sm.id) || have.size >= it.staff_needed || ctx.canStaffBeAssigned(sm, it, [...have])) continue;
      rows.push({ item_id: it.id, staff_id: sm.id }); have.add(sm.id); ctx.assume(sm.id, it.id);
    }
  }
  if (!rows.length) return toast(t('copy_nothing'), 'warn');
  const res = planAssignments(Object.assign(plInput(b), { dryRun: true }));
  plPreview(Object.assign(res, { rows, empty: rows.length, filled: rows.length, missing: 0, unfilled: [] }), null, t('copy_last_week'));
};
/* one plan in detail: filled / missing (with the reasons), names to tap for "why this person", rules broken by existing assignments, balance */
function planBody(res) {
  const b = plCache; plShown = res;
  const nm = id => b.staff.find(s => s.id === id)?.display_name || '';
  const byItem = {}; res.rows.forEach(r => { (byItem[r.item_id] = byItem[r.item_id] || []).push(r.staff_id); });
  const its = b.items.filter(i => byItem[i.id] || res.unfilled.some(u => u.item_id === i.id)).sort((a, c) => (a.date + a.start_time).localeCompare(c.date + c.start_time));
  // why an item stays short: the rules that stopped each team member, counted
  const whyList = (u, it) => Object.entries(u.why).sort((a, c) => c[1] - a[1]).map(([r, n]) => `<li><b>${n}</b> ${esc(whyText(r, it, b))}</li>`).join('');
  const sc = res.score;
  return `<div class="plan-sum"><span><b>${res.empty}</b>${esc(t('empty_places'))}</span><span class="ok"><b>${res.filled}</b>${esc(t('filled'))}</span><span class="${res.missing ? 'bad' : ''}"><b>${res.missing}</b>${esc(t('still_missing'))}</span></div>
    ${sc && res.explain?.size ? `<p class="muted small">${esc(t('sc_filled', { a: sc.covered, b: sc.required }))} · ${esc(t('sc_consecutive', { n: sc.consecutive, u: sc.unavoidable }))} · ${esc(t('sc_repeats', { n: sc.repeats - sc.repeatsNeeded }))}</p>` : ''}
    <div class="list">${its.map(i => { const u = res.unfilled.find(x => x.item_id === i.id); return `<div class="li ${u ? 'short' : ''}"><b>${esc(D.short(i.date))} ${esc(hm(i.start_time))} ${esc(itemName(i))}</b> ${chip(typeLabel(i.type), 'ty-' + i.type)}
      ${byItem[i.id] ? `<p class="names">${ico('plus')} ${byItem[i.id].map(sid => res.explain?.has(i.id + '|' + sid) ? `<button class="name-tag planner" data-act="pl_whyc" data-i="${i.id}" data-s="${sid}" aria-label="${esc(t('why_chosen') + ' ' + nm(sid))}">${esc(nm(sid))}</button>` : `<span class="name-tag planner">${esc(nm(sid))}</span>`).join(' ')}</p>` : ''}
      ${u ? `<p>${chip(t('missing_n', { n: u.missing }), 'bad')} ${esc(Object.keys(u.why).length ? t('no_match_all') : t('nobody_in_team'))}</p><ul class="why">${whyList(u, i)}</ul>` : ''}</div>`; }).join('') || empty(t('nothing_to_plan'))}</div>
    ${res.warnings.length ? `<h3>${ico('flag')} ${esc(t('plan_warnings'))}</h3><p class="muted small">${esc(t('plan_warnings_hint'))}</p><div class="list">${res.warnings.map(w => { const it = res.itemById.get(w.item_id); return `<div class="li warn">${esc(t('warn_assigned', { name: nm(w.staff_id), item: itemName(it) + ' · ' + D.short(it.date) + ' ' + hm(it.start_time), why: whyText(w.reason, it, b, w.staff_id) }))}</div>`; }).join('')}</div>` : ''}
    <h3>${esc(t('balance'))}</h3><p class="muted small">${esc(t('balance_hint'))}</p>${balanceHtml(res, b)}`;
}
/* the ONE save of planned rows: the database checks every row again; what changed meanwhile is listed, never forced */
async function plSave(rows, replaceIds) {
  const j = await api('planner_apply', { p_rows: rows, p_replace_items: replaceIds }), b = plCache;
  toast(t('plan_applied', { n: j.saved, s: j.skipped.length }), j.skipped.length ? 'warn' : 'ok'); route();
  if (j.skipped.length) setTimeout(() => modal(t('plan_applied', { n: j.saved, s: j.skipped.length }), `<div class="list">${j.skipped.map(x => { const it = b.items.find(i => i.id === +x.item_id);
    return `<div class="li warn">${esc(it ? itemName(it) + ' · ' + D.short(it.date) + ' ' + hm(it.start_time) : '')} · ${esc(b.staff.find(s => s.id === x.staff_id)?.display_name || '')}: ${esc(it ? whyText(x.reason, it, b, +x.staff_id) : t('why_notfound'))}</div>`; }).join('')}</div>`, {}), 300);
}
function plPreview(res, replaceIds, title) { modal(title, planBody(res), { wide: true, saveLabel: t('apply_plan'), save: () => plSave(res.rows, replaceIds) }); }
// assignment history: the assignments of the past days shown (this team) are deleted – counted first, then confirmed
ACT.pl_hist_del = async () => {
  const today = D.today(), its = plCache.items.filter(i => i.date < today && i.staff.length), f = { p_filter: { item_id: its.map(i => i.id) } };
  if (!its.length) return;
  const pv = await delMany('assignments', Object.assign({ p_preview: true }, f));
  if (!pv.n) return toast(t('nothing_found'), 'bad');
  if (pv.n > 1 && !can('bulk_delete')) return toast(t('err_bulk_needed'), 'bad');
  const last = its.map(i => i.date).sort().pop();
  if (!await delAsk({ title: t('delete_assignments_q', { n: pv.n }), n: pv.n, facts: [t('del_asg_days', { from: D.short(plFrom), to: D.short(last), items: its.length })], text: t('delete_assignments_text') })) return;
  const j = await delMany('assignments', f); toast(t('deleted_n', { n: j.deleted })); route();
};
// the assignments of the period as a document: per day every item with its assignment rule and the people (numbers + names)
ACT.pl_print = () => {
  const b = plCache; const its = b.items.filter(i => i.status === 'scheduled' && i.staff_needed > 0 && (!i.team_id || i.team_id === S.team?.id));
  const who = s => [staffTag(b, s.staff_id), s.name].filter((x, k, a) => x && a.indexOf(x) === k).join(' ');
  printSheet(t('pg_planner'), D.range(plFrom, plDays).map(d => { const di = its.filter(i => i.date === d); return di.length ? `<h2>${esc(D.long(d))}</h2>`
      + tableHtml([t('time'), t('name'), t('type'), t('location'), t('asg_rule'), t('staff')], di.map(i => [hm(i.start_time) + (i.end_time ? '–' + hm(i.end_time) : ''), itemName(i), typeLabel(i.type), i.location || '',
        (roleNames(i.assign_roles).join(' + ') || t('asg_any_role')) + ' · ' + i.staff.length + '/' + i.staff_needed, i.staff.map(who).join(', ') || '—'])) : ''; }).join('') || `<p>${esc(t('nothing_to_plan'))}</p>`,
    { sub: D.span(plFrom, D.add(plFrom, plDays - 1)) });
};

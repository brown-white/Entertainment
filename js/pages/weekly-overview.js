'use strict';
/* AUREA · pages/weekly-overview.js — Programme → Week overview: the whole week on one page (parts of the day across seven days), its quick view,
   Select (bulk changes of any items), copy, the team's days, and Check programme.
   Uses: core/state · translations/languages · supabase · core/utils · icons/icons · core/permissions · components/modals · core/actions ·
         components/cards · core/router · components/forms · components/tables · systems/team-schedule · systems/smart-planner ·
         systems/assignment-system · systems/program-engine */
let wvFrom = null, wvType = 'all', wvOp = 'all', wvCancelled = false, wvFocus = null, wvData = null, wvSelecting = false;
async function weekOverview() {
  const today = D.today(); if (!wvFrom) { wvFrom = monday(today); wvFocus = today; }        // (opened: this week, today in view on a phone)
  const to = D.add(wvFrom, 6), days = D.range(wvFrom, 7);
  const plan = can('m_planner') && !!S.team;
  const [b, chk] = await Promise.all([board(wvFrom, to), plan ? safe(api('planner_check', { p_from: wvFrom, p_to: to })) : null]);
  wvData = Object.assign(b, { from: wvFrom, span: 7, check: chk, warn: new Map() });
  if (chk) {
    // the Smart Planner's own check of the assignments already made: the same warnings as on the Planner page
    planAssignments(Object.assign(plInput(wvData), { dryRun: true })).warnings.forEach(w => wvData.warn.set(w.item_id + '|' + w.staff_id, w.reason));
    asgShow(wvData);                                                    // (Assign staff = the planner's own pick list, for this week)
  }
  const types = visibleTypes(), ops = wvOp === 'all' ? OPS : [wvOp];
  const nCancel = b.items.filter(i => i.status === 'cancelled').length;
  const shown = b.items.filter(i => types.includes(i.type) && (wvType === 'all' || i.type === wvType) && (wvCancelled || i.status !== 'cancelled'));
  const warnList = b.items.flatMap(i => i.staff.filter(s => wvData.warn.has(i.id + '|' + s.staff_id)).map(s => ({ i, s, r: wvData.warn.get(i.id + '|' + s.staff_id) })));
  const mgr = can('m_program'), selecting = mgr && wvSelecting;
  wvData.shownIds = shown.map(i => i.id);
  // the manager's actions: nothing chosen → Add / Copy day / Copy week / Select; in Select → what can be done with the chosen items
  const bar = !mgr ? '' : selecting ? wvSelBar(shown, types)
    : `<div class="wv-act"><button class="btn small" data-act="pi_new" data-date="${wvFrom <= today && today <= to ? today : wvFrom}">${ico('plus')} ${esc(t('add_prog'))}</button>
        <button class="btn ghost small" data-act="wv_copy_day_pick">${ico('copy')} ${esc(t('copy_day'))}</button><button class="btn ghost small" data-act="wv_copy_week">${ico('copy')} ${esc(t('copy_week'))}</button>
        <button class="btn ghost small" data-act="wv_select">${ico('check')} ${esc(t('select'))}</button><button class="btn ghost small" data-act="pc_check">${ico('search')} ${esc(t('pc_title'))}</button></div>`;
  return progTabs('overview') + `<div class="wv ${selecting ? 'selecting' : ''}">
    <div class="wv-bar">
      <div class="wv-nav"><button class="btn ghost small" data-act="wv_week" data-n="-7">‹ ${esc(t('prev_week'))}</button><b class="wv-range">${esc(D.dm(wvFrom))} – ${esc(D.fmt(to, { day: 'numeric', month: 'short', year: 'numeric' }))}</b><button class="btn ghost small" data-act="wv_week" data-n="7">${esc(t('next_week'))} ›</button></div>
      <div class="wv-jump"><button class="btn ghost small" data-act="wv_today">${esc(t('today'))}</button><button class="btn ghost small" data-act="wv_this">${esc(t('this_week'))}</button>
        <input type="date" class="wv-date-in" data-act-change="wv_jump" value="${wvFrom}" aria-label="${esc(t('go_to_date'))}" title="${esc(t('go_to_date'))}"></div>
      <span class="grow"></span>
      <div class="wv-tools"><button class="btn ghost small" data-act="wv_print">${ico('download')} ${esc(t('print_pdf'))}</button></div>
    </div>
    ${bar}
    <div class="chips">${[['all', t('all')]].concat(types.map(ty => [ty, typeLabel(ty)])).map(([v, l]) => `<button class="chip-btn ${wvType === v ? 'on' : ''}" data-act="wv_type" data-ty="${v}">${esc(l)}</button>`).join('')}</div>
    <div class="chips">${[['all', t('all_day')]].concat(OPS.map(op => [op, t('part_' + op)])).map(([v, l]) => `<button class="chip-btn ${wvOp === v ? 'on' : ''}" data-act="wv_op" data-op="${v}">${esc(l)}</button>`).join('')}${nCancel ? `<button class="chip-btn ${wvCancelled ? 'on' : ''}" data-act="wv_cancelled">${esc(t('show_cancelled', { n: nCancel }))}</button>` : ''}</div>
    ${warnList.length ? `<details class="hint-box warn wv-warn"><summary>${ico('flag')} ${esc(t('plan_warnings_n', { n: warnList.length }))}</summary><ul class="chg-list">${warnList.map(x => `<li>${esc(staffTag(b, x.s.staff_id, x.s.name))} ${esc(x.s.name)} · ${esc(itemName(x.i))} · ${esc(D.short(x.i.date))} ${esc(hm(x.i.start_time))}: ${esc(whyText(x.r, x.i, wvData, x.s.staff_id))}</li>`).join('')}</ul><a class="btn ghost small" href="#/planner">${esc(t('pg_planner'))}</a></details>` : ''}
    <div class="wv-scroll"><div class="wv-grid" style="--wv-rows:${1 + ops.length}">${days.map(d => `<section class="wv-day ${d === today ? 'today' : ''} ${d < today ? 'past' : ''}" data-date="${d}" aria-label="${esc(D.long(d))}">
      ${wvHead(b, d)}${ops.map(op => wvPart(b, d, op, shown.filter(i => i.date === d && opOf(i.start_time) === op))).join('')}</section>`).join('')}</div></div>
    <p class="muted small">${esc(t('wv_hint'))}</p></div>`;
}
// the top of a day: the hotel's day (name, restaurant theme), the team's dress code and notes, who is off and who has entrance duty
function wvHead(b, d) {
  const di = dayOf(b.days, d), pl = b.plans.find(p => p.date === d) || {}, st = b.status.filter(x => x.date === d);
  const who = list2 => list2.map(x => `<span class="wv-who" title="${esc(b.staff.find(p => p.id === x.staff_id)?.display_name || '')}">${esc(staffTag(b, x.staff_id))}${x.extra || ''}</span>`).join('') || `<span class="muted">${esc(t('nobody'))}</span>`;
  const kv = (label, value) => `<span class="wv-kv"><i>${esc(label)}</i><b>${value}</b></span>`;
  const off = st.filter(x => x.status === 'day_off'), ent = st.filter(x => x.status === 'working' && x.entrance), away = st.filter(x => ['vacation', 'absent', 'sick'].includes(x.status));
  const leave = uniq(ent.map(x => x.leave_op).filter(Boolean)), at = uniq(ent.map(x => x.entrance_at).filter(Boolean));
  const dayInfo = `${dayName(di) ? `<span class="wv-dayname">${esc(dayName(di))}</span>` : `<span class="wv-dayname none">${esc(can('m_program,m_dayplan') ? t('add_day_info') : '')}</span>`}
    ${restName(di) ? kv(t('restaurant_theme'), esc(restName(di))) : ''}${pl.dress_code ? kv(t('dress_code'), esc(pl.dress_code)) : ''}${pl.notes ? `<span class="wv-note">${esc(pl.notes)}</span>` : ''}`;
  const team = S.team ? `${kv(t('st_day_off'), who(off))}${kv(t('entrance'), who(ent))}${ent.length ? kv(t('entrance_time'), esc(at.join(' / '))) + kv(t('leave_operation'), esc(leave.join(' / '))) : ''}
    ${away.length ? kv(t('away'), who(away.map(x => Object.assign({}, x, { extra: ' · ' + esc(statusLabel(x.status)) })))) : ''}` : '';
  return `<header class="wv-head"><div class="wv-date"><b>${esc(D.fmt(d, { weekday: 'long' }))}</b><span>${esc(D.fmt(d, { day: 'numeric', month: 'short' }))}</span>${d === D.today() ? chip(t('today'), 'ok') : ''}</div>
    ${can('m_program,m_dayplan') ? `<button class="wv-info" data-act="dp_plan" data-date="${d}" aria-label="${esc(t('day_name') + ' · ' + D.long(d))}">${dayInfo}</button>` : `<div class="wv-info">${dayInfo}</div>`}
    ${team ? (can('m_dayplan') ? `<button class="wv-info" data-act="wv_team" data-date="${d}" aria-label="${esc(t('st_day_off') + ' · ' + t('entrance') + ' · ' + D.long(d))}">${team}</button>` : `<div class="wv-info">${team}</div>`) : ''}
    ${can('m_program') ? `<div class="wv-head-act">${wvSelecting ? wvSelToggle('day', `data-date="${d}"`, t('select_day')) : `<button class="btn ghost small" data-act="wv_copy_day" data-date="${d}">${ico('copy')} ${esc(t('copy_day'))}</button>`}</div>` : ''}</header>`;
}
// one part of the day of one day: its items as cards (+ Add)
function wvPart(b, d, op, its) {
  const sel = can('m_program') && wvSelecting;
  const add = can('m_program') && !sel ? `<button class="wv-add" data-act="pi_new" data-date="${d}" data-time="${opStart(op)}">${ico('plus')} ${esc(t('add'))}</button>` : '';
  return `<div class="wv-op" data-date="${d}" data-op="${op}"><h4>${esc(t('part_' + op))}${sel && its.length ? wvSelToggle('op', `data-date="${d}" data-op="${op}"`, t('select_op'), true) : ''}</h4>${its.map(i => wvCard(b, i)).join('') || `<span class="wv-empty">—</span>`}${add}</div>`;
}
// why an item is on that day: ONE DATE, WEEKLY (one day a week), DAILY, or its days (MON/WED/SAT)
const schedText = it => { const w = it.series?.weekdays; if (!w) return t('sch_one_tag'); return w.length === 7 ? t('sch_daily_tag') : w.length === 1 ? t('sch_weekly_tag') : w.map(i => D.wdName(i, 'short')).join('/'); };
function wvCard(b, it) {
  const w = s => b.warn?.get(it.id + '|' + s.staff_id), flagged = it.staff.some(w), live = it.status === 'scheduled';
  const short = live && it.staff_needed > 0 && it.staff.length < it.staff_needed, selecting = can('m_program') && wvSelecting, drag = can('m_program') && !selecting && live && it.date >= D.today();
  const on = selecting && sel('wv').has(it.id);
  return `<div class="wv-card t-${esc(it.type)} ${live ? '' : 'cancelled'} ${short ? 'short' : ''} ${flagged ? 'warn' : ''} ${it.highlight ? 'hl' : ''} ${on ? 'picked' : ''}" role="button" tabindex="0" ${selecting ? 'data-act="wv_pick"' : 'data-act="wv_item"'} data-id="${it.id}" ${drag ? 'draggable="true"' : ''}
    ${selecting ? `aria-pressed="${on}"` : ''} aria-label="${esc(itemName(it) + ', ' + hm(it.start_time) + ', ' + typeLabel(it.type) + ', ' + schedText(it))}">
    <span class="wv-time">${selecting ? `<input type="checkbox" class="sel-box" data-k="wv" data-id="${it.id}" tabindex="-1" aria-hidden="true" ${on ? 'checked' : ''}>` : ''}<span>${esc(hm(it.start_time))}${it.end_time ? '–' + esc(hm(it.end_time)) : ''}</span><span class="wv-sched ${it.series ? '' : 'one'}" title="${esc(it.series ? ruleText({ weekdays: it.series.weekdays, valid_from: it.series.from, valid_to: it.series.to }) : t('sch_date'))}">${esc(schedText(it))}</span></span><b class="wv-name">${esc(itemName(it))}</b>
    ${it.location ? `<span class="wv-loc">${ico('pin')}${esc(it.location)}</span>` : ''}<span class="wv-type"><span class="ty-badge">${ico(TYPE_ICONS[it.type] || 'sun')}${esc(typeLabel(it.type))}</span>${live ? '' : ' ' + chip(t('cancelled'), 'bad')}${it.guest_visible === false ? ' ' + chip(t('staff_only')) : ''}</span>
    <span class="wv-asg ${it.staff_needed > 0 ? '' : 'none'}">${esc(asgRuleText(it))}</span>
    ${it.staff_needed > 0 || it.staff.length ? `<span class="wv-staff">${ico('users')}${it.staff.map(s => `<span class="${w(s) ? 'bad' : ''}" title="${esc(s.name + (w(s) ? ': ' + whyText(w(s), it, b, s.staff_id) : ''))}">${w(s) ? ico('flag') : ''}${esc(staffTag(b, s.staff_id, s.name))}</span>`).join(' ')}${it.staff_needed > 0 ? `<small>${it.staff.length}/${it.staff_needed}</small>` : ''}</span>` : ''}
    ${it.booking_required ? `<span class="wv-loc">${ico('ticket')}${esc(t('booked'))} ${it.booked || 0}${it.capacity ? '/' + it.capacity : ''}</span>` : ''}</div>`;
}
/* ---------- SELECT in the Week overview: choose items (any types together) by item, day, part of the day, type or all, then
   change them in one go. The choice is the app's ONE selection (sel('wv')); every change is the database's bulk change
   (program_bulk: the ONE series save and the ONE item save, a preview first – nothing changes before "Apply changes"). ---------- */
const wvPicked = () => (wvData?.items || []).filter(i => sel('wv').has(i.id));
const wvSelToggle = (kind, attrs, label, mini) => `<button type="button" class="wv-seltg ${mini ? 'mini' : ''}" data-act="wv_sel" data-sel="${kind}" ${attrs} aria-pressed="false" ${mini ? `aria-label="${esc(label)}" title="${esc(label)}"` : ''}>${ico('check')}${mini ? '' : `<span>${esc(label)}</span>`}</button>`;
function wvSelBar(shown, types) {
  const ids = shown.map(i => i.id), s = selKeep('wv', ids), all = ids.length > 0 && ids.every(id => s.has(id));
  const act = (k, icon, label) => `<button class="btn ghost small" data-act="wv_bulk" data-do="${k}" data-sel-need ${s.size ? '' : 'disabled'}>${icon ? ico(icon) + ' ' : ''}${esc(label)}</button>`;
  return `<div class="wv-selbar sel-bar" data-selk="wv" data-ids="${ids.join(',')}">
    <div class="wv-selrow"><label><input type="checkbox" data-act-change="sel_all" data-k="wv" ${all ? 'checked' : ''}> ${esc(t('select_all'))} (${ids.length})</label>
      ${types.filter(ty => shown.some(i => i.type === ty)).map(ty => wvSelToggle('type', `data-ty="${ty}"`, t('tp_' + ty))).join('')}
      <span class="grow"></span><b class="sel-n">${s.size ? esc(t('selected_n', { n: s.size })) : ''}</b></div>
    <div class="wv-selrow">${act('start', 'calendar', t('bk_set_start'))}${act('schedule', 'repeat', t('schedule'))}${act('copy', 'copy', t('copy'))}${act('move', '', t('move_item'))}${act('visible', '', t('bk_visibility'))}${act('assign', 'users', t('asg_rule'))}${act('delete', 'trash', t('delete'))}
      <span class="grow"></span><button class="btn small" data-act="wv_sel_done">${esc(t('bk_cancel_sel'))}</button></div></div>`;
}
// the items a day / part of the day / type toggle stands for (what the week shows)
const wvSubset = el => (wvData?.items || []).filter(i => (wvData.shownIds || []).includes(i.id)).filter(i =>
  el.dataset.sel === 'day' ? i.date === el.dataset.date : el.dataset.sel === 'op' ? i.date === el.dataset.date && opOf(i.start_time) === el.dataset.op : i.type === el.dataset.ty).map(i => i.id);
ACT.wv_select = () => { wvSelecting = true; sel('wv').clear(); route(); };
ACT.wv_sel_done = () => { wvSelecting = false; sel('wv').clear(); route(); };
ACT.wv_pick = el => { const s = sel('wv'), id = +el.dataset.id; if (s.has(id)) s.delete(id); else s.add(id); selUpdate('wv'); };
ACT.wv_sel = el => { const ids = wvSubset(el), s = sel('wv'), all = ids.length > 0 && ids.every(id => s.has(id)); ids.forEach(id => (all ? s.delete(id) : s.add(id))); selUpdate('wv'); };
// after every change of the choice: the cards, the toggles, the count and which actions make sense (start date: a series chosen;
// move: a coming date chosen)
SEL_ON.wv = s => {
  $$('.wv-card[data-act=wv_pick]').forEach(c => { const on = s.has(+c.dataset.id); c.classList.toggle('picked', on); c.setAttribute('aria-pressed', on); });
  $$('.wv-seltg').forEach(b => { const ids = wvSubset(b); b.setAttribute('aria-pressed', ids.length > 0 && ids.every(id => s.has(id))); });
  const its = wvPicked(), ok = { start: its.some(i => i.template_id), move: its.some(i => i.status === 'scheduled' && i.date >= D.today()) };
  $$('[data-act=wv_bulk]').forEach(b => { b.disabled = !s.size || (b.dataset.do in ok && !ok[b.dataset.do]); });
};
const dFull = d => D.fmt(d, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });     // (a bulk change names its date in full)
ACT.wv_bulk = el => {
  const its = wvPicked(), k = el.dataset.do; if (!its.length) return;
  const n = its.length, title = t(k === 'start' ? 'bk_set_start' : k === 'visible' ? 'bk_visibility' : k === 'move' ? 'move_item' : k === 'assign' ? 'asg_rule' : k) + ' · ' + t('selected_n', { n });
  if (k === 'start') return formBox(title, [{ k: 'date', type: 'date', label: t('sch_from'), req: true }], { date: D.today() },
    r => { if (!r.date) throw new ApiError('required', { field: t('sch_from') }); later(() => bulkRun(its, 'start', { date: r.date }, t('bk_new_start', { date: dFull(r.date) }))); },
    { saveLabel: t('next'), after: `<p class="muted small">${esc(t('bk_start_hint'))}</p>` });
  if (k === 'schedule') {
    const f = [{ k: 'what', type: 'choice', label: t('schedule'), options: [['end', t('bk_set_end')], ['noend', t('bk_remove_end')], ['one', t('sch_date')], ['week', t('sch_week')], ['days', t('sch_days')], ['on', t('bk_activate')], ['off', t('bk_deactivate')]] },
      { k: 'date', type: 'date', label: t('sch_to') }, { k: 'weekday', type: 'select', label: t('sch_weekday'), num: true, options: [0, 1, 2, 3, 4, 5, 6].map(i => [i, D.wdName(i)]) }, { k: 'weekdays', type: 'days', label: t('weekdays') }];
    const mount = root => { const sync = () => { const v = $('[data-choice=what] input:checked', root)?.value; [['date', v === 'end'], ['weekday', v === 'week'], ['weekdays', v === 'days']].forEach(([x, on]) => { const b = fieldBox(root, x); if (b) b.hidden = !on; }); };
      $$('[data-choice=what] input', root).forEach(i => i.addEventListener('change', sync)); sync(); };
    return formBox(title, f, { what: 'end', weekday: D.wd(its[0].date), weekdays: uniq(its.map(i => D.wd(i.date))).sort() }, r => {
      const go = (a, args, what) => later(() => bulkRun(its, a, args, what));
      if (r.what === 'end') { if (!r.date) throw new ApiError('required', { field: t('sch_to') }); return go('end', { date: r.date }, t('bk_new_end', { date: dFull(r.date) })); }
      if (r.what === 'noend') return go('end', { date: null }, t('bk_remove_end'));
      if (r.what === 'one') return go('one_date', {}, t('bk_to_one'));
      if (r.what === 'week') return go('weekdays', { weekdays: [+r.weekday] }, t('rule_every', { day: D.wdName(+r.weekday) }));
      if (r.what === 'days') { const w = (r.weekdays || []).map(Number).sort(); if (!w.length) throw new ApiError('required', { field: t('weekdays') }); return go('weekdays', { weekdays: w }, ruleText({ weekdays: w })); }
      return go('active', { on: r.what === 'on' }, t(r.what === 'on' ? 'bk_activate' : 'bk_deactivate'));
    }, { saveLabel: t('next'), mount });
  }
  if (k === 'copy') return formBox(title, copyFields(false, true), Object.assign(copyDefault(its[0].date), { wk: D.add(monday(its[0].date), 7) }),
    r => { const rows = copyRows(its, r); later(() => progCopy(rows, title)); }, { saveLabel: t('next'), after: copyQuick, mount: copyMount });
  if (k === 'move') return formBox(title, [{ k: 'date', type: 'date', label: t('date'), req: true }], { date: D.add(D.today(), 1) },
    r => { if (!r.date) throw new ApiError('required', { field: t('date') }); later(() => bulkRun(its, 'move', { date: r.date }, t('bk_move_to', { date: dFull(r.date) }))); }, { saveLabel: t('next') });
  if (k === 'visible') return formBox(title, [{ k: 'on', type: 'choice', label: t('bk_visibility'), options: [['1', t('bk_show_guests')], ['0', t('staff_only')]] }], { on: '0' },
    r => later(() => bulkRun(its, 'visible', { on: r.on === '1' }, t(r.on === '1' ? 'bk_show_guests' : 'staff_only'))), { saveLabel: t('next'), after: `<p class="muted small">${esc(t('guest_visible_hint'))}</p>` });
  // the assignment rule of the chosen items at once (their series and one-date items) – the same check first
  if (k === 'assign') { const f = asgFields();
    return formBox(title, f, { assign: 'req', staff_needed: 1, assign_roles: [] }, r => { asgOf(r);
      const what = r.staff_needed > 0 ? (roleNames(r.assign_roles).join(' + ') || t('asg_any_role')) + ' · ' + t('asg_n_required', { n: r.staff_needed }) : t('asg_rule_none');
      later(() => bulkRun(its, 'assign', { staff_needed: r.staff_needed, roles: r.assign_roles }, t('asg_rule') + ': ' + what)); }, { saveLabel: t('next'), mount: progMount }); }
  if (k === 'delete') return choiceBox(t('del_scope_title') + ' · ' + t('selected_n', { n }), `<p class="muted">${esc(t('del_series_hint'))}</p>`,
    [{ k: 'one', label: t('bk_del_one') }, { k: 'future', label: t('bk_del_future') }, { k: 'series', label: t('bk_del_series'), cls: 'solid-danger' }])
    .then(sc => sc && bulkRun(its, 'delete', { scope: sc }, t('bk_del_' + sc)));
};
// the preview of a bulk change, then Apply (the database answers what it would do; nothing is changed before the person agrees)
async function bulkRun(its, action, args, what) {
  const ids = its.map(i => i.id), pv = await api('program_bulk', { p_ids: ids, p_action: action, p_args: args, p_preview: true });
  const rl = r => ruleText({ weekdays: r.weekdays, valid_from: r.from, valid_to: r.to }) + (r.active ? '' : ' · ' + t('paused')) + (r.guest_visible ? '' : ' · ' + t('staff_only'));
  const after = pv.rules_after || [], had = new Set((pv.rules || []).map(r => r.id));
  const changes = (pv.rules || []).map(r => { const a = after.find(x => x.id === r.id); return { name: tx(r.name_i18n, r.name), from: rl(r), to: a ? rl(a) : t('bk_series_gone') }; })
    .concat(after.filter(a => !had.has(a.id)).map(a => ({ name: tx(a.name_i18n, a.name), from: t('sch_date'), to: rl(a) }))).filter(c => c.from !== c.to);
  const skip = pv.skipped || [], types = Object.entries(pv.types || {}).map(([ty, n]) => `${t('tp_' + ty)}: ${n}`).join(' · ');
  const html = `<p class="bk-n">${esc(t('bk_selected', { n: pv.selected }))}</p><p class="bk-what">${esc(what)}</p>
    <p><span class="muted">${esc(t('bk_affected'))}</span> ${esc(types)}</p><p class="muted small">${esc(t('bk_split', { s: pv.series, o: pv.one_dates }))}</p>
    ${changes.length ? `<ul class="chg-list">${changes.slice(0, 24).map(c => `<li><b>${esc(c.name)}</b>: ${esc(c.from)} → ${esc(c.to)}</li>`).join('')}${changes.length > 24 ? `<li class="muted">… +${changes.length - 24}</li>` : ''}</ul>` : ''}
    ${skip.length ? `<details class="hint-box"><summary>${esc(t('bk_skipped', { n: skip.length }))}</summary><ul class="chg-list">${skip.map(x => `<li>${esc(tx(x.name_i18n, x.name))}${x.date ? ' · ' + esc(D.short(x.date)) : ''}: ${esc(t('bk_why_' + x.reason))}</li>`).join('')}</ul></details>` : ''}
    ${effectHtml(pv.effect)}
    ${pv.issues.length ? `<p class="hint-box warn">${ico('flag')}<span>${esc(t('change_issues'))}</span></p><ul class="chg-list">${pv.issues.map(x => `<li>${esc(issueText(x))}</li>`).join('')}</ul>` : ''}`;
  const choices = pv.issues.length && can('m_planner') ? [{ k: 'remove', label: t('bk_apply_remove') }, { k: 'save', label: t('bk_apply_anyway') }] : [{ k: 'save', label: t('bk_apply') }];
  const ch = await choiceBox(t('bk_title'), html, choices); if (!ch) return;
  const j = await api('program_bulk', { p_ids: ids, p_action: action, p_args: args, p_preview: false });
  if (ch === 'remove') await unassignIssues(pv.issues);
  toast(t('bk_done', { n: j.changed }), 'ok'); sel('wv').clear(); wvSelecting = false; route();
}
ACT.wv_week = el => { wvFrom = D.add(wvFrom, +el.dataset.n); route(); };
ACT.wv_today = () => { wvFrom = monday(D.today()); wvFocus = D.today(); route(); };
ACT.wv_this = () => { wvFrom = monday(D.today()); wvFocus = wvFrom; route(); };
ACT.wv_jump = el => { if (!el.value) return; wvFrom = monday(el.value); wvFocus = el.value; route(); };
ACT.wv_type = el => { wvType = el.dataset.ty; route(); };            // filters only change the view
ACT.wv_op = el => { wvOp = el.dataset.op; route(); };
ACT.wv_cancelled = () => { wvCancelled = !wvCancelled; route(); };
/* tap an item: the quick editor (name, type, day, times, place) – everything else in the full programme editor ("All settings").
   It saves through the same save as the full editor: a date of a series asks which dates (this date only / this and future / entire series) */
ACT.wv_item = async el => {
  const view = wvData?.items.find(i => i.id === +el.dataset.id); if (!view) return;
  if (!can('m_program')) { location.hash = '#/item/' + view.id; return; }
  const it = (await list('program_items', { id: view.id }))[0], tp = it?.template_id ? (await list('program_templates', { id: it.template_id }))[0] : null;
  wvQuick(it, view, tp);
};
function wvQuick(it, view, tp, preset = {}) {
  if (!it) return editForm('', [], undefined, null);                    // deleted meanwhile on another phone: said so, list refreshed
  const f = [{ k: 'name', label: t('name'), req: true }, { k: 'type', type: 'select', label: t('type'), options: TYPES.map(x => [x, typeLabel(x)]) },
    { k: 'date', type: 'date', label: t('date'), req: true }, { k: 'start_time', type: 'time', label: t('start'), req: true }, { k: 'end_time', type: 'time', label: t('end') }, { k: 'location', label: t('location') },
    // the item's assignment rule, right here (the same save as the full editor)
    ...asgFields()];
  const staff = view?.staff || [], w = s => wvData?.warn?.get(it.id + '|' + s.staff_id), kind = tp ? 'occ' : 'date';
  const head = `<p class="wv-q-meta">${tp ? chip(t('series_of', { rule: ruleText(tp) }), 'ok') : chip(t('one_off'))}${it.slot_date ? ' ' + chip(t('moved_from', { d: D.short(it.slot_date) }), 'warn') : ''}${it.customized ? ' ' + chip(t('own_changes')) : ''}${it.status === 'cancelled' ? ' ' + chip(t('cancelled'), 'bad') : ''} ${chip(t('asg_rule') + ': ' + asgRuleText(it), it.staff_needed > 0 ? '' : 'muted')}</p>`;
  // a name: remove / replace / mark as manual / why (the manager who plans this team)
  const edit = can('m_planner') && S.team && wvData?.check && it.status === 'scheduled' && it.date >= D.today();
  const people = `<div class="wv-q-staff"><b>${esc(t('staff'))}</b> ${staff.map(s => `<${edit ? `button type="button" data-act="as_staff" data-i="${it.id}" data-s="${s.staff_id}"` : 'span'} class="name-tag ${s.source || ''} ${w(s) ? 'warn' : ''}">${w(s) ? ico('flag') + ' ' : ''}${esc(staffTag(wvData, s.staff_id, s.name) + ' ' + s.name)}${w(s) ? ' – ' + esc(whyText(w(s), it, wvData, s.staff_id)) : ''}</${edit ? 'button' : 'span'}>`).join(' ') || `<span class="muted">${esc(t('nobody_yet'))}</span>`}
    ${it.staff_needed > 0 ? `<small class="muted">${staff.length}/${it.staff_needed}</small>` : ''}${can('m_planner') && S.team && wvData?.check && it.status === 'scheduled' && it.staff_needed > 0 ? ` <button class="btn ghost small" data-act="wv_assign" data-id="${it.id}">${ico('users')} ${esc(t('assign_staff'))}</button>` : ''}</div>`;
  const asg = { assign: it.staff_needed > 0 ? 'req' : 'none', staff_needed: Math.max(1, +it.staff_needed || 1), assign_roles: it.assign_roles || [] };
  return editForm(itemName(it), f, Object.assign({}, it, asg, preset), async r => { const res = await progSave(kind, r, it, tp); if (res === false) return false; route(); },
    Object.assign(progDangerOpts(kind, it, tp), { mount: progMount, after: head + people, extra: `<button class="btn ghost" data-act="wv_copy_item" data-id="${it.id}">${ico('copy')} ${esc(t('copy'))}</button><button class="btn ghost" data-act="pi_edit" data-id="${it.id}">${esc(t('all_settings'))}</button>` }));
}
ACT.wv_assign = el => { closeModals(); ACT.pl_item(el); };                // the planner's pick list (same rules, same save)
/* drag a card to another day (computers): the same item moves (never a copy); the manager confirms, the database checks */
function wvMount(view) {
  const grid = $('.wv-grid', view); if (!grid) return;
  if (wvSelecting) SEL_ON.wv(sel('wv'));
  if (wvFocus) {                                                         // the chosen day at the start of the row (a phone shows that day)
    const col = $(`.wv-day[data-date="${wvFocus}"]`, grid), sc = grid.parentNode; wvFocus = null;
    if (col) { const c = col.getBoundingClientRect(), r = sc.getBoundingClientRect(), pad = parseFloat(getComputedStyle(sc).paddingInlineStart) || 0;
      sc.scrollLeft += isRtl() ? c.right - r.right + pad : c.left - r.left - pad; }
  }
  if (!can('m_program')) return;
  let dragId = null; const clear = () => $$('.wv-op.drop', grid).forEach(z => z.classList.remove('drop'));
  grid.addEventListener('dragstart', ev => { const c = ev.target.closest?.('.wv-card[draggable=true]'); if (!c) return; dragId = +c.dataset.id; ev.dataTransfer.effectAllowed = 'move'; ev.dataTransfer.setData('text/plain', String(dragId)); c.classList.add('dragging'); });
  grid.addEventListener('dragend', ev => { ev.target.closest?.('.wv-card')?.classList.remove('dragging'); clear(); dragId = null; });
  grid.addEventListener('dragover', ev => { const z = ev.target.closest?.('.wv-op'); if (!z || dragId == null || z.dataset.date < D.today()) return; ev.preventDefault(); ev.dataTransfer.dropEffect = 'move'; if (!z.classList.contains('drop')) { clear(); z.classList.add('drop'); } });
  grid.addEventListener('drop', ev => { const z = ev.target.closest?.('.wv-op'); if (!z || dragId == null) return; ev.preventDefault(); const id = dragId; clear(); wvDrop(id, z.dataset.date, z.dataset.op).catch(fail); });
}
async function wvDrop(id, date, op) {
  const view = wvData?.items.find(i => i.id === id); if (!view || date < D.today()) return;
  const sameOp = opOf(view.start_time) === op;
  if (view.date === date && sameOp) return;
  const it = (await list('program_items', { id }))[0]; if (!it) return route();
  const tp = it.template_id ? (await list('program_templates', { id: it.template_id }))[0] : null;
  if (sameOp) {                                                          // another day, the same time
    const ask = t('move_q', { name: itemName(view), from: D.short(view.date), to: D.short(date), time: hm(view.start_time) });
    const row = tp ? await progSave('occ', { date }, it, tp, { title: t('move_item'), ask }) : await itemSave({ id, date }, view, { title: t('move_item'), okLabel: t('move_item'), ask });
    if (row !== false) { toast(t('saved')); route(); }
    return;
  }
  // another part of the day needs another time: the quick editor opens with the new day and that part's time, the manager saves
  const st = opStart(op), len = it.end_time ? (mins(hm(it.end_time)) - mins(hm(it.start_time)) + 1440) % 1440 : null;
  wvQuick(it, view, tp, { date, start_time: st, end_time: len ? hmOf(mins(st) + len) : null });
  toast(t('move_set_time'), 'warn');
}
/* who is off / on entrance duty that day: the quick list for the team; ✎ = the full day editor of that person (times, note) */
ACT.wv_team = async el => {
  const d = el.dataset.date, b = await board(d, d), people = b.staff.filter(s => !s.is_manager && s.status !== 'left' && (!s.start_date || s.start_date <= d) && (!s.end_date || s.end_date >= d));
  const cur = s => statusOf(b, s.id, d) || { status: 'working', entrance: false, practice: false };
  modal(D.long(d) + (S.team ? ' · ' + S.team.name : ''), `<p class="muted small">${esc(t('team_day_intro', { leave: b.rules?.leave_op_time || '', ent: b.rules?.entrance_time || '' }))}</p>
    <div class="list wv-team">${people.map(s => { const st = cur(s); return `<div class="li row" data-s="${s.id}"><span class="grow"><b>${esc((s.staff_number ? '#' + s.staff_number + ' ' : '') + s.display_name)}</b>${st.entrance ? `<small class="muted"> ${esc(entranceLabel(st))}${st.leave_op ? ' · ' + esc(t('leave_operation')) + ' ' + esc(st.leave_op) : ''}</small>` : ''}</span>
      <select data-f="status" aria-label="${esc(t('status') + ' ' + s.display_name)}">${STATUS.map(x => `<option value="${x}" ${st.status === x ? 'selected' : ''}>${esc(statusLabel(x))}</option>`).join('')}</select>
      <label class="pickchip"><input type="checkbox" data-f="entrance" ${st.entrance ? 'checked' : ''}> ${esc(t('entrance'))}</label>
      <button class="icon-btn" data-act="wv_cell" data-s="${s.id}" data-d="${d}" aria-label="${esc(t('edit') + ' ' + s.display_name)}">${ico('edit')}</button></div>`; }).join('') || empty(t('no_staff'))}</div>`, {
    save: async root => {
      const changes = $$('.li[data-s]', root).map(row => { const s = people.find(p => p.id === +row.dataset.s), st = cur(s), status = $('[data-f=status]', row).value, entrance = $('[data-f=entrance]', row).checked && status === 'working';
        return status === st.status && entrance === !!st.entrance ? null : { staff_id: s.id, date: d, status, entrance, practice: !!st.practice && status === 'working', note: st.note ?? null, times: false }; }).filter(Boolean);
      if (!changes.length) return;
      if (await dayStatusSave(changes) === false) return false;
      toast(t('saved')); route();
    }
  });
};
ACT.wv_cell = el => { closeModals(); ACT.dp_cell(el); };
ACT.wv_copy_item = async el => {
  const it = (await list('program_items', { id: +el.dataset.id }))[0]; if (!it) return route();
  closeModals();
  formBox(t('copy') + ' · ' + itemName(it), copyFields(true), Object.assign(copyDefault(it.date), { start_time: it.start_time }),
    r => { const rows = copyRows([it], r); setTimeout(() => progCopy(rows, t('copy') + ' · ' + itemName(it)).catch(fail), 30); },
    { saveLabel: t('next'), after: copyQuick + `<p class="muted small">${esc(t('copy_item_hint'))}</p>`, mount: copyMount });
};
ACT.wv_copy_day = el => {
  const d = el.dataset.date, its = (wvData?.items || []).filter(i => i.date === d && i.status === 'scheduled');
  if (!its.length) return toast(t('copy_none_new'), 'warn');
  formBox(t('copy_day') + ' · ' + D.long(d), copyFields(false), copyDefault(d),
    r => { const rows = copyRows(its, r); setTimeout(() => progCopy(rows, t('copy_day') + ' · ' + D.short(d)).catch(fail), 30); }, { saveLabel: t('next'), after: copyQuick, mount: copyMount });
};
ACT.wv_copy_day_pick = () => {
  const days = D.range(wvFrom, 7), today = D.today();
  formBox(t('copy_day'), [{ k: 'd', type: 'select', label: t('copy_from'), options: days.map(d => [d, D.long(d)]) }], { d: days.includes(today) ? today : wvFrom },
    r => later(() => ACT.wv_copy_day({ dataset: { date: r.d } })), { saveLabel: t('next') });
};
ACT.wv_copy_week = () => {
  const its = (wvData?.items || []).filter(i => i.status === 'scheduled'), from = wvFrom, mon0 = monday(D.today());
  if (!its.length) return toast(t('copy_none_new'), 'warn');
  // to any week (a day of it): every item on its own weekday there (never onto itself; past dates are not copied)
  const f = [{ k: 'to', type: 'date', label: t('week_of'), req: true, hint: t('week_of_hint') }];
  formBox(t('copy_week') + ' · ' + D.dm(from) + ' – ' + D.dm(D.add(from, 6)), f, { to: from < mon0 ? mon0 : D.add(from, 7) },
    r => { const to = r.to && monday(r.to); if (!to) throw new ApiError('required', { field: t('week_of') }); if (to === from) throw new ApiError('same_week');
      const n = D.diff(from, to); later(() => progCopy(its.map(i => ({ id: i.id, date: D.add(i.date, n) })), t('copy_week') + ' · ' + D.dm(to) + ' – ' + D.dm(D.add(to, 6)))); }, { saveLabel: t('next') });
};
// Print: the ONE export screen of the weekly programme (its design, a live preview), with the week and the filters shown here
ACT.wv_print = () => { openWith('prog_export', { types: wvType === 'all' ? null : [wvType], ops: wvOp === 'all' ? null : [wvOp] }); location.hash = '#/prog_export/' + wvFrom; };
/* CHECK THE PROGRAMME: what makes an old name, a wrong day or a double item appear – found in the programme itself (the coming
   two months), each with its repair through the ONE save: extra copies and left-over one-date items go (the ONE bulk delete, with its
   preview); dates on a weekday their schedule no longer has, and dates with their own changes, follow their schedule again */
ACT.pc_check = async () => {
  closeModals();
  const j = await api('programme_check'), box = (k, v, on, label) => `<label class="li row with-row"><input type="checkbox" data-pc="${k}" value="${v}" ${on ? 'checked' : ''}><span>${label}</span></label>`;
  const sec = (k, title, hint, rows, btn) => rows.length ? `<section class="with-sec" data-sec="${k}"><h3>${esc(title)} <small class="muted">${rows.length}</small></h3><p class="muted small">${esc(hint)}</p><div class="list">${rows.join('')}</div>
      <p><button class="btn ghost small" data-act="pc_do" data-k="${k}">${esc(btn)}</button></p></section>` : '';
  const flag = x => x.used ? ` · <span class="bad-t">${esc(t('pc_used'))}</span>` : '';
  const html = sec('dup', t('pc_dups'), t('pc_dups_hint'), j.duplicates.flatMap(g => g.items.slice(1).map(x => box('dup', x.id, !x.used,
        `<b>${esc(D.short(g.date))} ${esc(x.start_time)}</b> ${esc(g.name)} · ${esc(x.series ? t('pc_of_series') : t('one_off'))}${flag(x)} <small class="muted">${esc(t('pc_kept', { time: g.items[0].start_time }))}</small>`))), t('pc_del_sel'))
    + sec('left', t('pc_left'), t('pc_left_hint'), j.leftovers.map(g => box('left', g.ids.join(','), !g.used,
        `<b>${esc(g.name)}</b> · ${esc(t('rule_every', { day: D.wdName(g.weekday) }))} ${esc(g.start_time)} · ${esc(t('pc_n_dates', { n: g.ids.length }))}${flag(g)}${g.series ? ` <small class="muted">${esc(t('pc_has_series'))}</small>` : ''}`)), t('pc_del_sel'))
    + sec('off', t('pc_off'), t('pc_off_hint'), j.off_rule.map(x => box('off', x.id, true, `<b>${esc(D.short(x.date))} ${esc(x.start_time)}</b> ${esc(x.name)} <small class="muted">${esc(x.series_name)}${x.moved ? ' · ' + esc(t('pc_moved')) : ''}</small>`)), t('pc_repair'))
    + sec('own', t('pc_own'), t('pc_own_hint'), j.own.map(x => box('own', x.id, false, `<b>${esc(D.short(x.date))} ${esc(x.start_time)}</b> ${esc(x.name)} <small class="muted">${esc(x.series_name)} · ${esc((x.fields || []).map(f => t('own_f_' + f)).join(', '))}</small>`)), t('pc_follow'));
  modal(t('pc_title'), html || `<p class="hint-box ok">${ico('check')}<span>${esc(t('pc_clean'))}</span></p>`, { wide: true });
};
ACT.pc_do = async el => {
  const k = el.dataset.k, root = el.closest('.modal'), ids = $$(`[data-pc=${k}]:checked`, root).flatMap(i => i.value.split(',').map(Number));
  if (!ids.length) return toast(t('nothing_selected'), 'bad');
  if (k === 'dup' || k === 'left') { closeModals(); return bulkRun(ids.map(id => ({ id })), 'delete', { scope: 'one' }, t('pc_del_what', { n: ids.length })); }
  if (!await confirmBox(t('pc_follow_q', { n: ids.length }), t(k === 'off' ? 'pc_repair' : 'pc_follow'))) return;
  const j = await api('program_item_follow', { p_ids: ids }); toast(t('pc_followed', { n: j.n }), 'ok'); closeModals(); route(); ACT.pc_check();
};

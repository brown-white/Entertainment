'use strict';
/* AUREA · systems/program-engine.js — THE programme: one editor for every page (a date, the series, from a date on), the series follow-up and its
   questions, copy, the parts of the day, the programme item row (guests and staff) and the ONE weekly programme on paper.
   Uses: core/state · translations/languages · supabase · core/utils · icons/icons · core/permissions · components/modals · core/actions ·
         components/cards · core/router · components/forms · systems/exports · systems/guest-lifecycle · systems/team-schedule ·
         systems/assignment-system */
const allCats = () => (S.mode === 'guest' ? S.g.home?.categories : S.categories) || [];
const itemCats = it => (it.categories || []).map(id => allCats().find(c => c.id === id)).filter(Boolean);
function itemRow(it, go = 'g_item') {
  const left = it.capacity > 0 ? Math.max(0, it.capacity - (+it.booked || 0)) : null;
  // who works is internal: names only in the staff app (the guests' data carries no assignment at all)
  const staff = S.mode === 'guest' ? '' : (it.staff || []).map(x => x.name).join(', ');
  let pill = '';
  if (S.mode === 'guest' && it.status === 'scheduled') {
    const b = myBooking(it);
    if (b) pill = `<span class="pill ok">${esc(t(b.status === 'waiting' ? 'waiting_list' : 'booked'))}</span>`;
    else if (it.booking_required) pill = left === 0 ? `<span class="pill bad">${esc(t('full'))}</span>` : `<span class="pill go">${esc(t('book'))}</span>`;
    else if (it.ticketed) pill = `<span class="pill go">${esc(t('tickets'))}</span>`;
  }
  return `<a class="item t-${esc(it.type)} ${it.highlight ? 'hl' : ''} ${it.status === 'cancelled' ? 'cancelled' : ''}" href="#/${go}/${it.id}">
    <time>${esc(hm(it.start_time))}${it.end_time ? `<small>${esc(hm(it.end_time))}</small>` : ''}</time>
    <div class="grow"><b>${esc(itemName(it))}</b><span class="meta"><span class="ty-badge">${ico(TYPE_ICONS[it.type] || 'sun')}${esc(typeLabel(it.type))}</span>${itemCats(it).map(c => ' ' + catChip(c)).join('')}${it.location ? ' ' + esc(it.location) : ''}${staff ? ' · ' + esc(staff) : ''}</span>
    ${it.status === 'cancelled' ? chip(t('cancelled'), 'bad') : ''}${S.mode !== 'guest' && it.booking_required && left != null ? chip(left ? t('places_left', { n: left }) : t('full'), left ? '' : 'bad') : ''}
    ${S.mode === 'guest' && it.booking_required && left && !myBooking(it) ? `<small class="muted">${esc(t('places_left', { n: left }))}</small>` : ''}${S.mode === 'guest' && isFav(it) ? `<span class="fav on" aria-label="${esc(t('favourite_remove'))}">${ico('heart', 'fill')}</span>` : ''}</div>${pill}</a>`;
}
const visibleTypes = () => TYPES.filter(ty => can('m_program') || can('see_' + ty));
// the Programme page's views: by date, the whole week (Week overview), the weekly items, the categories
const progTabs = cur => (can('m_program') ? tabs('programme', [['day', t('by_date')], ['overview', t('week_overview')], ['weekly', t('weekly_programme')], ['cats', t('categories')]], cur) : '');
/* ---------- THE programme editor: one form for every page (Add, Edit, Week overview, Weekly programme, item page).
   A programme item is ONE DATE (a dated record) or a SERIES – Every week / Selected days, from a start date, to an end date or
   open – whose dates the database makes in the same table. A date of a series is changed for THIS DATE ONLY (its own
   exception), for THIS DATE AND FUTURE DATES (the series is split there) or for the ENTIRE SERIES; dates that already happened
   stay as they were. ---------- */
const PROG_COLS = ['type', 'name', 'categories', 'description', 'image_url', 'start_time', 'end_time', 'location', 'booking_required', 'capacity',
  'staff_needed', 'assign_roles', 'gender_rule', 'required_skill_id', 'team_id', 'highlight', 'ticketed', 'guest_visible', 'name_i18n', 'desc_i18n'];
// kind: 'new' (choose the schedule) · 'date' (a one-date item: it may become a series) · 'occ' (a date of a series) · 'series' (the series)
function progFields(kind) {
  const sched = kind === 'new' || kind === 'date' ? [['date', t('sch_date')], ['week', t('sch_week')], ['days', t('sch_days')]] : kind === 'series' ? [['week', t('sch_week')], ['days', t('sch_days')]] : null;
  return [{ type: 'section', label: t('sec_what') },
    { k: 'type', type: 'select', label: t('type'), options: TYPES.map(x => [x, typeLabel(x)]) }, { k: 'name', label: t('name'), req: true },
    { k: 'categories', type: 'multi', num: true, label: t('categories'), options: (S.categories || []).filter(c => c.active !== false).map(c => [c.id, catName(c)]), hint: t('categories_hint') },
    { k: 'description', type: 'textarea', label: t('description'), rows: 3 }, { k: 'image_url', type: 'image', label: t('photo') },
    { type: 'section', label: t('sec_when') },
    sched && { k: 'schedule', type: 'choice', label: t('schedule'), options: sched },
    kind !== 'series' && { k: 'date', type: 'date', label: t('date') },
    sched && { k: 'weekday', type: 'select', label: t('sch_weekday'), num: true, options: [0, 1, 2, 3, 4, 5, 6].map(i => [i, D.wdName(i)]) },
    sched && { k: 'weekdays', type: 'days', label: t('weekdays') },
    sched && { k: 'valid_from', type: 'date', label: t('sch_from') }, sched && { k: 'valid_to', type: 'date', label: t('sch_to'), hint: t('end_date_hint') },
    { k: 'start_time', type: 'time', label: t('start'), req: true }, { k: 'end_time', type: 'time', label: t('end') }, { k: 'location', label: t('location') },
    { type: 'section', label: t('sec_guests') },
    { k: 'guest_visible', type: 'bool', label: t('guest_visible'), hint: t('guest_visible_hint') },
    { k: 'booking_required', type: 'bool', label: t('booking_required'), hint: t('booking_hint') }, { k: 'capacity', type: 'number', label: t('capacity'), min: 0, ph: '0', hint: t('capacity_hint') },
    // the ASSIGNMENT RULE of this item, decided by the manager – never by the programme type
    { type: 'section', label: t('sec_assign'), hint: t('sec_assign_hint') },
    ...asgFields(true),
    { k: 'gender_rule', type: 'select', label: t('gender_rule'), options: ['any', 'male', 'female', 'mixed'].map(g => [g, t('gr_' + g)]) },
    { k: 'required_skill_id', type: 'select', label: t('required_skill'), num: true, options: opts(S.skills, 'id', 'name', t('none')) },
    { k: 'team_id', type: 'select', label: t('team'), num: true, options: teamOpts(t('whole_hotel')) },
    { type: 'section', label: t('sec_extras') },
    { k: 'highlight', type: 'bool', label: t('opt_highlight'), hint: t('opt_highlight_hint') }, { k: 'ticketed', type: 'bool', label: t('opt_ticketed'), hint: t('opt_ticketed_hint') },
    kind === 'series' && { k: 'active', type: 'bool', label: t('active'), hint: t('series_active_hint') },
    (kind === 'date' || kind === 'occ') && { k: 'status', type: 'select', label: t('status'), options: [['scheduled', t('scheduled')], ['cancelled', t('cancelled')]] },
    { k: 'name_i18n', type: 'i18n', label: t('name_translations') }, { k: 'desc_i18n', type: 'i18n', label: t('desc_translations') }].filter(Boolean);
}
// the Schedule choice shows only what it needs: one date, or the weekday(s) with the start and end date
const fieldBox = (root, k) => $(`[name="${k}"], [data-days="${k}"], [data-choice="${k}"]`, root)?.closest('.field');
function progMount(root) {
  const sync = () => {
    const v = $('[data-choice=schedule] input:checked', root)?.value; if (!v) return;
    const show = { date: v === 'date', wk: v === 'wk', weekday: v === 'week', weekdays: v === 'days', valid_from: v === 'week' || v === 'days', valid_to: v === 'week' || v === 'days' };
    Object.entries(show).forEach(([k, on]) => { const b = fieldBox(root, k); if (b) b.hidden = !on; });
  };
  $$('[data-choice=schedule] input', root).forEach(i => i.addEventListener('change', sync)); sync();
  const asg = () => { const req = $('[data-choice=assign] input:checked', root)?.value === 'req'; ['assign_roles', 'staff_needed'].forEach(k => { const b = $(`[data-multi="${k}"], [name="${k}"]`, root)?.closest('.field'); if (b) b.hidden = !req; }); };
  $$('[data-choice=assign] input', root).forEach(i => i.addEventListener('change', asg)); asg();
}
// the rule in words: "Every Monday · from 19 Oct" / "Mon Wed Sat · 1 Oct – 31 Dec"
const ruleText = tp => [(tp.weekdays || []).length === 7 ? t('every_day') : (tp.weekdays || []).length === 1 ? t('rule_every', { day: D.wdName(tp.weekdays[0]) }) : (tp.weekdays || []).map(i => D.wdName(i, 'short')).join(' '),
  tp.valid_from && tp.valid_to ? D.dm(tp.valid_from) + ' – ' + D.dm(tp.valid_to) : tp.valid_from ? t('rule_from', { date: D.dm(tp.valid_from) }) : tp.valid_to ? t('rule_until', { date: D.dm(tp.valid_to) }) : ''].filter(Boolean).join(' · ');
// a value as the form and the database both mean it (times without seconds, empty = none, lists in order)
const normV = v => (v == null || v === '' ? null : Array.isArray(v) ? JSON.stringify(v.map(String).sort()) : typeof v === 'object' ? JSON.stringify(Object.keys(v).sort().map(k => [k, v[k]]).filter(([, x]) => x !== '' && x != null))
  : /^\d\d:\d\d(:\d\d)?$/.test(String(v)) ? String(v).slice(0, 5) : String(v));
const changedOf = (r, base, cols) => Object.fromEntries(cols.filter(k => k in r && normV(r[k]) !== normV((base || {})[k])).map(k => [k, r[k]]));
const pick = (o, cols) => Object.fromEntries(cols.filter(k => k in o).map(k => [k, o[k]]));
// the form's values for each kind (the form shows what the date / the series shows now)
function progRow(kind, it, tp, preset = {}) {
  const base = kind === 'series' ? tp : kind === 'new' ? { staff_needed: 1, type: 'activity', team_id: S.team?.id, guest_visible: true } : it;
  const asg = { assign: kind === 'new' ? null : +((base || {}).staff_needed ?? 1) > 0 ? 'req' : 'none', staff_needed: Math.max(1, +((base || {}).staff_needed) || 1), assign_roles: (base || {}).assign_roles || [] };
  const d = (it && it.date) || preset.date || D.today(), w = tp?.weekdays || [D.wd(d)];
  return Object.assign({}, base, asg, { schedule: kind === 'series' ? (w.length === 1 ? 'week' : 'days') : 'date', date: d, weekday: w[0], weekdays: w,
    valid_from: kind === 'series' ? tp.valid_from : d, valid_to: kind === 'series' ? tp.valid_to : null }, preset);
}
const seriesRowOf = r => Object.assign(pick(r, PROG_COLS), { weekdays: r.schedule === 'week' ? [+r.weekday] : (r.weekdays || []).map(Number).sort(), valid_from: r.valid_from || null, valid_to: r.valid_to || null }, 'active' in r ? { active: r.active } : {});
function askDate(title, def) {
  const f = [{ k: 'd', type: 'date', label: t('date'), req: true }];
  return new Promise(res => { let done = false;
    modal(title, formHtml(f, { d: def }), { cancel: true, saveLabel: t('next'), mount: root => wireForm(root), onClose: () => { if (!done) res(null); },
      save: root => { const r = readForm(root, f); done = true; res(r.d); } }); });
}
/* the ONE save of a series (new, entire, from a date / this date and future, a one-date item repeated): what it would break for
   people already planned in the coming two weeks is shown first, the manager decides */
async function seriesSave(row, from, itemId) {
  const pv = await api('program_change_preview', { p_kind: 'series', p_args: { row, from, item: itemId } });
  let take = false;
  const eff = pv.effect || {}, effBig = (eff.removed || []).some(x => x.staff || x.booked) || (eff.cancelled || []).length;
  if (pv.issues.length || pv.duplicates.length || effBig) { const ch = await changeAsk({ issues: pv.issues, dups: pv.duplicates, effect: eff, dated: true }); if (!ch) return false; take = ch === 'remove'; }
  // nothing keeps the old version unnoticed: dates of the series with their own name / time / place, one-date items and other
  // series with the old name are shown – the manager chooses which follow the change (saved in the same save)
  const w = pv.with, withSel = w && ((w.dates || []).length || (w.namesakes || []).length || (w.series || []).length) ? await withAsk(w, row) : null;
  if (withSel === false) return false;
  const j = await api('program_template_save', { p_row: row, p_from: from, p_item: itemId, p_with: withSel });
  if (take) await unassignIssues(pv.issues);
  return j.row;
}
function withAsk(w, row) {
  const own = x => Object.entries(x.own || {}).map(([k, v]) => t('with_own_' + k, { v: k === 'type' ? typeLabel(v) : v })).join(' · ');
  const box = (k, x, on, label) => `<label class="li row with-row"><input type="checkbox" data-with="${k}" value="${x.id}" ${on ? 'checked' : ''}><span>${label}</span></label>`;
  const sec = (k, title, hint, rows) => rows.length ? `<section class="with-sec" data-sec="${k}"><h3>${esc(title)}</h3><p class="muted small">${esc(hint)}</p><div class="list">${rows.join('')}</div></section>` : '';
  const html = `<p class="hint-box">${ico('repeat')}<span>${esc(t('with_intro'))}</span></p>`
    + sec('dates', t('with_dates'), t('with_dates_hint'), (w.dates || []).map(x => box('dates', x, x.suggest, `<b>${esc(D.short(x.date))} ${esc(x.start_time)}</b> ${esc(tx(x.name_i18n, x.name))} <small class="muted">${esc(own(x))}</small>`)))
    + sec('namesakes', t('with_namesakes'), t('with_namesakes_hint', { name: row.name || '' }), (w.namesakes || []).map(x => box('namesakes', x, true, `<b>${esc(D.short(x.date))} ${esc(x.start_time)}</b> ${esc(x.name)}`)))
    + sec('series', t('with_series'), t('with_series_hint', { name: row.name || '' }), (w.series || []).map(x => box('series', x, true, `<b>${esc(x.name)}</b> <small class="muted">${esc(ruleText({ weekdays: x.weekdays, valid_from: x.from, valid_to: x.to }))}</small>`)));
  return new Promise(res => { let done = false;
    modal(t('with_title'), html, { wide: true, cancel: true, saveLabel: t('save'), noFocus: true, onClose: () => { if (!done) res(false); },
      save: root => { done = true; const ids = k => $$(`[data-with=${k}]:checked`, root).map(i => +i.value); res({ dates: ids('dates'), namesakes: ids('namesakes'), series: ids('series') }); } }); });
}
// which dates of a series a change (or a delete) is for
const scopeAsk = (title, hint, ask) => choiceBox(title, (ask ? `<p><b>${esc(ask)}</b></p>` : '') + `<p class="muted">${esc(hint)}</p>`, [{ k: 'one', label: t('scope_one') }, { k: 'future', label: t('scope_future') }, { k: 'series', label: t('scope_series') }]);
/* save the editor: one date, a new series, a one-date item made recurring, the series itself, or a date of a series (which dates?) */
async function progSave(kind, r, it, tp, o = {}) {
  asgOf(r, kind === 'series' ? tp : kind === 'new' ? null : it);
  const st = r.start_time ?? it?.start_time, en = 'end_time' in r ? r.end_time : it?.end_time;
  if (st && en && hm(st) === hm(en)) throw new ApiError('time_same');
  const recurring = kind === 'series' || ((kind === 'new' || kind === 'date') && r.schedule && r.schedule !== 'date');
  if (recurring) {
    const row = seriesRowOf(r);
    if (!row.weekdays.length) throw new ApiError('required', { field: t('weekdays') });
    if (!row.valid_from) throw new ApiError('required', { field: t('sch_from') });                  // a series always starts on a date
    if (row.valid_from && row.valid_to && row.valid_to < row.valid_from) throw new ApiError('dates');
    if (kind !== 'series') return seriesSave(row, null, kind === 'date' ? it.id : null);         // a new series / this date repeats from now on
    const ch = changedOf(row, tp, PROG_COLS.concat(['weekdays', 'valid_from', 'valid_to', 'active'])); if (!Object.keys(ch).length) return true;
    const sc = await choiceBox(t('scope_title'), `<p class="muted">${esc(t('scope_series_hint'))}</p>`, [{ k: 'from', label: t('scope_from_date') }, { k: 'series', label: t('scope_series') }]);
    if (!sc) return false;
    const from = sc === 'from' ? await askDate(t('scope_from_date'), D.today()) : null; if (sc === 'from' && !from) return false;
    return seriesSave(Object.assign({ id: tp.id }, ch), from, null);
  }
  const row = Object.assign(pick(r, PROG_COLS), 'date' in r ? { date: r.date } : {}, 'status' in r ? { status: r.status } : {});
  if (!row.date && kind !== 'occ' && kind !== 'date') throw new ApiError('required', { field: t('date') });
  if (kind === 'new') return itemSave(row, null);
  const ch = changedOf(row, it, PROG_COLS.concat(['date', 'status'])); if (!Object.keys(ch).length) return true;
  if (kind === 'date') return itemSave(Object.assign({ id: it.id }, ch), it);
  // a date of a series: only its own status (cancel / restore) is always this date; anything else – which dates?
  const part = pick(ch, PROG_COLS), moved = 'date' in ch;
  if (!Object.keys(part).length && !moved) return itemSave(Object.assign({ id: it.id }, ch), it);
  const sc = await scopeAsk(o.title || t('scope_title'), t('scope_hint'), o.ask || itemName(it) + ' · ' + D.long(it.date)); if (!sc) return false;
  if (sc === 'one') return itemSave(Object.assign({ id: it.id }, ch), it);
  const slot = it.slot_date || it.date, row2 = Object.assign({ id: tp.id }, part);
  if (moved) row2.weekdays = uniq((tp.weekdays || []).filter(w => w !== D.wd(slot)).concat(D.wd(ch.date))).sort();   // the series moves to that weekday
  const from = sc === 'future' ? slot : null, res = await seriesSave(row2, from, null); if (res === false) return false;
  // the date the change was made on shows it even when it is its own exception or a date that already happened
  if (!moved && Object.keys(part).length && (it.customized || slot < (from || D.today()))) await save('program_items', Object.assign({ id: it.id }, part));
  return res;
}
/* open the editor */
async function progEdit(kind, it, tp, preset) {
  if ((kind === 'date' || kind === 'occ') && !it) return editForm('', [], undefined, null);          // deleted meanwhile (another phone)
  if (kind === 'series' && !tp) return editForm('', [], undefined, null);
  const head = kind === 'occ' ? `<p class="hint-box">${ico('repeat')}<span>${esc(t('series_of', { rule: ruleText(tp) }))}${it.slot_date ? ' · ' + esc(t('moved_from', { d: D.short(it.slot_date) })) : ''}${it.customized ? ' · ' + esc(t('own_changes')) : ''}
      <button type="button" class="btn ghost small" data-act="pt_edit" data-id="${tp.id}">${esc(t('edit_series'))}</button></span></p>` : '';
  const title = kind === 'new' ? t('add_prog') : kind === 'series' ? t('edit_series') + ' · ' + tp.name : t('edit') + ' · ' + itemName(it);
  return editForm(title, progFields(kind), progRow(kind, it, tp, preset), async r => { const res = await progSave(kind, r, it, tp); if (res === false) return false; route(); },
    Object.assign(progDangerOpts(kind, it, tp), { mount: root => { progMount(root); if (head) $('.form', root).insertAdjacentHTML('afterbegin', head); } }));
}
/* delete: one date (a weekly date stays as a cancelled marker), or which dates of a series */
function progDangerOpts(kind, it, tp) {
  if (kind === 'new') return {};
  if (kind === 'date') return { danger: async () => { const j = await del('program_items', it.id); toast(j.archived ? t('deleted_date_cancelled') : t('deleted')); route(); } };
  if (kind === 'series') return { dangerNoAsk: true, dangerLabel: t('delete_series'), danger: async () => {
    const sc = await choiceBox(t('del_scope_title'), `<p class="muted">${esc(t('del_series_hint'))}</p>`, [{ k: 'from', label: t('scope_from_date') }, { k: 'series', label: t('scope_series'), cls: 'solid-danger' }]); if (!sc) return false;
    const from = sc === 'from' ? await askDate(t('scope_from_date'), D.today()) : null; if (sc === 'from' && !from) return false;
    await seriesDelete(tp.id, from); } };
  return { dangerNoAsk: true, danger: async () => {
    const sc = await scopeAsk(t('del_scope_title'), t('del_series_hint'), itemName(it) + ' · ' + D.long(it.date)); if (!sc) return false;
    if (sc === 'one') { const j = await del('program_items', it.id); toast(j.archived ? t('deleted_date_cancelled') : t('deleted')); route(); return; }
    await seriesDelete(tp.id, sc === 'future' ? (it.slot_date || it.date) : null); } };
}
async function seriesDelete(id, from) {
  const j = await api('program_template_delete', { p_id: id, p_from: from });
  toast(j.cancelled ? t('series_deleted_cancelled', { n: j.cancelled }) : t('deleted'), j.cancelled ? 'warn' : 'ok'); closeModals(); route();
}
ACT.pi_new = el => progEdit('new', null, null, Object.assign({}, el?.dataset?.date ? { date: el.dataset.date } : {}, el?.dataset?.time ? { start_time: el.dataset.time } : {}, el?.dataset?.sched ? { schedule: el.dataset.sched } : {}));
ACT.pi_edit = async el => {
  closeModals();
  const it = (await list('program_items', { id: +el.dataset.id }))[0];
  const tp = it?.template_id ? (await list('program_templates', { id: it.template_id }))[0] : null;
  return progEdit(tp ? 'occ' : 'date', it, tp);
};
ACT.pt_new = () => progEdit('new', null, null, { schedule: 'week', valid_from: D.today() });
ACT.pt_edit = async el => { closeModals(); progEdit('series', null, (await list('program_templates', { id: +el.dataset.id }))[0]); };
/* the ONE save of a programme item (Add, Edit, the Week overview's quick edit and moves): the database first says what the change
   would break for people already planned (time conflict, day off, entrance duty, skill …) and whether the same activity is already
   there at that time; nothing is saved silently over a problem – the manager decides. Answers the saved row, or false. */
async function itemSave(r, old, o = {}) {
  const st = r.start_time ?? old?.start_time, en = r.end_time !== undefined ? r.end_time : old?.end_time;
  if (st && en && hm(st) === hm(en)) throw new ApiError('time_same');
  const pv = await api('program_change_preview', { p_kind: 'item', p_args: r });
  let take = [];
  if (pv.issues.length || pv.duplicates.length || o.ask) {
    const ch = await changeAsk({ title: o.title, ask: o.ask, issues: pv.issues, dups: pv.duplicates, okLabel: o.okLabel, own: r.id });
    if (!ch) return false;
    if (ch === 'remove') take = pv.issues.filter(x => x.i === r.id);
  }
  const row = await save('program_items', r);
  if (take.length) await unassignIssues(take);
  return row;
}
/* ---------- Week overview: the whole week of the ONE programme on one page (Programme → Week overview).
   Only another view and editor of the same records: the dated programme items, the hotel's day information, the team's dress
   code / notes and each person's day (day off, entrance duty). Every change goes through the same saves as everywhere else, so
   the Programme, the guests' programme, the staff app, the Day plan, the Planner and the Dashboard show it at once. ---------- */
const OPS = ['morning', 'afternoon', 'evening'];
const opBounds = () => [mins(hm(S.settings.op_afternoon || '13:00')), mins(hm(S.settings.op_evening || '18:00'))];
// the part of the day an item starts in, by the hotel's own times (the planner's rule)
const opOf = time => { const m = mins(hm(time)), [a, e] = opBounds(); return m < a ? 'morning' : m < e ? 'afternoon' : 'evening'; };
const hmOf = m => String(Math.floor(((m % 1440) + 1440) % 1440 / 60)).padStart(2, '0') + ':' + String(((m % 60) + 60) % 60).padStart(2, '0');
// the time a new item of a part of the day starts with (the manager changes it in the form)
const opStart = op => { const [a, e] = opBounds(); return op === 'morning' ? hmOf(Math.min(600, a - 60)) : hmOf(op === 'afternoon' ? a : e); };
/* copy on purpose – an item, a day or a week, also from days that already happened – to a date (today, tomorrow, any date) or
   to a weekly series (every week / selected days, from a start date). The database answers first what would be created (never a
   duplicate, never over the weekly programme) and what the destination already has; the manager ticks, keeps the destination's
   items and adds, or replaces chosen parts of the day, and confirms. Staff are not copied (the planner plans the new dates). */
async function progCopy(rows, title) {
  // the preview is asked again whenever "replace" changes: what is taken off is no longer "already there"
  const ask = rep => api('program_copy', { p_rows: rows, p_preview: true, p_replace: rep });
  let pv = await ask(null), rep = null, seq = 0;
  const when = x => x.date ? D.short(x.date) : ruleText({ weekdays: x.weekdays || [], valid_from: x.valid_from, valid_to: x.valid_to });
  const nNew = () => pv.rows.filter(x => x.state === 'new').length;
  const rowHtml = (x, k) => `<label class="li row ${x.state === 'new' ? '' : 'dim'}"><input type="checkbox" data-k="${k}" ${x.state === 'new' ? 'checked' : 'disabled'}>
      <span class="grow"><b>${esc(when(x))} ${esc(x.start_time || '')}</b> ${esc(tx(x.name_i18n, x.name))} <span class="muted small">${esc(x.type ? typeLabel(x.type) : '')}${x.location ? ' · ' + esc(x.location) : ''}</span></span>${x.state === 'new' ? chip(t(x.date ? 'will_create' : 'will_create_series'), 'ok') : chip(t('cp_' + x.state))}</label>`;
  const GROUPS = [['cp_g_new', x => x.state === 'new'], ['cp_g_dup', x => x.state === 'weekly' || x.state === 'exists'], ['cp_g_no', x => !['new', 'weekly', 'exists'].includes(x.state)]];
  const rowsHtml = () => GROUPS.map(([key, f]) => { const rs = pv.rows.map((x, k) => [x, k]).filter(([x]) => f(x));
    return rs.length ? `<h4 class="cp-g">${esc(t(key, { n: rs.length }))}</h4>` + rs.map(([x, k]) => rowHtml(x, k)).join('') : ''; }).join('');
  const exHtml = () => (pv.existing || []).map(e => `<li>${esc(D.short(e.date))} ${esc(e.start_time)} ${esc(tx(e.name_i18n, e.name))}${e.weekly ? ' ' + chip(t('from_weekly')) : ''}${e.kept ? ' ' + chip(t('cp_exists')) : ''}${e.remove ? ' ' + chip(t('will_remove'), 'bad') : ''}</li>`).join('');
  const ex = pv.existing || [];
  const dest = ex.length ? `<div class="hint-box warn cp-dest">${ico('flag')}<div><p>${esc(t('dest_has', { n: ex.length }))}</p>
      <div class="chips" data-cmode><label class="pickchip"><input type="radio" name="cmode" value="keep" checked> ${esc(t('keep_add'))}</label><label class="pickchip"><input type="radio" name="cmode" value="replace"> ${esc(t('replace_parts'))}</label></div>
      <div class="chips" data-parts hidden>${OPS.map(op => `<label class="pickchip"><input type="checkbox" value="${op}" checked> ${esc(t('part_' + op))}</label>`).join('')}</div>
      <ul class="chg-list cp-existing">${exHtml()}</ul></div></div>` : '';
  modal(title, `<p class="muted small">${esc(t('copy_intro'))}</p>${dest}<div class="list pick cp-rows">${rowsHtml()}</div>`, {
    cancel: true, saveLabel: t('create_n', { n: nNew() }),
    mount: root => {
      const wrap = root.closest('.modal-wrap') || root;
      const upd = async () => {
        const on = $('input[name=cmode]:checked', root)?.value === 'replace', parts = on ? $$('[data-parts] input:checked', root).map(i => i.value) : [], pp = $('[data-parts]', root);
        if (pp) pp.hidden = !on;
        const r2 = parts.length ? uniq(rows.filter(x => x.date).map(x => x.date)).map(d => ({ date: d, parts })) : null, my = ++seq;
        const p2 = await ask(r2); if (my !== seq) return;
        pv = p2; rep = r2;
        $('.cp-rows', root).innerHTML = rowsHtml(); const ul = $('.cp-existing', root); if (ul) ul.innerHTML = exHtml();
        const sb = $('[data-save]', wrap); if (sb) sb.textContent = t('create_n', { n: nNew() });
      };
      $$('[data-cmode] input, [data-parts] input', root).forEach(i => i.addEventListener('change', () => upd().catch(fail)));
    },
    save: async root => {
      const sel = new Set($$('input[data-k]:checked', root).map(i => +i.dataset.k));
      if (!pv.rows.some((x, k) => x.state === 'new' && sel.has(k))) { toast(t('copy_none_new'), 'warn'); return false; }
      // the chosen new copies + what is already there (a copy that brings an item itself never takes it off)
      const send = rows.filter((x, k) => pv.rows[k].state !== 'new' || sel.has(k));
      const j = await api('program_copy', { p_rows: send, p_preview: false, p_replace: rep });
      toast(t('copied_n', { n: j.created }), j.created ? 'ok' : 'warn'); route();
    }
  });
}
// the destination of a copy: one date (today / tomorrow / any date) or a weekly series (every week / selected days, from a start date)
const copyFields = (time, week) => [{ k: 'schedule', type: 'choice', label: t('copy_to'), options: [['date', t('sch_date')]].concat(week ? [['wk', t('sch_wk')]] : [], [['week', t('sch_week')], ['days', t('sch_days')]]) },
  { k: 'date', type: 'date', label: t('date') }, week && { k: 'wk', type: 'date', label: t('week_of'), hint: t('week_of_hint') }, { k: 'weekday', type: 'select', label: t('sch_weekday'), num: true, options: [0, 1, 2, 3, 4, 5, 6].map(i => [i, D.wdName(i)]) },
  { k: 'weekdays', type: 'days', label: t('weekdays') }, { k: 'valid_from', type: 'date', label: t('sch_from') }, { k: 'valid_to', type: 'date', label: t('sch_to'), hint: t('end_date_hint') },
  time && { k: 'start_time', type: 'time', label: t('start'), req: true }].filter(Boolean);
const copyQuick = `<p class="row cp-quick"><button type="button" class="btn ghost small" data-qd="0">${esc(t('today'))}</button><button type="button" class="btn ghost small" data-qd="1">${esc(t('tomorrow'))}</button></p>`;
const copyMount = root => { progMount(root); $$('[data-qd]', root).forEach(b => { b.onclick = () => { root.querySelector('[name=date]').value = D.add(D.today(), +b.dataset.qd); const r = root.querySelector('[name=schedule][value=date]'); r.checked = true; r.dispatchEvent(new Event('change')); }; }); };
// one copy row per item, as the destination says
function copyRows(items, r) {
  // to a week: each item on its own weekday of that week
  if (r.schedule === 'wk') { if (!r.wk) throw new ApiError('required', { field: t('week_of') }); const m = monday(r.wk); return items.map(i => Object.assign({ id: i.id, date: D.add(m, D.wd(i.date)) })); }
  if (r.schedule === 'date') { if (!r.date) throw new ApiError('required', { field: t('date') }); return items.map(i => Object.assign({ id: i.id, date: r.date }, r.start_time ? { start_time: hm(r.start_time) } : {})); }
  const wd = r.schedule === 'week' ? [+r.weekday] : (r.weekdays || []).map(Number);
  if (!wd.length) throw new ApiError('required', { field: t('weekdays') });
  if (r.valid_to && r.valid_from && r.valid_to < r.valid_from) throw new ApiError('dates');
  return items.map(i => Object.assign({ id: i.id, weekdays: wd, valid_from: r.valid_from || D.today(), valid_to: r.valid_to || null }, r.start_time ? { start_time: hm(r.start_time) } : {}));
}
const copyDefault = d => ({ schedule: 'date', date: d < D.today() ? D.today() : D.add(d, 7), weekday: D.wd(d), weekdays: [D.wd(d)], valid_from: D.today() });
/* ---------- the ONE weekly programme on paper (Week overview and Programme → Print): seven day columns, the parts of the day
   across the week, each item with its time, name, place and type in the type's colour. A real PDF (A4 landscape) from the one PDF
   engine; nothing of the screen (buttons, filters) is printed. ---------- */
function weekPdfAsk(from, o) {
  const f = [{ k: 'dayInfo', type: 'bool', label: t('print_day_info'), def: true }, { k: 'staff', type: 'bool', label: t('print_staff') }];
  formBox(t('print_pdf') + ' · ' + D.dm(from) + ' – ' + D.dm(D.add(from, 6)), f, { dayInfo: true, staff: false },
    r => { setTimeout(() => weekPdf(from, Object.assign({}, o, r)).catch(fail), 30); },
    { saveLabel: t('make_pdf'), after: o.types || o.ops ? `<p class="muted small">${esc(t('print_filters', { what: [(o.types || []).map(typeLabel).join(', '), (o.ops || []).map(x => t('part_' + x)).join(', ')].filter(Boolean).join(' · ') }))}</p>` : '' });
}
async function weekPdf(from, o = {}) {
  const to = D.add(from, 6), b = await board(from, to), types = visibleTypes(), days = D.range(from, 7), rtl = isRtl();
  const its = b.items.filter(i => i.status === 'scheduled' && types.includes(i.type) && (!o.types || o.types.includes(i.type)));
  const ops = OPS.filter(op => (!o.ops || o.ops.includes(op)) && its.some(i => opOf(i.start_time) === op));      // an empty part of the day is left out
  // the ONE document head and foot (Settings → Documents); the week always lies (seven columns)
  const [W, H] = docPaper(true, 'landscape'), M = 8, G = 1.6, CW = (W - 2 * M - 6 * G) / 7, BOTTOM = H - DOC_FOOT - 1;
  const HEAD = await docHead(W, M, t('programme'), D.span(from, to), { compact: true });
  const css = getComputedStyle(document.documentElement), color = ty => (css.getPropertyValue('--t-' + ty).trim() || '#777777');
  const cx = i => (rtl ? W - M - (i + 1) * CW - i * G : M + i * (CW + G));                         // column i (right-to-left: mirrored)
  const T = docT(rtl, W, false);                                                   // ONE text; the columns are placed (mirrored) here
  const tx0 = (i, pad) => (rtl ? cx(i) + CW - pad : cx(i) + pad);                                   // where a line of column i starts
  const who = sid => staffTag(b, sid);
  // one item → its lines at scale k
  const cardOf = (it, k) => {
    const w = CW - 2 * 1.3 * k - 1, L = [];
    L.push({ s: hm(it.start_time) + (it.end_time ? '–' + hm(it.end_time) : ''), z: 2.3 * k, bold: true });
    wrapText(itemName(it), 2.55 * k, w, true).slice(0, 3).forEach(s => L.push({ s, z: 2.55 * k, bold: true }));
    if (it.location) wrapText(it.location, 2.05 * k, w).slice(0, 2).forEach(s => L.push({ s, z: 2.05 * k, fill: '#555' }));
    L.push({ s: typeLabel(it.type).toUpperCase(), z: 1.75 * k, bold: true, fill: color(it.type), ls: 0.15 });
    if (o.staff && it.staff.length) wrapText(it.staff.map(s => who(s.staff_id) || s.name).join(' '), 1.9 * k, w).slice(0, 2).forEach(s => L.push({ s, z: 1.9 * k, fill: '#555' }));
    return { it, L, h: L.reduce((a, l) => a + l.z * 1.28, 0) + 2 * 1.1 * k };
  };
  const headOf = (d, k) => {
    const di = dayOf(b.days, d), w = CW - 2, L = [{ s: D.fmt(d, { weekday: 'long' }).toUpperCase(), z: 2.7 * k, bold: true, ls: 0.25 }, { s: D.fmt(d, { day: 'numeric', month: 'long' }), z: 2.3 * k, fill: '#555' }];
    if (o.dayInfo) {
      if (dayName(di)) wrapText(dayName(di), 2.6 * k, w, false, true).slice(0, 2).forEach(s => L.push({ s, z: 2.6 * k, serif: true, italic: true }));
      if (restName(di)) wrapText(t('restaurant_theme') + ': ' + restName(di), 1.95 * k, w).slice(0, 2).forEach(s => L.push({ s, z: 1.95 * k, fill: '#555' }));
    }
    return { L, h: L.reduce((a, l) => a + l.z * 1.3, 0) + 3 * k };
  };
  const byDayOp = (k, op) => days.map(d => its.filter(i => i.date === d && opOf(i.start_time) === op).map(i => cardOf(i, k)));
  const GAP = k => 1.2 * k, LABEL = k => 4.6 * k;
  const total = k => { const hh = Math.max(...days.map(d => headOf(d, k).h)); return HEAD.h + 2 + hh + ops.reduce((a, op) => a + LABEL(k) + 3.5 + Math.max(4, ...byDayOp(k, op).map(cs => cs.reduce((x, c) => x + c.h + GAP(k), 0))), 0); };
  const k = [1.3, 1.15, 1, 0.92, 0.85, 0.78, 0.72, 0.66].find(z => total(z) <= BOTTOM - M) || 0.66;      // the largest size that fits one page
  const pages = []; let cur, y;
  const head = days.map(d => headOf(d, k)), HH = Math.max(...head.map(h => h.h));
  const lines = (L, i, y0, pad) => { let yy = y0; return L.map(l => { yy += l.z * 1.28; return T(tx0(i, pad), yy - l.z * 0.25, l.s, l.z, l); }).join(''); };
  const newPage = () => {
    cur = []; cur.cards = 0; pages.push(cur); y = M;
    cur.push(HEAD.svg); y += HEAD.h;
    days.forEach((d, i) => { cur.push(`<rect x="${cx(i).toFixed(2)}" y="${y.toFixed(2)}" width="${CW.toFixed(2)}" height="${HH.toFixed(2)}" rx="1.2" fill="#F1ECE4"/>`); cur.push(lines(head[i].L, i, y + 1, 1)); });
    y += HH + 2;
  };
  newPage();
  for (const op of ops) {
    let queue = byDayOp(k, op), first = true;
    for (;;) {
      // the part's name and at least its first item together; a part that does not fit goes on on the next page ("continued")
      const first1 = Math.min(...queue.filter(cs => cs.length).map(cs => cs[0].h));
      if (cur.cards && y + LABEL(k) + 1.5 + first1 > BOTTOM) newPage();
      cur.push(`<rect x="${M}" y="${y.toFixed(2)}" width="${(W - 2 * M).toFixed(2)}" height="${LABEL(k).toFixed(2)}" fill="#2A2A2A"/>`);
      cur.push(T(rtl ? W - M - 2 : M + 2, y + LABEL(k) * 0.7, t('part_' + op).toUpperCase() + (first ? '' : ' · ' + t('continued')), 2.5 * k, { bold: true, fill: '#FFFFFF', ls: 0.4 }));
      y += LABEL(k) + 1.5;
      const room = BOTTOM - y; let take = queue.map(cs => { let s = 0, n = 0; while (n < cs.length && s + cs[n].h <= room) { s += cs[n].h + GAP(k); n++; } return n; });
      if (take.every(n => !n)) take = queue.map(cs => (cs.length ? 1 : 0));         // (an item taller than a page: drawn anyway)
      let band = 0;
      queue.forEach((cs, i) => { let yy = y; cs.slice(0, take[i]).forEach(c => {
        cur.push(`<rect x="${cx(i).toFixed(2)}" y="${yy.toFixed(2)}" width="${CW.toFixed(2)}" height="${c.h.toFixed(2)}" rx="1" fill="#FFFFFF" stroke="#DDD6CA" stroke-width="0.2"/>`
          + `<rect x="${(rtl ? cx(i) + CW - 0.9 : cx(i)).toFixed(2)}" y="${yy.toFixed(2)}" width="0.9" height="${c.h.toFixed(2)}" fill="${color(c.it.type)}"/>`);
        cur.push(lines(c.L, i, yy + 1.1 * k, 2)); cur.cards++; yy += c.h + GAP(k); }); band = Math.max(band, yy - y); });
      queue.forEach((cs, i) => { if (!take[i] && !cs.length) cur.push(T(tx0(i, 2), y + 3, '—', 2.4 * k, { fill: '#999' })); });
      y += Math.max(band, 4) + 2;
      queue = queue.map((cs, i) => cs.slice(take[i]));
      if (queue.every(cs => !cs.length)) break;
      newPage(); first = false;
    }
  }
  if (!ops.length) cur.push(T(rtl ? W - M : M, y + 6, t('no_items_week'), 3.2, { fill: '#666' }));
  const n = pages.length;
  const svgs = pages.map((p, i) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}mm" height="${H}mm"><rect width="${W}" height="${H}" fill="#fff"/>${p.join('')}${docFoot(W, H, M, i, n)}</svg>`);
  return makePdf(svgs, W, H, t('programme') + ' ' + D.dm(from) + ' - ' + D.dm(to));
}

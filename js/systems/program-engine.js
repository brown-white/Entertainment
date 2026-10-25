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
/* ---------- the ONE weekly programme on paper (Programme → Print, Week overview → Print → the Export screen). It reads the ONE
   programme when it is made – the same resolved dates as the Week overview, the guests' programme and the Smart Planner (day_board),
   the hotel's day information (theme, restaurant theme), the team's day (dress code, days off, entrance) – and draws it in a DESIGN:
   only how it looks (colours, the day pictures, section styles, watermark, which information shows), saved per hotel
   (export_designs) and never mixed with programme data. A real PDF from the one PDF engine (A4 landscape: seven day columns). ---------- */
const PX_PARTS = ['morning', 'afternoon', 'evening'];
const PX_DAYS = [0, 1, 2, 3, 4, 5, 6];
// every setting of a design and its value when a design does not say (the "Brown & White Luxury" look)
const PX_DEFAULT = Object.assign({
  title: '', subtitle: '', logo: true, ent_logo: '', font: 'serif',
  c_head: '#3B2A1E', c_accent: '#B8862B', c_text: '#2A1D14', c_bg: '#FBF7F0', c_day: '#FFFFFF', c_card: '#FFFFFF',
  ty_activity: '#52725B', ty_event: '#B48746', ty_show: '#8E3B5B', ty_live_music: '#3B6FB6', ty_special_event: '#8B6FB6',
  s_morning_bg: '#EADFCB', s_morning_bg2: '', s_morning_fg: '#3B2A1E',
  s_afternoon_bg: '#D8C09A', s_afternoon_bg2: '', s_afternoon_fg: '#3B2A1E',
  s_evening_bg: '#3B2A1E', s_evening_bg2: '', s_evening_fg: '#F5EBD7',
  s_body: '', split: 'diag', card: 'stripe', empty: 'dash',
  show_day: true, show_date: true, show_theme: true, show_restaurant: true, show_dress: false, show_dayoff: false, show_entrance: false,
  show_time: true, show_name: true, show_location: true, show_type: true, show_desc: false, show_staff: false, show_legend: true, show_footer: true,
  wm_on: false, wm_text: '', wm_size: 22, wm_opacity: 7, wm_pos: 'diagonal', wm_rotate: -30
}, ...PX_DAYS.map(w => ({ ['d' + w + '_img']: '', ['d' + w + '_x']: 50, ['d' + w + '_y']: 50, ['d' + w + '_zoom']: 1, ['d' + w + '_ev_bg']: '', ['d' + w + '_ev_bg2']: '', ['d' + w + '_ev_fg']: '' })));
// the factory designs: starting points the manager changes and saves as the hotel's own (never programme data)
const PX_PRESETS = {
  luxury: {},
  christmas: { c_head: '#7A1F1F', c_accent: '#B8913A', c_text: '#2B1A14', c_bg: '#FFFDF8', s_morning_bg: '#E3EDE3', s_morning_fg: '#1F4D2E', s_afternoon_bg: '#F2D9D5', s_afternoon_fg: '#7A1F1F',
    s_evening_bg: '#7A1F1F', s_evening_bg2: '#1F4D2E', s_evening_fg: '#FFFFFF', split: 'diag' },
  newyear: { c_head: '#0E1A33', c_accent: '#C9A24A', c_text: '#141A26', c_bg: '#F8F6F1', s_morning_bg: '#E6E9F0', s_morning_fg: '#0E1A33', s_afternoon_bg: '#EFE3C4', s_afternoon_fg: '#0E1A33',
    s_evening_bg: '#0E1A33', s_evening_bg2: '#C9A24A', s_evening_fg: '#FFFFFF', split: 'band' },
  halloween: { c_head: '#2B1B33', c_accent: '#E07A1F', c_text: '#231A26', c_bg: '#FFF8F0', s_morning_bg: '#F7E3CF', s_morning_fg: '#2B1B33', s_afternoon_bg: '#E9D6F0', s_afternoon_fg: '#2B1B33',
    s_evening_bg: '#1A1A1A', s_evening_bg2: '#E07A1F', s_evening_fg: '#FFFFFF', split: 'diag' },
  summer: { c_head: '#0B5C73', c_accent: '#F2A93B', c_text: '#173540', c_bg: '#FFFDF7', s_morning_bg: '#DDF2F6', s_morning_fg: '#0B5C73', s_afternoon_bg: '#FCE7C4', s_afternoon_fg: '#7A4A0B',
    s_evening_bg: '#0B5C73', s_evening_bg2: '#F2A93B', s_evening_fg: '#FFFFFF', split: 'band', font: 'sans' },
  minimal: { c_head: '#1F1F1F', c_accent: '#1F1F1F', c_text: '#1F1F1F', c_bg: '#FFFFFF', c_day: '#FFFFFF', s_morning_bg: '#F0F0F0', s_morning_fg: '#1F1F1F', s_afternoon_bg: '#E2E2E2', s_afternoon_fg: '#1F1F1F',
    s_evening_bg: '#1F1F1F', s_evening_fg: '#FFFFFF', card: 'outline', font: 'sans', empty: 'none' }
};
// a design as saved (or a factory one) with every setting it does not have from the defaults – old designs keep working
const pxDesign = (raw, preset) => Object.assign({}, PX_DEFAULT, PX_PRESETS[preset] || {}, raw || {});
const pxHex = c => (/^#[0-9a-f]{6}$/i.test(c || '') ? c : null);
const pxMix = (a, b, t) => { const p = x => [1, 3, 5].map(i => parseInt(x.slice(i, i + 2), 16)), A = p(pxHex(a) || '#000000'), B = p(pxHex(b) || '#FFFFFF');
  return '#' + A.map((v, i) => Math.round(v + (B[i] - v) * t).toString(16).padStart(2, '0')).join(''); };
const pxTypeColor = (d, ty) => pxHex(d['ty_' + ty]) || '#777777';
// the colours of a part's title on one day: the day's own (the evening of each day can have its own), else the part's
const pxPartColors = (d, op, w) => { const own = op === 'evening' && pxHex(d['d' + w + '_ev_bg']);
  return own ? { bg: own, bg2: pxHex(d['d' + w + '_ev_bg2']), fg: pxHex(d['d' + w + '_ev_fg']) || pxHex(d['s_evening_fg']) || '#FFFFFF' }
    : { bg: pxHex(d['s_' + op + '_bg']) || '#DDDDDD', bg2: pxHex(d['s_' + op + '_bg2']), fg: pxHex(d['s_' + op + '_fg']) || '#222222' }; };

/* the programme of one week for the document – read now, never kept with a design (o.types / o.ops: only these) */
async function pxLoad(from, o = {}) {
  const f = monday(from), to = D.add(f, 6), b = await board(f, to), types = visibleTypes();
  const items = b.items.filter(i => i.status === 'scheduled' && types.includes(i.type) && (!o.types || o.types.includes(i.type)) && (!o.ops || o.ops.includes(opOf(i.start_time))));
  return { from: f, to, days: D.range(f, 7), b, items };
}
// pictures travel inside the document: each address read once (its data and its size)
const PX_IMG = new Map();
function pxImg(url) {
  if (!url) return Promise.resolve(null);
  if (!PX_IMG.has(url)) PX_IMG.set(url, imgData(url).then(data => !data ? null : new Promise(ok => { const im = new Image(); im.onload = () => ok({ data, w: im.naturalWidth || 1, h: im.naturalHeight || 1 }); im.onerror = () => ok(null); im.src = data; })));
  return PX_IMG.get(url);
}
async function pxImages(d) {
  const out = { days: {} };
  await Promise.all([pxImg(d.logo ? S.hotel?.logo_url : '').then(x => { out.logo = x; }), pxImg(d.ent_logo).then(x => { out.ent = x; }),
    ...PX_DAYS.map(w => pxImg(d['d' + w + '_img']).then(x => { out.days[w] = x; }))]);
  return out;
}
// a picture filling its box: the manager's point of interest (x / y in %) and zoom decide which part shows (never stretched)
function pxCover(img, x, y, w, h, fx, fy, zoom, id, rr) {
  const s = Math.max(w / img.w, h / img.h) * Math.max(1, +zoom || 1), dw = img.w * s, dh = img.h * s;
  const ix = x + (w - dw) * Math.min(100, Math.max(0, +fx)) / 100, iy = y + (h - dh) * Math.min(100, Math.max(0, +fy)) / 100;
  return `<defs><clipPath id="${id}"><rect x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${w.toFixed(2)}" height="${h.toFixed(2)}" rx="${rr}"/></clipPath></defs>`
    + `<image href="${img.data}" x="${ix.toFixed(2)}" y="${iy.toFixed(2)}" width="${dw.toFixed(2)}" height="${dh.toFixed(2)}" preserveAspectRatio="none" clip-path="url(#${id})"/>`;
}
// a title box in one colour or two (diagonal, a stripe at the foot, or two halves)
function pxBox(x, y, w, h, c, split, rr) {
  if (!c.bg2) return `<rect x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${w.toFixed(2)}" height="${h.toFixed(2)}" rx="${rr}" fill="${c.bg}"/>`;
  const id = 'pb' + (++pxSeq);
  const second = split === 'band' ? `<rect x="${x.toFixed(2)}" y="${(y + h * 0.68).toFixed(2)}" width="${w.toFixed(2)}" height="${(h * 0.32).toFixed(2)}" fill="${c.bg2}"/>`
    : split === 'half' ? `<rect x="${(x + w / 2).toFixed(2)}" y="${y.toFixed(2)}" width="${(w / 2).toFixed(2)}" height="${h.toFixed(2)}" fill="${c.bg2}"/>`
      : `<path d="M${(x + w * 0.62).toFixed(2)} ${y.toFixed(2)}H${(x + w).toFixed(2)}V${(y + h).toFixed(2)}H${(x + w * 0.38).toFixed(2)}Z" fill="${c.bg2}"/>`;
  return `<defs><clipPath id="${id}"><rect x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${w.toFixed(2)}" height="${h.toFixed(2)}" rx="${rr}"/></clipPath></defs><g clip-path="url(#${id})"><rect x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${w.toFixed(2)}" height="${h.toFixed(2)}" fill="${c.bg}"/>${second}</g>`;
}
let pxSeq = 0;
// the largest size (≤ z) at which a text keeps to n lines and no word is broken (long names: smaller, never into the next column)
function pxFit(txt, z, w, n, bold, serif, min) {
  const words = String(txt || '').split(/\s+/).filter(Boolean);
  for (let k = z; k >= min - 1e-6; k -= 0.1) { const L = wrapText(txt, k, w, bold, serif); if (L.length <= n && words.every(x => tw(x, k, bold, serif) <= w)) return { z: k, L }; }
  const L = wrapText(txt, min, w, bold, serif);
  if (L.length > n) { L.length = n; let l = L[n - 1] + '…'; while (l.length > 2 && tw(l, min, bold, serif) > w) l = l.slice(0, -2) + '…'; L[n - 1] = l; }
  return { z: min, L };
}

/* THE drawing: the design + the week → the pages (SVG in mm). One page when everything fits at a readable size; otherwise the
   parts of the day go on on the next page ("continued") – nothing is shrunk below its readable size, nothing cut, nothing over another */
async function pxPages(data, d, o = {}) {
  const [W, H] = docPaper(true, 'landscape'), M = 8, G = 2.2, rtl = isRtl(), T = docT(rtl, W, false), img = o.img || await pxImages(d);
  const CW = (W - 2 * M - 6 * G) / 7, BOTTOM = H - (d.show_footer ? DOC_FOOT + 1 : M), meta = docMeta();
  const ink = pxHex(d.c_text) || '#222222', mute = pxMix(ink, pxHex(d.c_card) || '#FFFFFF', 0.38), head = pxHex(d.c_head) || ink, acc = pxHex(d.c_accent) || head;
  const serif = d.font !== 'sans', cx = i => (rtl ? W - M - (i + 1) * CW - i * G : M + i * (CW + G)), tx0 = (i, pad) => (rtl ? cx(i) + CW - pad : cx(i) + pad);
  const { b, items, days } = data, used = TYPES.filter(ty => items.some(i => i.type === ty));
  const parts = PX_PARTS.filter(op => items.some(i => opOf(i.start_time) === op));
  const dateOn = !!d.show_date;
  /* the page head: (logos) the hotel / subtitle, the title, the week, the legend */
  const headSvg = full => {
    const out = [], lz = full ? 17 : 10;
    if (img.logo) out.push(`<image href="${img.logo.data}" x="${(rtl ? W - M - lz : M).toFixed(2)}" y="${M}" width="${lz}" height="${lz}" preserveAspectRatio="xMidYMid meet"/>`);
    if (img.ent) out.push(`<image href="${img.ent.data}" x="${(rtl ? M : W - M - lz).toFixed(2)}" y="${M}" width="${lz}" height="${lz}" preserveAspectRatio="xMidYMid meet"/>`);
    const sub = d.subtitle || [meta.hotel, meta.dept].filter(Boolean).join(' · '), title = d.title || t('programme'), mid = W / 2, tw2 = W - 2 * M - 2 * (lz + 6);
    if (!full) {
      out.push(T(mid, M + 5.4, fitLine([title, sub].filter(Boolean).join(' · '), 4.2, tw2, !serif, serif), 4.2, { serif, bold: !serif, fill: head, anchor: 'middle' }));
      if (dateOn) out.push(T(mid, M + 9.4, D.span(data.from, data.to), 2.5, { fill: mute, anchor: 'middle' }));
      return { svg: out.join(''), h: 13 };
    }
    let y = M + 3.6;
    if (sub) out.push(T(mid, y, fitLine(sub.toUpperCase(), 2.6, tw2, true, false), 2.6, { bold: true, fill: acc, ls: 0.6, anchor: 'middle' }));
    y += 8.8; const tz = Math.min(9.6, 9.6 * tw2 / Math.max(tw2, tw(title, 9.6, !serif, serif)));
    out.push(T(mid, y, title, tz, { serif, bold: !serif, fill: head, anchor: 'middle' }));
    if (dateOn) { y += 4.6; out.push(T(mid, y, D.span(data.from, data.to), 2.7, { fill: mute, anchor: 'middle' })); }
    y += 2.6;
    if (d.show_legend && used.length) {           // the legend: each programme type of this week in its colour
      const lab = used.map(ty => ({ ty, s: typeLabel(ty).toUpperCase(), w: tw(typeLabel(ty).toUpperCase(), 2.2, true) + 0.4 * typeLabel(ty).length + 6 })), total = lab.reduce((a, x) => a + x.w, 0) + (lab.length - 1) * 3;
      let x = rtl ? mid + total / 2 : mid - total / 2; y += 2.6;
      lab.forEach(l => { const x0 = rtl ? x - l.w : x;
        out.push(`<rect x="${x0.toFixed(2)}" y="${(y - 2.9).toFixed(2)}" width="${l.w.toFixed(2)}" height="4.2" rx="2.1" fill="${pxMix(pxTypeColor(d, l.ty), '#FFFFFF', 0.86)}"/><circle cx="${(rtl ? x0 + l.w - 2.4 : x0 + 2.4).toFixed(2)}" cy="${(y - 0.8).toFixed(2)}" r="1.1" fill="${pxTypeColor(d, l.ty)}"/>`);
        out.push(T(rtl ? x0 + l.w - 4.4 : x0 + 4.4, y, l.s, 2.2, { bold: true, fill: pxMix(pxTypeColor(d, l.ty), '#000000', 0.25), ls: 0.4 }));
        x += rtl ? -(l.w + 3) : l.w + 3; });
      y += 2.6;
    }
    out.push(`<rect x="${M}" y="${(y + 0.6).toFixed(2)}" width="${(W - 2 * M).toFixed(2)}" height="0.35" fill="${acc}"/>`);
    return { svg: out.join(''), h: y + 2.4 - M };
  };
  const fitLine = (s, z, w, bold, ser) => { let l = String(s); while (l.length > 2 && tw(l, z, bold, ser) > w) l = l.slice(0, -2) + '…'; return l; };
  /* a day's head: its picture, the day, the date, the theme, the restaurant theme (and, for the team: dress code, days off, entrance) */
  const anyImg = PX_DAYS.some(w => img.days[w]), IH = anyImg ? 20 : 0, PAD = 1.8, w0 = CW - 2 * PAD;
  const dayLines = (dd, full) => {
    const w = D.wd(dd), di = dayOf(b.days, dd), pl = (b.plans || []).find(p => p.date === dd) || {}, L = [];
    if (d.show_day) L.push({ s: D.fmt(dd, { weekday: 'long' }).toUpperCase(), z: 3.3, bold: true, fill: head, ls: 0.35 });
    if (dateOn) L.push({ s: D.fmt(dd, { day: 'numeric', month: 'long' }), z: 2.5, fill: mute });
    if (!full) return L;
    if (d.show_theme && dayName(di)) { const f = pxFit(dayName(di), 3.2, w0, 2, false, true, 2.6); f.L.forEach(s => L.push({ s, z: f.z, serif: true, italic: true, fill: acc })); }
    const named = (lab, v) => { if (!v) return; L.push({ s: lab.toUpperCase(), z: 1.85, bold: true, fill: mute, ls: 0.25, gap: 0.6 }); const f = pxFit(v, 2.5, w0, 2, true, false, 2.1); f.L.forEach(s => L.push({ s, z: f.z, fill: ink, bold: true })); };
    if (d.show_restaurant) named(t('restaurant_theme'), restName(di));
    if (d.show_dress) named(t('dress_code'), pl.dress_code);
    const names = f => (b.status || []).filter(s => s.date === dd && f(s)).map(s => staffTag(b, s.staff_id)).filter(Boolean).join(', ');
    if (d.show_dayoff) named(t('st_day_off'), names(s => s.status === 'day_off'));
    if (d.show_entrance) named(t('entrance'), names(s => s.entrance));
    return L;
  };
  const lineH = l => l.z * 1.32 + (l.gap || 0);
  const dayH = full => Math.max(...days.map(dd => dayLines(dd, full).reduce((a, l) => a + lineH(l), 0))) + 2 * PAD + (full ? IH : 0);
  const dayHead = (dd, i, y, h, full) => {
    const w = D.wd(dd), x = cx(i), out = [`<rect x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${CW.toFixed(2)}" height="${h.toFixed(2)}" rx="1.6" fill="${pxHex(d.c_day) || '#FFFFFF'}" stroke="${pxMix(acc, '#FFFFFF', 0.55)}" stroke-width="0.25"/>`];
    if (full && IH) out.push(img.days[w] ? pxCover(img.days[w], x, y, CW, IH, d['d' + w + '_x'], d['d' + w + '_y'], d['d' + w + '_zoom'], 'pi' + (++pxSeq), 1.6)
      : `<rect x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${CW.toFixed(2)}" height="${IH}" rx="1.6" fill="${pxMix(acc, '#FFFFFF', 0.82)}"/>`);
    let yy = y + (full ? IH : 0) + PAD;
    dayLines(dd, full).forEach(l => { yy += lineH(l); out.push(T(cx(i) + CW / 2, yy - l.z * 0.28, l.s, l.z, Object.assign({ anchor: 'middle' }, l))); });
    return out.join('');
  };
  /* a programme card: time, name, place, type (description, staff) – only what the design shows */
  const cardOf = (it, k) => {
    const pad = 1.3 * k, sw = d.card === 'outline' ? 0 : 1.3, w = CW - 2 * pad - sw, L = [];
    const time = d.show_time ? hm(it.start_time) + (it.end_time ? '–' + hm(it.end_time) : '') : '', ty = d.show_type ? typeLabel(it.type).toUpperCase() : '';
    const tyL = { s: ty, z: 2.1 * k, bold: true, fill: pxMix(pxTypeColor(d, it.type), '#000000', 0.12), ls: 0.22 };
    // the first line: the time, and the type at its other end when both fit; else each on its own line
    const both = time && ty && tw(time, 2.6 * k, true) + tw(ty, 2.1 * k, true) + 0.22 * ty.length + 2 <= w;
    if (time) L.push({ s: time, z: 2.6 * k, bold: true, fill: ink, side: both ? tyL : null });
    if (d.show_name) { const f = pxFit(itemName(it).toUpperCase(), 2.8 * k, w, 3, true, false, 2.3 * k); f.L.forEach(s => L.push({ s, z: f.z, bold: true, fill: ink })); }
    if (d.show_location && it.location) { const f = pxFit(it.location, 2.3 * k, w, 2, false, false, 2.05 * k); f.L.forEach(s => L.push({ s, z: f.z, fill: mute })); }
    if (ty && !both) L.push(tyL);
    const desc = tx(it.description_i18n, it.description || '');
    if (d.show_desc && desc) { const f = pxFit(desc, 2.15 * k, w, 3, false, false, 2.15 * k); f.L.forEach(s => L.push({ s, z: f.z, fill: mute })); }
    if (d.show_staff && (it.staff || []).length) { const f = pxFit(it.staff.map(s => staffTag(b, s.staff_id, s.name)).join(' · '), 2.1 * k, w, 2, false, false, 2.1 * k); f.L.forEach(s => L.push({ s, z: f.z, fill: mute })); }
    return { it, L, h: L.reduce((a, l) => a + lineH(l), 0) + 2 * pad + 0.2, pad, sw };
  };
  const cardSvg = (c, i, y) => {
    const x = cx(i), col = pxTypeColor(d, c.it.type), out = [];
    if (d.card === 'outline') out.push(`<rect x="${(x + 0.15).toFixed(2)}" y="${y.toFixed(2)}" width="${(CW - 0.3).toFixed(2)}" height="${c.h.toFixed(2)}" rx="1.3" fill="${pxHex(d.c_card) || '#FFFFFF'}" stroke="${col}" stroke-width="0.35"/>`);
    else out.push(`<rect x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${CW.toFixed(2)}" height="${c.h.toFixed(2)}" rx="1.3" fill="${d.card === 'tint' ? pxMix(col, pxHex(d.c_card) || '#FFFFFF', 0.86) : pxHex(d.c_card) || '#FFFFFF'}" stroke="${pxMix(acc, '#FFFFFF', 0.6)}" stroke-width="0.2"/>`
      + `<path d="M${(rtl ? x + CW - c.sw : x).toFixed(2)} ${y.toFixed(2)}h${c.sw}v${c.h.toFixed(2)}h-${c.sw}z" fill="${col}"/>`);
    let yy = y + c.pad; const x0 = rtl ? x + CW - c.sw - c.pad : x + c.sw + c.pad;
    c.L.forEach(l => { yy += lineH(l); out.push(T(x0, yy - l.z * 0.3, l.s, l.z, l));
      if (l.side) out.push(T(rtl ? x + c.pad : x + CW - c.pad, yy - l.z * 0.3, l.side.s, l.side.z, Object.assign({ end: true }, l.side))); });
    return out.join('');
  };
  const GAP = k => 1.3 * k, TH = k => 5.6 * k;
  const cells = (op, k) => days.map(dd => items.filter(i => i.date === dd && opOf(i.start_time) === op).map(i => cardOf(i, k)));
  const H1 = headSvg(true), DH = dayH(true);
  const total = k => H1.h + 2 + DH + 2.4 + parts.reduce((a, op) => a + TH(k) + 1.4 + Math.max(5, ...cells(op, k).map(cs => cs.reduce((x, c) => x + c.h + GAP(k), 0))) + 2, 0);
  const k = [1.12, 1.06, 1, 0.95, 0.9, 0.86].find(z => total(z) <= BOTTOM - M) || 0.86;        // one page at the largest size; never smaller (readable)
  // the pages
  const pages = []; let cur, y;
  const newPage = first => {
    cur = []; cur.cards = 0; pages.push(cur);
    const hd = first ? H1 : headSvg(false); cur.push(hd.svg); y = M + hd.h + 2;
    const h = first ? DH : dayH(false); days.forEach((dd, i) => cur.push(dayHead(dd, i, y, h, first))); y += h + 2.4;
  };
  const partTitles = (op, cont) => days.map((dd, i) => { const c = pxPartColors(d, op, D.wd(dd));
    const lab = t('part_' + op).toUpperCase(), full = cont ? lab + ' · ' + t('continued') : lab, z = 2.5 * k, txt = tw(full, z, true) + 0.45 * full.length <= CW - 6 ? full : cont ? lab + ' ›' : lab;
    // two colours: the title on a small plate of the first colour, so it reads on both (a stripe at the foot: the title above it)
    const band = c.bg2 && d.split === 'band', plate = c.bg2 && !band, tw0 = tw(txt, z, true) + 0.45 * txt.length + 4, ty = y + (band ? TH(k) * 0.5 : TH(k) * 0.66);
    return pxBox(cx(i), y, CW, TH(k), c, d.split, 1.2)
      + (plate ? `<rect x="${(cx(i) + CW / 2 - tw0 / 2).toFixed(2)}" y="${(y + TH(k) * 0.16).toFixed(2)}" width="${tw0.toFixed(2)}" height="${(TH(k) * 0.68).toFixed(2)}" rx="${(TH(k) * 0.34).toFixed(2)}" fill="${c.bg}"/>` : '')
      + T(cx(i) + CW / 2, ty, txt, band ? z * 0.92 : z, { bold: true, fill: c.fg, ls: 0.45, anchor: 'middle' }); }).join('');
  const emptyCell = (i, yy) => d.empty === 'none' ? '' : d.empty === 'text' ? T(cx(i) + CW / 2, yy + 4, t('px_no_programme'), 2.2 * k, { italic: true, serif, fill: mute, anchor: 'middle' })
    : T(cx(i) + CW / 2, yy + 4, '—', 2.6 * k, { fill: mute, anchor: 'middle' });
  newPage(true);
  for (const op of parts) {
    let queue = cells(op, k), cont = false;
    for (;;) {
      const first1 = Math.min(...queue.filter(cs => cs.length).map(cs => cs[0].h));
      if (cur.cards && y + TH(k) + 1.4 + first1 > BOTTOM) newPage(false);
      cur.push(partTitles(op, cont)); y += TH(k) + 1.4;
      const room = BOTTOM - y; let take = queue.map(cs => { let s = 0, n = 0; while (n < cs.length && s + cs[n].h <= room) { s += cs[n].h + GAP(k); n++; } return n; });
      if (take.every(n => !n)) take = queue.map(cs => (cs.length ? 1 : 0));
      const band = Math.max(5, ...queue.map((cs, i) => cs.slice(0, take[i]).reduce((a, c) => a + c.h + GAP(k), 0)));
      if (pxHex(d.s_body)) days.forEach((dd, i) => cur.push(`<rect x="${cx(i).toFixed(2)}" y="${(y - 0.6).toFixed(2)}" width="${CW.toFixed(2)}" height="${(band + 0.6).toFixed(2)}" rx="1.2" fill="${d.s_body}"/>`));
      queue.forEach((cs, i) => { let yy = y; if (!cs.length && !cont) cur.push(emptyCell(i, yy)); cs.slice(0, take[i]).forEach(c => { cur.push(cardSvg(c, i, yy)); cur.cards++; yy += c.h + GAP(k); }); });
      y += band + 2;
      queue = queue.map((cs, i) => cs.slice(take[i]));
      if (queue.every(cs => !cs.length)) break;
      newPage(false); cont = true;
    }
  }
  if (!parts.length) cur.push(T(W / 2, y + 10, t('no_items_week'), 3.4, { fill: mute, anchor: 'middle', italic: true, serif }));
  // the watermark: subtle, on every page (centre, the page's diagonal, at the foot, or repeated)
  const wm = () => {
    const s = String(d.wm_text || '').trim(); if (!d.wm_on || !s) return '';
    const z = Math.max(4, Math.min(80, +d.wm_size || 22)), op = Math.max(1, Math.min(60, +d.wm_opacity || 7)) / 100, rot = +d.wm_rotate || 0;
    const txt = (x, y2, r) => `<text x="${x.toFixed(2)}" y="${y2.toFixed(2)}" font-size="${z}" font-family="${serif ? 'Georgia,serif' : 'Arial,sans-serif'}" font-weight="700" fill="${ink}" fill-opacity="${op}" text-anchor="middle"${r ? ` transform="rotate(${r} ${x.toFixed(2)} ${y2.toFixed(2)})"` : ''}>${esc(s)}</text>`;
    if (d.wm_pos === 'center') return txt(W / 2, H / 2 + z * 0.35, rot);
    if (d.wm_pos === 'bottom') return txt(W / 2, BOTTOM - 2, 0);
    if (d.wm_pos === 'repeat') { const out = [], sx = Math.max(60, tw(s, z, true, serif) + 30), sy = z * 3.2; for (let yy = sy / 2; yy < H; yy += sy) for (let xx = (Math.round(yy / sy) % 2) * sx / 2; xx < W + sx; xx += sx) out.push(txt(xx, yy, rot)); return out.join(''); }
    return txt(W / 2, H / 2 + z * 0.35, -Math.atan2(H, W) * 180 / Math.PI);      // diagonal
  };
  const n = pages.length;
  return { W, H, k, pages: pages.map((p, i) => `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 ${W} ${H}" width="${W}mm" height="${H}mm"><rect width="${W}" height="${H}" fill="${pxHex(d.c_bg) || '#FFFFFF'}"/>${p.join('')}${wm()}${d.show_footer ? docFoot(W, H, M, i, n, { date: dateOn }) : ''}</svg>`) };
}
// the PDF: the week read again at this moment (a programme change is always in it), sharp (300 dpi), A4 landscape
async function pxPdf(from, design, o = {}) {
  const data = await pxLoad(from, o), r = await pxPages(data, design);
  return makePdf(r.pages, r.W, r.H, (design.title || t('programme')) + (design.show_date ? ' ' + D.dm(data.from) + ' - ' + D.dm(data.to) : ''), { dpi: r.pages.length <= 8 ? 300 : 240 });
}

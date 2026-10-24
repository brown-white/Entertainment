'use strict';
/* AUREA · systems/team-schedule.js — the team's days: the day board (programme + staff + day statuses), off / vacation / absent / entrance duty, the day's
   information, clock times, attendance counts – and the ONE check of what a change would break (people who would be
   unassigned), used by every save that can unassign someone.
   Uses: core/state · translations/languages · supabase · core/utils · icons/icons · core/permissions · components/modals · core/actions ·
         components/cards · core/router · components/forms */
const dayOf = (days, d) => (days || []).find(x => x.date === d) || {};
const dayName = di => tx(di.day_name_i18n, di.day_name || '');
const restName = di => tx(di.restaurant_i18n, di.restaurant_theme || '');
/* clock times are shown and entered in the hotel's own time zone */
const clockTime = ts => { try { return new Intl.DateTimeFormat(locale(), { hour: '2-digit', minute: '2-digit', timeZone: hotelTz() }).format(new Date(ts)); } catch { return String(ts).slice(11, 16); } };
function hotelTs(date, hhmm) {
  const tz = hotelTz() || 'UTC'; const guess = new Date(`${date}T${hhmm}:00Z`);
  let off = 0; try { const p = new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'shortOffset' }).formatToParts(guess).find(x => x.type === 'timeZoneName').value; const m = p.match(/GMT([+-]\d+)(?::(\d+))?/); if (m) off = (+m[1]) * 60 + Math.sign(+m[1]) * (+(m[2] || 0)); } catch { /* UTC */ }
  return new Date(guess.getTime() - off * 60000).toISOString();
}
// one shift typed by hand: an end before the start is the next day (a night shift over midnight)
const clockPair = (d, cin, cout) => ({ check_in: cin ? hotelTs(d, cin) : null, check_out: cout ? hotelTs(cin && cout < cin ? D.add(d, 1) : d, cout) : null });
const clockHm = ts => { try { return new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: hotelTz() }).format(new Date(ts)); } catch { return ''; } };
const board = (from, to, all = false) => api('day_board', { p_from: from, p_to: to, p_all_teams: all });
const statusOf = (b, sid, d) => b.status.find(s => s.staff_id === sid && s.date === d);
// entrance duty is a time, not a whole day: its label always carries the time it starts (one record: duty → team → hotel)
const entranceLabel = s => t('entrance') + (s?.entrance_at ? ' ' + s.entrance_at : '');
const stChip = s => s ? chip(statusLabel(s.status), 'st-' + s.status) + (s.entrance ? chip(entranceLabel(s), 'st-entrance') : '') + (s.practice ? chip(t('practice'), 'st-practice') : '') : '';
const teamOpts = blank => (blank ? [['', blank]] : []).concat(S.teams.map(x => [x.id, x.name]));
/* what a change would break, in words; the choices: cancel / take the people concerned off / save anyway */
const issueText = x => { const who = (x.number ? '#' + x.number + ' ' : '') + x.staff, what = tx(x.item_i18n, x.item) + ' · ' + D.short(x.date) + ' ' + x.time;
  return `${who} · ${what}: ${x.r === 'entrance' && x.leave ? t('why_entrance_t', { leave: x.leave, end: x.end }) : t('why_' + x.r)}`; };
function changeAsk(o) {
  const issues = o.issues || [], dups = o.dups || [];
  const own = issues.filter(x => o.own == null || x.i === o.own);   // people who can be taken off this item (others are told, not changed)
  const html = (o.ask ? `<p>${esc(o.ask)}</p>` : '')
    + (issues.length ? `<p class="hint-box warn">${ico('flag')}<span>${esc(t('change_issues'))}</span></p><ul class="chg-list">${issues.map(x => `<li>${esc(issueText(x))}</li>`).join('')}</ul>` : '')
    + (dups.length ? `<p class="hint-box warn">${ico('copy')}<span>${esc(t('change_dups'))}</span></p><ul class="chg-list">${dups.slice(0, 12).map(x => `<li>${o.dated ? esc(D.short(x.date)) + ' · ' : ''}${esc(tx(x.name_i18n, x.name))} · ${esc(x.start_time + (x.end_time ? '–' + x.end_time : ''))}${x.location ? ' · ' + esc(x.location) : ''}</li>`).join('')}</ul>` : '')
    + effectHtml(o.effect);
  const choices = (own.length && can('m_planner') ? [{ k: 'remove', label: t('save_remove', { n: own.length }) }] : [])
    .concat([{ k: 'save', label: issues.length || dups.length ? t('save_anyway') : (o.okLabel || t('save')) }]);
  return choiceBox(o.title || t('check_change'), html, choices);
}
// what a change does to the dates concerned: coming dates that go (with their staff and bookings), past dates without
// history that go, coming dates cancelled because guests booked them (they are told) – shown before anything is saved
const effLine = x => `${D.short(x.date)} ${x.start_time} ${tx(x.name_i18n, x.name)}${x.staff ? ' · ' + t('eff_staff', { n: x.staff }) : ''}${x.booked ? ' · ' + t('eff_booked', { n: x.booked }) : ''}`;
function effectHtml(e) {
  if (!e) return '';
  const rm = e.removed || [], cn = e.cancelled || [], list2 = (a, cls) => `<ul class="chg-list">${a.slice(0, 8).map(x => `<li class="${cls(x)}">${esc(effLine(x))}</li>`).join('')}${a.length > 8 ? `<li class="muted">… +${a.length - 8}</li>` : ''}</ul>`;
  return (rm.length ? `<p class="hint-box ${rm.some(x => x.staff || x.booked) ? 'warn' : ''}">${ico('trash')}<span>${esc(t('eff_removed', { n: rm.length }))}</span></p>${list2(rm, x => x.staff || x.booked ? 'bad' : '')}` : '')
    + (e.removed_past ? `<p class="muted small">${esc(t('eff_removed_past', { n: e.removed_past }))}</p>` : '')
    + (cn.length ? `<p class="hint-box warn">${ico('flag')}<span>${esc(t('eff_cancelled', { n: cn.length }))}</span></p>${list2(cn, () => '')}` : '');
}
// take the people concerned off the items (only this team's assignments: the one assignment save)
async function unassignIssues(issues) {
  const by = {}; issues.forEach(x => { (by[x.i] = by[x.i] || new Set()).add(x.s); });
  for (const [iid, gone] of Object.entries(by)) {
    const rows = await list('assignments', { item_id: +iid });
    if (rows.some(a => gone.has(a.staff_id))) await api('assignment_set', { p_item_id: +iid, p_staff_ids: rows.map(a => a.staff_id).filter(s => !gone.has(s)) });
  }
}
/* the ONE save of a person's day (Day plan cell, the Week overview's team day): what it would break is shown first */
async function dayStatusSave(list2) {
  const issues = [];
  for (const a of list2) { const pv = await api('program_change_preview', { p_kind: 'day', p_args: a }); issues.push(...pv.issues); }
  let take = false;
  if (issues.length) { const ch = await changeAsk({ issues }); if (!ch) return false; take = ch === 'remove'; }
  for (const a of list2) await api('day_status_set', { p_staff_id: a.staff_id, p_date: a.date, p_status: a.status, p_entrance: a.entrance, p_practice: a.practice, p_note: a.note, p_leave_op: a.leave_op, p_entrance_at: a.entrance_at, p_times: !!a.times });
  if (take) await unassignIssues(issues);
  return true;
}
// a person as the team knows them: the staff number when there is one (never used to decide anything), else the name
const staffTag = (b, sid, name) => { const p = b.staff.find(x => x.id === sid); return p?.staff_number ? '#' + p.staff_number : (p?.display_name || name || ''); };
/* the days that really count for a person: from the first working day, never after today or the last day */
function workWindow(p, from, to) {
  let a = from, z = to < D.today() ? to : D.today();
  if (p.start_date && p.start_date > a) a = p.start_date;
  if (p.end_date && p.end_date < z) z = p.end_date;
  return a <= z ? [a, z] : null;
}
function attendanceSummary(p, b, from, to) {
  const w = workWindow(p, from, to); const inW = d => !!w && d >= w[0] && d <= w[1];
  const st = b.status.filter(x => x.staff_id === p.id && inW(x.date)), ck = (b.clock || []).filter(k => k.staff_id === p.id && inW(k.date));
  const n = s => st.filter(x => x.status === s).length;
  const hours = sum(ck.filter(k => k.check_in && k.check_out), k => (new Date(k.check_out) - new Date(k.check_in)) / 36e5);
  return { worked: n('working'), off: n('day_off'), vac: n('vacation'), absent: n('absent'), sick: n('sick'), clocked: ck.filter(k => k.check_in).length,
    hours: Math.round(hours * 10) / 10, days: w ? D.range(w[0], 400).indexOf(w[1]) + 1 : 0, window: w, tracked: st.length > 0 };
}
const ST_LETTER = { working: 'P', day_off: 'O', vacation: 'H', absent: 'A', sick: 'S' };
ACT.dp_cell = async el => {
  const sid = +el.dataset.s, d = el.dataset.d; const b = await board(d, d); const st = statusOf(b, sid, d) || {}; const p = b.staff.find(x => x.id === sid);
  // the ONE entrance duty record of that day: its own times, or empty = the team's / hotel's times (shown as the hint)
  const f = [{ k: 'status', type: 'select', label: t('status'), options: STATUS.map(s => [s, statusLabel(s)]) }, { k: 'entrance', type: 'bool', label: t('entrance'), hint: t('entrance_hint') },
    { k: 'leave_op', type: 'time', label: t('leave_op_at'), hint: t('time_default_team', { x: b.rules?.leave_op_time || '' }) },
    { k: 'entrance_at', type: 'time', label: t('entrance_at'), hint: t('time_default_team', { x: b.rules?.entrance_time || '' }) },
    { k: 'practice', type: 'bool', label: t('practice') }, { k: 'note', label: t('note') }];
  const k = (b.clock || []).find(x => x.staff_id === sid && x.date === d);
  const cf = [{ k: 'cin', type: 'time', label: t('clock_in_btn') }, { k: 'cout', type: 'time', label: t('clock_out_btn') }];
  modal(p.display_name + ' · ' + D.short(d), formHtml(f, Object.assign({}, st, { leave_op: st.own_leave_op, entrance_at: st.own_entrance_at })) + (st.source === 'set' ? `<p class="muted small">${esc(t('set_by_hand'))}</p>` : '')
    + `<h3>${esc(t('clock_times'))}</h3><div id="clk">${formHtml(cf, { cin: k?.check_in ? clockHm(k.check_in) : '', cout: k?.check_out ? clockHm(k.check_out) : '' })}</div>`, {
    save: async root => {
      // the one save of a person's day: what it would break for their assignments is shown first (the manager decides)
      const r = readForm(root, f);
      if (await dayStatusSave([{ staff_id: sid, date: d, status: r.status, entrance: r.entrance, practice: r.practice, note: r.note, leave_op: r.leave_op, entrance_at: r.entrance_at, times: true }]) === false) return false;
      const c = readForm($('#clk', root), cf);
      const { check_in: cin, check_out: cout } = clockPair(d, c.cin, c.cout);
      if (k ? (cin !== k.check_in || cout !== k.check_out) : (cin || cout)) await save('staff_clock', Object.assign(k ? { id: k.id } : { staff_id: sid, date: d }, { check_in: cin, check_out: cout }));
      toast(t('saved')); route();
    },
    extra: st.source === 'set' ? `<button class="btn ghost" data-act="dp_reset" data-s="${sid}" data-d="${d}">${esc(t('use_pattern'))}</button>` : ''
  });
};
ACT.dp_reset = async el => { await api('day_status_set', { p_staff_id: +el.dataset.s, p_date: el.dataset.d, p_status: null, p_entrance: null, p_practice: null, p_note: null }); closeModals(); route(); };
/* one day's information (Day plan, Week overview): the hotel's day name and restaurant theme, the team's dress code and notes.
   The form shows what the day shows now; it is kept for this date only, or for every such weekday (the week pattern – this date
   then follows the week again). A value the same as the week's needs no own entry for the date. */
ACT.dp_plan = async el => {
  const d = el.dataset.date, w = D.wd(d); const b = await board(d, d); const p = b.plans[0] || {}; const di = dayOf(b.days, d);
  const [own, wk] = await Promise.all([di.date_id ? list('day_info', { id: di.date_id }) : [], di.week_id ? list('day_info', { id: di.week_id }) : []]).then(x => x.map(r => r[0] || {}));
  const tw = (b.week || []).find(x => x.weekday === w) || {}, team = !!S.team && can('m_dayplan');
  const f = [{ type: 'section', label: t('whole_hotel'), hint: t('day_info_hint') }, { k: 'day_name', label: t('day_name') }, { k: 'restaurant_theme', label: t('restaurant_theme') },
    team && { type: 'section', label: S.team.name }, team && { k: 'dress_code', label: t('dress_code') }, team && { k: 'notes', type: 'textarea', label: t('notes'), rows: 3 }].filter(Boolean);
  const scope = `<fieldset class="field days" data-scope><legend>${esc(t('applies_to'))}</legend><label><input type="radio" name="scope" value="date" checked> ${esc(t('only_this_date', { date: D.short(d) }))}</label>
    <label><input type="radio" name="scope" value="week"> ${esc(t('every_weekday', { day: D.wdName(w) }))}</label></fieldset>`;
  const same = (x, y) => (x || '') === (y || '');
  editForm(D.long(d), f, { day_name: di.day_name || '', restaurant_theme: di.restaurant_theme || '', dress_code: p.dress_code || '', notes: p.notes || '' }, async (r, root) => {
    const every = $('[data-scope] input:checked', root)?.value === 'week';
    const hv = { day_name: r.day_name || null, restaurant_theme: r.restaurant_theme || null };
    if (every) {
      if (!same(wk.day_name, hv.day_name) || !same(wk.restaurant_theme, hv.restaurant_theme)) {
        if (hv.day_name || hv.restaurant_theme) await save('day_info', Object.assign(wk.id ? { id: wk.id } : { weekday: w }, hv)); else if (wk.id) await del('day_info', wk.id);
      }
      if (own.id) await del('day_info', own.id);
    } else if (same(wk.day_name, hv.day_name) && same(wk.restaurant_theme, hv.restaurant_theme)) { if (own.id) await del('day_info', own.id); }
    else await save('day_info', Object.assign(own.id ? { id: own.id } : { date: d }, hv));
    if (team) {
      const tv = { dress_code: r.dress_code || null, notes: r.notes || null };
      if (every) {
        if (!same(tw.dress_code, tv.dress_code) || !same(tw.notes, tv.notes)) await save('team_week_pattern', Object.assign(tw.id ? { id: tw.id } : { weekday: w }, tv));
        if (p.plan_id) await del('team_day_plans', p.plan_id);
      } else if (same(tw.dress_code, tv.dress_code) && same(tw.notes, tv.notes)) { if (p.plan_id) await del('team_day_plans', p.plan_id); }
      else await save('team_day_plans', Object.assign(p.plan_id ? { id: p.plan_id } : { date: d }, tv));
    }
    route();
  }, { after: scope });
};

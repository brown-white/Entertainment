'use strict';
/* Mr Hassan · systems/attendance.js — STAFF ATTENDANCE, written once for every hotel and team: the period of a team (or of every team) from
   the ONE attendance_sheet (each day's status and policy, the clock records, the Management letters, tickets sold), what counts for a
   person, what is wrong on a day, clock in / out from the phone (the place is checked by the database: the phone only says where it
   is, and every refusal says why), the ONE correction of a person's day (status + clock, always with a reason) and the two exports:
   Detailed (everything) and Management (the letters and the total of work days, from the one rule in Attendance → Settings).
   Uses: core/state · translations/languages · supabase · core/utils · core/permissions · components/modals · components/cards ·
         core/router · components/forms · components/tables · systems/team-schedule */
/* ---------- the period of a team / every team ---------- */
async function attSheet(from, to, all) {
  const j = await api('attendance_sheet', { p_from: from, p_to: to, p_all_teams: !!all });
  const dm = new Map(j.days.map(x => [x.staff_id + '|' + x.date, x])), km = new Map(j.clock.map(k => [k.staff_id + '|' + k.date, k]));
  return Object.assign(j, { allTeams: !!all && can('all_teams'), dates: D.range(from, D.diff(from, to) + 1), dayOf: (s, d) => dm.get(s + '|' + d), clockOf: (s, d) => km.get(s + '|' + d) });
}
// the clock of a day as people read it ("09:44 – 18:02"); a shift still open shows "…"
const clockSpan = k => (k && k.check_in ? clockTime(k.check_in) + ' – ' + (k.check_out ? clockTime(k.check_out) : '…') : '');
const attPlan = x => (x && x.sched_in ? x.sched_in + (x.sched_out ? ' – ' + x.sched_out : '') : '');
// the place check of a clock in / out, in words
const attCheck = (c, place) => (c ? t('att_chk_' + c) + (c === 'ok' && place ? ' · ' + place : '') : '');
// what kind of person this is in attendance (an app account, attendance only, left)
const attKind = p => (p.status === 'left' ? t('ss_left') : !p.has_login ? t('att_only_person') : !p.app_access ? t('att_no_app') : t('ss_active'));
/* what is wrong with a person's day: late, left early, no clock out, not clocked although needed, clock attempts refused */
function attIssues(j, sid, d) {
  const x = j.dayOf(sid, d), k = j.clockOf(sid, d), out = []; if (!x && !k) return out;
  const due = d < j.today || (d === j.today && x?.sched_in && hotelNowMin() > mins(x.sched_in) + (x.grace || 0));
  if (k?.late_min > 0) out.push({ k: k.late_excused ? 'excused' : 'late', text: t(k.late_excused ? 'att_late_excused' : 'att_late_n', { n: k.late_min }) });
  if (k?.early_min > 0) out.push({ k: 'early', text: t('att_early_n', { n: k.early_min }) });
  if (k?.check_in && !k.check_out && d < j.today) out.push({ k: 'no_out', text: t('att_no_out') });
  if (x?.status === 'working' && x.clock_req && !k?.check_in && due) out.push({ k: 'no_clock', text: t('att_not_clocked') });
  j.refused.filter(r => r.staff_id === sid && hotelDate(r.at) === d).forEach(r => out.push({ k: 'refused', text: t('att_refused', { time: clockTime(r.at), why: attWhy(r.data) }) }));
  if (k?.source === 'manual' || k?.edited_at) out.push({ k: 'edited', text: t('att_corrected', { name: k.edited_by_name || '' }) + (k.edit_reason ? ': ' + k.edit_reason : '') });
  return out;
}
const attWhy = r => (r?.why === 'place' ? t('att_why_place', { m: r.distance ?? '?', place: r.place || '' }) : r?.why === 'accuracy' ? t('att_why_accuracy', { m: r.accuracy ?? '?' }) : t('att_why_' + (r?.why || 'position')));
/* what counts for a person in the period (today and earlier): the statuses, the Management total, clock, lateness, tickets sold */
function attSum(j, p) {
  const days = j.dates.filter(d => d <= j.today).map(d => j.dayOf(p.id, d)).filter(Boolean), n = s => days.filter(x => x.status === s).length;
  const ks = j.dates.map(d => j.clockOf(p.id, d)).filter(Boolean), late = ks.filter(k => k.late_min > 0 && !k.late_excused), early = ks.filter(k => k.early_min > 0);
  const tk = j.tickets.filter(x => x.staff_id === p.id);
  return { working: n('working'), day_off: n('day_off'), vacation: n('vacation'), absent: n('absent'), sick: n('sick'), days: days.length, mgmt: +(j.mgmt[p.id] || 0),
    clocked: ks.filter(k => k.check_in).length, late: late.length, lateMin: sum(late, k => k.late_min), early: early.length, earlyMin: sum(early, k => k.early_min),
    noOut: ks.filter(k => k.check_in && !k.check_out && k.date < j.today).length,
    notClocked: days.filter(x => x.status === 'working' && x.clock_req && x.date < j.today && !j.clockOf(p.id, x.date)?.check_in).length,
    refused: j.refused.filter(r => r.staff_id === p.id).length,
    hours: Math.round(sum(ks.filter(k => k.check_in && k.check_out), k => (new Date(k.check_out) - new Date(k.check_in)) / 36e5) * 10) / 10,
    tickets: sum(tk, x => x.n), sales: byCur(tk, x => x.amount, x => x.currency) };
}
/* ---------- clock in / out from the phone ---------- */
// where the phone is (asked each time, never stored on the phone); a refusal says which: permission off, not available, too slow
function attPosition() {
  return new Promise((ok, no) => {
    if (!navigator.geolocation) { no({ code: 'unsupported' }); return; }
    navigator.geolocation.getCurrentPosition(p => ok({ lat: p.coords.latitude, lng: p.coords.longitude, acc: Math.round(p.coords.accuracy) }),
      e => no({ code: e.code === 1 ? 'denied' : e.code === 3 ? 'timeout' : 'unavailable' }), { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 });
  });
}
async function attClock(action, needPlace) {
  if (!navigator.onLine) throw new ApiError('offline');
  let pos = null;
  const where = async () => { try { pos = await attPosition(); } catch (e) {
    await safe(api('staff_clock', { p_action: action, p_pos: { error: e.code } }));          // the manager sees the refused attempt and why
    throw new ApiError('geo_' + e.code); } };
  if (needPlace) await where();
  try { return await api('staff_clock', { p_action: action, p_pos: pos }); } catch (e) {
    if (e.code === 'clock_position' && !pos) { await where(); return api('staff_clock', { p_action: action, p_pos: pos }); }   // (the place became needed meanwhile)
    if (e.code === 'clock_location' && action === 'out') throw new ApiError('clock_location_out', e.info);
    throw e;
  }
}
/* ---------- the ONE correction of a person's day: the status (Edit attendance) and the clock (Correct clock: add a missing clock in /
   out, correct a time, accept a refused place, excuse lateness) – the clock always with a reason, the same one record, who and when ---------- */
async function attDayEdit(sid, d, j) {
  j = j && j.dayOf ? j : await attSheet(d, d, true);
  const p = j.staff.find(x => x.id === sid); if (!p) return toast(t('err_notfound'), 'bad');
  const x = j.dayOf(sid, d), k = j.clockOf(sid, d), past = d <= j.today;
  const stOpts = can('m_dayplan') ? STATUS : past && can('att_edit,team_ops') ? ['working', 'absent', 'sick'] : [];
  const canClock = can('att_clock_fix') && past;
  const sf = stOpts.length && x ? [{ k: 'status', type: 'select', label: t('status'), options: (stOpts.includes(x.status) ? [] : [[x.status, statusLabel(x.status)]]).concat(stOpts.map(s => [s, statusLabel(s)])) }] : [];
  const cf = canClock ? [{ k: 'in', type: 'time', label: t('clock_in_btn') }, { k: 'out', type: 'time', label: t('clock_out_btn'), hint: t('att_out_hint') },
    { k: 'late_excused', type: 'bool', label: t('att_excuse_late') }, { k: 'note', label: t('note') }, { k: 'reason', type: 'textarea', rows: 2, label: t('att_reason'), hint: t('att_reason_hint') }] : [];
  const iss = attIssues(j, sid, d), cur = { status: x?.status, in: k?.check_in ? clockHm(k.check_in) : '', out: k?.check_out ? clockHm(k.check_out) : '', late_excused: !!k?.late_excused, note: k?.note || '' };
  const facts = [[t('status'), x ? statusLabel(x.status) : t('not_employed')], [t('att_planned'), attPlan(x) ? attPlan(x) + (x.grace ? ' · ' + t('att_grace_n', { n: x.grace }) : '') : x?.clock_req === false ? t('att_no_clock_needed') : '—'],
    [t('clock_times'), clockSpan(k) || t('not_clocked')], k && [t('att_place'), [attCheck(k.in_check, k.in_place), k.check_out ? attCheck(k.out_check, k.out_place) : ''].filter(Boolean).join(' / ')],
    k?.orig && [t('att_recorded'), clockSpan(k.orig) + (k.orig.late_min ? ' · ' + t('att_late_n', { n: k.orig.late_min }) : '')]].filter(Boolean);
  const html = `<dl class="facts">${facts.map(([a, b]) => `<dt>${esc(a)}</dt><dd>${esc(b)}</dd>`).join('')}</dl>${iss.length ? `<ul class="att-issues">${iss.map(i => `<li class="i-${i.k}">${esc(i.text)}</li>`).join('')}</ul>` : ''}
    ${sf.length ? formHtml(sf, cur) : ''}${cf.length ? `<h3>${esc(t('att_correct_clock'))}</h3><div id="attclk">${formHtml(cf, cur)}</div>` : ''}${!sf.length && !cf.length ? `<p class="muted small">${esc(t('att_view_only'))}</p>` : ''}`;
  modal(p.display_name + ' · ' + D.short(d), html, {
    noFocus: true, mount: root => wireForm(root),
    save: sf.length || cf.length ? async root => {
      const r = sf.length ? readForm(root, sf) : {}, c = cf.length ? readForm($('#attclk', root), cf) : {};
      const clockCh = cf.length && ((c.in || '') !== cur.in || (c.out || '') !== cur.out || !!c.late_excused !== cur.late_excused || (c.note || '') !== cur.note);
      if (clockCh && !(c.reason || '').trim()) throw new ApiError('reason');
      if (sf.length && r.status !== x.status) await api('day_status_set', { p_staff_id: sid, p_date: d, p_status: r.status, p_entrance: !!x.entrance, p_practice: !!x.practice, p_note: x.note || null });
      if (clockCh) await api('clock_fix', { p_staff: sid, p_date: d, p_row: { in: c.in || '', out: c.out || '', late_excused: !!c.late_excused, note: c.note || '', reason: c.reason } });
      toast(t('saved')); route();
    } : null
  });
}
/* ---------- the exports ---------- */
const attFile = (kind, month) => ['attendance', kind, S.hotel?.name, month].filter(Boolean).join('-');
// MANAGEMENT: Name, the days (the letters of the one rule: today and earlier), Total Work Days – nothing else (no staff number)
function attMgmtDoc(j, people, month) {
  const rule = j.mgmt_rule || {}, cols = [t('name')].concat(j.dates.map(d => String(+d.slice(8))), [t('att_total_work_days')]);
  const rows = people.map(p => [p.display_name].concat(j.dates.map(d => j.dayOf(p.id, d)?.m || ''), [+(j.mgmt[p.id] || 0)]));
  const legend = uniq(STATUS.map(s => rule[s]?.l).filter(Boolean)).map(l => l + ' = ' + STATUS.filter(s => rule[s]?.l === l).map(statusLabel).join(' / ')
    + (STATUS.some(s => rule[s]?.l === l && rule[s]?.n) ? ' (' + t('att_counts') + ')' : '')).join(' · ');
  return { title: t('att_mgmt_title'), sub: D.mon(month) + ' · ' + (j.allTeams ? t('all_teams') : S.team?.name || ''), file: attFile('management', month),
    html: `<p class="muted">${esc(legend)}</p>` + tableHtml(cols, rows), sheets: { [t('att_mgmt_title')]: { cols, rows } } };
}
// DETAILED: every person with what counts (and the tickets sold), every day with its clock – for the PDF / Word the summary and the clock records
function attDetailDoc(j, people, month) {
  const hotel = S.hotel?.name || '', team = p => p.team_name || '', sums = people.map(p => [p, attSum(j, p)]);
  const sumCols = [t('staff_number'), t('name'), t('role'), t('nationality'), t('gender'), t('att_hiring'), t('att_end'), t('status'), t('team'), t('hotel'), t('month'),
    t('st_working'), t('st_day_off'), t('st_vacation'), t('st_absent'), t('st_sick'), t('att_total_work_days'), t('att_clocked_days'), t('att_late_times'), t('att_late_minutes'),
    t('att_early_times'), t('att_early_minutes'), t('att_no_out'), t('att_not_clocked'), t('att_refused_n'), t('hours'), t('att_tickets_sold'), t('att_ticket_sales')];
  const sumRows = sums.map(([p, s]) => [p.staff_number || '', p.display_name, p.role_name || '', countryName(p.nationality) || '', p.gender ? t(p.gender) : '', p.start_date || '', p.end_date || '', attKind(p),
    team(p), hotel, D.mon(month), s.working, s.day_off, s.vacation, s.absent, s.sick, s.mgmt, s.clocked, s.late, s.lateMin, s.early, s.earlyMin, s.noOut, s.notClocked, s.refused, s.hours, s.tickets, moneyBy(s.sales)]);
  const dayCols = [t('staff_number'), t('name'), t('team'), t('date'), t('status'), t('att_planned_in'), t('att_planned_out'), t('clock_in_btn'), t('clock_out_btn'), t('att_late_minutes'),
    t('att_early_minutes'), t('att_place_in'), t('att_place_out'), t('att_source'), t('att_corrected_by'), t('att_reason'), t('note')];
  const dayRows = [];
  people.forEach(p => j.dates.filter(d => d <= j.today).forEach(d => { const x = j.dayOf(p.id, d), k = j.clockOf(p.id, d); if (!x && !k) return;
    dayRows.push([p.staff_number || '', p.display_name, team(p), d, x ? statusLabel(x.status) : '', k?.sched_in ? hm(k.sched_in) : x?.sched_in || '', k?.sched_out ? hm(k.sched_out) : x?.sched_out || '',
      k?.check_in ? clockHm(k.check_in) : '', k?.check_out ? clockHm(k.check_out) : '', k?.late_min || 0, k?.early_min || 0, attCheck(k?.in_check, k?.in_place), attCheck(k?.out_check, k?.out_place),
      k ? t('att_src_' + (k.source || 'app')) : '', k?.edited_by_name || '', k?.edit_reason || '', k?.note || x?.note || '']); }));
  // the paper: the summary (the columns a page can hold) and the clock records with something to say
  const pCols = [t('staff_number'), t('name'), t('role'), t('team'), t('att_hiring'), t('att_end'), 'P', 'O', 'H', 'A', 'S', t('att_total_work_days'), t('att_late_short'), t('att_early_short'), t('att_no_out'), t('att_tickets_sold')];
  const pRows = sums.map(([p, s]) => [p.staff_number || '', p.display_name + (p.status === 'left' || !p.has_login ? ' (' + attKind(p) + ')' : ''), p.role_name || '', team(p), p.start_date ? D.dm(p.start_date) : '', p.end_date ? D.dm(p.end_date) : '',
    s.working, s.day_off, s.vacation, s.absent, s.sick, s.mgmt, s.late ? s.late + ' / ' + s.lateMin + "'" : '', s.early ? s.early + ' / ' + s.earlyMin + "'" : '', s.noOut || '', s.tickets ? s.tickets + (moneyBy(s.sales) ? ' · ' + moneyBy(s.sales) : '') : '']);
  const ex = []; people.forEach(p => j.dates.forEach(d => { const is = attIssues(j, p.id, d); if (is.length) ex.push([D.dm(d), p.display_name, attPlan(j.dayOf(p.id, d)), clockSpan(j.clockOf(p.id, d)), is.map(i => i.text).join(' · ')]); }));
  const html = `<dl><dt>${esc(t('hotel'))}</dt><dd>${esc(hotel)}</dd><dt>${esc(t('team'))}</dt><dd>${esc(j.allTeams ? t('all_teams') : S.team?.name || '')}</dd><dt>${esc(t('month'))}</dt><dd>${esc(D.mon(month))}</dd><dt>${esc(t('people'))}</dt><dd>${people.length}</dd></dl>`
    + `<h2>${esc(t('att_summary'))}</h2>` + tableHtml(pCols, pRows) + `<p class="muted">${esc(t('att_letters_legend'))}</p>`
    + (ex.length ? `<h2>${esc(t('att_exceptions'))}</h2>` + tableHtml([t('date'), t('name'), t('att_planned'), t('clock_times'), t('att_what')], ex) : `<p>${esc(t('att_no_exceptions'))}</p>`);
  return { title: t('att_detail_title'), sub: D.mon(month) + ' · ' + (j.allTeams ? t('all_teams') : S.team?.name || ''), file: attFile('detailed', month), html,
    sheets: { [t('att_summary')]: { cols: sumCols, rows: sumRows }, [t('att_days')]: { cols: dayCols, rows: dayRows } } };
}

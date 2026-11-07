'use strict';
/* Mr Hassan · pages/dashboard.js — Dashboard: the manager's Control Center (the day, action required, timeline, team, requests, tasks,
   reminders, suppliers, tickets, quick actions) and Analytics (statistics).
   Uses: core/state · translations/languages · supabase · core/utils · icons/icons · core/permissions · core/actions · components/cards ·
         core/router · components/tables · systems/exports · systems/feedback · systems/team-schedule · systems/operations · pages/my-day */
/* ---------- Dashboard: THE Entertainment Operations Control Center – the day's numbers, ACTION REQUIRED (the ONE attention list), TODAY
   (the day's timeline: programme, my tasks, reminders, celebrations), TEAM status, GUEST REQUESTS, TASKS, REMINDERS, SUPPLIERS, TICKETS;
   the quick actions the manager pinned. Each part only with its own permission; the details one click away. ---------- */
page('dashboard', {
  perm: 'm_dashboard,mgr_schedule', icon: 'gauge', group: 'operations',
  links: [{ arg: 'stats', group: 'reports', icon: 'chart', title: 'analytics', perm: 'm_dashboard' }],
  sub: arg => (arg === 'stats' ? '' : D.long(D.today()) + (S.team ? ' · ' + S.team.name : '')),
  render: async arg => {
    const head = can('m_dashboard') ? tabs('dashboard', [['today', t('ops_today')], ['stats', t('analytics')]], arg === 'stats' ? 'stats' : 'today') : '';
    if (arg === 'stats' && can('m_dashboard')) return head + await statsView();
    return head + await controlCenter();
  }
});
async function controlCenter() {
  const today = D.today(), tom = D.add(today, 1), bP = board(today, tom), month = D.month(today);
  const [b, guests, att, mine, team, rem, ev, songs, alerts, sales, sup] = await Promise.all([bP,
    can('guests_view,m_guests') ? safe(api('staff_guests')) : null, can('clock_in') && !S.preview ? safe(api('my_attendance')) : null,
    safe(tasksOf('mine', D.add(today, -14), D.add(today, 7))), can('task_assign,task_create,m_team') ? safe(tasksOf('manage', today, today)) : null,
    can('reminders') ? safe(remindersOf('mine')) : null, can('req_view,req_manage') ? safe(api('requests_list', { p_kind: 'events', p_from: today, p_to: D.add(today, 14) })) : null,
    can('song_requests,song_update,req_view,req_manage') ? safe(api('requests_list', { p_kind: 'songs', p_from: today, p_to: today })) : null, bP.then(attentionList),
    can('m_tickets,tickets_view,tickets_revenue') ? safe(api('ticket_report', { p_filter: { from: today, to: today } })) : null,
    can('sup_view,sup_edit,sup_mark,sup_manage,sup_pricing') ? safe(api('supplier_overview', { p_month: month })) : null]);
  const live = b.items.filter(i => i.status === 'scheduled'), todayItems = live.filter(i => i.date === today);
  const st = b.status.filter(s => s.date === today), name = id => b.staff.find(p => p.id === id)?.display_name || '';
  const working = st.filter(s => s.status === 'working'), off = st.filter(s => s.status !== 'working'), entrance = working.filter(s => s.entrance);
  const stays = guests?.stays || [], inHouse = stays.filter(g => g.arrival <= today && g.departure >= today).length, arriving = stays.filter(g => g.arrival === today).length;
  const reqs = (ev?.events || []).filter(r => ['open', 'review', 'clarify', 'approved'].includes(r.status)), newSongs = (songs?.songs || []).filter(s => s.status === 'new').length;
  const cnt = k => (team || []).filter(x => (k === 'late' ? x.late : x.status === k)).length;
  const urgent = alerts.filter(a => a.level === 'bad').length;
  // the numbers of the day: each one opens its details
  const kpis = `<div class="stats">${kpi(t('working_today'), working.length, { href: 'dayplan', detail: off.length ? t('n_not_working', { n: off.length }) : '' })}
    ${kpi(t('items_today'), todayItems.length, { href: 'programme', detail: t('bookings_n', { n: sum(todayItems, i => i.booked) }) })}
    ${guests ? kpi(t('guests_in_house'), inHouse, { href: 'guests', detail: arriving ? t('arriving_n', { n: arriving }) : '' }) : ''}
    ${kpi(t('ops_action'), alerts.length, { tone: urgent ? 'bad' : alerts.length ? 'warn' : 'ok', detail: urgent ? t('n_urgent', { n: urgent }) : '' })}
    ${team ? kpi(t('pg_tasks'), cnt('open') + cnt('accepted') + cnt('in_progress'), { href: 'tasks/team', tone: cnt('late') ? 'bad' : '', detail: cnt('late') ? t('n_late', { n: cnt('late') }) : t('n_done', { n: cnt('done') + cnt('checked') }) }) : ''}
    ${ev ? kpi(t('guest_requests'), reqs.length, { href: 'guestreq', tone: reqs.some(r => r.status === 'open') ? 'warn' : '', detail: newSongs ? t('ops_songs_new', { n: newSongs }) : '' }) : ''}
    ${sales ? kpi(t('tickets_sold_today'), sales.counts?.sold || 0, { href: 'ticketsadmin/report', detail: sales.revenue && Object.keys(sales.revenue).length ? moneyBy(sales.revenue) : '' }) : ''}</div>`;
  // the day's timeline: what happens and what I have to do, by the clock (now marked)
  const tl = timelineNow([].concat(todayItems.map(i => ({ at: hm(i.start_time), title: itemName(i), href: 'item/' + i.id, tc: `var(--t-${i.type})`,
      sub: [typeLabel(i.type), i.location, i.staff.length < i.staff_needed ? t('staff_n_of', { have: i.staff.length, need: i.staff_needed }) : i.staff.map(s => s.name).join(', ')].filter(Boolean).join(' · ') })),
    (mine || []).filter(x => ['open', 'accepted', 'in_progress'].includes(x.status) && (!x.due_date || x.due_date <= today)).map(x => ({ at: hm(x.start_time || x.deadline_time), icon: 'tasks', title: x.title, sub: [t('tc_' + x.category), x.late ? t('tk_late') : ''].filter(Boolean).join(' · '), href: 'tasks', cls: x.late ? 'late' : '' })),
    (rem || []).filter(r => r.status === 'open' && r.date <= today).map(r => ({ at: r.date < today ? '' : r.time, icon: 'bell', title: r.title, sub: t('rs_' + r.state), href: 'tasks/reminders', cls: r.state === 'overdue' ? 'late' : '' })),
    reqs.filter(r => r.req_date === today).map(r => ({ at: hm(r.req_time), icon: 'gift', title: t('rq_' + r.req_type) + ' · ' + t('room') + ' ' + (r.room || '—'), sub: placeLabel(r.location), href: 'guestreq/r' + r.id })))
    .sort((x, y) => (x.at || '99').localeCompare(y.at || '99')));
  const supM = (sup?.suppliers || []).filter(s => s.active !== false && !s.deleted), supT = supM.reduce((o, s) => { ['P', 'M', 'A', 'expected'].forEach(k => { o[k] = (o[k] || 0) + (s.month?.[k] || 0); }); return o; }, {});
  const main = `<section>${secHead(t('ops_action'), 'flag', alerts.hidden ? '' : '', alerts.length)}${attentionHtml(alerts)}</section>
    <section>${secHead(t('ops_today'), 'clock', `<a class="btn ghost small" href="#/programme">${esc(t('pg_programme'))}</a>`, tl.length)}${tl.length ? `<div class="card">${timelineHtml(tl)}</div>` : empty(t('ops_today_none'), '', 'sun')}</section>
    ${team || (mine || []).length ? `<section>${secHead(t('pg_tasks'), 'tasks', `<a class="btn ghost small" href="#/tasks/team">${esc(t('see_all'))}</a>`)}
      ${team ? `<div class="stats small">${kpi(t('ts_open'), cnt('open'))}${kpi(t('ts_in_progress'), cnt('accepted') + cnt('in_progress'))}${kpi(t('ts_done'), cnt('done') + cnt('checked'), { tone: 'ok' })}${kpi(t('tk_late'), cnt('late'), { tone: cnt('late') ? 'bad' : '' })}</div>
        <div class="list">${team.filter(x => ['open', 'accepted', 'in_progress', 'done'].includes(x.status)).slice(0, 6).map(x => taskLi(x, 'manage')).join('') || empty(t('tk_none'), '', 'tasks')}</div>` : ''}</section>` : ''}`;
  const side = `<section>${secHead(t('team_status'), 'users', `<a class="btn ghost small" href="#/dayplan">${esc(t('pg_dayplan'))}</a>`)}
      <div class="team-now"><div><b>${working.length}</b><small>${esc(t('working_today'))}</small></div><div><b>${entrance.length}</b><small>${esc(t('entrance_today'))}</small></div>
        <div><b>${st.filter(s => s.status === 'day_off').length}</b><small>${esc(t('day_off_today'))}</small></div><div><b>${st.filter(s => ['absent', 'sick'].includes(s.status)).length}</b><small>${esc(t('absent_sick'))}</small></div></div>
      ${off.length ? `<p class="small muted">${off.map(s => esc(name(s.staff_id)) + ' ' + stChip(s)).join(' ')}</p>` : ''}</section>
    ${ev || songs ? `<section>${secHead(t('guest_requests'), 'gift', `<a class="btn ghost small" href="#/guestreq">${esc(t('see_all'))}</a>`, reqs.length)}
      ${reqs.length ? `<div class="list flat">${reqs.slice(0, 6).map(r => `<a class="li" href="#/guestreq/r${r.id}"><b>${esc(t('rq_' + r.req_type))}</b> <small class="muted">${esc(D.short(r.req_date))}${r.req_time ? ' ' + esc(hm(r.req_time)) : ''} · ${esc(t('room'))} ${esc(r.room || '—')}${r.tasks.length ? ' · ' + esc(t('gr_tasks_n', { done: r.tasks.filter(k => ['done', 'checked'].includes(k.status)).length, n: r.tasks.length })) : ''}</small> ${chip(t('grs_' + r.status), r.status === 'open' || r.status === 'clarify' ? 'warn' : r.status === 'approved' ? 'ok' : '')}</a>`).join('')}</div>` : `<p class="muted small">${esc(t('gr_none'))}</p>`}
      ${songs ? `<p><a class="btn ghost small" href="#/guestreq/songs">${ico('music')} ${esc(t('ops_songs_new', { n: newSongs }))}</a></p>` : ''}</section>` : ''}
    ${rem ? remSection(rem.filter(r => r.status === 'open').slice(0, 6)) : ''}
    ${sup ? `<section>${secHead(t('supplier_status'), 'truck', `<a class="btn ghost small" href="#/attendance/suppliers">${esc(t('see_all'))}</a>`)}
      <div class="stats small">${kpi(t('sup_st_present'), supT.P || 0, { tone: 'ok' })}${kpi(t('sup_st_mistake'), supT.M || 0, { tone: supT.M ? 'warn' : '' })}${kpi(t('sup_st_absent'), supT.A || 0, { tone: supT.A ? 'bad' : '' })}${kpi(t('sup_expected'), supT.expected || 0)}</div>
      <p class="muted small">${esc(t('sup_month_n', { n: supM.length, month: D.mon(month) }))}</p></section>` : ''}
    ${sales && sales.revenue ? `<section>${secHead(t('tickets_sold_today'), 'ticket', `<a class="btn ghost small" href="#/ticketsadmin/report">${esc(t('ticket_report'))}</a>`)}
      <div class="card"><dl class="kv"><dt>${esc(t('tks_sold'))}</dt><dd>${sales.counts?.sold || 0}</dd><dt>${esc(t('revenue'))}</dt><dd>${esc(Object.keys(sales.revenue).length ? moneyBy(sales.revenue) : '—')}</dd></dl></div></section>` : ''}`;
  return `${clockCard(att)}${pgActions((can('task_create,task_assign') ? `<button class="btn" data-act="tk_new">${ico('plus')} ${esc(t('new_task'))}</button>` : '')
      + moreMenu([can('reminders') && `<button data-act="rem_new">${ico('bell')} ${esc(t('rem_new'))}</button>`, `<button data-act="quick_edit">${ico('bolt')} ${esc(t('quick_edit'))}</button>`,
        can('m_dashboard') && `<a href="#/dashboard/stats">${ico('chart')} ${esc(t('analytics'))}</a>`, `<a href="#/myday">${ico('sun')} ${esc(t('pg_myday'))}</a>`].filter(Boolean).join('')))}
    ${kpis}${quickBar()}<div class="dash"><div class="dash-col">${main}</div><div class="dash-col">${side}</div></div>`;
}

let stDays = 30;
// the three statistics tables, once: the screen and the Excel file show the same translated columns
// (absent and sick are separate columns, as in Attendance and pay)
const statsTables = j => {
  const pct = (a, b) => (b ? Math.round(100 * a / b) + '%' : '–');
  return [
    [t('activities_ranking'), [t('name'), t('type'), t('held'), t('cancelled'), t('bookings'), t('attended'), t('no_shows'), t('waiting_list'), t('rating'), t('favourites')],
      j.activities.map(a => [a.name, typeLabel(a.type), a.held, a.cancelled, a.booked, a.attended + ' (' + pct(a.attended, a.booked) + ')', a.no_show, a.waiting, a.rating ?? '–', a.favourites]), t('nothing_yet')],
    [t('staff'), [t('name'), t('assignments'), t('days_worked'), t('st_absent'), t('st_sick'), t('hours'), t('points')],
      j.staff.map(p => [p.name, p.assignments, p.worked, p.absent, p.sick ?? 0, p.hours, p.points]), t('no_staff')],
    [t('feedback_by_department'), [t('department'), t('total'), t('average')],
      j.feedback.map(f => [f.department ? deptName({ name: f.department, key: f.key, name_i18n: f.name_i18n }) : t('activity_rating'), f.n, f.avg]), t('no_feedback')]];
};
async function statsView() {
  const to = D.today(), from = D.add(to, -(stDays - 1));
  const j = await api('stats', { p_from: from, p_to: to }); statsCache = j;
  const sumOf = k => sum(j.activities, a => a[k]);
  return pgActions(`<button class="btn secondary" data-act="st_xlsx">${ico('download')} ${esc(t('excel'))}</button>`)
    + `<div class="chips">${[7, 30, 90].map(n => `<button class="chip-btn ${stDays === n ? 'on' : ''}" data-act="st_days" data-n="${n}">${esc(t('last_n_days', { n }))}</button>`).join('')}</div>
    <div class="stats">${kpi(t('stays'), j.guests)}${kpi(t('bookings'), sumOf('booked'))}${kpi(t('no_shows'), sumOf('no_show'), { tone: sumOf('no_show') ? 'warn' : '' })}
      ${kpi(t('waiting_list'), sumOf('waiting'))}${kpi(t('gk_complaint'), j.support.complaint || 0, { tone: j.support.complaint ? 'bad' : '' })}${kpi(t('song_requests'), j.songs)}</div>
    ${statsTables(j).map(([title, h, rows, none], n) => `<section>${secHead(title, ['trophy', 'users', 'star'][n])}${dataTable('st' + n, { rows, id: r => rows.indexOf(r), empty: none, size: 20,
      cols: h.map((label, i) => ({ k: 'c' + i, label, num: rows.some(r => typeof r[i] === 'number'), text: r => r[i] })) })}</section>`).join('')}`;
}
let statsCache = null;
ACT.st_days = el => { stDays = +el.dataset.n; route(); };
ACT.st_xlsx = () => exportXlsx('statistics-' + D.today(), Object.fromEntries(statsTables(statsCache).map(([title, h, rows]) => [title, rows.map(r => Object.fromEntries(h.map((k, i) => [k, r[i]])))])));

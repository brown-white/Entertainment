'use strict';
/* AUREA · pages/dashboard.js — Dashboard: what needs attention today, and statistics.
   Uses: core/state · translations/languages · supabase · core/utils · core/permissions · core/actions · components/cards · core/router ·
         components/tables · systems/exports · systems/feedback · systems/team-schedule · systems/program-engine */
/* ---------- Dashboard: attention center ---------- */
page('dashboard', {
  perm: 'm_dashboard', icon: 'gauge', group: 'manage',
  render: async arg => {
    const head = tabs('dashboard', [['today', t('today')], ['stats', t('statistics')]], arg === 'stats' ? 'stats' : 'today');
    if (arg === 'stats') return head + await statsView();
    const today = D.today(), tom = D.add(today, 1);
    const [b, reqs, gs, fb, tk, tasks, guests] = await Promise.all([
      board(today, tom), can('m_team') ? safe(list('staff_requests', { status: 'pending' })) : null,
      can('gs_history') ? safe(list('guest_support_records', { status: 'open', _limit: 300 })) : null,
      can('feedback_view') ? safe(list('guest_feedback', { status: 'new', _limit: 300 })) : null,
      // ticket money still due: only the sales and payments of the open packs (not the whole season's history)
      can('m_tickets') ? safe(list('ticket_packs', { status: 'open' }).then(async ps => ({ ps, sales: ps.length ? await list('tickets', { status: 'sold', pack_id: ps.map(x => x.id), _limit: 5000 }) : [], pays: ps.length ? await list('ticket_payments', { pack_id: ps.map(x => x.id), _limit: 5000 }) : [] }))) : null,
      can('m_team') ? safe(list('tasks', { status: ['open', 'accepted'] })) : null,
      can('guests_view') || can('m_guests') ? safe(api('staff_guests')) : null]);
    const att = [];
    const live = b.items.filter(i => i.status === 'scheduled');
    live.filter(i => i.staff.length < i.staff_needed).forEach(i => att.push(['warn', t('att_needs_staff', { name: itemName(i), have: i.staff.length, need: i.staff_needed, day: D.short(i.date) + ' ' + hm(i.start_time) }), 'planner']));
    live.forEach(i => i.staff.forEach(s => { const st = statusOf(b, s.staff_id, i.date); if (st && st.status !== 'working') att.push(['bad', t('att_assigned_off', { name: s.name, item: itemName(i), status: statusLabel(st.status), day: D.short(i.date) }), 'planner']); }));
    const usesEntrance = b.pattern.some(p => p.entrance);
    if (usesEntrance && !b.status.some(s => s.date === today && s.entrance)) att.push(['warn', t('att_no_entrance'), 'dayplan']);
    if (reqs?.length) att.push(['info', t('att_requests', { n: reqs.length }), 'requests']);
    const comp = (gs || []).filter(x => x.kind === 'complaint');
    if (comp.length) att.push(['bad', t('att_complaints', { n: comp.length }), 'gsupport/history']);
    const lowIds = new Set(fb?.length ? (await safe(ratingsOf(fb.map(x => x.id))) || []).filter(r => r.rating <= 2).map(r => r.feedback_id) : []);
    const low = (fb || []).filter(x => lowIds.has(x.id));
    if (low.length) att.push(['bad', t('att_low_feedback', { n: low.length }), 'feedback']);
    else if (fb?.length) att.push(['info', t('att_feedback', { n: fb.length }), 'feedback']);
    if (tk) { const due = sum(tk.sales, s => s.price) - sum(tk.pays, x => x.amount); if (due > 0) att.push(['info', t('att_ticket_money', { total: money(due) }), 'ticketsadmin/sellers']); }
    if (can('m_backup') && (!S.settings.last_backup_at || D.diff(String(S.settings.last_backup_at).slice(0, 10), today) > 7)) att.push(['warn', t('att_backup'), 'backup/export']);
    const late = (tasks || []).filter(x => x.due_date && x.due_date < today);
    if (late.length) att.push(['warn', t('att_tasks_late', { n: late.length }), 'tasks']);
    const work = b.status.filter(s => s.date === today && s.status === 'working').length;
    const off = b.status.filter(s => s.date === today && s.status !== 'working').length;
    const todayItems = live.filter(i => i.date === today);
    const arriving = (guests?.stays || []).filter(g => g.arrival === today).length;
    const inHouse = (guests?.stays || []).filter(g => g.arrival <= today).length;
    return head + `<div class="stats"><span><b>${work}</b>${esc(t('working_today'))}</span><span><b>${off}</b>${esc(t('not_working_today'))}</span><span><b>${todayItems.length}</b>${esc(t('items_today'))}</span>
      ${guests ? `<span><b>${inHouse}</b>${esc(t('guests_in_house'))}</span><span><b>${arriving}</b>${esc(t('arriving_today'))}</span>` : ''}<span><b>${sum(todayItems, i => i.booked)}</b>${esc(t('bookings_today'))}</span></div>
      <section><h2>${esc(t('needs_attention'))} ${att.length ? `<small class="muted">(${att.length})</small>` : ''}</h2>${att.length ? `<div class="list attention">${att.sort((x, y) => ['bad', 'warn', 'info'].indexOf(x[0]) - ['bad', 'warn', 'info'].indexOf(y[0])).slice(0, 12).map(([k, txt, go]) => `<a class="li ${k}" href="#/${go}">${esc(txt)}</a>`).join('')}${att.length > 12 ? `<a class="li" href="#/planner">+ ${att.length - 12}</a>` : ''}</div>` : empty(t('all_good'))}</section>
      <section><h2>${esc(t('today'))} · ${esc(D.long(today))}</h2>${todayItems.length ? `<div class="items">${todayItems.map(i => itemRow(i, 'item')).join('')}</div>` : empty(t('no_items_day'))}</section>`;
  }
});

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
  return `<div class="chips">${[7, 30, 90].map(n => `<button class="chip-btn ${stDays === n ? 'on' : ''}" data-act="st_days" data-n="${n}">${esc(t('last_n_days', { n }))}</button>`).join('')}<span class="grow"></span><button class="btn ghost small" data-act="st_xlsx">${esc(t('excel'))}</button></div>
    <div class="stats"><span><b>${j.guests}</b>${esc(t('stays'))}</span><span><b>${sum(j.activities, a => a.booked)}</b>${esc(t('bookings'))}</span><span><b>${sum(j.activities, a => a.no_show)}</b>${esc(t('no_shows'))}</span>
      <span><b>${sum(j.activities, a => a.waiting)}</b>${esc(t('waiting_list'))}</span><span><b>${(j.support.complaint || 0)}</b>${esc(t('gk_complaint'))}</span><span><b>${j.songs}</b>${esc(t('song_requests'))}</span></div>
    ${statsTables(j).map(([title, h, rows, none]) => `<section><h2>${esc(title)}</h2>${rows.length ? `<div class="tablewrap">${tableHtml(h, rows)}</div>` : empty(none)}</section>`).join('')}`;
}
let statsCache = null;
ACT.st_days = el => { stDays = +el.dataset.n; route(); };
ACT.st_xlsx = () => exportXlsx('statistics-' + D.today(), Object.fromEntries(statsTables(statsCache).map(([title, h, rows]) => [title, rows.map(r => Object.fromEntries(h.map((k, i) => [k, r[i]])))])));

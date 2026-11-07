'use strict';
/* Mr Hassan · systems/operations.js — the operations parts every screen shares (written once, used by My Day, the Dashboard, Tasks and
   Guest requests): THE task (its row with the right buttons for the one looking, its form for one person, a role or the whole team),
   ONE reminder system (about anything or nothing), and ONE "needs attention" list – the board's own checks and the database's
   missing-information alerts together, each said once, put aside while its problem is unchanged.
   Uses: core/state · translations/languages · supabase · core/utils · icons/icons · core/permissions · components/modals · core/actions ·
         components/cards · core/router · components/forms · systems/feedback · systems/team-schedule · systems/ticket-system */
const TASK_CATS = ['task', 'meeting', 'staff_meeting', 'mgmt_meeting', 'supplier_followup', 'supplier_confirm', 'show_check', 'event_check', 'event_prep', 'entrance_check',
  'attendance_fix', 'programme_change', 'deadline', 'guest_contact', 'music', 'setup', 'photos', 'missing_info'];
const PRIOS = ['low', 'normal', 'high', 'urgent'];
const REQ_TYPES = ['birthday', 'anniversary', 'proposal', 'honeymoon', 'celebration', 'custom'];
const REQ_WANTS = ['cake', 'music', 'song', 'decoration', 'table', 'balloons', 'photos', 'entrance', 'custom'];
const REQ_PLACES = ['beach', 'restaurant', 'pool', 'lobby', 'room'];
const placeLabel = p => (REQ_PLACES.includes(p) ? t('place_' + p) : p || '');
const prioChip = p => (p === 'urgent' || p === 'high' ? chip(t('prio_' + p), p === 'urgent' ? 'bad' : 'warn') : '');
const roleOf = key => (S.roles || []).find(r => r.key === key);
// what a GUEST sees of their request's step (Submitted · Under review · Confirmed / Accepted · Completed / Played · Unable to fulfil)
const gStep = s => chip(t('gstep_' + s), ['played', 'confirmed', 'completed', 'accepted'].includes(s) ? 'ok' : s === 'unable' ? 'bad' : '');

/* ---------- THE TASK ---------- */
// for whom: one person, everyone of a role, or the whole team
const taskWho = x => x.assigned_name || (x.role_name ? t('tk_role_x', { role: x.role_name }) : t('whole_team'));
const taskWhen = x => [x.due_date ? D.short(x.due_date) : '', x.start_time ? hm(x.start_time) : '', x.deadline_time ? t('tk_until', { time: hm(x.deadline_time) }) : ''].filter(Boolean).join(' · ');
// what the task is for (a guest's celebration, a programme date, a song)
const taskFor = x => [x.request ? `${t('rq_' + x.request.type)} · ${t('room')} ${x.request.room || '—'}` : '', x.item ? itemName(x.item) : '', x.song ? '♪ ' + x.song.title : ''].filter(Boolean).join(' · ');
// mine: the steps I may take (accept → in progress → done); manage: check, send back, change
function taskLi(x, mode) {
  const mine = mode === 'mine', st = x.late ? chip(t('tk_late'), 'bad') : chip(t('ts_' + x.status), x.status === 'done' || x.status === 'checked' ? 'ok' : x.status === 'cancelled' ? '' : x.status === 'in_progress' ? 'warn' : '');
  const btn = (s, label, cls = 'small') => `<button class="btn ${cls}" data-act="tk_set" data-id="${x.id}" data-s="${s}">${esc(label)}</button>`;
  const acts = mine ? (x.status === 'open' ? btn('accepted', t('accept')) : '') + (x.status === 'accepted' ? btn('in_progress', t('ts_in_progress')) : '')
      + (['open', 'accepted', 'in_progress'].includes(x.status) ? `<button class="btn secondary small" data-act="tk_done" data-id="${x.id}">${esc(t('mark_done'))}</button>` : '')
    : (x.status === 'done' ? btn('checked', t('check_ok')) + btn('open', t('send_back'), 'secondary small') : '') + `<button class="btn secondary small" data-act="tk_edit" data-id="${x.id}">${esc(t('edit'))}</button>`;
  return `<div class="li task ${x.status} ${x.late ? 'late' : ''}" data-task="${x.id}"><div class="row"><b class="grow">${esc(x.title)}</b>${prioChip(x.priority)}${st}</div>
    <small class="muted">${esc([x.category !== 'task' ? t('tc_' + x.category) : '', taskWhen(x), placeLabel(x.location), mine ? '' : taskWho(x)].filter(Boolean).join(' · '))}</small>
    ${taskFor(x) ? `<small class="task-for">${ico('link')} ${esc(taskFor(x))}</small>` : ''}
    ${x.details ? `<p>${nl2br(x.details)}</p>` : ''}${x.internal_note && !mine ? `<p class="muted small">${ico('lock')} ${esc(x.internal_note)}</p>` : ''}
    ${x.staff_note ? `<p class="reply">${esc(x.staff_note)}</p>` : ''}${x.photo_url ? `<img class="thumb" src="${esc(x.photo_url)}" alt="" data-act="lightbox">` : ''}
    ${x.done_at && !mine ? `<small class="muted">${esc(t('tk_done_by', { name: x.done_name || '—', at: D.stamp(x.done_at) }))}</small>` : ''}
    ${acts ? `<div class="actions">${acts}</div>` : ''}</div>`;
}
async function tasksOf(scope, from, to, all) { return (await api('tasks_list', { p_scope: scope, p_from: from || null, p_to: to || null, p_all: !!all })).tasks; }
// THE task form: one person, a role (everyone of it in the team sees it until one takes it) or the whole team; what it is for comes
// from where it was made (a guest request, a song, a programme date)
async function taskForm(x, preset = {}) {
  const team = (await api('team_members')).staff, mgr = can('task_assign');
  const who = [['', t('whole_team')]].concat(mgr ? S.roles.filter(r => !r.is_manager).map(r => ['r' + r.id, t('tk_role_x', { role: r.name })]) : [],
    (mgr ? team : team.filter(p => p.id === meId())).map(p => ['s' + p.id, p.display_name + (p.role_name ? ' · ' + p.role_name : '')]));
  if (!who.some(w => w[0] === 's' + meId())) who.push(['s' + meId(), (S.me?.display_name || '') + ' · ' + t('tk_me')]);
  const f = [{ k: 'title', label: t('title'), req: true }, { k: 'category', type: 'select', label: t('category'), options: TASK_CATS.map(c => [c, t('tc_' + c)]) },
    { k: 'who', type: 'select', label: t('assigned_to'), options: who, hint: t('tk_who_hint') },
    { k: 'priority', type: 'select', label: t('priority'), options: PRIOS.map(p => [p, t('prio_' + p)]) },
    { k: 'due_date', type: 'date', label: t('date') }, { k: 'start_time', type: 'time', label: t('start') }, { k: 'deadline_time', type: 'time', label: t('tk_deadline') },
    { k: 'location', label: t('location') }, { k: 'details', type: 'textarea', rows: 3, label: t('tk_instructions') },
    mgr && { k: 'internal_note', type: 'textarea', rows: 2, label: t('internal_note'), hint: t('internal_note_hint') },
    { k: 'points', type: 'number', label: t('points'), min: 0, def: 1 }, { k: 'repeat', type: 'select', label: t('repeat'), options: ['none', 'daily', 'weekly'].map(r => [r, t('rp_' + r)]), hint: t('repeat_hint') },
    !x.id && can('reminders') && { type: 'section', label: t('reminder'), hint: t('tk_remind_hint') },
    !x.id && can('reminders') && { k: 'remind_date', type: 'date', label: t('date') }, !x.id && can('reminders') && { k: 'remind_time', type: 'time', label: t('time') }].filter(Boolean);
  const row = Object.assign({ category: 'task', priority: 'normal', repeat: 'none', points: 1, due_date: D.today() }, x, preset);
  row.who = row.assigned_staff_id ? 's' + row.assigned_staff_id : row.assigned_role_id ? 'r' + row.assigned_role_id : row.who || '';
  if (row.location && REQ_PLACES.includes(row.location)) row.location = placeLabel(row.location);
  editForm(x.id ? t('edit') : t('new_task'), f, row, async r => {
    const w = r.who || ''; delete r.who;
    const p = Object.assign({}, r, { id: x.id || null, assigned_staff_id: w[0] === 's' ? +w.slice(1) : null, assigned_role_id: w[0] === 'r' ? +w.slice(1) : null,
      request_id: row.request_id || null, item_id: row.item_id || null, song_id: row.song_id || null });
    for (const k of ['due_date', 'start_time', 'deadline_time', 'remind_date', 'remind_time']) p[k] = p[k] || null;
    await api('task_save', { p_row: p }); toast(t('saved')); route();
  }, x.id && can('task_create,task_assign') ? { danger: async () => { await del('tasks', x.id); route(); } } : {});
}
ACT.tk_new = el => taskForm({}, el?.dataset?.preset ? JSON.parse(el.dataset.preset) : {});
// (read again first: a task deleted on another phone is said so – never saved again as a new one)
ACT.tk_edit = async el => { const [x] = await list('tasks', { id: +el.dataset.id }); if (!x) return editForm(t('edit'), [], undefined); taskForm(x); };
ACT.tk_set = async el => { await api('task_status', { p_id: +el.dataset.id, p_status: el.dataset.s }); route(); };
ACT.tk_done = el => editForm(t('mark_done'), [{ k: 'staff_note', type: 'textarea', label: t('note'), rows: 3 }, { k: 'photo_url', type: 'image', label: t('photo') }], {},
  async r => { await api('task_status', { p_id: +el.dataset.id, p_status: 'done', p_note: r.staff_note || null, p_photo: r.photo_url || null }); route(); });

/* ---------- ONE reminder system ---------- */
const REM_LINK_GO = { staff: () => 'staffadmin', supplier: id => 'attendance/suppliers/' + id, supplier_item: () => 'attendance/suppliers', performance: () => 'attendance/suppliers',
  attendance: () => 'attendance/today', program_item: () => 'program', request: id => 'guestreq/r' + id, song: () => 'guestreq/songs', task: () => 'tasks', ticket: () => 'ticketsadmin' };
const remChip = r => chip(t('rs_' + r.state), r.state === 'overdue' ? 'bad' : r.state === 'due' ? 'warn' : r.state === 'completed' ? 'ok' : '');
let remCache = [];
function remLi(r) {
  const go = r.link_type && REM_LINK_GO[r.link_type] ? REM_LINK_GO[r.link_type](r.link_id) : null, open = r.status === 'open';
  return `<div class="li rem ${r.state}"><div class="row">${ico('bell')}<b class="grow">${esc(r.title)}</b>${prioChip(r.priority)}${remChip(r)}</div>
    <small class="muted">${esc([D.short(r.date) + ' ' + r.time, r.repeat !== 'none' ? t('rp_' + r.repeat) : '', r.assigned_to !== meId() ? r.assigned_name : ''].filter(Boolean).join(' · '))}</small>
    ${r.link_label ? `<small class="task-for">${ico('link')} ${go ? `<a href="#/${esc(go)}">${esc(r.link_label)}</a>` : esc(r.link_label)}</small>` : ''}${r.details ? `<p>${nl2br(r.details)}</p>` : ''}
    <div class="actions">${open ? `<button class="btn small" data-act="rem_set" data-id="${r.id}" data-a="done">${ico('check')} ${esc(t('done'))}</button><button class="btn secondary small" data-act="rem_set" data-id="${r.id}" data-a="snooze">${esc(t('rem_later'))}</button><button class="btn secondary small" data-act="rem_set" data-id="${r.id}" data-a="dismiss">${esc(t('dismiss'))}</button>`
      : `<button class="btn secondary small" data-act="rem_set" data-id="${r.id}" data-a="reopen">${esc(t('reopen'))}</button>`}<button class="icon-btn" data-act="rem_edit" data-id="${r.id}" aria-label="${esc(t('edit'))}">${ico('edit')}</button></div></div>`;
}
async function remindersOf(scope, type, id) { const rows = (await api('reminders_list', { p_scope: scope, p_link_type: type || null, p_link_id: id || null })).reminders; remCache = remCache.filter(x => !rows.some(y => y.id === x.id)).concat(rows); return rows; }
// a reminder: about something (link) or nothing; for me or – with "Assign tasks" – for someone of the team
async function remForm(r, link = {}) {
  const team = can('task_assign') ? (await api('team_members')).staff : [];
  const f = [{ k: 'title', label: t('title'), req: true }, { k: 'date', type: 'date', label: t('date'), req: true }, { k: 'time', type: 'time', label: t('time') },
    { k: 'priority', type: 'select', label: t('priority'), options: PRIOS.map(p => [p, t('prio_' + p)]) },
    { k: 'repeat', type: 'select', label: t('repeat'), options: ['none', 'daily', 'weekly', 'monthly'].map(x => [x, t('rp_' + x)]) },
    team.length && { k: 'assigned_to', type: 'select', num: true, label: t('assigned_to'), options: [[meId(), t('tk_me')]].concat(team.filter(p => p.id !== meId()).map(p => [p.id, p.display_name])) },
    { k: 'details', type: 'textarea', rows: 2, label: t('details') }].filter(Boolean);
  const row = Object.assign({ date: D.add(D.today(), 1), time: '10:00', priority: 'normal', repeat: 'none', assigned_to: meId() }, r, link);
  editForm(r.id ? t('edit') : t('rem_new'), f, row, async v => {
    await api('reminder_save', { p_row: Object.assign({ id: r.id || null, link_type: row.link_type || null, link_id: row.link_id || null, link_label: row.link_label || null }, v, { time: v.time || null }) });
    toast(t('saved')); route();
  }, r.id ? { danger: async () => { await api('reminder_set', { p_id: r.id, p_action: 'delete' }); route(); } } : {});
}
ACT.rem_new = el => remForm({}, el?.dataset?.link ? JSON.parse(el.dataset.link) : {});
ACT.rem_edit = el => remForm(remCache.find(x => x.id === +el.dataset.id) || {});
ACT.rem_set = async el => { await api('reminder_set', { p_id: +el.dataset.id, p_action: el.dataset.a, p_minutes: el.dataset.a === 'snooze' ? 60 : null }); route(); };
const remSection = (rows, link) => `<section class="ops-rem"><div class="row"><h2 class="grow">${ico('bell')} ${esc(t('reminders'))}</h2>${can('reminders') ? `<button class="btn secondary small" data-act="rem_new" ${link ? `data-link="${esc(JSON.stringify(link))}"` : ''}>${ico('plus')} ${esc(t('rem_new'))}</button>` : ''}</div>
  ${rows.length ? `<div class="list">${rows.map(remLi).join('')}</div>` : `<p class="muted">${esc(t('rem_none'))}</p>`}</section>`;

/* ---------- ONE "needs attention" list ---------- */
// the database's missing-information alerts: where each one leads
const ALERT_GO = { clock_out: () => 'attendance/today', sup_unmarked: d => 'attendance/suppliers/' + d.supplier_id, req_no_dj: d => 'guestreq/r' + d.id, sup_no_price: d => 'attendance/suppliers/' + d.supplier_id,
  no_location: () => 'program', req_new: () => 'guestreq', song_new: () => 'guestreq/songs', task_late: () => 'tasks/team' };
const alertText = a => { const d = a.data || {};
  return t('al_' + a.kind, Object.assign({}, d, { date: d.date ? D.short(d.date) : '', first: d.first ? D.short(d.first) : '', due_date: d.due_date ? D.short(d.due_date) : '',
    type: d.type ? t('rq_' + d.type) : '', who: d.name || d.role || t('whole_team'), items: (d.items || []).join(', ') })); };
// everything that needs someone now, from ONE place: the team's board (staffing, days off, entrance), the open records, and the database's
// alerts (each once, as long as its problem is there – put aside with "Seen" until it changes)
async function attentionList(b) {
  const today = D.today(), att = [];
  const [reqs, gs, fb, tk, al, inv] = await Promise.all([
    can('m_team') ? safe(list('staff_requests', { status: 'pending' })) : null,
    can('gs_history') ? safe(list('guest_support_records', { status: 'open', kind: 'complaint', _limit: 300 })) : null,
    can('feedback_view') ? safe(list('guest_feedback', { status: 'new', _limit: 300 })) : null,
    // ticket money still due: only the sales and payments of the open packs (not the whole season's history)
    can('m_tickets') ? safe(list('ticket_packs', { status: 'open' }).then(async ps => ({ ps, sales: ps.length ? await list('tickets', { status: ['sold', 'refunded'], pack_id: ps.map(x => x.id), _limit: 5000 }) : [], pays: ps.length ? await list('ticket_payments', { pack_id: ps.map(x => x.id), _limit: 5000 }) : [] }))) : null,
    can('alerts_manage') ? safe(api('ops_alerts')) : null,
    // (11.0) tickets running out: the next three days' events
    can('m_tickets,tickets_view') ? safe(api('ticket_report', { p_filter: { from: today, to: D.add(today, 3) } })) : null]);
  if (b) {
    const live = b.items.filter(i => i.status === 'scheduled');
    live.filter(i => i.staff.length < i.staff_needed).forEach(i => att.push({ level: 'warn', text: t('att_needs_staff', { name: itemName(i), have: i.staff.length, need: i.staff_needed, day: D.short(i.date) + ' ' + hm(i.start_time) }), go: 'planner' }));
    live.forEach(i => i.staff.forEach(s => { const st = statusOf(b, s.staff_id, i.date); if (st && st.status !== 'working') att.push({ level: 'bad', text: t('att_assigned_off', { name: s.name, item: itemName(i), status: statusLabel(st.status), day: D.short(i.date) }), go: 'planner' }); }));
    if (b.pattern.some(p => p.entrance) && !b.status.some(s => s.date === today && s.entrance)) att.push({ level: 'warn', text: t('att_no_entrance'), go: 'dayplan' });
  }
  if (reqs?.length) att.push({ level: 'info', text: t('att_requests', { n: reqs.length }), go: 'requests' });
  if (gs?.length) att.push({ level: 'bad', text: t('att_complaints', { n: gs.length }), go: 'gsupport/history' });
  const lowIds = new Set(fb?.length ? (await safe(ratingsOf(fb.map(x => x.id))) || []).filter(r => r.rating <= 2).map(r => r.feedback_id) : []);
  const low = (fb || []).filter(x => lowIds.has(x.id));
  if (low.length) att.push({ level: 'bad', text: t('att_low_feedback', { n: low.length }), go: 'feedback' });
  else if (fb?.length) att.push({ level: 'info', text: t('att_feedback', { n: fb.length }), go: 'feedback' });
  // (per currency: the cash and other payments the sellers still hold – never one sum of several currencies)
  if (tk) { const due = tkMoney(tk.sales, tk.pays).due, pos = Object.fromEntries(Object.entries(due).filter(([, v]) => v > 0));
    if (Object.keys(pos).length) att.push({ level: 'info', text: t('att_ticket_money', { total: moneyBy(pos) }), go: 'ticketsadmin/sellers' }); }
  (inv?.batches || []).filter(x => x.active !== false && x.counts?.total && (!x.item || x.item.status === 'scheduled')).forEach(x => {
    const left = (x.counts.available || 0) + (x.counts.assigned || 0), name = x.item ? itemName(x.item) : x.type_name, day = x.item ? D.short(x.item.date) : '';
    if (left === 0) att.push({ level: 'info', text: t('att_tk_sold_out', { name, day }), go: 'ticketsadmin/b' + x.id });
    else if (left <= Math.max(3, Math.ceil(x.counts.total * 0.1))) att.push({ level: 'warn', text: t('att_tk_low', { name, day, n: left }), go: 'ticketsadmin/b' + x.id });
  });
  if (can('m_backup') && (!S.settings.last_backup_at || D.diff(String(S.settings.last_backup_at).slice(0, 10), today) > 7)) att.push({ level: 'warn', text: t('att_backup'), go: 'backup/export' });
  (al?.alerts || []).forEach(a => att.push({ level: a.level, text: alertText(a), go: ALERT_GO[a.kind] ? ALERT_GO[a.kind](a.data || {}) : null, key: a.key, fp: a.fp }));
  att.hidden = al?.hidden || 0;
  return att.sort((x, y) => ['bad', 'warn', 'info'].indexOf(x.level) - ['bad', 'warn', 'info'].indexOf(y.level));
}
// the ONE Action required list: Urgent / Attention / Information (icon, colour and name), each line opens where it is fixed
const ATT_LVL = { bad: ['urgent', 'lv_urgent'], warn: ['alert', 'lv_attention'], info: ['info', 'lv_info'] };
const attLi = a => { const [ic, lk] = ATT_LVL[a.level] || ATT_LVL.info;
  return `<div class="li ${a.level}"><span class="lvl" title="${esc(t(lk))}">${ico(ic)}<span class="sr-only">${esc(t(lk))}</span></span>${a.go ? `<a href="#/${esc(a.go)}">${esc(a.text)}</a>` : `<span class="grow">${esc(a.text)}</span>`}${a.key ? `<button class="btn ghost small" data-act="al_ack" data-k="${esc(a.key)}" data-fp="${esc(a.fp)}" title="${esc(t('al_ack_hint'))}">${ico('check')} ${esc(t('al_ack'))}</button>` : ''}</div>`; };
const attentionHtml = (att, max = 6) => (att.length ? `<div class="attn attention">${att.slice(0, max).map(attLi).join('')}${att.length > max ? `<details class="attn-more"><summary class="li">${esc(t('show_all_n', { n: att.length }))}</summary>${att.slice(max).map(attLi).join('')}</details>` : ''}</div>` : empty(t('all_good'), '', 'ok'))
  + (att.hidden ? `<p class="muted small">${esc(t('al_hidden_n', { n: att.hidden }))} <button class="btn secondary small" data-act="al_unhide">${esc(t('al_show_all'))}</button></p>` : '');
ACT.al_ack = async el => { await api('ops_alert_ack', { p_key: el.dataset.k, p_fp: el.dataset.fp }); route(); };
ACT.al_unhide = async () => { await api('ops_alert_ack', { p_key: '*', p_fp: '' }); route(); };

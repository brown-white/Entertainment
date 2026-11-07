'use strict';
/* Mr Hassan · pages/my-day.js — staff pages: My day (now and next, my day by the clock, today at a glance, clock in / out, what I work with),
   the quick actions (pinned pages) and My schedule (the next 14 days).
   Uses: core/state · translations/languages · supabase · core/utils · icons/icons · core/permissions · components/modals · core/actions ·
         components/cards · components/theme · core/router · systems/notifications · systems/team-schedule · systems/attendance ·
         systems/games · systems/program-engine · systems/operations */
/* ---------- My day: the person's own day – now and next, my work by the clock, my tasks, the hotel's day; what the person works with
   (Role + Permissions, never the role's name): the DJ's song requests, Guest Contact's requests, the games of my assignments, ticket
   selling – each as a section or a quick action. The manager's Control Center is the Dashboard (pages/dashboard.js). ---------- */
page('myday', {
  perm: 'myday', icon: 'sun', group: 'operations',
  sub: () => D.long(D.today()),
  render: async () => {
    const today = D.today(), tom = D.add(today, 1), me = meId();
    const [b, ann, notes, tasks, quiz, att, songs, reqs] = await Promise.all([
      board(D.add(today, -1), tom), safe(list('announcements', { _limit: 6 })), S.preview ? null : pollStaff().then(() => S.inbox.notifications.slice(0, 5)),
      can('tasks,task_create,task_assign') ? safe(tasksOf('mine', D.add(today, -14), tom)) : null,
      can('quiz') ? safe(list('quizzes', { audience: 'staff', quiz_date: today, active: true })) : null,
      can('clock_in') && !S.preview ? safe(api('my_attendance')) : null,
      can('song_requests,song_update') ? safe(api('requests_list', { p_kind: 'songs', p_from: today, p_to: today })) : null,
      can('req_view,req_manage') ? safe(api('requests_list', { p_kind: 'events', p_from: today, p_to: D.add(today, 7) })) : null]);
    const myS = statusOf(b, me, today), plan = b.plans.find(p => p.date === today) || {};
    const mine = d => b.items.filter(i => i.date === d && i.staff.some(s => s.staff_id === me)).sort((x, y) => (x.start_time || '').localeCompare(y.start_time || ''));
    const myTasks = (tasks || []).filter(x => ['open', 'accepted', 'in_progress'].includes(x.status));
    const myGames = mine(today).filter(i => i.game_type);                     // (10.5) the games of my assignments: Start game right here
    // my day by the clock: my assignments and my tasks with a time; now = the last one that started
    const tl = timelineNow([].concat(mine(today).filter(i => i.status === 'scheduled').map(i => ({ at: hm(i.start_time), title: itemName(i), sub: [i.end_time ? hm(i.start_time) + '–' + hm(i.end_time) : '', i.location].filter(Boolean).join(' · '), href: 'item/' + i.id, tc: `var(--t-${i.type})` })),
      myTasks.filter(x => (x.start_time || x.deadline_time) && (!x.due_date || x.due_date <= today)).map(x => ({ at: hm(x.start_time || x.deadline_time), icon: 'tasks', title: x.title, sub: t('tc_' + x.category), href: 'tasks', cls: x.late ? 'late' : '' })))
      .sort((x, y) => (x.at || '99').localeCompare(y.at || '99')));
    const at = tl.findIndex(x => (x.cls || '').includes('now')), now = tl[at], next = tl.slice(at + 1).find(x => x.at);
    const newSongs = (songs?.songs || []).filter(x => ['new', 'review'].includes(x.status));
    const openReqs = (reqs?.events || []).filter(r => ['open', 'review', 'clarify', 'approved'].includes(r.status));
    const nn = (cls, label, x, none) => `<div class="${x ? cls : ''}"><small>${esc(label)}</small>${x ? `<b><a href="#/${esc(x.href)}">${esc(x.title)}</a></b><span><time>${esc(x.at || '')}</time>${x.sub ? ' · ' + esc(x.sub) : ''}</span>` : `<b class="muted">${esc(none)}</b>`}</div>`;
    const work = `<section>${secHead(t('my_work_today'), 'clock', '', tl.length)}${tl.length ? `<div class="card">${timelineHtml(tl)}</div>` : empty(t('no_assignments'), can('programme_view') ? `<a class="btn secondary small" href="#/programme">${esc(t('pg_programme'))}</a>` : '', 'sun')}</section>`;
    const side = [
      glanceCard(b, today, myS, plan),
      myTasks.length ? `<section>${secHead(t('tk_mine'), 'tasks', `<a class="btn ghost small" href="#/tasks">${esc(t('see_all'))}</a>`, myTasks.length)}<div class="list">${myTasks.slice(0, 5).map(x => taskLi(x, 'mine')).join('')}</div></section>` : '',
      songs ? `<section>${secHead(t('song_requests'), 'music', `<a class="btn ghost small" href="#/guestreq/songs">${esc(t('see_all'))}</a>`, newSongs.length)}${newSongs.length ? `<div class="list flat">${newSongs.slice(0, 5).map(x => `<a class="li" href="#/guestreq/songs"><b>${esc(x.song || x.title || '')}</b> <small class="muted">${esc(x.room ? t('room') + ' ' + x.room : '')}</small></a>`).join('')}</div>` : `<p class="muted small">${esc(t('ops_songs_new', { n: 0 }))}</p>`}</section>` : '',
      reqs ? `<section>${secHead(t('guest_requests'), 'gift', `<a class="btn ghost small" href="#/guestreq">${esc(t('see_all'))}</a>`, openReqs.length)}${openReqs.length ? `<div class="list flat">${openReqs.slice(0, 5).map(r => `<a class="li" href="#/guestreq/r${r.id}"><b>${esc(t('rq_' + r.req_type))}</b> <small class="muted">${esc(D.short(r.req_date))}${r.req_time ? ' ' + esc(hm(r.req_time)) : ''} · ${esc(t('room'))} ${esc(r.room || '—')}</small> ${chip(t('grs_' + r.status), r.status === 'open' || r.status === 'clarify' ? 'warn' : r.status === 'approved' ? 'ok' : '')}</a>`).join('')}</div>` : `<p class="muted small">${esc(t('gr_none'))}</p>`}</section>` : '',
      (ann || []).length ? `<section>${secHead(t('announcements'), 'pin')}<div class="list">${ann.map(a => `<div class="li">${a.pinned ? ico('pin') + ' ' : ''}<b>${esc(a.title)}</b><p>${nl2br(a.body || '')}</p><small class="muted">${esc(D.stamp(a.created_at))}</small></div>`).join('')}</div></section>` : '',
      (notes || []).length ? `<section>${secHead(t('notifications'), 'bell')}<div class="list">${notes.map(a => { const v = notifView(a); return `<div class="li"><b>${esc(v.title)}</b><p>${nl2br(v.body)}</p></div>`; }).join('')}</div></section>` : '',
      (quiz || []).length ? `<section class="card">${secHead(t('quiz_of_day'), 'help')}<p>${esc(quiz[0].question)}</p><a class="btn small" href="#/quiz">${esc(t('answer'))}</a></section>` : ''].join('');
    return `<p class="hello">${esc(t('hello_name', { name: (S.preview ? S.preview.me : S.me).display_name }))}</p>
      ${clockCard(att)}
      <section class="now-next">${nn('now', t('now'), now, t('nothing_now'))}${nn('next', t('next_up'), next, t('nothing_more_today'))}</section>
      ${quickBar()}
      <div class="dash"><div class="dash-col">${work}
        ${myGames.length ? `<section class="my-games">${secHead(t('my_games_today'), 'trophy')}${myGames.map(gameItemCard).join('')}</section>` : ''}
        ${b.standards.length ? `<section>${secHead(t('daily_standards'), 'list')}<div class="card">${timelineHtml(b.standards.map(x => ({ at: hm(x.time), title: tx(x.label_i18n, x.label) })))}</div></section>` : ''}
        <section>${secHead(t('tomorrow') + ' · ' + D.short(tom), 'calendar')}${(() => { const s2 = statusOf(b, me, tom); const m2 = mine(tom); return (s2 && s2.status !== 'working' ? `<p>${stChip(s2)}</p>` : '') + (m2.length ? `<div class="items">${m2.map(i => itemRow(i, 'item')).join('')}</div>` : empty(t('no_assignments'), '', 'calendar')); })()}</section></div>
        <div class="dash-col">${side}</div></div>`;
  }
});
/* ---------- quick actions: the person's pinned pages (Customize), else the usual ones of what they may use ---------- */
const QUICK_DEFAULT = ['tickets', 'gsupport', 'guestreq', 'games', 'tasks', 'attendance', 'programme', 'guests', 'feedback'];
function quickBar(edit = true) {
  const m = menuFor(roleKey()), favs = myPrefs().favs;
  const picks = (favs && favs.length ? favs.map(k => m.find(x => x.key === k)) : QUICK_DEFAULT.map(k => m.find(x => x.key === k))).filter(x => x && x.key !== current.key).slice(0, 8);
  if (!picks.length && !edit) return '';
  return `<section class="quick" aria-label="${esc(t('quick_actions'))}">${picks.map(x => `<a href="#/${esc(x.key)}">${ico(x.icon || 'chev')}<span>${esc(x.label)}</span></a>`).join('')}
    ${edit && !S.preview ? `<button class="btn ghost small" data-act="quick_edit">${ico('edit')} ${esc(t('quick_edit'))}</button>` : ''}</section>`;
}
ACT.quick_edit = () => {
  const m = menuFor(roleKey()).filter(x => !['dashboard', 'myday', 'profile'].includes(x.key)), favs = myPrefs().favs || [];
  modal(t('quick_edit'), `<p class="muted small">${esc(t('quick_edit_hint'))}</p><div class="fav-pick">${m.map(x => `<label class="pickchip"><input type="checkbox" value="${esc(x.key)}" ${favs.includes(x.key) ? 'checked' : ''}> ${ico(x.icon || 'chev')} ${esc(x.label)}</label>`).join('')}</div>`, {
    cancel: true, save: async root => {
      const pick = $$('input:checked', root).map(i => i.value).slice(0, 12), prefs = Object.assign({}, myPrefs(), { favs: pick });
      await api('staff_profile_save', { p_row: { ui_prefs: prefs } }); S.me.ui_prefs = prefs; toast(t('saved')); route();
    } });
};

/* Today at a glance: the hotel's day + what happens today + who is where (every staff member sees it) */
function glanceCard(b, d, myS, plan) {
  const di = dayOf(b.days, d), its = b.items.filter(i => i.date === d && i.status === 'scheduled');
  const of = ty => its.filter(i => i.type === ty).map(i => hm(i.start_time) + ' ' + itemName(i)).join(' · ');
  const who = (f, extra = () => '') => b.status.filter(x => x.date === d && f(x)).map(x => { const n = b.staff.find(p => p.id === x.staff_id)?.display_name; return n ? n + extra(x) : ''; }).filter(Boolean).join(', ');
  const row = (icon, label, value, none) => `<div class="g-row">${ico(icon)}<span>${esc(label)}</span><b class="${value ? '' : 'none'}">${esc(value || none)}</b></div>`;
  return `<div class="card glance"><div class="glance-head"><div><small>${esc(D.long(d))}</small><b>${esc(dayName(di) || t('today'))}</b></div>${myS ? stChip(myS) : ''}</div>
    ${row('dish', t('restaurant_theme'), restName(di), t('not_set'))}${plan.dress_code ? row('user', t('dress_code'), plan.dress_code) : ''}
    ${row('sparkle', t('events_today'), of('event'), t('no_event_today'))}${row('mask', t('shows_today'), of('show'), t('no_show_today'))}
    ${row('music', t('live_music_today'), of('live_music'), t('no_live_music_today'))}${of('special_event') ? row('star', t('type_special_event'), of('special_event')) : ''}
    ${row('door', t('entrance_today'), who(x => x.entrance && x.status === 'working', x => x.entrance_at ? ' ' + x.entrance_at : ''), t('nobody'))}${row('moon', t('day_off_today'), who(x => x.status === 'day_off'), t('nobody'))}
    ${plan.notes ? `<p class="prose">${nl2br(plan.notes)}</p>` : ''}${myS?.entrance ? `<p class="muted small">${esc(t('entrance_window', { a: myS.entrance_at || '', b: myS.leave_op || '' }))}</p>` : ''}</div>`;
}

/* clock in / out: one card, server time, own record only – today's policy from Attendance → Settings (the expected times, the place);
   someone the rules do not ask to clock in (e.g. the manager) sees no card */
function clockCard(a) {
  if (!a || !a.can_clock || (!a.clock_required && !a.clock?.check_in)) return '';
  const k = a.clock || {}, late = a.late_tracking && k.sched_in ? (k.late_min > 0 ? chip(t('att_late_n', { n: k.late_min }), 'bad') : chip(t('att_on_time'), 'ok')) : '';
  const info = [a.sched_in ? t('att_expected', { a: a.sched_in, b: a.sched_out || '…' }) + (a.grace ? ' · ' + t('att_grace_n', { n: a.grace }) : '') : '', a.location_required ? t('att_clock_at', { place: a.places.join(', ') }) : ''].filter(Boolean).join(' · ');
  return `<div class="card clock"><div class="row">${ico('clock')}${k.check_in ? `<span>${esc(t('clocked_in_at', { time: clockTime(k.check_in) }))}</span>${late}` : `<span class="muted">${esc(t('not_clocked'))}</span>`}
    ${k.check_out ? `<span>${esc(t('clocked_out_at', { time: clockTime(k.check_out) }))}</span>` : ''}<span class="grow"></span>
    ${!k.check_in ? `<button class="btn" data-act="clock" data-a="in" data-place="${a.location_required ? 1 : ''}">${esc(t('clock_in_btn'))}</button>` : !k.check_out ? `<button class="btn secondary" data-act="clock" data-a="out" data-place="${a.location_required ? 1 : ''}">${esc(t('clock_out_btn'))}</button>` : ''}</div>
    ${info ? `<small class="muted">${esc(info)}</small>` : ''}</div>`;
}
// a refusal (wrong place, no position, not precise enough, no connection) is said in full – nothing was saved
ACT.clock = async el => {
  el.disabled = true;
  try { const j = await attClock(el.dataset.a, !!el.dataset.place); toast(el.dataset.a === 'in' && j.row?.late_min > 0 ? t('att_clocked_late', { n: j.row.late_min }) : t('saved'), j.row?.late_min > 0 && el.dataset.a === 'in' ? 'warn' : 'ok'); route(); }
  catch (e) { el.disabled = false; modal(t(el.dataset.a === 'in' ? 'clock_in_btn' : 'clock_out_btn'), `<p class="hint-box warn">${ico('info')}<span>${esc(errText(e))}</span></p>`, { noFocus: true }); }
};

/* ---------- My schedule (next 14 days) ---------- */
page('schedule', {
  perm: 'myday', icon: 'calendar', group: 'operations',
  render: async () => {
    const to = D.add(D.today(), 13), from = D.add(D.today(), -7), me = meId();
    const b = await board(from, to);
    return `<div class="sched">${D.range(from, 21).map(d => {
      const s = statusOf(b, me, d), its = b.items.filter(i => i.date === d && i.staff.some(x => x.staff_id === me));
      const plan = b.plans.find(p => p.date === d) || {};
      return `<div class="sched-day ${s && s.status !== 'working' ? 'off' : ''}"><div class="d"><b>${esc(D.fmt(d, { day: 'numeric' }))}</b><small>${esc(D.fmt(d, { weekday: 'short' }))}</small></div>
        <div>${stChip(s)}${(() => { const k = (b.clock || []).find(x => x.staff_id === me && x.date === d); return k?.check_in ? ` <small>${ico('clock')} ${esc(clockTime(k.check_in))}${k.check_out ? '–' + esc(clockTime(k.check_out)) : ''}</small>` : ''; })()}${dayName(dayOf(b.days, d)) ? ` <small class="muted">${esc(dayName(dayOf(b.days, d)))}</small>` : ''}${its.map(i => `<p><time>${esc(hm(i.start_time))}</time> ${esc(itemName(i))}</p>`).join('') || (s && s.status === 'working' ? `<small class="muted">${esc(t('no_assignments'))}</small>` : '')}</div></div>`;
    }).join('')}</div>`;
  }
});

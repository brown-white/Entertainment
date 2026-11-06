'use strict';
/* Mr Hassan · pages/my-day.js — staff pages: My day (today at a glance, clock in / out) and My schedule (the next 14 days).
   Uses: core/state · translations/languages · supabase · core/utils · icons/icons · core/permissions · components/modals · core/actions ·
         components/cards · core/router · systems/notifications · systems/team-schedule · systems/attendance · systems/games ·
         systems/program-engine */
/* ---------- My day ---------- */
page('myday', {
  perm: 'myday', icon: 'sun', group: 'my',
  render: async () => {
    const today = D.today(), tom = D.add(today, 1), me = meId();
    const [b, ann, notes, tasks, quiz, att] = await Promise.all([
      board(D.add(today, -1), tom), safe(list('announcements', { _limit: 6 })), S.preview ? null : pollStaff().then(() => S.inbox.notifications.slice(0, 5)),
      can('tasks') ? safe(list('tasks', { status: ['open', 'accepted'] })) : null,
      can('quiz') ? safe(list('quizzes', { audience: 'staff', quiz_date: today, active: true })) : null,
      can('clock_in') && !S.preview ? safe(api('my_attendance')) : null]);
    const myS = statusOf(b, me, today), plan = b.plans.find(p => p.date === today) || {};
    const mine = d => b.items.filter(i => i.date === d && i.staff.some(s => s.staff_id === me));
    const myTasks = (tasks || []).filter(x => !x.assigned_staff_id || x.assigned_staff_id === me);
    const myGames = mine(today).filter(i => i.game_type);                     // (10.5) the games of my assignments: Start game right here
    return `<p class="hello">${esc(t('hello_name', { name: (S.preview ? S.preview.me : S.me).display_name }))}</p>
      ${clockCard(att)}
      ${glanceCard(b, today, myS, plan)}
      <section><h2>${esc(t('my_work_today'))}</h2>${mine(today).length ? `<div class="items">${mine(today).map(i => itemRow(i, 'item')).join('')}</div>` : empty(t('no_assignments'))}</section>
      ${myGames.length ? `<section class="my-games"><h2>${esc(t('my_games_today'))}</h2>${myGames.map(gameItemCard).join('')}</section>` : ''}
      ${b.standards.length ? `<section><h2>${esc(t('daily_standards'))}</h2><ol class="timeline">${b.standards.map(s => `<li><time>${esc(hm(s.time))}</time>${esc(tx(s.label_i18n, s.label))}</li>`).join('')}</ol></section>` : ''}
      <section><h2>${esc(t('tomorrow'))} · ${esc(D.short(tom))}</h2>${(() => { const s2 = statusOf(b, me, tom); const m2 = mine(tom); return (s2 && s2.status !== 'working' ? `<p>${stChip(s2)}</p>` : '') + (m2.length ? `<div class="items">${m2.map(i => itemRow(i, 'item')).join('')}</div>` : empty(t('no_assignments'))); })()}</section>
      ${(ann || []).length ? `<section><h2>${esc(t('announcements'))}</h2><div class="list">${ann.map(a => `<div class="li">${a.pinned ? ico('pin') + ' ' : ''}<b>${esc(a.title)}</b><p>${nl2br(a.body || '')}</p><small class="muted">${esc(D.stamp(a.created_at))}</small></div>`).join('')}</div></section>` : ''}
      ${(notes || []).length ? `<section><h2>${esc(t('notifications'))}</h2><div class="list">${notes.map(a => { const v = notifView(a); return `<div class="li"><b>${esc(v.title)}</b><p>${nl2br(v.body)}</p></div>`; }).join('')}</div></section>` : ''}
      ${myTasks.length ? `<section><h2>${esc(t('pg_tasks'))}</h2><div class="list">${myTasks.slice(0, 5).map(x => `<a class="li" href="#/tasks">${esc(x.title)}${x.due_date ? ` <small class="muted">${esc(D.dm(x.due_date))}</small>` : ''}</a>`).join('')}</div></section>` : ''}
      ${(quiz || []).length ? `<section class="card"><h2>${esc(t('quiz_of_day'))}</h2><p>${esc(quiz[0].question)}</p><a class="btn small" href="#/quiz">${esc(t('answer'))}</a></section>` : ''}`;
  }
});

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
    ${!k.check_in ? `<button class="btn" data-act="clock" data-a="in" data-place="${a.location_required ? 1 : ''}">${esc(t('clock_in_btn'))}</button>` : !k.check_out ? `<button class="btn ghost" data-act="clock" data-a="out" data-place="${a.location_required ? 1 : ''}">${esc(t('clock_out_btn'))}</button>` : ''}</div>
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
  perm: 'myday', icon: 'calendar', group: 'my',
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

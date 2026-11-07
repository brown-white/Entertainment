'use strict';
/* Mr Hassan · pages/guest-requests.js — GUEST REQUESTS (the team's side of what guests ask for in the guest app, and of what the team
   takes for them): CELEBRATIONS (birthday, anniversary, proposal …: one structured request – review, a question to the guest, approve,
   the internal tasks for the DJ, the supervisor, social media, guest contact, each followed here) and SONGS (the DJ's list: the song
   chosen in YouTube, the room, the event; under review → accepted → playing soon → played). The guest only ever sees their own simple
   steps – never the team's notes, people or costs.
   Uses: core/state · translations/languages · supabase · core/utils · icons/icons · core/permissions · components/modals · core/actions ·
         components/cards · core/router · components/forms · systems/operations */
let grShow = 'active', srShow = 'open';
const GR_ACTIVE = ['open', 'review', 'clarify', 'approved'];
const reqStChip = s => chip(t('grs_' + s), s === 'open' || s === 'clarify' ? 'warn' : s === 'approved' || s === 'closed' ? 'ok' : s === 'rejected' ? 'bad' : '');
const wantsText = w => (w || []).map(x => t('want_' + x)).join(', ');
const ytThumb = id => `https://i.ytimg.com/vi/${id}/mqdefault.jpg`;
let grCache = null, srCache = null;
page('guestreq', {
  perm: 'req_view,req_manage,song_requests,song_update', icon: 'gift', group: 'guests', title: 'guest_requests',
  render: async arg => {
    const T = [can('req_view,req_manage') && ['events', t('gr_events')], can('song_requests,song_update,req_view,req_manage') && ['songs', t('song_requests')]].filter(Boolean);
    if (/^r\d+$/.test(arg || '') && can('req_view,req_manage')) return grDetail(+arg.slice(1));
    const tab = T.some(x => x[0] === arg) ? arg : T[0][0];
    return tabs('guestreq', T, tab) + (tab === 'songs' ? await srList() : await grList());
  }
});
/* ---------- CELEBRATIONS ---------- */
async function grList() {
  const j = await api('requests_list', { p_kind: 'events', p_from: D.add(D.today(), -30), p_to: D.add(D.today(), 120) }); grCache = j.events;
  const rows = j.events.filter(r => grShow === 'all' || (grShow === 'active' ? GR_ACTIVE.includes(r.status) : !GR_ACTIVE.includes(r.status)));
  return `${can('req_manage') ? pgActions(`<button class="btn" data-act="gr_new">${ico('plus')} ${esc(t('gr_new'))}</button>`) : ''}<div class="chips">${['active', 'done', 'all'].map(k => `<button class="chip-btn ${grShow === k ? 'on' : ''}" data-act="gr_show" data-k="${k}">${esc(t('gr_show_' + k))}</button>`).join('')}</div>
    ${S.settings.f_events ? '' : `<p class="hint-box">${ico('info')}<span>${esc(t('gr_off'))}</span></p>`}
    ${rows.length ? `<div class="list">${rows.map(r => { const done = r.tasks.filter(k => ['done', 'checked'].includes(k.status)).length;
      return `<a class="li gr-row ${r.status}" href="#/guestreq/r${r.id}"><div class="row">${ico('gift')}<b class="grow">${esc(t('rq_' + r.req_type))} · ${esc(D.short(r.req_date))}${r.req_time ? ' ' + esc(hm(r.req_time)) : ''}</b>${reqStChip(r.status)}</div>
        <small class="muted">${esc([t('room') + ' ' + (r.room || '—'), r.guest || '', placeLabel(r.location), wantsText(r.wants)].filter(Boolean).join(' · '))}</small>
        ${r.tasks.length ? `<small class="task-for">${ico('tasks')} ${esc(t('gr_tasks_n', { done, n: r.tasks.length }))}${r.tasks.some(k => k.late) ? ' · ' + esc(t('tk_late')) : ''}</small>` : ''}${r.status === 'review' && r.guest_reply ? `<small class="task-for">${ico('chat')} ${esc(r.guest_reply)}</small>` : ''}</a>`; }).join('')}</div>` : empty(t('gr_none'))}`;
}
ACT.gr_show = el => { grShow = el.dataset.k; route(); };
// ONE request: what the guest asked, its steps, the message the guest sees, the team's own note, its tasks and reminders
async function grDetail(id) {
  grCache = (await api('requests_list', { p_kind: 'events', p_from: D.add(D.today(), -200), p_to: D.add(D.today(), 200) })).events;
  const r = grCache.find(x => x.id === id); if (!r) return empty(t('not_found'));
  const rem = can('reminders') ? await remindersOf('link', 'request', id) : [], mg = can('req_manage');
  const step = (s, label, cls = 'small') => `<button class="btn ${cls}" data-act="gr_step" data-id="${id}" data-s="${s}">${esc(label)}</button>`;
  const steps = !mg ? '' : r.status === 'open' ? step('approved', t('approve')) + step('review', t('gr_review'), 'secondary small') + step('clarify', t('gr_ask'), 'secondary small') + step('rejected', t('reject'), 'secondary small danger')
    : r.status === 'review' || r.status === 'clarify' ? step('approved', t('approve')) + step('clarify', t('gr_ask'), 'secondary small') + step('rejected', t('reject'), 'secondary small danger')
    : r.status === 'approved' ? step('closed', t('gr_complete')) + step('cancelled', t('gr_cancel'), 'secondary small') : step('review', t('reopen'), 'secondary small');
  const tpl = (role, title, cat, time) => { const ro = roleOf(role); return `<button class="btn secondary small" data-act="tk_new" data-preset="${esc(JSON.stringify({ title, category: cat, request_id: id, due_date: r.req_date, start_time: cat === 'music' || cat === 'photos' ? time : null, deadline_time: cat === 'music' || cat === 'photos' ? null : time, location: placeLabel(r.location), who: ro ? 'r' + ro.id : '', priority: 'high' }))}">${ico('plus')} ${esc(ro ? ro.name : t('tc_' + cat))}</button>`; };
  const at = (m) => { if (!r.req_time) return null; const x = mins(hm(r.req_time)) + m; return String(Math.floor(((x % 1440) + 1440) % 1440 / 60)).padStart(2, '0') + ':' + String((((x % 1440) + 1440) % 1440) % 60).padStart(2, '0'); };
  return `<div class="card gr-head" data-crumb="${esc(t('rq_' + r.req_type) + (r.room ? ' · ' + r.room : ''))}"><div class="row">${ico('gift')}<h2 class="grow">${esc(t('rq_' + r.req_type))}</h2>${reqStChip(r.status)}</div>
      <dl class="kv"><dt>${esc(t('date'))}</dt><dd>${esc(D.long(r.req_date))}${r.req_time ? ' · ' + esc(hm(r.req_time)) : ''}</dd><dt>${esc(t('location'))}</dt><dd>${esc(placeLabel(r.location) || '—')}</dd>
        <dt>${esc(t('room'))}</dt><dd>${esc(r.room || '—')}${r.guest ? ' · ' + esc(r.guest) : ''}</dd><dt>${esc(t('gr_wants'))}</dt><dd>${esc(wantsText(r.wants) || '—')}</dd>
        ${r.song ? `<dt>${esc(t('song_title'))}</dt><dd>${esc(r.song)}</dd>` : ''}${r.body ? `<dt>${esc(t('gr_guest_notes'))}</dt><dd>${nl2br(r.body)}</dd>` : ''}
        ${r.guest_message ? `<dt>${esc(t('gr_message'))}</dt><dd>${nl2br(r.guest_message)}</dd>` : ''}${r.guest_reply ? `<dt>${esc(t('gr_reply'))}</dt><dd>${nl2br(r.guest_reply)}</dd>` : ''}
        ${r.internal_note ? `<dt>${ico('lock')} ${esc(t('internal_note'))}</dt><dd>${nl2br(r.internal_note)}</dd>` : ''}</dl>
      <p class="muted small">${esc(t('gr_guest_sees', { step: t('gstep_' + r.guest_step) }))}${r.source === 'staff' ? ' · ' + esc(t('gr_by_staff', { name: r.staff_name || '' })) : ''}${r.handled_name ? ' · ' + esc(t('gr_handled', { name: r.handled_name, at: D.stamp(r.handled_at) })) : ''}</p>
      ${mg ? `<div class="actions">${steps}<button class="btn secondary small" data-act="gr_edit" data-id="${id}">${ico('edit')} ${esc(t('edit'))}</button></div>` : ''}</div>
    <section><div class="row"><h2 class="grow">${ico('tasks')} ${esc(t('gr_internal_tasks'))}</h2></div>
      ${can('task_create,task_assign') && GR_ACTIVE.includes(r.status) ? `<p class="muted small">${esc(t('gr_task_tpl'))}</p><div class="chips">${tpl('dj', t('gr_t_dj', { type: t('rq_' + r.req_type) }), 'music', r.req_time ? hm(r.req_time) : null)}${tpl('supervisor', t('gr_t_setup'), 'setup', at(-30))}${tpl('social', t('gr_t_photos'), 'photos', at(-5))}${tpl('guest_contact', t('gr_t_confirm'), 'guest_contact', '17:00')}
        <button class="btn secondary small" data-act="tk_new" data-preset="${esc(JSON.stringify({ request_id: id, due_date: r.req_date, location: placeLabel(r.location) }))}">${ico('plus')} ${esc(t('new_task'))}</button></div>` : ''}
      ${r.tasks.length ? `<div class="list">${r.tasks.map(k => taskLi(k, 'manage')).join('')}</div>` : `<p class="muted">${esc(t('gr_no_tasks'))}</p>`}</section>
    ${can('reminders') ? remSection(rem, { link_type: 'request', link_id: id, link_label: t('rq_' + r.req_type) + ' · ' + t('room') + ' ' + (r.room || ''), title: t('rq_' + r.req_type) + ' · ' + t('room') + ' ' + (r.room || ''), date: D.add(r.req_date, -1) }) : ''}`;
}
// a step of the request; a question to the guest (and a rejection) says something to the guest
ACT.gr_step = async el => {
  const id = +el.dataset.id, s = el.dataset.s;
  if (s === 'clarify' || s === 'rejected' || s === 'approved') {
    return formBox(t('grs_' + s), [{ k: 'guest_message', type: 'textarea', rows: 3, label: t('gr_message'), hint: t('gr_message_hint'), req: s === 'clarify' }], { guest_message: grCache.find(x => x.id === id)?.guest_message || '' },
      async v => { await api('request_save', { p_row: { id, status: s, guest_message: v.guest_message || '' } }); toast(t('saved')); route(); });
  }
  await api('request_save', { p_row: { id, status: s } }); route();
};
// the request's details (also a new one taken by phone or at the desk: the room finds the guest's stay)
const grFields = isNew => [{ k: 'type', type: 'select', label: t('gr_type'), options: REQ_TYPES.map(x => [x, t('rq_' + x)]) }, isNew && { k: 'room', label: t('room') },
  { k: 'date', type: 'date', label: t('date'), req: true }, { k: 'time', type: 'time', label: t('time') },
  { k: 'location', type: 'select', label: t('location'), options: [['', '—']].concat(REQ_PLACES.map(p => [p, t('place_' + p)]), [['other', t('place_other')]]) },
  { k: 'location_other', label: t('place_other'), hint: t('gr_other_hint') },
  { k: 'wants', type: 'multi', label: t('gr_wants'), options: REQ_WANTS.map(w => [w, t('want_' + w)]) }, { k: 'song', label: t('song_title') },
  { k: 'notes', type: 'textarea', rows: 2, label: t('gr_guest_notes') }, { k: 'guest_message', type: 'textarea', rows: 2, label: t('gr_message'), hint: t('gr_message_hint') },
  { k: 'internal_note', type: 'textarea', rows: 2, label: t('internal_note'), hint: t('internal_note_hint') }].filter(Boolean);
function grForm(r) {
  const known = !r.location || REQ_PLACES.includes(r.location);
  const row = r.id ? { type: r.req_type, date: r.req_date, time: hm(r.req_time), location: known ? r.location || '' : 'other', location_other: known ? '' : r.location, wants: r.wants, song: r.song, notes: r.body, guest_message: r.guest_message, internal_note: r.internal_note }
    : { type: 'birthday', date: D.add(D.today(), 1), wants: [] };
  editForm(r.id ? t('edit') : t('gr_new'), grFields(!r.id), row, async v => {
    const p = { type: v.type, date: v.date, time: v.time || null, location: v.location === 'other' ? v.location_other || '' : v.location || '', wants: v.wants || [], song: v.song || '', notes: v.notes || '', guest_message: v.guest_message || '', internal_note: v.internal_note || '' };
    if (r.id) p.id = r.id; else p.room = v.room || '';
    const j = await api('request_save', { p_row: p }); toast(t('saved')); grCache = null; location.hash = '#/guestreq/r' + (r.id || j.id); route();
  });
}
ACT.gr_new = () => grForm({});
ACT.gr_edit = el => grForm(grCache.find(x => x.id === +el.dataset.id));

/* ---------- SONGS (the DJ's list) ---------- */
const SR_OPEN = ['new', 'review', 'accepted', 'soon'];
const srChip = s => chip(t('srs_' + s), s === 'new' ? 'warn' : s === 'played' ? 'ok' : s === 'rejected' ? 'bad' : '');
async function srList() {
  const j = await api('requests_list', { p_kind: 'songs', p_from: D.add(D.today(), -3), p_to: D.today() }); srCache = j.songs;
  const rows = j.songs.filter(x => srShow === 'all' || (srShow === 'open' ? SR_OPEN.includes(x.status) : !SR_OPEN.includes(x.status)));
  const dj = can('song_update'), mg = can('req_manage');
  const btn = (x, s, label, cls = 'small') => `<button class="btn ${cls}" data-act="sr_set" data-id="${x.id}" data-s="${s}">${esc(label)}</button>`;
  return `${S.settings.f_songs ? '' : `<p class="hint-box">${ico('info')}<span>${esc(t('songs_off'))}</span></p>`}
    <div class="chips">${['open', 'done', 'all'].map(k => `<button class="chip-btn ${srShow === k ? 'on' : ''}" data-act="sr_show" data-k="${k}">${esc(t('gr_show_' + (k === 'open' ? 'active' : k)))} (${j.songs.filter(x => k === 'all' || (k === 'open' ? SR_OPEN.includes(x.status) : !SR_OPEN.includes(x.status))).length})</button>`).join('')}</div>
    ${rows.length ? `<div class="list songs">${rows.map(x => `<div class="li song-row ${x.status}"><div class="row">${x.video_id ? `<a class="yt-th" href="https://www.youtube.com/watch?v=${esc(x.video_id)}" target="_blank" rel="noopener"><img src="${esc(ytThumb(x.video_id))}" alt="" loading="lazy"></a>` : `<span class="yt-th none">${ico('music')}</span>`}
        <span class="grow"><b>${esc(x.title)}</b>${x.artist ? ' · ' + esc(x.artist) : ''}<small class="muted"> ${esc([t('room') + ' ' + (x.room || '—'), D.stamp(x.created_at), x.item ? itemName(x.item) + (x.item.time ? ' ' + x.item.time : '') + (x.item.location ? ' · ' + x.item.location : '') : ''].filter(Boolean).join(' · '))}</small>
        ${x.note ? `<p>${esc(x.note)}</p>` : ''}${x.assigned_name ? `<small class="muted">${ico('user')} ${esc(x.assigned_name)}</small>` : ''}${x.internal_note && mg ? `<small class="muted"> ${ico('lock')} ${esc(x.internal_note)}</small>` : ''}</span>${prioChip(x.priority)}${srChip(x.status)}</div>
      <div class="actions">${dj && ['new', 'review'].includes(x.status) ? btn(x, 'accepted', t('accept')) + (x.status === 'new' ? btn(x, 'review', t('srs_review'), 'secondary small') : '') : ''}
        ${dj && x.status === 'accepted' ? btn(x, 'soon', t('srs_soon')) : ''}${dj && ['accepted', 'soon'].includes(x.status) ? btn(x, 'played', t('srs_played')) : ''}
        ${dj && SR_OPEN.includes(x.status) ? btn(x, 'rejected', t('reject'), 'secondary small') : ''}${dj && !SR_OPEN.includes(x.status) && x.status !== 'cancelled' ? btn(x, 'accepted', t('reopen'), 'secondary small') : ''}
        ${mg ? `<button class="btn secondary small" data-act="sr_edit" data-id="${x.id}">${ico('edit')} ${esc(t('sr_manage'))}</button>` : ''}
        ${can('task_create,task_assign') ? `<button class="btn secondary small" data-act="tk_new" data-preset="${esc(JSON.stringify({ title: t('sr_task_title', { title: x.title }), category: 'music', song_id: x.id, item_id: x.item?.id || null, who: roleOf('dj') ? 'r' + roleOf('dj').id : '', due_date: D.today() }))}">${ico('tasks')} ${esc(t('new_task'))}</button>` : ''}
        ${can('reminders') ? `<button class="btn secondary small" data-act="rem_new" data-link="${esc(JSON.stringify({ link_type: 'song', link_id: x.id, link_label: x.title, title: x.title, date: D.today(), time: null }))}">${ico('bell')}</button>` : ''}
        ${can('req_delete') ? `<button class="icon-btn" data-act="sr_del" data-id="${x.id}" aria-label="${esc(t('delete'))}">${ico('trash')}</button>` : ''}</div></div>`).join('')}</div>` : empty(t('no_song_requests'))}`;
}
ACT.sr_show = el => { srShow = el.dataset.k; route(); };
ACT.sr_set = async el => { await api('song_update', { p_id: +el.dataset.id, p_row: { status: el.dataset.s } }); route(); };
ACT.sr_del = async el => { if (!await confirmBox(t('confirm_delete'))) return; await del('song_requests', +el.dataset.id); route(); };
// the team lead's choices for a song: who plays it, how urgent, the team's note
ACT.sr_edit = async el => {
  const x = srCache.find(s => s.id === +el.dataset.id), team = (await api('team_members')).staff;
  editForm(x.title, [{ k: 'assigned_staff_id', type: 'select', num: true, label: t('sr_dj'), options: [['', '—']].concat(team.map(p => [p.id, p.display_name + (p.role_name ? ' · ' + p.role_name : '')])) },
    { k: 'priority', type: 'select', label: t('priority'), options: PRIOS.map(p => [p, t('prio_' + p)]) }, { k: 'internal_note', type: 'textarea', rows: 2, label: t('internal_note'), hint: t('internal_note_hint') }],
  x, async v => { await api('song_update', { p_id: x.id, p_row: { assigned_staff_id: v.assigned_staff_id || null, priority: v.priority, internal_note: v.internal_note || '' } }); route(); });
};

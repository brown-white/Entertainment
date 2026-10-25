'use strict';
/* AUREA · pages/guest/stay.js — guest app: my stay (sign in with the room, my bookings and tickets, sign out, change hotel) and rate your stay.
   Uses: core/state · translations/languages · supabase · core/utils · icons/icons · components/modals · core/actions · components/cards ·
         core/router · components/forms · components/navigation · systems/feedback · systems/guest-lifecycle · systems/program-engine ·
         systems/ticket-system */
/* Rate your stay: every department at once */
page('g_feedback', {
  mode: 'guest', title: 'rate_your_stay',
  render: async () => {
    if (gSet().f_feedback === false) return empty(t('not_found'));
    if (!signedIn()) return empty(t('sign_in_for_feedback'), `<a class="btn" href="#/g_stay">${esc(t('sign_in'))}</a>`);
    const deps = S.g.home.departments || [];
    return `<p class="lead">${esc(t('rate_intro'))}</p><form class="card" id="g-rate" onsubmit="return false">${fieldsHtml(fbFields(deps))}<button class="btn wide" data-act="g_rate">${esc(t('send'))}</button></form>
      ${S.g.me.feedback.length ? `<section><h2>${esc(t('your_feedback'))}</h2>${fbList(S.g.me.feedback, deps)}</section>` : ''}`;
  }
});
ACT.g_rate = async () => {
  const r = fbRead($('#g-rate'), S.g.home.departments || []);
  if (!r.ratings.length) return toast(t('choose_rating'), 'bad');
  await rpc('guest_feedback_add', { p_key: S.g.key, p_row: r }); toast(t('thank_you_feedback')); await gRefreshMe(); route();
};

page('g_stay', {
  mode: 'guest', title: 'g_my_stay',
  render: async () => {
    if (!signedIn()) {
      // 1. the hotel (chosen before) → 2. the room number, checked against this hotel's room list → 3. the guest's details
      const today = D.today(); const list = gSet().guest_signin_mode === 'list';
      if (!gRoomOk || gRoomOk.hotel !== S.g.hotelId) return `<div class="card narrow"><p>${esc(t(list ? 'stay_intro_list' : 'stay_intro'))}</p><form id="g-room" onsubmit="return false">
        ${fieldHtml({ k: 'room', label: t('room_number'), req: true, ac: 'off' })}<button class="btn wide" data-act="g_room_go">${esc(t('continue'))}</button></form><p class="muted small">${esc(t('privacy_note'))}</p></div>`;
      return `<div class="card narrow"><p class="row"><span class="grow">${esc(t('room'))} <b>${esc(gRoomOk.room)}</b> ${chip(t('room_verified'), 'ok')}</span><button class="btn ghost small" data-act="g_room_change">${esc(t('change'))}</button></p><form id="g-in" onsubmit="return false">
        <input type="hidden" name="room" value="${esc(gRoomOk.room)}">${fieldHtml({ k: 'name', label: t(list ? 'your_surname' : 'your_name'), req: true, ac: list ? 'family-name' : 'name' })}
        ${list ? '' : fieldHtml({ k: 'nationality', type: 'country', label: t('nationality') }) + fieldHtml({ k: 'phone', type: 'phone', country: 'nationality', label: t('phone_optional') })
          + `<div class="row2">${fieldHtml({ k: 'arrival', label: t('arrival'), type: 'date', def: today })}${fieldHtml({ k: 'departure', label: t('departure'), type: 'date', def: D.add(today, 7) })}</div>`}
        <button class="btn wide" data-act="g_signin">${esc(t('sign_in'))}</button></form><p class="muted small">${esc(t('privacy_note'))}</p></div>`;
    }
    const me = S.g.me; const st = me.stay;
    const favTpl = uniq(me.favourites || []);
    const favItems = favTpl.map(id => gItems().find(i => i.template_id === id && i.date >= D.today())).filter(Boolean);
    return `<div class="card stay-card"><b>${esc(st.name)}</b><span>${esc(t('room'))} ${esc(st.room)} · ${esc(D.dm(st.arrival))} – ${esc(D.dm(st.departure))}</span>${me.active ? '' : chip(t('stay_ended'), 'bad')}</div>
      <section><h2>${esc(t('my_bookings'))}</h2>${me.bookings.length ? `<div class="items">${me.bookings.map(b => { const off = b.item.status === 'cancelled';   // a cancelled activity has no page any more
        return `<${off ? 'div' : 'a'} class="item${off ? ' off' : ''}" ${off ? '' : `href="#/g_item/${b.item_id}"`}><time>${esc(hm(b.item.start_time))}</time><div><b>${esc(tx(b.item.name_i18n, b.item.name))}</b><span class="meta">${esc(D.short(b.item.date))} · ${esc(t('seats'))}: ${b.seats}${b.status === 'waiting' ? ' · ' + esc(t('waiting_list')) : ''}${off ? ' · ' + esc(t('cancelled')) : ''}</span></div></${off ? 'div' : 'a'}>`; }).join('')}</div>` : empty(t('no_bookings'))}</section>
      ${me.tickets.length ? `<section><h2>${esc(t('my_tickets'))}</h2>${ticketList(me.tickets)}</section>` : ''}
      <section><h2>${esc(t('favourites'))}</h2>${favItems.length ? `<div class="items">${favItems.map(i => itemRow(i)).join('')}</div>` : empty(t('no_favourites'))}</section>
      ${gSet().f_feedback !== false ? `<p><a class="btn ghost wide" href="#/g_feedback">${ico('star')} ${esc(t('rate_your_stay'))}</a></p>` : ''}
      <p class="center"><button class="btn ghost" data-act="g_signout">${esc(t('sign_out'))}</button></p>`;
  }
});
let gRoomOk = null;
ACT.g_room_go = async el => {
  const v = $('#g-room [name=room]').value.trim(); if (!v) return toast(t('err_room'), 'bad');
  el.disabled = true;
  try { const j = await rpc('guest_room_check', { p_hotel_id: S.g.hotelId, p_room: v }); gRoomOk = { hotel: S.g.hotelId, room: j.room }; route(); }
  catch (e) { fail(e); } finally { el.disabled = false; }
};
ACT.g_room_change = () => { gRoomOk = null; route(); };
ACT.g_signin = async el => {
  const f = $('#g-in'); el.disabled = true;
  try {
    const v = k => (f[k] ? f[k].value : '') || null;
    const j = await rpc('guest_signin', { p_hotel_id: S.g.hotelId, p_room: f.room.value, p_name: f.name.value, p_nationality: v('nationality'), p_phone: v('phone'), p_arrival: v('arrival'), p_departure: v('departure'), p_lang: S.lang });
    store.set('gkey.' + S.g.hotelId, j.key); S.g.key = j.key; gRoomOk = null; await gRefreshMe(); renderShell(); toast(t('welcome')); route();
  } catch (e) { fail(e); } finally { el.disabled = false; }
};
ACT.g_signout = async () => {
  if (!await confirmBox(t('sign_out_q'))) return;
  try { await rpc('guest_signout', { p_key: S.g.key }); } catch { /* ignore */ }
  store.set('gkey.' + S.g.hotelId, null); S.g.key = null; S.g.me = null; gRoomOk = null; renderShell(); route();
};
// another hotel: nothing of the previous one stays on screen (its name, programme, sign-in and messages)
ACT.g_change_hotel = () => { S.g.hotelId = null; S.g.home = null; S.g.me = null; S.g.key = null; S.hotel = null; gRoomOk = null; store.set('ghotel', null); renderShell(); location.hash = '#/g_hotels'; route(); };

'use strict';
/* AUREA · pages/guest/programme.js — guest app: the programme by day, an activity (book, favourite, rate).
   Uses: core/state · translations/languages · supabase · core/utils · icons/icons · components/modals · core/actions · components/cards ·
         core/auth · core/router · components/forms · systems/guest-lifecycle · systems/team-schedule · systems/program-engine */
let gDay = null, gType = 'all', gCat = 'all';
page('g_prog', {
  mode: 'guest', title: 'programme',
  render: async () => {
    const today = D.today(); gDay = gDay && gDay >= today ? gDay : today;
    const di = dayOf(S.g.home.days, gDay);
    const cats = allCats().filter(c => gItems().some(i => (i.categories || []).includes(c.id)));
    const its = gItems().filter(i => i.date === gDay && (gType === 'all' || i.type === gType) && (gCat === 'all' || (i.categories || []).includes(+gCat)));
    return dayStrip(gDay, today, 14, 'g_day')
      + (dayName(di) || restName(di) ? `<div class="day-line">${dayName(di) ? `<b>${esc(dayName(di))}</b>` : ''}${restName(di) ? `<span>${ico('dish')} ${esc(restName(di))}</span>` : ''}</div>` : '')
      + `<div class="chips" role="group" aria-label="${esc(t('type'))}">${['all'].concat(TYPES).map(ty => `<button class="chip-btn ${gType === ty ? 'on' : ''}" data-act="g_type" data-ty="${ty}">${esc(ty === 'all' ? t('all') : typeLabel(ty))}</button>`).join('')}</div>
      ${cats.length ? `<div class="chips cats" role="group" aria-label="${esc(t('categories'))}">${ico('tag')}<button class="chip-btn ${gCat === 'all' ? 'on' : ''}" data-act="g_cat" data-c="all">${esc(t('all_categories'))}</button>${cats.map(c => `<button class="chip-btn ${String(gCat) === String(c.id) ? 'on' : ''}" data-act="g_cat" data-c="${c.id}">${esc(catName(c))}</button>`).join('')}</div>` : ''}
      ${its.length ? `<div class="items">${its.map(i => itemRow(i)).join('')}</div>` : empty(t('no_items_day'))}`;
  }
});
ACT.g_cat = el => { gCat = el.dataset.c; route(); };
ACT.g_day = el => { gDay = el.dataset.date; route(); };
ACT.g_type = el => { gType = el.dataset.ty; route(); };

page('g_item', {
  mode: 'guest', title: 'details', heading: arg => { const it = gItem(arg); return it ? itemName(it) : t('details'); },
  render: async arg => {
    const it = gItem(arg); if (!it) return empty(t('not_found'));
    const st = gSet(); const b = myBooking(it);
    const left = it.capacity > 0 ? Math.max(0, it.capacity - (+it.booked || 0)) : null;
    let book = '';
    if (it.booking_required && st.f_booking !== false && it.status === 'scheduled') {
      if (!signedIn()) book = `<a class="btn" href="#/g_stay">${esc(t('sign_in_to_book'))}</a>`;
      else if (b) book = `<p>${b.status === 'waiting' ? chip(t('on_waiting_list')) : chip(t('booked_seats', { n: b.seats }), 'ok')}</p><button class="btn ghost" data-act="g_unbook" data-id="${b.id}">${esc(b.status === 'waiting' ? t('leave_waiting_list') : t('cancel_booking'))}</button>`;
      else if (left === 0) book = `<p>${chip(t('full'), 'bad')}</p><button class="btn ghost" data-act="g_book" data-id="${it.id}" data-wait="1">${esc(t('join_waiting_list'))}</button>`;
      else book = `<div class="book-box">${left != null ? `<p class="places">${ico('users')} ${esc(t('places_left', { n: left }))}</p>` : ''}
        <div class="stepper" role="group" aria-label="${esc(t('seats'))}"><span>${esc(t('seats'))}</span><button type="button" class="icon-btn" data-act="g_seat" data-d="-1" aria-label="-1">${ico('minus')}</button>
          <input id="g-seats" type="number" value="1" min="1" max="${Math.min(st.max_seats || 4, left ?? 99)}" readonly aria-live="polite"><button type="button" class="icon-btn" data-act="g_seat" data-d="1" aria-label="+1">${ico('plus')}</button></div>
        <button class="btn wide" data-act="g_book" data-id="${it.id}">${ico('check')} ${esc(t('book'))}</button></div>`;
    }
    const mine = (S.g.me?.feedback || []).find(f => f.item_id === it.id);   // one rating per guest and activity: theirs is shown and can be changed
    const fb = signedIn() && st.f_feedback !== false && it.date <= D.today()
      ? `<section class="card"><h2>${esc(t('rate_this'))}</h2><form id="g-fb" onsubmit="return false">${fieldHtml({ k: 'rating', type: 'stars', label: itemName(it) }, mine?.ratings?.[0]?.rating)}${fieldHtml({ k: 'comment', type: 'textarea', label: t('comment'), rows: 2 }, mine?.comment)}
        <button class="btn" data-act="g_rate_item" data-id="${it.id}">${esc(t('send'))}</button></form></section>` : '';
    return `${it.image_url ? `<img class="hero" src="${esc(it.image_url)}" alt="">` : ''}
      <div class="card"><p class="meta">${chip(typeLabel(it.type), 'ty-' + it.type)} ${esc(D.long(it.date))} · ${esc(hm(it.start_time))}${it.end_time ? '–' + esc(hm(it.end_time)) : ''}${it.location ? ' · ' + esc(it.location) : ''}</p>
      ${itemDesc(it) ? `<p class="prose">${nl2br(itemDesc(it))}</p>` : ''}
      ${it.status === 'cancelled' ? chip(t('cancelled'), 'bad') : ''}
      ${it.booking_required && left != null ? `<p class="muted">${esc(t('places_left', { n: left }))}</p>` : ''}
      <div class="actions">${book}${it.template_id && signedIn() ? `<button class="btn ghost" data-act="g_fav" data-id="${it.template_id}" data-on="${isFav(it) ? 0 : 1}">${isFav(it) ? ico('heart', 'fill') + ' ' + esc(t('favourite_remove')) : ico('heart') + ' ' + esc(t('favourite_add'))}</button>` : ''}
      ${it.ticketed && st.f_tickets !== false ? `<a class="btn ghost" href="#/g_pack/${it.id}">${esc(t('get_tickets'))}</a>` : ''}</div></div>${fb}`;
  }
});
ACT.g_book = async el => {
  const seats = +($('#g-seats')?.value || 1);
  const j = await rpc('guest_book', { p_key: S.g.key, p_item_id: +el.dataset.id, p_seats: seats, p_wait: el.dataset.wait === '1' });
  toast(j.waiting ? t('on_waiting_list') : t('booked')); await guestLoad(); route();
};
ACT.g_unbook = async el => { if (!await confirmBox(t('cancel_booking_q'))) return; await rpc('guest_unbook', { p_key: S.g.key, p_booking_id: +el.dataset.id }); toast(t('booking_cancelled')); await guestLoad(); route(); };
ACT.g_fav = async el => { await rpc('guest_fav', { p_key: S.g.key, p_template_id: +el.dataset.id, p_on: el.dataset.on === '1' }); await gRefreshMe(); route(); };
ACT.g_seat = el => { const i = $('#g-seats'); i.value = Math.max(1, Math.min(+i.max || 1, (+i.value || 1) + +el.dataset.d)); };
ACT.g_rate_item = async el => {
  const f = $('#g-fb'); const rating = +f.rating.value;
  if (!rating) return toast(t('choose_rating'), 'bad');
  await rpc('guest_feedback_add', { p_key: S.g.key, p_row: { item_id: +el.dataset.id, comment: f.comment.value, ratings: [{ department_id: null, rating }] } });
  toast(t('thank_you_feedback')); await gRefreshMe(); route();
};

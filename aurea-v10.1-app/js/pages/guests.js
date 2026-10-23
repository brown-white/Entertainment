'use strict';
/* AUREA · pages/guests.js — Guests: stays, rooms, bookings.
   Uses: core/state · translations/languages · supabase · core/utils · icons/icons · core/permissions · components/modals · core/actions ·
         components/cards · core/router · components/forms · components/tables · systems/exports */
/* ---------- Guests: stays, rooms, bookings ---------- */
let guF = 'house', bkDay = null, guQ = '';
page('guests', {
  perm: 'm_guests', icon: 'bed', group: 'manage', title: 'guests_admin',
  render: async arg => {
    const tab = ['stays', 'rooms', 'bookings'].includes(arg) ? arg : 'stays';
    const head = tabs('guests', [['stays', t('stays')], ['rooms', t('rooms')], ['bookings', t('bookings')]], tab);
    const today = D.today();
    if (tab === 'rooms') {
      const rooms = await list('rooms');
      return head + `<div class="card"><p class="muted">${esc(t('rooms_intro'))}</p><textarea id="rooms-in" rows="2" placeholder="101-120, 201-230, 305A" aria-label="${esc(t('rooms'))}"></textarea><p class="row"><button class="btn" data-act="rooms_add">${esc(t('add_rooms'))}</button><button class="btn ghost" data-act="imp_rooms">${ico('download')} ${esc(t('upload_room_list'))}</button><span class="grow"></span><button class="btn ghost small" data-act="rooms_unlock">${esc(t('unlock_signins'))}</button></p></div>
        <p class="muted">${esc(t('rooms_count', { n: rooms.length, a: rooms.filter(r => r.active).length }))} · ${esc(t('rooms_tap_hint'))}</p><div class="numgrid rooms">${rooms.map(r => `<button class="${r.active ? '' : 'off'}" data-act="room_tap" data-id="${r.id}" title="${esc(r.info || '')}" aria-label="${esc(r.room_number + ' ' + (r.active ? t('active') : t('inactive')) + (r.info ? ' · ' + r.info : ''))}">${esc(r.room_number)}${r.info ? '<i aria-hidden="true"></i>' : ''}</button>`).join('')}</div>`;
      roomCache = rooms;
    }
    if (tab === 'bookings') {
      bkDay = bkDay || today;
      const items = (await list('program_items', { date: bkDay })).filter(i => i.booking_required);
      const books = items.length ? await list('bookings', { item_id: items.map(i => i.id) }) : [];
      const stays = books.length ? await list('guest_stays', { id: uniq(books.map(b => b.stay_id)) }) : [];
      const st = id => stays.find(s => s.id === id) || {};
      bkCache = { items, books, st };
      return head + dayStrip(bkDay, D.add(today, -3), 14, 'bk_day') + (items.length ? items.map(i => {
        // places taken = booked + attended (same rule as the database); waiting guests are listed after them and hold no place
        const bs = books.filter(b => b.item_id === i.id && b.status !== 'cancelled').sort((x, y) => (x.status === 'waiting') - (y.status === 'waiting'));
        return `<section class="card"><h2>${esc(hm(i.start_time))} ${esc(itemName(i))} <small class="muted">${sum(bs.filter(b => b.status !== 'waiting'), b => b.seats)}${i.capacity ? '/' + i.capacity : ''}</small></h2>
        ${bs.length ? `<div class="list">${bs.map(b => `<div class="li row"><b>${esc(st(b.stay_id).room || '')}</b> ${esc(st(b.stay_id).name || '')} · ${b.seats}<span class="grow"></span>${b.status === 'attended' ? chip(t('attended'), 'ok') : b.status === 'waiting' ? chip(t('waiting_list'), 'warn') : `<button class="btn ghost small" data-act="bk_set" data-id="${b.id}" data-s="attended">${esc(t('attended'))}</button>`}<button class="btn ghost small" data-act="bk_set" data-id="${b.id}" data-s="cancelled">${esc(t('cancel'))}</button></div>`).join('')}</div>` : `<p class="muted">${esc(t('no_bookings'))}</p>`}
        ${bs.length ? `<button class="btn ghost small" data-act="bk_print" data-id="${i.id}">${esc(t('print_pdf'))}</button>` : ''}</section>`; }).join('') : empty(t('no_bookable_items')));
    }
    // guests in house and arriving are always loaded (as many as the rooms); departed guests (kept 45 days) only when asked for
    const F = { house: g => g.arrival <= today && g.departure >= today, arriving: g => g.arrival > today, departed: g => g.departure < today, all: () => true };
    const past = ['departed', 'all'].includes(guF);
    const [cur, old] = await Promise.all([list('guest_stays', { _from: today, _limit: 5000 }), past ? list('guest_stays', { _to: D.add(today, -1), _limit: 5000 }) : []]);
    // one search over the list shown (name, room, nationality, phone) – also the archive of departed guests
    const q = guQ.toLowerCase(), hit = g => !q || [g.name, g.room, g.nationality, countryName(g.nationality), g.phone].some(v => String(v || '').toLowerCase().includes(q));
    const rows = cur.concat(old), r = rows.filter(F[guF]).filter(hit); stayCache = rows;
    return head + `<div class="chips">${['house', 'arriving', 'departed', 'all'].map(k => `<button class="chip-btn ${guF === k ? 'on' : ''}" data-act="gu_f" data-k="${k}">${esc(t('gf_' + k))}${['departed', 'all'].includes(k) && !past ? '' : ` (${rows.filter(F[k]).length})`}</button>`).join('')}
      <span class="grow"></span><button class="btn ghost small" data-act="gu_xlsx">${esc(t('excel'))}</button><button class="btn small" data-act="gu_new">${esc(t('add_stay'))}</button></div>
      <div class="row"><input id="gu-q" type="search" class="grow" value="${esc(guQ)}" placeholder="${esc(t('guest_search_ph'))}" aria-label="${esc(t('search'))}" data-act-change="gu_q"></div>
      ${guF === 'departed' ? `<p class="muted small">${esc(t('archive_hint'))}</p>` : ''}
      ${S.settings.guest_signin_mode === 'list' ? `<p class="muted small">${esc(t('list_mode_note'))}</p>` : ''}
      ${r.length && can('m_guests') ? selHead('gu', r.map(g => g.id), `<button class="btn ghost small danger" data-act="gu_del" data-sel-need ${sel('gu').size ? '' : 'disabled'}>${ico('trash')} ${esc(t('delete_selected'))}</button>`
          + (guF === 'departed' ? `<button class="btn ghost small danger" data-act="gu_del" data-all="1">${esc(t('delete_all_shown', { n: r.length }))}</button>` : '')) : ''}
      ${r.length ? tableWrapClick(r) : empty(t('no_guests'))}<p class="muted small">${esc(t('privacy_45'))}</p>`;
  }
});
let stayCache = [], bkCache = null, guShown = [];
const tableWrapClick = r => { guShown = r.map(g => g.id); return `<div class="list">${r.map(g => `<div class="sel-li">${can('m_guests') ? selBox('gu', g.id, g.room + ' ' + g.name) : ''}<button class="li row" data-act="gu_edit" data-id="${g.id}"><b>${esc(g.room)}</b> ${esc(g.name)}<span class="grow"></span><small class="muted">${esc(D.dm(g.arrival))} – ${esc(D.dm(g.departure))}${g.nationality ? ' · ' + esc(g.nationality) : ''}</small></button></div>`).join('')}</div>`; };
// delete guests: the chosen ones, or every guest shown in the archive; departed guests need "delete guest history".
// Their tickets stay in the sales history without the name; their bookings, messages and favourites go with the stay.
ACT.gu_del = async el => {
  const ids = el.dataset.all ? guShown.slice() : selIds('gu'); if (!ids.length) return;
  if (ids.length > 1 && !can('bulk_delete')) return toast(t('err_bulk_needed'), 'bad');
  const today = D.today(), gone = stayCache.filter(g => ids.includes(g.id) && g.departure < today).length;
  if (gone && !can('guests_history_delete')) return toast(t('err_guest_history'), 'bad');
  const r = await delAsk({ title: ids.length === 1 ? t('delete_stay_named_q', { name: (stayCache.find(g => g.id === ids[0]) || {}).name || '' }) : t('delete_stays_q', { n: ids.length }), n: ids.length,
    facts: [gone ? t('del_stays_departed', { n: gone }) : '', ids.length - gone ? t('del_stays_current', { n: ids.length - gone }) : ''].filter(Boolean), text: t('delete_stays_text') });
  if (!r) return;
  const j = await delMany('guest_stays', ids.length === 1 ? { p_id: ids[0] } : { p_ids: ids });
  sel('gu').clear(); toast(t('deleted_n', { n: j.deleted })); route();
};
ACT.gu_tickets = el => { const g = stayCache.find(x => x.id === +el.dataset.id); closeModals(); openWith('tickets', { q: '', stay: { id: g.id, name: g.name } }); location.hash = '#/ticketsadmin/inventory'; };
ACT.gu_f = el => { guF = el.dataset.k; route(); };
ACT.gu_q = el => { guQ = el.value.trim(); route(); };
ACT.gu_edit = el => {
  const g = stayCache.find(x => x.id === +el.dataset.id);
  editForm(g.name, stayFields(),
    g, async r => { await save('guest_stays', r); route(); }, { danger: async () => { await del('guest_stays', g.id); route(); }, dangerAsk: t('delete_stay_q'),
      after: can('m_tickets') || can('tickets_view') ? `<p><button type="button" class="btn ghost small" data-act="gu_tickets" data-id="${g.id}">${ico('ticket')} ${esc(t('guest_tickets'))}</button></p>` : '' });
};
const stayFields = () => [{ k: 'name', label: t('name'), req: true }, { k: 'room', label: t('room'), req: true }, { k: 'arrival', type: 'date', label: t('arrival'), req: true }, { k: 'departure', type: 'date', label: t('departure'), req: true }, { k: 'nationality', type: 'country', label: t('nationality') }, { k: 'phone', type: 'phone', country: 'nationality', label: t('phone') }];
ACT.gu_new = () => editForm(t('add_stay'), stayFields(), { arrival: D.today(), departure: D.add(D.today(), 7) }, async r => { await save('guest_stays', r); route(); });
ACT.gu_xlsx = async () => exportXlsx('guests', { [t('stays')]: (await list('guest_stays', { _limit: 5000 })).map(g => ({ [t('room')]: g.room, [t('name')]: g.name, [t('arrival')]: g.arrival, [t('departure')]: g.departure, [t('nationality')]: countryName(g.nationality), [t('phone')]: g.phone || '', [t('language')]: g.lang || '' })) });
ACT.rooms_add = async () => { const j = await api('mgr_rooms_add', { p_text: $('#rooms-in').value }); toast(t('rooms_added', { n: j.added })); route(); };
ACT.rooms_unlock = async () => { await api('mgr_attempts_clear'); toast(t('done')); };
let roomCache = [];
ACT.room_info = el => { const r = roomCache.find(x => x.id === +el.dataset.id); closeModals();
  editForm(t('room') + ' ' + r.room_number, [{ k: 'info', label: t('room_info'), hint: t('room_info_hint') }], r, async x => { await save('rooms', { id: r.id, info: x.info }); route(); }); };
ACT.room_tap = el => { closeModals(); const id = +el.dataset.id; const on = !el.classList.contains('off'), rm = roomCache.find(x => x.id === id) || {};
  modal(t('room') + ' ' + (rm.room_number || el.textContent), `${rm.info ? `<p>${esc(rm.info)}</p>` : ''}<div class="sheet-actions"><button class="btn ghost wide" data-act="room_info" data-id="${id}">${ico('edit')} ${esc(t('room_info'))}</button><button class="btn ghost wide" data-act="room_toggle" data-id="${id}" data-a="${on ? 0 : 1}">${ico(on ? 'x' : 'check')} ${esc(on ? t('room_off') : t('room_on'))}</button>
    <button class="btn ghost wide danger" data-act="room_del" data-id="${id}">${ico('trash')} ${esc(t('room_remove'))}</button></div><p class="muted small">${esc(t('room_off_hint'))}</p>`, {}); };
ACT.room_del = async el => { closeModals(); if (!await confirmBox(t('room_remove_q'), t('delete'))) return; const j = await del('rooms', +el.dataset.id);
  toast(j.archived ? t('archived_instead') : t('deleted'), j.archived ? 'warn' : 'ok'); route(); };    // a room with guests' stays is kept as inactive
ACT.room_toggle = async el => { closeModals(); await save('rooms', { id: +el.dataset.id, active: el.dataset.a === '1' }); route(); };
ACT.bk_day = el => { bkDay = el.dataset.date; route(); };
ACT.bk_set = async el => { await save('bookings', { id: +el.dataset.id, status: el.dataset.s }); route(); };
ACT.bk_print = el => {
  const i = bkCache.items.find(x => x.id === +el.dataset.id); const bs = bkCache.books.filter(b => b.item_id === i.id && b.status !== 'cancelled');
  printSheet(itemName(i), tableHtml([t('room'), t('name'), t('seats'), t('status')], bs.map(b => [bkCache.st(b.stay_id).room || '', bkCache.st(b.stay_id).name || '', b.seats, t(b.status === 'waiting' ? 'waiting_list' : b.status)])), { sub: [D.span(i.date, i.date), hm(i.start_time) + (i.end_time ? '–' + hm(i.end_time) : ''), i.location].filter(Boolean).join(' · ') });
};

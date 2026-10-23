'use strict';
/* AUREA · pages/hotels.js — Hotels: add, edit, open a hotel.
   Uses: core/state · translations/languages · supabase · core/utils · core/permissions · core/actions · components/cards · core/auth ·
         core/router · components/forms · components/navigation */
/* ---------- Hotels ---------- */
page('hotels', {
  perm: 'm_hotels', icon: 'building', group: 'admin',
  render: async () => {
    const { hotels } = await api('mgr_hotels'); hotelsCache = hotels;
    return `<p class="row"><span class="muted grow">${esc(t('hotels_intro'))}</span>${can('all_hotels') ? `<button class="btn small" data-act="ho_new">${esc(t('add_hotel'))}</button>` : ''}</p>
      <div class="list">${hotels.map(h => `<div class="li row">${h.logo_url ? `<img class="ava xs" src="${esc(h.logo_url)}" alt="">` : ''}<span><b>${esc(h.name)}</b>${h.id === S.hotel.id ? ' ' + chip(t('current'), 'ok') : ''}${h.status === 'inactive' ? ' ' + chip(t('inactive')) : ''}
        <small class="muted"> ${h.teams} ${esc(t('teams'))} · ${h.staff} ${esc(t('staff'))} · ${h.rooms} ${esc(t('rooms'))} · ${h.guests} ${esc(t('guests_in_house'))}</small></span><span class="grow"></span>
        ${h.id !== S.hotel.id ? `<button class="btn ghost small" data-act="ho_open" data-id="${h.id}">${esc(t('open'))}</button>` : ''}<button class="btn ghost small" data-act="ho_edit" data-id="${h.id}">${esc(t('edit'))}</button></div>`).join('')}</div>`;
  }
});
let hotelsCache = [];
const hotelFields = () => [{ k: 'name', label: t('name'), req: true }, { k: 'logo_url', type: 'image', label: t('logo') }, { k: 'timezone', label: t('timezone'), hint: 'Africa/Cairo, Europe/Berlin …', def: 'Africa/Cairo' },
  { k: 'currency', type: 'select', label: t('currency'), options: curOpts(), def: 'EUR', hint: t('hotel_currency_hint') }, { k: 'status', type: 'select', label: t('status'), options: [['active', t('active')], ['inactive', t('inactive')]] }];
ACT.ho_new = () => editForm(t('add_hotel'), hotelFields(), { status: 'active' }, async r => { await api('mgr_hotel_save', { p_row: r }); await loadMe(); renderShell(); route(); }, { after: `<p class="muted small">${esc(t('new_hotel_note'))}</p>` });
ACT.ho_edit = el => { const h = hotelsCache.find(x => x.id === +el.dataset.id); editForm(h.name, hotelFields(), h, async r => { await api('mgr_hotel_save', { p_row: Object.assign({ id: h.id }, r) }); await loadMe(); renderShell(); route(); }); };
ACT.ho_open = async el => { await api('staff_context', { p_hotel_id: +el.dataset.id, p_team_id: null }); await loadMe(); renderShell(); location.hash = '#/dashboard'; route(); };

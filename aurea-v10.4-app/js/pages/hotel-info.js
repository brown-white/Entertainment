'use strict';
/* AUREA · pages/hotel-info.js — staff pages: bus times, weather, hotel info.
   Uses: core/state · translations/languages · supabase · core/utils · icons/icons · core/permissions · components/cards · core/router */
/* ---------- Bus, weather, hotel info ---------- */
page('bus', {
  perm: 'bus,m_content', icon: 'swap', group: 'team', title: 'bus_times',
  render: async () => { const rows = await list('buses'); return (can('m_content') ? `<p><a class="btn small" href="#/content/buses">${esc(t('edit'))}</a></p>` : '') + (rows.length ? busTable(rows) : empty(t('no_bus'))); }
});
page('weather', {
  perm: 'weather', icon: 'cloud', group: 'team',
  render: async () => S.settings.lat ? `<div id="wx"></div>` : empty(t('no_location')),
  mount: () => weatherInto($('#wx'), S.settings.lat, S.settings.lon, false)
});
page('hotelinfo', {
  perm: 'hotel_info,m_content', icon: 'info', group: 'team', title: 'hotel_info',
  render: async () => {
    const rows = await list('hotel_info');
    return (can('m_content') ? `<p><a class="btn small" href="#/content/info">${esc(t('edit'))}</a></p>` : '') + (rows.length ? `<div class="info-cards">${rows.map(i => `<article class="card">${i.image_url ? `<img src="${esc(i.image_url)}" alt="">` : ''}<h2>${ico(i.icon)} ${esc(tx(i.title_i18n, i.title))}</h2><p class="prose">${nl2br(tx(i.body_i18n, i.body))}</p></article>`).join('')}</div>` : empty(t('no_info')));
  }
});

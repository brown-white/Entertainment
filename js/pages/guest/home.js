'use strict';
/* AUREA · pages/guest/home.js — guest app: choose the hotel, the home page, More, hotel info, our team, photos, own pages.
   Uses: core/state · translations/languages · core/utils · icons/icons · core/actions · components/cards · core/auth · core/router ·
         components/navigation · systems/guest-lifecycle · systems/team-schedule · systems/program-engine */
page('g_hotels', {
  mode: 'guest', title: 'choose_hotel',
  render: async () => `<div class="hotel-pick">${(S.g.hotels || []).map(h => `<button class="hotel-card" data-act="g_pick_hotel" data-id="${h.id}">
      ${h.logo_url ? `<img src="${esc(h.logo_url)}" alt="">` : `<span class="mono">${esc(h.name.slice(0, 1))}</span>`}<b>${esc(h.name)}</b><small>${esc(h.app_name || '')}</small></button>`).join('')}</div>`
});
ACT.g_pick_hotel = async el => { S.g.hotelId = +el.dataset.id; store.set('ghotel', S.g.hotelId); await guestLoad(); renderShell(); location.hash = '#/g_home'; route(); };

page('g_home', {
  mode: 'guest', title: () => S.g.home?.hotel?.name || '',
  render: async () => {
    const st = gSet(), today = D.today(), nowMin = hotelNowMin();
    const its = gItems().filter(i => i.date === today && i.status === 'scheduled');
    const now = its.filter(i => mins(i.start_time) <= nowMin && endMin(i) > nowMin), next = its.filter(i => mins(i.start_time) > nowMin).slice(0, 3);
    const welcome = tx(st.welcome, st.welcome?.en || '');
    const tiles = guestMenu().map(x => `<a class="tile" href="#/${x.key}"><span>${ico(x.icon)}</span><b>${esc(x.label)}</b></a>`).join('')
      + `<a class="tile" href="#/g_stay"><span>${ico('heart')}</span><b>${esc(t('g_my_stay'))}</b></a>`
      + (waUrl(st.whatsapp) ? `<a class="tile" href="${esc(waUrl(st.whatsapp))}" target="_blank" rel="noopener"><span>${ico('phone')}</span><b>${esc(t('link_whatsapp'))}</b></a>` : '');
    const di = dayOf(S.g.home.days, today);
    return `<div class="card g-hero">${signedIn() ? `<p class="hello">${esc(t('hello_name', { name: S.g.me.stay.name }))}</p>` : ''}
      ${dayName(di) || restName(di) ? `<div class="day-banner"><small>${esc(t('today'))} · ${esc(D.long(today))}</small>${dayName(di) ? `<b>${esc(dayName(di))}</b>` : ''}${restName(di) ? `<span>${ico('dish')} ${esc(t('restaurant_theme'))}: ${esc(restName(di))}</span>` : ''}</div>` : ''}
      ${welcome ? `<p class="lead">${nl2br(welcome)}</p>` : ''}<div id="g-weather"></div></div>
      ${signedIn() ? '' : `<a class="card cta" href="#/g_stay"><b>${esc(t('sign_in_cta_title'))}</b><span>${esc(t('sign_in_cta'))}</span><span class="btn">${esc(t('sign_in'))}</span></a>`}
      ${now.length ? `<section><h2>${esc(t('now_on'))}</h2><div class="items">${now.map(i => itemRow(i)).join('')}</div></section>` : ''}
      <section><h2>${esc(t('next_up'))}</h2>${next.length ? `<div class="items">${next.map(i => itemRow(i)).join('')}</div>` : empty(t('nothing_more_today'))}
        <a class="more-link" href="#/g_prog">${esc(t('see_programme'))} →</a></section>
      ${(S.g.home.winners || []).filter(w => w.prizes.length).map(w => `<section class="card winners"><h2>${ico('trophy')} ${esc(t('winners'))} · ${esc(w.title)}</h2>
        <ol>${w.prizes.map(p => `<li>${p.image_url ? `<img src="${esc(p.image_url)}" alt="" loading="lazy">` : ''}<span class="grow"><b>${esc(p.label)}</b>${p.value ? `<small>${esc(p.value)}</small>` : ''}</span><span class="tk-no">${esc(t('ticket_no'))} ${esc(p.ticket_number)}</span></li>`).join('')}</ol></section>`).join('')}
      <div class="tiles">${tiles}</div>`;
  },
  mount: () => { const st = gSet(); if (st.f_weather !== false && st.lat) weatherInto($('#g-weather'), st.lat, st.lon, true); }
});
function contactBlock(st) {
  const L = [['whatsapp', waUrl(st.whatsapp)], ['phone', st.phone && 'tel:' + String(st.phone).replace(/[^\d+]/g, '')], ['email', st.email && 'mailto:' + st.email],
    ['website', st.website], ['instagram', st.instagram], ['facebook', st.facebook], ['tiktok', st.tiktok], ['youtube', st.youtube],
    ['tripadvisor', st.tripadvisor], ['google_reviews', st.google_reviews], ['holidaycheck', st.holidaycheck]].filter(x => x[1]);
  if (!L.length) return '';
  return `<section><h2>${esc(t('contact_us'))}</h2><div class="links">${L.map(([k, u]) => `<a class="btn ghost small" href="${esc(u)}" target="_blank" rel="noopener">${esc(t('link_' + k))}</a>`).join('')}</div></section>`;
}

page('g_more', {
  mode: 'guest', title: 'more',
  render: async () => {
    return `<div class="menu-all"><section>${guestMenu().slice(1).map(x => `<a href="#/${x.key}"><span class="mi">${ico(x.icon)}</span><span class="grow">${esc(x.label)}</span>${ico('chev', 'chev')}</a>`).join('')}
      ${canInstall() ? `<a href="#" data-act="install"><span class="mi">${ico('download')}</span><span class="grow">${esc(t('install_app'))}</span></a>` : ''}
      <a href="#" data-act="lang"><span class="mi">${ico('globe')}</span><span class="grow">${esc(t('language'))} · ${esc((LANGS.find(l => l[0] === S.lang) || LANGS[0])[1])}</span></a>
      ${(S.g.hotels || []).length > 1 ? `<a href="#" data-act="g_change_hotel"><span class="mi">${ico('building')}</span><span class="grow">${esc(t('change_hotel'))}</span></a>` : ''}</section></div>`;
  }
});

page('g_info', {
  mode: 'guest', title: 'hotel_info',
  render: async () => {
    const g = S.g.home; const st = gSet();
    const bus = g.buses;
    return `${g.info.length ? `<div class="info-cards">${g.info.map(i => `<article class="card">${i.image_url ? `<img src="${esc(i.image_url)}" alt="">` : ''}<h2>${ico(i.icon)} ${esc(tx(i.title_i18n, i.title))}</h2><p class="prose">${nl2br(tx(i.body_i18n, i.body))}</p></article>`).join('')}</div>` : empty(t('no_info'))}
      ${st.f_bus !== false && bus.length ? `<section><h2>${esc(t('bus_times'))}</h2>${busTable(bus)}</section>` : ''}
      ${st.f_weather !== false && st.lat ? `<section id="g-weather2"></section>` : ''}${contactBlock(st)}`;
  },
  mount: () => { const st = gSet(); if ($('#g-weather2')) weatherInto($('#g-weather2'), st.lat, st.lon, false); }
});
page('g_team', {
  mode: 'guest', title: 'our_team',
  render: async () => { const team = S.g.home.team; return team.length ? `<div class="people">${team.map(m => `<div class="person">${avatar(m.photo_url, m.name, 'lg')}<b>${esc(m.name)}</b><small>${esc(m.role)}${m.nationality ? ' · ' + esc(countryName(m.nationality)) : ''}</small>${m.bio ? `<p>${esc(m.bio)}</p>` : ''}</div>`).join('')}</div>` : empty(t('no_team')); }
});
page('g_photos', {
  mode: 'guest', title: 'photos',
  render: async () => { const ph = S.g.home.photos; return ph.length ? `<div class="gallery">${ph.map(p => `<figure><img src="${esc(p.url)}" alt="${esc(p.caption || '')}" loading="lazy" data-act="lightbox">${p.caption ? `<figcaption>${esc(p.caption)}</figcaption>` : ''}</figure>`).join('')}</div>` : empty(t('no_photos')); }
});
page('g_page', {
  mode: 'guest', title: 'page', heading: arg => (S.g.home.pages.find(p => String(p.id) === arg)?.title) || t('page'),
  render: async arg => { const p = S.g.home.pages.find(x => String(x.id) === arg); return p ? `<article class="card prose">${nl2br(p.body)}</article>` : empty(t('not_found')); }
});

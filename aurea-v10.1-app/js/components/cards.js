'use strict';
/* AUREA · components/cards.js — small shared view pieces: empty state, avatar, chips, stars, tabs, day strip, item names and types, phone buttons,
   bus times, the weather box and the photo lightbox.
   Uses: translations/languages · core/utils · icons/icons · components/modals · core/actions */
const safeColor = c => (/^#[0-9a-f]{6}$/i.test(c || '') ? c : '#8C7B6B');
const catChip = c => `<span class="chip cat" style="--cc:${safeColor(c.color)}">${esc(catName(c))}</span>`;
const catName = c => (c ? tx(c.name_i18n, c.key && c.name.toLowerCase() === c.key ? t('cat_' + c.key) : c.name) : '');
/* call + WhatsApp buttons for one phone number (the same everywhere) */
const phoneBtns = (phone, cls = 'small') => phone ? `<a class="btn ${cls}" href="tel:${esc(String(phone).replace(/[^\d+]/g, ''))}">${ico('phone')} ${esc(t('call'))}</a>${waUrl(phone) ? `<a class="btn ghost ${cls}" href="${esc(waUrl(phone))}" target="_blank" rel="noopener">WhatsApp</a>` : ''}` : '';

/* ---------- small shared view pieces ---------- */
const TYPES = ['activity', 'event', 'show', 'live_music', 'special_event'];
const STATUS = ['working', 'day_off', 'vacation', 'absent', 'sick'];
const empty = (text, action) => `<div class="empty"><p>${esc(text)}</p>${action || ''}</div>`;
const avatar = (url, name, cls = '') => url ? `<img class="ava ${cls}" src="${esc(url)}" alt="" loading="lazy">` : `<span class="ava ${cls} ini" aria-hidden="true">${esc((name || '?').trim().slice(0, 1).toUpperCase())}</span>`;
const chip = (text, cls = '') => `<span class="chip ${cls}">${esc(text)}</span>`;
const stars = n => (n ? `<span class="stars" role="img" aria-label="${n}/5">${[1, 2, 3, 4, 5].map(i => ico('star', i <= n ? 'fill' : 'dim')).join('')}</span>` : '');
const tabs = (base, items, cur) => `<nav class="tabs" role="tablist">${items.filter(Boolean).map(([k, l]) => `<a role="tab" href="#/${base}/${k}" class="${k === cur ? 'on' : ''}" aria-selected="${k === cur}">${esc(l)}</a>`).join('')}</nav>`;
function dayStrip(sel, from, n, act) {
  return `<div class="daystrip" role="listbox">${D.range(from, n).map(d => `<button role="option" aria-selected="${d === sel}" class="${d === sel ? 'on' : ''}" data-act="${act}" data-date="${d}">
    <span>${esc(D.fmt(d, { weekday: 'short' }))}</span><b>${esc(D.fmt(d, { day: 'numeric' }))}</b><small>${d === D.today() ? esc(t('today')) : esc(D.fmt(d, { month: 'short' }))}</small></button>`).join('')}</div>`;
}
const itemName = it => tx(it.name_i18n, it.name);
const itemDesc = it => tx(it.desc_i18n, it.description);
const typeLabel = ty => t('type_' + ty);
const statusLabel = s => t('st_' + s);
const busTable = rows => {
  const dirs = uniq(rows.map(r => r.direction));
  return dirs.map(d => `<div class="bus"><h3>${esc(t('dir_' + d) !== 'dir_' + d ? t('dir_' + d) : d)}</h3><div class="times">${rows.filter(r => r.direction === d).map(r => `<span>${esc(hm(r.time))}${r.note ? `<small>${esc(r.note)}</small>` : ''}</span>`).join('')}</div></div>`).join('');
};

/* ---------- lightbox + weather (shared by guests and staff) ---------- */
ACT.lightbox = el => {
  const imgs = $$('img[data-act=lightbox]', el.closest('.page') || document); let i = imgs.indexOf(el);
  const m = modal('', `<div class="lightbox"><img src="${esc(el.src)}" alt=""><p>${esc(el.alt || '')}</p>${imgs.length > 1 ? `<div class="row"><button class="btn ghost" data-lb="-1">‹</button><button class="btn ghost" data-lb="1">›</button></div>` : ''}</div>`, { wide: true, noFocus: true });
  m.root.onclick = ev => { const b = ev.target.closest('[data-lb]'); if (!b) return; i = (i + +b.dataset.lb + imgs.length) % imgs.length; $('img', m.root).src = imgs[i].src; $('p', m.root).textContent = imgs[i].alt || ''; };
};
const WX = c => (c === 0 ? ['sun', 'wx_clear'] : c <= 3 ? ['partly', 'wx_cloudy'] : c <= 48 ? ['fog', 'wx_fog'] : c <= 67 ? ['rain', 'wx_rain'] : c <= 77 ? ['snow', 'wx_snow'] : c <= 82 ? ['rain', 'wx_showers'] : ['storm', 'wx_storm']);
async function weatherInto(el, lat, lon, mini) {
  if (!el || !lat) return;
  try {
    const r = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code,wind_speed_10m&daily=weather_code,temperature_2m_max,temperature_2m_min,uv_index_max&timezone=auto&forecast_days=5`);
    const w = await r.json(); const c = w.current; const [ic, k] = WX(c.weather_code);
    el.innerHTML = `<div class="card weather"><div class="now"><span class="wx">${ico(ic, 'wx')}</span><b>${Math.round(c.temperature_2m)}°</b><span>${esc(t(k))} · ${esc(t('wind'))} ${Math.round(c.wind_speed_10m)} km/h</span></div>
      ${mini ? '' : `<div class="days">${w.daily.time.map((d, i) => `<div><small>${esc(D.fmt(d, { weekday: 'short' }))}</small><span>${ico(WX(w.daily.weather_code[i])[0], 'wx')}</span><b>${Math.round(w.daily.temperature_2m_max[i])}°</b><small>${Math.round(w.daily.temperature_2m_min[i])}° · UV ${Math.round(w.daily.uv_index_max[i])}</small></div>`).join('')}</div>`}</div>`;
  } catch { el.innerHTML = ''; }
}

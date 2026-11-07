'use strict';
/* Mr Hassan · components/cards.js — small shared view pieces: empty state, avatar, chips, stars, tabs, day strip, item names and types, phone buttons,
   bus times, the weather box and the photo lightbox.
   Uses: translations/languages · core/utils · icons/icons · components/modals · core/actions */
const safeColor = c => (/^#[0-9a-f]{6}$/i.test(c || '') ? c : '#8C7B6B');
const catChip = c => `<span class="chip cat" style="--cc:${safeColor(c.color)}">${esc(catName(c))}</span>`;
const catName = c => (c ? tx(c.name_i18n, c.key && c.name.toLowerCase() === c.key ? t('cat_' + c.key) : c.name) : '');
/* call + WhatsApp buttons for one phone number (the same everywhere) */
const phoneBtns = (phone, cls = 'small') => phone ? `<a class="btn ${cls}" href="tel:${esc(String(phone).replace(/[^\d+]/g, ''))}">${ico('phone')} ${esc(t('call'))}</a>${waUrl(phone) ? `<a class="btn secondary ${cls}" href="${esc(waUrl(phone))}" target="_blank" rel="noopener">WhatsApp</a>` : ''}` : '';

/* ---------- small shared view pieces ---------- */
const TYPES = ['activity', 'event', 'show', 'live_music', 'special_event'];
const STATUS = ['working', 'day_off', 'vacation', 'absent', 'sick'];
// an empty list says what is missing and offers the next step (its action)
const empty = (text, action, icon = 'inbox') => `<div class="empty">${ico(icon)}<p>${esc(text)}</p>${action ? `<div class="actions">${action}</div>` : ''}</div>`;
const avatar = (url, name, cls = '') => url ? `<img class="ava ${cls}" src="${esc(url)}" alt="" loading="lazy">` : `<span class="ava ${cls} ini" aria-hidden="true">${esc((name || '?').trim().slice(0, 1).toUpperCase())}</span>`;
// ONE status chip: success / warning / danger / information carry their icon (never colour alone)
const CHIP_ICON = { ok: 'check', warn: 'alert', bad: 'alert', info: 'info' };
const chip = (text, cls = '') => { const k = String(cls).split(' ').find(c => CHIP_ICON[c]); return `<span class="chip ${cls}">${k ? ico(CHIP_ICON[k]) : ''}${esc(text)}</span>`; };
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

/* ---------- (11.0) the design system's view pieces: loading skeleton, KPI, section header, the page header's actions, the ⋯ menu,
   the timeline ---------- */
const skeleton = (kind = 'page') => `<div class="loading" role="status" aria-label="${esc(t('loading'))}">${kind === 'page' ? '<span class="skel title"></span><div class="skel-row"><span class="skel block"></span><span class="skel block"></span><span class="skel block"></span></div>' : ''}<span class="skel line"></span><span class="skel line short"></span><span class="skel block"></span></div>`;
// a KPI: the number, its name, a detail; a tone (ok / warn / bad) and where it leads
const kpi = (label, value, o = {}) => { const tag = o.href ? 'a' : 'span';
  return `<${tag} class="${o.tone || ''}" ${o.href ? `href="#/${esc(o.href)}"` : ''}><b>${esc(String(value))}</b>${esc(label)}${o.detail ? `<small>${esc(o.detail)}</small>` : ''}</${tag}>`; };
const secHead = (title, icon, actions = '', n) => `<div class="sec-head"><h2>${icon ? ico(icon) : ''}${esc(title)}${n ? ` <span class="count">${n}</span>` : ''}</h2>${actions}</div>`;
// the page's own actions, shown in the page header on the right (core/router)
const pgActions = html => (html ? `<div data-pg-actions hidden>${html}</div>` : '');
// the ⋯ menu: the other actions behind the main one (items: buttons / links with their data-act)
const moreMenu = (items, label = t('more_actions')) => (items ? `<details class="menu"><summary class="icon-btn" aria-label="${esc(label)}" title="${esc(label)}">${ico('more')}</summary><div class="menu-pop">${items}</div></details>` : '');
document.addEventListener('click', ev => {
  $$('details.menu[open]').forEach(d => { if (!d.contains(ev.target) || ev.target.closest('.menu-pop > a, .menu-pop > button')) d.open = false; });
});
// the timeline of a day: [{ at, title, sub, href, cls (now / past / late), tc (a colour token) }]
const timelineHtml = items => `<ol class="timeline">${items.map(x => `<li class="${x.cls || ''}"><time>${esc(x.at || '')}</time><span class="tl-dot" ${x.tc ? `style="--tc:${x.tc}"` : ''}></span><div class="tl-body">${x.href ? `<a href="#/${esc(x.href)}">` : ''}${x.icon ? ico(x.icon) + ' ' : ''}<b>${esc(x.title)}</b>${x.href ? '</a>' : ''}${x.sub ? `<small>${esc(x.sub)}</small>` : ''}</div></li>`).join('')}</ol>`;
// where "now" is on today's timeline: the last item that has started is now, the ones before it are past
function timelineNow(items, nowHm = String(Math.floor(hotelNowMin() / 60)).padStart(2, '0') + ':' + String(hotelNowMin() % 60).padStart(2, '0')) {
  let cur = -1; items.forEach((x, i) => { if (x.at && x.at <= nowHm) cur = i; });
  return items.map((x, i) => Object.assign({}, x, { cls: [x.cls, i === cur ? 'now' : i < cur && x.at ? 'past' : ''].filter(Boolean).join(' ') }));
}

/* ---------- lightbox + weather (shared by guests and staff) ---------- */
ACT.lightbox = el => {
  const imgs = $$('img[data-act=lightbox]', el.closest('.page') || document); let i = imgs.indexOf(el);
  const m = modal('', `<div class="lightbox"><img src="${esc(el.src)}" alt=""><p>${esc(el.alt || '')}</p>${imgs.length > 1 ? `<div class="row"><button class="btn secondary" data-lb="-1">‹</button><button class="btn secondary" data-lb="1">›</button></div>` : ''}</div>`, { wide: true, noFocus: true });
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

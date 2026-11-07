'use strict';
/* Mr Hassan · components/navigation.js — the app shell: the top bar (hotel, bell, profile, language), the hotel / team switch, the bottom bar and the side menu,
   the hidden staff sign-in, the language picker, install to home screen and the offline notice.
   Uses: core/state · translations/languages · supabase · core/utils · icons/icons · core/permissions · components/modals · core/actions ·
         components/cards · components/theme · core/auth · core/router */
/* ---------- shell: the side menu (desktop: full or a rail of icons, tablet: the rail), the top bar (hotel / team, search, notifications,
   language, profile), the bottom bar on a phone (5 places, by what the person may use) ---------- */
// the hotel's brand in the header: its logo and / or its name (Settings → Themes → Branding), else the app's mark
function brandHtml(st, sub) {
  const logo = themeLogo(st), how = st.brand_header || 'logo_name', name = st.app_name || 'Mr Hassan';
  const img = logo && how !== 'name' ? `<img src="${esc(logo)}" alt="${how === 'logo' ? esc(name) : ''}">` : !logo ? `<span class="mark" aria-hidden="true">${esc(name.trim().slice(0, 1).toUpperCase())}</span>` : '';
  return img + (how === 'logo' && logo ? '' : `<span><b>${esc(name)}</b>${sub ? `<small>${esc(sub)}</small>` : ''}</span>`);
}
function renderShell() {
  const st = S.mode === 'staff' ? S.settings : (S.g.home?.settings || {});
  applyTheme(st);
  const hotelName = S.mode === 'staff' ? S.hotel?.name : S.g.home?.hotel?.name;
  const sub = st.subtitle || [hotelName, S.mode === 'staff' && S.team ? S.team.name : ''].filter(Boolean).join(' · ');
  let right = `<button class="icon-btn" data-act="lang" aria-label="${esc(t('language'))}">${esc(S.lang.toUpperCase().slice(0, 2))}</button>`;
  if (S.mode === 'guest') {
    const unread = (S.g.me?.notifications || []).filter(n => !n.read).length;
    right = `<button class="icon-btn bell" data-act="notifs" aria-label="${esc(t('notifications'))}">${ico('bell')}${unread ? `<i>${unread}</i>` : ''}</button>` + right;
  } else {
    const un = S.inbox.notifications.filter(n => !n.read), urgent = !!S.inbox.urgent;
    right = (S.preview ? '' : `<button class="icon-btn top-search-ic" data-act="cmdk" aria-label="${esc(t('search'))}">${ico('search')}</button>`)
      + (S.preview ? '' : `<button class="icon-btn bell ${urgent ? 'urgent' : ''}" data-act="notifs" aria-label="${esc(t('notifications'))}${un.length ? ' (' + un.length + ')' : ''}">${ico('bell')}${un.length ? `<i>${un.length > 99 ? '99+' : un.length}</i>` : ''}</button>`)
      + right + `<a class="icon-btn" href="#/profile" aria-label="${esc(t('pg_profile'))}">${avatar(S.me?.photo_url, S.me?.display_name, 'xs')}</a>`;
  }
  const search = S.mode === 'staff' && !S.preview ? `<button class="top-search" data-act="cmdk">${ico('search')}<span>${esc(t('search_anything'))}</span><kbd>${/Mac|iP/.test(navigator.platform) ? '⌘' : 'Ctrl'} K</kbd></button>` : '';
  $('#top').innerHTML = `<a class="brand" href="#/${S.mode === 'staff' ? homeKey() : 'g_home'}">${brandHtml(st, sub)}</a>${S.mode === 'staff' ? ctxBar() + search : ''}<div class="top-r">${right}</div>`;
  $('#ctx').innerHTML = S.mode === 'staff' && S.preview ? `<div class="preview-bar">${ico('eye')}<span class="grow">${esc(t('preview_of', { name: S.preview.me.display_name }))}</span><button class="btn small secondary" data-act="preview_end">${esc(t('preview_end'))}</button></div>` : '';
  $('#ctx').hidden = !(S.mode === 'staff' && S.preview);
  const sk = $('.skip'); if (sk) sk.textContent = t('skip_to_content');
  showOffline();
  renderNav();
}
// the hotel / team switch (only who may see several), else where I am
function ctxBar() {
  const hs = S.hotels.length > 1 && can('all_hotels'), ts = S.teams.length > 1 && can('all_teams');
  if (!hs && !ts) return `<div class="ctx-sw static"><label>${ico('building')}<span class="ctx-txt">${esc(S.hotel?.name || '')}${S.team ? ' · ' + esc(S.team.name) : ''}</span></label></div>`;
  return `<div class="ctx-sw"><label title="${esc(t('current_hotel'))}">${ico('building')}<select data-ctx="hotel" aria-label="${esc(t('current_hotel'))}" ${hs ? '' : 'disabled'}>${S.hotels.map(h => `<option value="${h.id}" ${h.id === S.hotel?.id ? 'selected' : ''}>${esc(h.name)}</option>`).join('')}</select></label>
    <label title="${esc(t('current_team'))}">${ico('users')}<select data-ctx="team" aria-label="${esc(t('current_team'))}" ${ts ? '' : 'disabled'}>${S.teams.map(x => `<option value="${x.id}" ${x.id === S.team?.id ? 'selected' : ''}>${esc(x.name)}${x.status === 'inactive' ? ' (' + esc(t('inactive')) + ')' : ''}</option>`).join('')}</select></label></div>`;
}
document.addEventListener('change', async ev => {
  const s = ev.target.closest('[data-ctx]'); if (!s) return;
  try {
    if (s.dataset.ctx === 'hotel') await api('staff_context', { p_hotel_id: +s.value, p_team_id: null });
    else await api('staff_context', { p_hotel_id: S.hotel.id, p_team_id: +s.value });
    await loadMe(); renderShell(); route();
  } catch (e) { fail(e); }
});
document.addEventListener('aurea:page-open', () => { if (!wideDesk()) navOpen = false; renderNav(); });
/* the bottom bar on a phone: home, then what this person works with most – My day, the programme, requests, tasks, tickets, games –
   as far as they may open it (Role + Permissions, the menu builder's hidden pages), and More (the whole menu) */
const TAB_PICKS = ['myday', 'programme', ['guestreq', 'gsupport', 'requests'], 'tasks', 'tickets', 'games', 'attendance'];
function tabPicks(m) {
  const has = k => m.find(x => x.key === k), out = [m[0]];
  TAB_PICKS.forEach(k => { const e = (Array.isArray(k) ? k : [k]).map(has).find(Boolean); if (e && !out.includes(e) && out.length < 4) out.push(e); });
  m.forEach(e => { if (out.length < 4 && !out.includes(e)) out.push(e); });
  return out.filter(Boolean);
}
let navOpen = false;   // a tablet: the side menu opened in full (until the next page)
const wideDesk = () => window.matchMedia('(min-width: 1200px)').matches;
function renderNav() {
  const nav = $('#tabbar');
  if (S.mode === 'guest') {
    const items = [['g_home', 'home', t('g_explore')]].concat(guestMenu().slice(0, 1).map(x => [x.key, x.icon, x.label]), [['g_stay', 'heart', t('g_my_stay')], ['g_more', 'dots', t('more')]]);
    const here = current.key + (current.arg ? '/' + current.arg : '');
    nav.innerHTML = items.map(([k, i, l]) => `<a href="#/${k}" class="${here === k || current.key === k ? 'on' : ''}">${ico(i)}<span>${esc(l)}</span></a>`).join('');
    $('#side').innerHTML = ''; return;
  }
  const m = menuFor(roleKey()), on = menuHere(m);
  nav.innerHTML = tabPicks(m).map(x => `<a href="#/${x.key}" class="${on === x.key ? 'on' : ''}" ${on === x.key ? 'aria-current="page"' : ''}>${ico(x.icon || 'chev')}<span>${esc(x.label)}</span></a>`).join('')
    + `<a href="#/menu_all" class="${current.key === 'menu_all' ? 'on' : ''}">${ico('menu')}<span>${esc(t('more'))}</span>${S.chatBadge ? `<i class="badge">${S.chatBadge}</i>` : ''}</a>`;
  const pref = myPrefs().nav, rail = wideDesk() ? pref === 'rail' : !navOpen;
  document.body.classList.toggle('rail', rail);
  const me = S.preview ? S.preview.me : S.me;
  $('#side').innerHTML = `<div class="side-head"><a class="brand" href="#/${homeKey()}" title="${esc(S.settings?.app_name || 'Mr Hassan')}">${brandHtml(S.settings || {}, S.hotel?.name)}</a></div>
    <div class="side-scroll">${menuList(m, 'side', on)}</div>
    <div class="side-foot"><a class="side-link ${on === 'profile' ? 'on' : ''}" href="#/profile" title="${esc(me?.display_name || '')}">${avatar(me?.photo_url, me?.display_name, 'xs')}<span>${esc(me?.display_name || '')}</span></a>
      <button class="side-btn" data-act="nav_toggle" aria-label="${esc(t(rail ? 'nav_expand' : 'nav_collapse'))}" title="${esc(t(rail ? 'nav_expand' : 'nav_collapse'))}">${ico('chev', rail === isRtl() ? 'flip' : '')}</button>
      <button class="side-btn" data-act="signout" aria-label="${esc(t('sign_out'))}" title="${esc(t('sign_out'))}">${ico('logout')}</button></div>`;
}
// the menu in its groups: the side menu (links) or the whole menu on a phone (tiles)
function menuList(m, where = 'all', on = menuHere(m)) {
  return GROUPS.map(g => {
    const its = m.filter(x => x.group === g); if (!its.length) return '';
    const link = x => where === 'side'
      ? `<a class="side-link ${on === x.key ? 'on' : ''}" href="#/${x.key}" title="${esc(x.label)}" ${on === x.key ? 'aria-current="page"' : ''}>${ico(x.icon || 'chev')}<span>${esc(x.label)}</span>${x.key === 'chat' && S.chatBadge ? `<i class="badge">${S.chatBadge}</i>` : ''}</a>`
      : `<a class="${on === x.key ? 'on' : ''}" href="#/${x.key}"><span class="mi">${ico(x.icon || 'chev')}</span><span class="grow">${esc(x.label)}</span>${x.key === 'chat' && S.chatBadge ? `<i class="badge">${S.chatBadge}</i>` : ''}</a>`;
    return where === 'side' ? `<section class="side-grp"><h3>${esc(t('grp_' + g))}</h3>${its.map(link).join('')}</section>`
      : `<section><h3>${esc(t('grp_' + g))}</h3><div class="menu-grid">${its.map(link).join('')}</div></section>`;
  }).join('') + (where === 'side' ? '' : `<section><div class="menu-grid"><a href="#/" data-act="signout"><span class="mi">${ico('logout')}</span><span class="grow">${esc(t('sign_out'))}</span></a></div></section>`);
}
// the side menu: full or the rail (a desktop keeps the choice in the person's appearance; a tablet opens it until the next page)
ACT.nav_toggle = async () => {
  if (!wideDesk()) { navOpen = !navOpen; renderNav(); return; }
  const prefs = Object.assign({}, myPrefs(), { nav: myPrefs().nav === 'rail' ? 'full' : 'rail' });
  if (S.me) S.me.ui_prefs = prefs;
  renderNav();
  if (!S.preview) api('staff_profile_save', { p_row: { ui_prefs: prefs } }).catch(fail);
};
window.matchMedia && matchMedia('(min-width: 1200px)').addEventListener?.('change', () => { if (S.mode === 'staff') renderNav(); });

/* ---------- hidden staff sign-in: 5 quick taps on the hotel name / logo ---------- */
let brandTaps = [];
document.addEventListener('click', ev => {
  if (S.mode === 'staff' || !ev.target.closest('.brand, .hotel-logo-tap')) return;
  const now = Date.now(); brandTaps = brandTaps.filter(x => now - x < 3000).concat(now);
  if (brandTaps.length >= 5) { brandTaps = []; ev.preventDefault(); location.hash = '#/login'; }
});

/* ---------- language picker (all screens) ---------- */
ACT.lang = () => modal(t('language'), `<div class="lang-grid">${LANGS.map(l => `<button class="${l[0] === S.lang ? 'on' : ''}" data-act="lang_set" data-l="${l[0]}" lang="${l[0]}">${esc(l[1])}</button>`).join('')}</div>`);
ACT.lang_set = async el => {
  S.lang = el.dataset.l; store.set('lang', S.lang);
  closeModals();
  if (S.mode === 'staff' && !S.preview) api('staff_profile_save', { p_row: { lang: S.lang } }).catch(() => {});
  renderShell(); route();
};

/* ---------- install to home screen + offline notice (files: manifest.webmanifest, sw.js, icons) ---------- */
let installEvt = null;
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); installEvt = e; });
const isStandalone = () => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const canInstall = () => !isStandalone() && (!!installEvt || /iphone|ipad|ipod/i.test(navigator.userAgent));
ACT.install = async () => { if (installEvt) { installEvt.prompt(); installEvt = null; } else toast(t('install_ios')); };
const showOffline = () => { const o = $('#offline'); if (o) { o.textContent = t('offline_banner'); o.hidden = navigator.onLine; } };
window.addEventListener('offline', showOffline);
window.addEventListener('online', () => { showOffline(); route(); });

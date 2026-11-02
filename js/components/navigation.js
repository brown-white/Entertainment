'use strict';
/* AUREA · components/navigation.js — the app shell: the top bar (hotel, bell, profile, language), the hotel / team switch, the bottom bar and the side menu,
   the hidden staff sign-in, the language picker, install to home screen and the offline notice.
   Uses: core/state · translations/languages · supabase · core/utils · icons/icons · core/permissions · components/modals · core/actions ·
         components/cards · components/theme · core/auth · core/router */
/* ---------- shell ---------- */
function renderShell() {
  applyTheme(S.mode === 'staff' ? S.settings : (S.g.home?.settings || {}));
  const st = S.mode === 'staff' ? S.settings : (S.g.home?.settings || {});
  const hotelName = S.mode === 'staff' ? S.hotel?.name : S.g.home?.hotel?.name;
  const logo = (S.mode === 'staff' ? S.hotel?.logo_url : S.g.home?.hotel?.logo_url);
  let right = `<button class="icon-btn" data-act="lang" aria-label="${esc(t('language'))}">${esc(S.lang.toUpperCase().slice(0, 2))}</button>`;
  if (S.mode === 'guest') {
    const unread = (S.g.me?.notifications || []).filter(n => !n.read).length;
    right = `<button class="icon-btn bell" data-act="notifs" aria-label="${esc(t('notifications'))}">${ico('bell')}${unread ? `<i>${unread}</i>` : ''}</button>` + right;
  } else {
    const un = S.inbox.notifications.filter(n => !n.read).length;
    right = (S.preview ? '' : `<button class="icon-btn" data-go="search" aria-label="${esc(t('search'))}">${ico('search')}</button>`) + (S.preview ? '' : `<button class="icon-btn bell" data-act="notifs" aria-label="${esc(t('notifications'))}">${ico('bell')}${un ? `<i>${un}</i>` : ''}</button>`)
      + `<button class="icon-btn" data-go="profile" aria-label="${esc(t('pg_profile'))}">${avatar(S.me?.photo_url, S.me?.display_name, 'xs')}</button>` + right;
  }
  $('#top').innerHTML = `<a class="brand" href="#/${S.mode === 'staff' ? homeKey() : 'g_home'}">${logo ? `<img src="${esc(logo)}" alt="">` : ''}
      <span><b>${esc(st.app_name || 'AUREA')}</b><small>${esc(st.subtitle || hotelName || '')}</small></span></a><div class="top-r">${right}</div>`;
  $('#ctx').innerHTML = S.mode === 'staff' ? ctxBar() : '';
  $('#ctx').hidden = S.mode !== 'staff';
  showOffline();
  renderNav();
}
function ctxBar() {
  const prev = S.preview ? `<div class="preview-bar">${esc(t('preview_of', { name: S.preview.me.display_name }))}<button class="btn small" data-act="preview_end">${esc(t('preview_end'))}</button></div>` : '';
  const hs = S.hotels.length > 1 && can('all_hotels');
  const ts = S.teams.length > 1 && can('all_teams');
  if (!hs && !ts) return prev + `<div class="ctx-line">${esc(S.hotel?.name || '')}${S.team ? ' · ' + esc(S.team.name) : ''}</div>`;
  return prev + `<div class="ctx-line">
    <label>${esc(t('current_hotel'))}<select data-ctx="hotel" ${hs ? '' : 'disabled'}>${S.hotels.map(h => `<option value="${h.id}" ${h.id === S.hotel?.id ? 'selected' : ''}>${esc(h.name)}</option>`).join('')}</select></label>
    <label>${esc(t('current_team'))}<select data-ctx="team" ${ts ? '' : 'disabled'}>${S.teams.map(x => `<option value="${x.id}" ${x.id === S.team?.id ? 'selected' : ''}>${esc(x.name)}${x.status === 'inactive' ? ' (' + esc(t('inactive')) + ')' : ''}</option>`).join('')}</select></label></div>`;
}
document.addEventListener('change', async ev => {
  const s = ev.target.closest('[data-ctx]'); if (!s) return;
  try {
    if (s.dataset.ctx === 'hotel') await api('staff_context', { p_hotel_id: +s.value, p_team_id: null });
    else await api('staff_context', { p_hotel_id: S.hotel.id, p_team_id: +s.value });
    await loadMe(); renderShell(); route();
  } catch (e) { fail(e); }
});
document.addEventListener('aurea:page-open', () => renderNav());
function renderNav() {
  const nav = $('#tabbar');
  if (S.mode === 'guest') {
    const items = [['g_home', 'home', t('g_explore')]].concat(guestMenu().slice(0, 1).map(x => [x.key, x.icon, x.label]), [['g_stay', 'heart', t('g_my_stay')], ['g_more', 'dots', t('more')]]);
    const here = current.key + (current.arg ? '/' + current.arg : '');
    nav.innerHTML = items.map(([k, i, l]) => `<a href="#/${k}" class="${here === k || current.key === k ? 'on' : ''}">${ico(i)}<span>${esc(l)}</span></a>`).join('');
    $('#side').innerHTML = ''; return;
  }
  const m = menuFor(roleKey());
  const first = m.slice(0, 4);
  nav.innerHTML = first.map(x => `<a href="#/${x.key}" class="${current.key === x.key ? 'on' : ''}">${ico(x.icon || 'chev')}<span>${esc(x.label)}</span></a>`).join('')
    + `<a href="#/menu_all" class="${current.key === 'menu_all' ? 'on' : ''}">${ico('menu')}<span>${esc(t('menu'))}</span>${S.chatBadge ? `<i class="dot">${S.chatBadge}</i>` : ''}</a>`;
  $('#side').innerHTML = menuList(m);
}
function menuList(m) {
  return GROUPS.map(g => {
    const its = m.filter(x => x.group === g); if (!its.length) return '';
    return `<section><h3>${esc(t('grp_' + g))}</h3>${its.map(x => `<a href="#/${x.key}" class="${(current.key + (current.arg ? '/' + current.arg : '')).startsWith(x.key) ? 'on' : ''}"><span class="mi">${ico(x.icon || 'chev')}</span><span class="grow">${esc(x.label)}</span>${x.key === 'chat' && S.chatBadge ? `<i class="dot">${S.chatBadge}</i>` : ''}</a>`).join('')}</section>`;
  }).join('') + `<section><a href="#/" data-act="signout"><span class="mi">${ico('x')}</span><span class="grow">${esc(t('sign_out'))}</span></a></section>`;
}

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

'use strict';
/* AUREA · app.js — starts the app: staff (a saved session) or guest (the hotel's home); the session ending and signing out; the offline files.
   Uses: core/state · translations/languages · supabase · core/utils · components/modals · core/actions · components/cards ·
         components/theme · core/auth · core/router · components/navigation · systems/notifications */
/* ---------- boot ---------- */
async function bootGuest() {
  S.mode = 'guest';
  const j = await rpc('public_hotels');
  if (!j.hotels.length) {
    const s = await rpc('setup_status');
    if (s.needs_setup) { S.mode = 'setup'; applyTheme({}); $('#top').innerHTML = `<span class="brand"><span><b>AUREA</b><small>${esc(t('setup_title'))}</small></span></span><div class="top-r"><button class="icon-btn" data-act="lang">${esc(S.lang.toUpperCase().slice(0, 2))}</button></div>`; $('#tabbar').innerHTML = ''; return; }
  }
  S.g.hotels = j.hotels;
  const qh = new URLSearchParams(location.search).get('hotel');
  if (qh && j.hotels.some(h => String(h.id) === qh)) { S.g.hotelId = +qh; store.set('ghotel', S.g.hotelId); }
  if (!j.hotels.some(h => h.id === S.g.hotelId)) S.g.hotelId = j.hotels.length === 1 ? j.hotels[0].id : null;
  if (S.g.hotelId) await guestLoad();
  renderShell();
  if (!store.get('lang')) setTimeout(() => ACT.lang(), 200);
}
async function boot() {
  $('#view').innerHTML = `<div class="loading"><span></span><span></span><span></span></div>`;
  try {
    if (S.token) {
      try { await loadMe(); } catch (e) { if (e.code !== 'signin') throw e; signOutLocal(); S.ended = true; }
    }
    if (S.mode === 'staff') { renderShell(); pollStaff(); } else { await bootGuest(); if (S.ended && S.mode === 'guest') location.hash = '#/login'; }
  } catch (e) {
    $('#view').innerHTML = `<div class="page">${empty(errText(e), `<button class="btn" onclick="location.reload()">${esc(t('try_again'))}</button>`)}</div>`;
    return;
  }
  route();
}
window.addEventListener('DOMContentLoaded', boot);
// the server no longer knows this staff session (it ended, or was signed out elsewhere): straight to the sign-in page, saying why
let ending = null;
function sessionEnded() {
  if (ending) return;
  signOutLocal(); S.ended = true; closeModals();
  ending = bootGuest().catch(() => {}).finally(() => { ending = null; if (location.hash === '#/login') route(); else location.hash = '#/login'; });
}
document.addEventListener('aurea:session-ended', sessionEnded);
ACT.signout = async () => {
  try { await rpc('staff_logout', { p_token: S.token }); } catch { /* already gone */ }
  signOutLocal(); await bootGuest(); location.hash = '#/g_home';
};
ACT.preview_end = () => { S.preview = null; renderShell(); location.hash = '#/staffadmin/staff'; };
if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => { /* file not uploaded: app still works */ });

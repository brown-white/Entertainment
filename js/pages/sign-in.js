'use strict';
/* AUREA · pages/sign-in.js — pages: staff sign-in and the first start (the first hotel and its manager).
   Uses: core/state · translations/languages · supabase · core/utils · icons/icons · components/modals · core/actions · core/auth ·
         core/router · components/forms · components/navigation · systems/notifications */
page('login', {
  mode: 'any', title: 'staff_sign_in',
  render: async () => `<form class="card narrow" id="loginf" onsubmit="return false">
    ${S.ended ? `<p class="hint-box">${ico('info')}<span>${esc(t('err_signin'))}</span></p>` : ''}
    ${fieldHtml({ k: 'username', label: t('username'), ac: 'username', req: true })}
    ${fieldHtml({ k: 'password', label: t('password'), type: 'password', ac: 'current-password', req: true })}
    <button class="btn wide" data-act="login_go">${esc(t('sign_in'))}</button>
    <p class="muted center"><a href="#/g_home">${esc(t('back_to_guest'))}</a></p></form>`
});
ACT.login_go = async el => {
  const f = $('#loginf'); const u = f.username.value.trim(), p = f.password.value;
  if (!u || !p) return toast(t('err_required', { field: t('username') }), 'bad');
  el.disabled = true;
  try {
    const j = await rpc('staff_login', { p_username: u, p_password: p });
    S.token = j.token; store.set('token', j.token); S.ended = false;
    await loadMe(); renderShell(); location.hash = '#/' + homeKey(); route(); pollStaff();
  } catch (e) { fail(e); } finally { el.disabled = false; }
};

page('setup', {
  mode: 'any', title: 'setup_title',
  render: async () => `<div class="card narrow"><p>${esc(t('setup_intro'))}</p><form id="setupf" onsubmit="return false">
    ${fieldHtml({ k: 'hotel', label: t('hotel_name'), req: true })}
    ${fieldHtml({ k: 'name', label: t('your_name'), req: true })}
    ${fieldHtml({ k: 'username', label: t('username'), req: true, hint: t('username_hint') })}
    ${fieldHtml({ k: 'password', label: t('password'), type: 'password', req: true, hint: t('password_hint') })}
    <button class="btn wide" data-act="setup_go">${esc(t('setup_create'))}</button></form></div>`
});
ACT.setup_go = async el => {
  const f = $('#setupf'); el.disabled = true;
  try {
    const j = await rpc('setup_first', { p_hotel: f.hotel.value.trim(), p_name: f.name.value.trim(), p_username: f.username.value.trim(), p_password: f.password.value });
    S.token = j.token; store.set('token', j.token); await loadMe(); renderShell(); location.hash = '#/dashboard'; route();
  } catch (e) { fail(e); } finally { el.disabled = false; }
};

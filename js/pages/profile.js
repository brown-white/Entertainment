'use strict';
/* AUREA · pages/profile.js — staff page: Profile (own details, password, install the app).
   Uses: core/state · translations/languages · supabase · core/utils · components/modals · core/actions · components/cards · core/auth ·
         core/router · components/forms · components/navigation */
/* ---------- Profile ---------- */
page('profile', {
  perm: 'myday', icon: 'user', group: 'my',
  render: async () => {
    const m = S.preview ? S.preview.me : S.me;
    const sk = S.my_skills.map(x => { const s = S.skills.find(k => k.id === x.skill_id); return s ? s.name + ' ' + '●'.repeat(x.level) : ''; }).filter(Boolean);
    return `<div class="card profile-head">${avatar(m.photo_url, m.display_name, 'lg')}<div><b>${esc(m.display_name)}</b><small>${esc(m.role_name || '')}${m.staff_number ? ' · #' + m.staff_number : ''}${S.team ? ' · ' + esc(S.team.name) : ''}</small>
      ${sk.length ? `<p class="muted">${esc(t('skills'))}: ${esc(sk.join(', '))}</p>` : ''}</div></div>
      <section class="card"><h2>${esc(t('my_details'))}</h2><form id="pf" onsubmit="return false">${fieldsHtml(profileFields(), m)}</form><button class="btn" data-act="pf_save">${esc(t('save'))}</button></section>
      <section class="card"><h2>${esc(t('change_password'))}</h2><form id="pw" onsubmit="return false">${fieldHtml({ k: 'old', type: 'password', label: t('password_current'), ac: 'current-password' })}${fieldHtml({ k: 'new', type: 'password', label: t('password_new'), ac: 'new-password', hint: t('password_hint') })}</form>
      <button class="btn" data-act="pw_save">${esc(t('change_password'))}</button></section>
      <p><button class="btn ghost" data-act="lang">${esc(t('language'))}</button> ${canInstall() ? `<button class="btn ghost" data-act="install">${esc(t('install_app'))}</button>` : ''} <button class="btn ghost" data-act="signout">${esc(t('sign_out'))}</button></p>`;
  }
});
const profileFields = () => [{ k: 'display_name', label: t('name'), req: true }, { k: 'photo_url', type: 'image', label: t('photo') }, { k: 'nationality', type: 'country', label: t('nationality') },
  { k: 'phone', type: 'phone', country: 'nationality', label: t('phone') }, { k: 'email', type: 'email', label: t('email') }, { k: 'theme', type: 'theme', label: t('my_theme'), none: t('theme_hotel') }, { k: 'bio', type: 'textarea', label: t('about_me'), rows: 3 }];
ACT.pf_save = async () => { const r = readForm($('#pf'), profileFields()); await api('staff_profile_save', { p_row: r }); await loadMe(); renderShell(); toast(t('saved')); };
ACT.pw_save = async () => { const f = $('#pw'); await api('staff_password', { p_old: f.old.value, p_new: f.new.value }); f.reset(); toast(t('password_changed')); };

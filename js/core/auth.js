'use strict';
/* AUREA · core/auth.js — the session data: the staff member's session (staff_me → hotel, team, role, permissions, menu) and the guest's hotel
   home and room key. The screens of signing in and out are pages/sign-in.js and app.js.
   Uses: core/state · supabase */
/* ---------- staff session ---------- */
async function loadMe() {
  const j = await api('staff_me');
  Object.assign(S, { me: j.me, perms: j.perms || {}, hotel: j.hotel, settings: j.settings || {}, team: j.team, hotels: j.hotels, teams: j.teams,
    roles: j.roles, menu: j.menu, pages: j.pages, skills: j.skills, categories: j.categories || [], my_skills: j.my_skills, today: j.today, mode: 'staff' });
  if (j.me.lang && !store.get('lang')) S.lang = j.me.lang;
}
function signOutLocal() { S.token = null; store.set('token', null); S.mode = 'guest'; S.me = null; S.preview = null; }
const gKey = () => store.get('gkey.' + S.g.hotelId);
async function guestLoad(from) {
  const h = await rpc('public_home', { p_hotel_id: S.g.hotelId, p_from: from || null, p_to: null });
  S.g.home = h; S.g.at = Date.now(); S.today = h.today; S.hotel = h.hotel;
  S.g.key = gKey();
  S.g.me = null;
  if (S.g.key) {
    try { S.g.me = await rpc('guest_me', { p_key: S.g.key }); } catch (e) { if (e.code === 'signin') { store.set('gkey.' + S.g.hotelId, null); S.g.key = null; } }
  }
  if (!store.get('lang') && h.settings?.default_lang) S.lang = h.settings.default_lang;
}

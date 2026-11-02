'use strict';
/* AUREA · core/state.js — the ONE app state S: who uses the app (staff session or guest), the current hotel, team, role, permissions, settings,
   the guest's hotel and stay – and store, what this phone keeps (sign-in, language, guest key).
   Uses: nothing (the first files) */
const store = {
  get(k, d = null) { try { const v = localStorage.getItem('aurea.' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { v == null ? localStorage.removeItem('aurea.' + k) : localStorage.setItem('aurea.' + k, JSON.stringify(v)); } catch { /* private mode */ } }
};

/* ---------- state ---------- */
const S = {
  lang: store.get('lang') || (navigator.language || 'en').slice(0, 2),
  token: store.get('token'),
  me: null, perms: {}, hotel: null, settings: {}, team: null, hotels: [], teams: [], roles: [], menu: [], pages: [], skills: [], my_skills: [],
  today: null, preview: null,
  inbox: { notifications: [] }, chatBadge: 0,           // the staff inbox (bell) and the unread chat (Menu badge): systems/notifications.js keeps them
  g: { hotelId: store.get('ghotel'), home: null, me: null, key: null }
};
const gSet = () => S.g.home?.settings || {};
const gItems = () => S.g.home?.items || [];
const gItem = id => gItems().find(i => String(i.id) === String(id));

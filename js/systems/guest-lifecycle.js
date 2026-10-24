'use strict';
/* AUREA · systems/guest-lifecycle.js — the guest from arrival to departure: signed in with the room, bookings, favourites, tickets, and the guest's
   notifications read every 90 seconds.
   Uses: core/state · supabase · components/modals · components/navigation · systems/notifications */
const signedIn = () => !!(S.g.me && S.g.me.stay);
const myBooking = it => (S.g.me?.bookings || []).find(b => b.item_id === it.id && (b.status === 'booked' || b.status === 'waiting'));
const isFav = it => it.template_id && (S.g.me?.favourites || []).includes(it.template_id);
async function gRefreshMe() { S.g.me = await rpc('guest_me', { p_key: S.g.key }); }
let gSeen = new Set();
async function pollGuest() {
  if (S.mode !== 'guest' || !S.g.key || document.hidden) return;
  try {
    const before = new Set((S.g.me?.notifications || []).map(n => n.id));
    await gRefreshMe();
    const fresh = (S.g.me.notifications || []).filter(n => !n.read && !before.has(n.id) && !gSeen.has(n.id));
    fresh.forEach(n => { gSeen.add(n.id); const v = notifView(n); toast(v.title); if ('Notification' in window && Notification.permission === 'granted') { try { new Notification(v.title, { body: v.body }); } catch { /* ignore */ } } });
    if (fresh.length) renderShell();
  } catch { /* offline */ }
}
setInterval(pollGuest, 90000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) pollGuest(); });

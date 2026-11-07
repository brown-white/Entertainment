'use strict';
/* Mr Hassan · systems/notifications.js — notifications: one view of manual and automatic messages (in the reader's language), the list (new on top,
   read ones folded), where each one opens, and the staff inbox read every 30 seconds (bell + unread chat).
   Uses: core/state · translations/languages · supabase · core/utils · icons/icons · core/permissions · components/modals · core/actions ·
         core/router · components/navigation */
/* ---------- notifications: one view for manual and automatic messages (in the reader's language) ---------- */
function notifView(n) {
  if (!n.kind) return { title: n.title, body: n.body || '' };
  const d = n.data || {};
  // (a low rating collected without a guest's name names "a guest", never the message's kind)
  const v = Object.assign({}, d, { name: tx(d.name_i18n, d.name || (n.kind === 'feedback_low' ? t('guest') : n.title)), date: d.date ? D.short(d.date) : '', date_to: d.date_to ? D.short(d.date_to) : '',
    old_date: d.old_date ? D.short(d.old_date) : '', kind: d.kind ? t('rk_' + d.kind) : '', type: d.type ? t('rq_' + d.type) : '', step: d.step ? t('gstep_' + d.step) : '',
    time: d.time || '', by: d.by || '' });
  return { title: t('nt_' + n.kind + '_title', v), body: t('nt_' + n.kind + '_body', v) };
}

/* (11.0) how much a notification asks: information, action needed, urgent (the icon and its colour, the bell) */
const NOTIF_URGENT = ['feedback_low', 'task_late'], NOTIF_ACT = ['task_assigned', 'reminder_due', 'req_new', 'req_reply', 'song_new', 'song_assigned', 'req_question'];
const notifLevel = n => (NOTIF_URGENT.includes(n.kind) || n.data?.priority === 'urgent' ? 'urgent' : NOTIF_ACT.includes(n.kind) ? 'act' : 'info');
const NOTIF_ICON = { urgent: 'urgent', act: 'alert', info: 'info' };
/* ---------- ONE notification list (staff and guests): new on top, read ones folded away; read / all read / dismiss ---------- */
const notifOwn = () => (S.mode === 'staff' ? S.inbox.notifications : (S.g.me?.notifications || []));
async function notifMark(ids, action) {
  if (S.mode === 'staff') await api('staff_notif_read', { p_ids: ids, p_action: action });
  else await rpc('guest_notif_read', { p_key: S.g.key, p_ids: ids, p_action: action });
  const set = ids && new Set(ids), own = notifOwn();
  own.forEach(n => { if (!set || set.has(n.id)) n.read = true; });
  if (action === 'dismiss') { const keep = own.filter(n => !(set ? set.has(n.id) : true)); own.length = 0; own.push(...keep); }
  renderShell(); const body = $('#notif-list'); if (body) body.innerHTML = notifListHtml();
}
function notifListHtml() {
  const ns = notifOwn(), nu = ns.filter(n => !n.read), rd = ns.filter(n => n.read);
  const item = n => { const v = notifView(n), lv = notifLevel(n); return `<div class="li notif ${lv} ${n.read ? '' : 'new'}"><span class="lvl" title="${esc(t('lv_' + lv))}">${ico(NOTIF_ICON[lv])}<span class="sr-only">${esc(t('lv_' + lv))}</span></span><button class="notif-main" data-act="nt_open" data-id="${n.id}" aria-label="${esc(v.title)}"><b>${esc(v.title)}</b><span>${nl2br(v.body)}</span><small class="muted">${esc(D.stamp(n.created_at))}${n.read ? '' : ' · ' + esc(t('new'))}</small></button>
    <button class="icon-btn" data-act="nt_dismiss" data-id="${n.id}" aria-label="${esc(t('dismiss'))}">${ico('x')}</button></div>`; };
  return (nu.length ? `<div class="row"><b class="grow">${esc(t('new_n', { n: nu.length }))}</b><button class="btn secondary small" data-act="nt_all">${ico('check')} ${esc(t('mark_all_read'))}</button></div><div class="list">${nu.map(item).join('')}</div>`
      : `<p class="muted">${esc(ns.length ? t('no_new_notifications') : (S.mode === 'staff' || S.g.key ? t('no_notifications') : t('sign_in_for_notifications')))}</p>`)
    + (rd.length ? `<details class="notif-old"><summary>${esc(t('earlier_read'))} (${rd.length})</summary><div class="list">${rd.map(item).join('')}</div></details>` : '');
}
ACT.notifs = () => modal(t('notifications'), `<div id="notif-list">${notifListHtml()}</div>` + ('Notification' in window && Notification.permission === 'default' ? `<p><button class="btn secondary small" data-act="g_alerts">${esc(t('turn_on_alerts'))}</button></p>` : ''), { drawer: true, noFocus: true });
/* where a notification leads when tapped (one table for staff and guests); plain announcements are only marked read */
function notifTarget(n) {
  if (S.mode === 'staff') {
    if (n.kind === 'feedback_low') openWith('feedback', { q: n.data?.room || '', status: 'all' });
    const d = n.data || {}, k = { feedback_low: 'feedback', assigned: 'schedule', unassigned: 'schedule', plan_updated: 'schedule', request_approved: 'requests', request_rejected: 'requests',
      // (10.9) the operations: my tasks, what I gave, my reminders, the guests' requests and songs
      task_assigned: 'tasks', task_done: 'tasks/team', task_late: 'tasks/team', reminder_due: 'tasks/reminders', song_new: 'guestreq/songs', song_assigned: 'guestreq/songs',
      req_new: 'guestreq/r' + d.id, req_reply: 'guestreq/r' + d.id, req_cancelled: 'guestreq/r' + d.id }[n.kind];
    const p = k && k.split('/')[0];
    return p && PAGES[p] && can(PAGES[p].perm) ? k : null;
  }
  if (n.item_id && n.kind !== 'item_cancelled' && gItem(n.item_id)) return 'g_item/' + n.item_id;   // the activity itself
  return { item_cancelled: 'g_stay', item_moved: 'g_stay', waitlist_booked: 'g_stay', tickets_released: 'g_stay', prize_won: 'g_stay',     // my bookings / my tickets
    req_status: 'g_celebrate', req_question: 'g_celebrate', song_status: 'g_songs' }[n.kind] || null;                                  // (10.9) my requests
}
ACT.nt_open = async el => {
  const n = notifOwn().find(x => x.id === +el.dataset.id); if (!n) return;
  if (!n.read) { try { await notifMark([n.id], 'read'); } catch (e) { return fail(e); } }
  const go = notifTarget(n); if (go) { closeModals(); location.hash = '#/' + go; }
};
ACT.nt_all = async () => { const ids = notifOwn().filter(n => !n.read).map(n => n.id); if (ids.length) try { await notifMark(ids, 'read'); } catch (e) { fail(e); } };
ACT.nt_dismiss = async el => { try { await notifMark([+el.dataset.id], 'dismiss'); } catch (e) { fail(e); } };

/* ---------- staff inbox: messages + unread chat, one call, gentle refresh ---------- */
let inboxSeen = null;
async function pollStaff() {
  if (S.mode !== 'staff' || S.preview || document.hidden) return;
  try {
    const j = await api('staff_inbox');
    const before = inboxSeen || new Set(j.notifications.map(n => n.id));
    const fresh = j.notifications.filter(n => !n.read && !before.has(n.id));
    inboxSeen = new Set(j.notifications.map(n => n.id));
    const changed = j.chat_unread !== S.chatBadge || j.notifications.filter(n => !n.read).length !== S.inbox.notifications.filter(n => !n.read).length;
    S.inbox = j; S.chatBadge = j.chat_unread;
    S.inbox.urgent = j.notifications.some(n => !n.read && notifLevel(n) === 'urgent');   // the bell says it (components/navigation)
    fresh.forEach(n => { const v = notifView(n); toast(v.title); if ('Notification' in window && Notification.permission === 'granted') { try { new Notification(v.title, { body: v.body }); } catch { /* ignore */ } } });
    if (changed) renderShell();
  } catch { /* offline: try later */ }
}
setInterval(pollStaff, 30000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) pollStaff(); });

ACT.g_alerts = async () => { try { await Notification.requestPermission(); } catch { /* not supported */ } };

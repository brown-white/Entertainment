'use strict';
/* AUREA · pages/notifications.js — Notifications: send a message to guests or staff.
   Uses: translations/languages · supabase · core/utils · icons/icons · components/modals · core/actions · components/cards · core/router ·
         components/forms · systems/team-schedule */
/* ---------- Notifications to guests / staff ---------- */
page('notifs', {
  perm: 'm_notifications', icon: 'bell', group: 'manage', title: 'notifications_admin',
  render: async () => {
    // the announcements sent by hand (automatic messages to one person or guest are theirs, not listed here)
    const rows = await list('notifications', { kind: null, _limit: 100 }); notifCache = rows;
    return `<p class="row"><span class="muted grow">${esc(t('notifs_intro'))}</span><button class="btn small" data-act="nt_new">${esc(t('send_notification'))}</button></p>` + (rows.length ? `<div class="list">${rows.map(n => `<div class="li row"><span>${chip(t('aud_' + (n.audience === 'stay' ? 'guests' : n.audience)))} <b>${esc(n.title)}</b><small class="muted"> ${esc(D.stamp(n.created_at))}</small><p>${esc(n.body || '')}</p></span><span class="grow"></span><button class="btn ghost small" data-act="nt_del" data-id="${n.id}">${ico('x')}</button></div>`).join('')}</div>` : empty(t('nothing_yet')));
  }
});
let notifCache = [];
ACT.nt_new = () => editForm(t('send_notification'), [{ k: 'audience', type: 'select', label: t('for_whom'), options: [['guests', t('aud_guests')], ['staff', t('aud_staff')]] },
  { k: 'team_id', type: 'select', label: t('team'), num: true, options: teamOpts(t('whole_hotel')), hint: t('team_staff_only') }, { k: 'title', label: t('title'), req: true }, { k: 'body', type: 'textarea', label: t('text'), rows: 3 },
  { k: 'expires', type: 'date', label: t('show_until') }], { audience: 'guests' }, async r => { await save('notifications', { audience: r.audience, team_id: r.audience === 'staff' ? r.team_id : null, title: r.title, body: r.body, expires_at: r.expires ? hotelTs(r.expires, '23:59') : null }); route(); });
ACT.nt_del = async el => { if (await confirmBox(t('confirm_delete'))) { await del('notifications', +el.dataset.id); route(); } };

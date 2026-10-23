'use strict';
/* AUREA · pages/content.js — pages: the hotel's own pages (staff view) and Content (hotel info, bus times, own pages).
   Uses: core/state · translations/languages · core/utils · icons/icons · components/cards · core/router · components/tables */
page('cpage', {
  title: () => (S.pages.find(p => String(p.id) === current.arg)?.title) || t('page'), hidden: true,
  render: async arg => { const cp = S.pages.find(p => String(p.id) === arg); return cp ? `<article class="card prose">${nl2br(cp.body)}</article>` : empty(t('not_found')); }
});

/* ---------- Content: hotel info, bus times, own pages ---------- */
page('content', {
  perm: 'm_content', icon: 'edit', group: 'admin', title: 'content_admin',
  render: async arg => {
    const tab = ['info', 'buses', 'pages'].includes(arg) ? arg : 'info';
    const head = tabs('content', [['info', t('hotel_info')], ['buses', t('bus_times')], ['pages', t('own_pages')]], tab);
    if (tab === 'buses') return head + await crudList('buses', {
      entity: 'buses', fields: () => [{ k: 'direction', type: 'select', label: t('direction'), options: ['to_hotel', 'to_staff_house', 'to_town', 'to_beach', 'other'].map(d => [d, t('dir_' + d)]) }, { k: 'time', type: 'time', label: t('time'), req: true }, { k: 'note', label: t('note') },
        { k: 'audience', type: 'select', label: t('for_whom'), options: [['staff', t('aud_staff')], ['guests', t('aud_guests')], ['both', t('aud_both')]] }],
      row: r => `<time>${esc(hm(r.time))}</time> <b>${esc(t('dir_' + r.direction))}</b> ${chip(t('aud_' + r.audience))}${r.note ? `<small class="muted"> · ${esc(t('note'))}: ${esc(r.note)}</small>` : ''}`
    })();
    if (tab === 'pages') return head + await crudList('cpages', {
      entity: 'custom_pages', sortable: true, intro: t('pages_intro'),
      fields: () => [{ k: 'title', label: t('title'), req: true }, { k: 'icon', type: 'icon', label: t('icon') }, { k: 'audience', type: 'select', label: t('for_whom'), options: [['guests', t('aud_guests')], ['staff', t('aud_staff')]] }, { k: 'body', type: 'textarea', label: t('text'), rows: 8 }],
      row: r => `${ico(r.icon)} <b>${esc(r.title)}</b> ${chip(t('aud_' + r.audience))}`
    })();
    return head + await crudList('info', {
      entity: 'hotel_info', sortable: true, fields: () => [{ k: 'icon', type: 'icon', label: t('icon') }, { k: 'title', label: t('title'), req: true }, { k: 'body', type: 'textarea', label: t('text'), rows: 6 }, { k: 'image_url', type: 'image', label: t('photo') },
        { k: 'title_i18n', type: 'i18n', label: t('title_translations') }, { k: 'body_i18n', type: 'i18n', label: t('text_translations') }],
      row: r => `${ico(r.icon)} <b>${esc(r.title)}</b>`
    })();
  }
});

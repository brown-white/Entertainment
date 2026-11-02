'use strict';
/* AUREA · pages/gallery.js — staff page: Gallery (photos for guests).
   Uses: translations/languages · supabase · core/utils · core/permissions · components/modals · core/actions · components/cards ·
         core/router · components/forms */
/* ---------- Gallery ---------- */
page('gallery', {
  perm: 'gallery,m_gallery', icon: 'image', group: 'team', title: 'photos',
  render: async () => {
    const rows = await list('photos', { _limit: 300 });
    return `${can('gallery') || can('m_gallery') ? `<p><label class="btn">${esc(t('add_photos'))}<input type="file" accept="image/*" multiple hidden id="gal-in"></label></p>` : ''}
      ${can('gallery') && !can('m_gallery') ? `<p class="muted small">${esc(t('gallery_staff_hint'))}</p>` : ''}
      ${rows.length ? `<div class="gallery">${rows.map(p => `<figure><img src="${esc(p.url)}" alt="${esc(p.caption || '')}" loading="lazy" data-act="lightbox"><figcaption>${esc(p.caption || '')} ${p.public ? '' : chip(t('staff_only'))}
        ${can('m_gallery') || p.staff_id === meId() ? `<button class="link" data-act="ph_edit" data-id="${p.id}">${esc(t('edit'))}</button>` : ''}</figcaption></figure>`).join('')}</div>` : empty(t('no_photos'))}`;
  },
  mount: () => {
    const inp = $('#gal-in'); if (!inp) return;
    inp.onchange = async () => {
      const files = [...inp.files]; let n = 0;
      for (const f of files) { try { const url = await uploadImage(f); await save('photos', { url, public: true }); n++; } catch (e) { fail(e); } }
      if (n) toast(t('photos_added', { n })); route();
    };
  }
});
ACT.ph_edit = async el => {
  const [p] = await list('photos', { id: +el.dataset.id });
  editForm(t('edit'), [{ k: 'caption', label: t('caption') }, can('m_gallery') && { k: 'public', type: 'bool', label: t('show_to_guests') }].filter(Boolean), p,
    async r => { await save('photos', r); route(); }, { danger: async () => { await del('photos', p.id); route(); } });
};

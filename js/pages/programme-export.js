'use strict';
/* AUREA · pages/programme-export.js — Programme → Print: the Export screen of the ONE weekly programme PDF. The design (one of the
   hotel's saved designs or a factory one), its colours, the day pictures, what shows, the watermark – beside a live preview of the
   real week – and Export PDF. A design is only how the PDF looks (export_designs, per hotel); it never changes the programme.
   Uses: core/state · translations/languages · supabase · core/utils · icons/icons · core/permissions · components/modals ·
         core/actions · components/cards · core/router · components/forms · systems/team-schedule ·
         systems/program-engine */
let pxJob = null;      // this hotel's open export: { hotel, from, key ('preset:luxury' | 'saved:<id>'), design (the values on screen), saved, data, filters }
const PX_KEY = () => 'px_design_' + (S.hotel?.id || 0);      // the design last used on this device (per hotel)
const pxCanEdit = () => can('m_program');
const pxSavedOf = key => (pxJob?.saved || []).find(x => 'saved:' + x.id === key);
// the design behind a choice: a saved one (its stored values) or a factory one
const pxFrom = key => { const sv = pxSavedOf(key); return sv ? pxDesign(sv.design) : pxDesign({}, String(key).replace('preset:', '')); };

page('prog_export', {
  perm: 'programme_view,m_program', hidden: true, title: 'px_title',
  render: async arg => {
    const from = monday(/^\d{4}-\d{2}-\d{2}$/.test(arg || '') ? arg : D.today()), intent = takeIntent('prog_export');
    const saved = await list('export_designs');
    if (!pxJob || pxJob.hotel !== S.hotel?.id) pxJob = { hotel: S.hotel?.id, filters: {} };
    if (intent) pxJob.filters = { types: intent.types || null, ops: intent.ops || null };
    pxJob.saved = saved; pxJob.from = from;
    // the design: the one on screen (kept while the week changes), else the one last used here, else the hotel's default, else the factory one
    if (!pxJob.design || (pxJob.key?.startsWith('saved:') && !pxSavedOf(pxJob.key))) {
      const last = store.get(PX_KEY()), def = saved.find(x => x.is_default);
      pxJob.key = last && (String(last).startsWith('preset:') ? PX_PRESETS[String(last).slice(7)] : pxSavedOf(last)) ? last : def ? 'saved:' + def.id : 'preset:luxury';
      pxJob.design = pxFrom(pxJob.key); pxJob.dirty = false;
    }
    pxJob.data = await pxLoad(from, pxJob.filters);
    const f = pxJob.filters, filt = [(f.types || []).map(typeLabel).join(', '), (f.ops || []).map(x => t('part_' + x)).join(', ')].filter(Boolean).join(' · ');
    const opts = (saved.length ? `<optgroup label="${esc(t('px_saved'))}">${saved.map(x => `<option value="saved:${x.id}" ${pxJob.key === 'saved:' + x.id ? 'selected' : ''}>${esc(x.name)}${x.is_default ? ' ★' : ''}</option>`).join('')}</optgroup>` : '')
      + `<optgroup label="${esc(t('px_factory'))}">${Object.keys(PX_PRESETS).map(k => `<option value="preset:${k}" ${pxJob.key === 'preset:' + k ? 'selected' : ''}>${esc(t('px_tpl_' + k))}</option>`).join('')}</optgroup>`;
    const sv = pxSavedOf(pxJob.key), edit = pxCanEdit();
    return `<p><a class="link" href="#/programme">‹ ${esc(t('programme'))}</a></p>
      <section class="card px-top">
        <div class="wv-nav px-week"><button class="btn ghost small" data-act="px_week" data-d="-7">‹ ${esc(t('prev_week'))}</button><b class="wv-range">${esc(D.span(from, D.add(from, 6)))}</b><button class="btn ghost small" data-act="px_week" data-d="7">${esc(t('next_week'))} ›</button></div>
        <div class="px-pick"><label for="px-key">${esc(t('px_design'))}</label><select id="px-key">${opts}</select>${pxJob.dirty ? chip(t('px_unsaved'), 'warn') : ''}</div>
        <div class="actions">${edit ? `<button class="btn ghost small" data-act="px_save">${ico('check')} ${esc(t('px_save'))}</button><button class="btn ghost small" data-act="px_saveas">${ico('plus')} ${esc(t('px_save_as'))}</button>
          ${sv && !sv.is_default ? `<button class="btn ghost small" data-act="px_default">★ ${esc(t('px_make_default'))}</button>` : ''}${sv ? `<button class="btn ghost small danger" data-act="px_delete">${ico('trash')} ${esc(t('delete'))}</button>` : ''}` : ''}
          <button class="btn" data-act="px_export">${ico('download')} ${esc(t('px_export'))}</button></div>
        ${filt ? `<p class="muted small row"><span class="grow">${esc(t('print_filters', { what: filt }))}</span><button class="btn ghost small" data-act="px_all">${esc(t('px_whole_week'))}</button></p>` : ''}
        <p class="muted small">${esc(t('px_intro'))}</p>
      </section>
      <div class="px-wrap">${edit ? `<form class="px-form" id="pxf" onsubmit="return false">${pxFormHtml(pxJob.design, pxJob.data)}</form>` : ''}
        <div class="px-prev"><h3>${esc(t('preview'))}</h3><div id="px-prev" class="px-pages" aria-live="polite"></div><p class="muted small" id="px-info"></p></div></div>`;
  },
  mount: () => {
    $('#px-key')?.addEventListener('change', async e => { const to = e.target.value; e.target.value = pxJob.key; if (pxJob.dirty && !await confirmBox(t('px_leave_q'), t('px_leave'))) return; e.target.value = to;
      pxJob.key = e.target.value; pxJob.design = pxFrom(pxJob.key); pxJob.dirty = false; store.set(PX_KEY(), pxJob.key); route(); });
    const root = $('#pxf');
    if (root) {
      $$('input[type=range]', root).forEach(r => r.addEventListener('input', () => { const o = r.parentNode.querySelector('output'); if (o) o.textContent = r.value; }));
      const upd = () => { pxJob.design = Object.assign({}, pxJob.design, readForm(root, pxFieldList(pxJob.data))); if (!pxJob.dirty) { pxJob.dirty = true; $('.px-pick')?.insertAdjacentHTML('beforeend', chip(t('px_unsaved'), 'warn')); } pxPreview(); };
      root.addEventListener('input', upd); root.addEventListener('change', upd);
    }
    pxPreview();
  }
});

/* the settings, in the order of the screen: Design · Day headers · Visible information · Watermark · Document */
const pxColor = (k, label, none) => ({ k, type: 'color', label, reset: none ? t('px_none') : false });      // an optional colour can be set to none
function pxGroups(data) {
  const parts = PX_PARTS.flatMap(op => [{ type: 'section', label: t('part_' + op) }, pxColor('s_' + op + '_bg', t('px_bg')), pxColor('s_' + op + '_bg2', t('px_bg2'), true), pxColor('s_' + op + '_fg', t('px_fg'))]);
  const day = w => { const dd = data?.days?.[w], di = dd ? dayOf(data.b.days, dd) : {};
    return [{ type: 'section', label: D.wdName(w) + (dayName(di) ? ' · ' + dayName(di) : ''), hint: restName(di) ? t('restaurant_theme') + ': ' + restName(di) : '' },
      { k: 'd' + w + '_img', type: 'image', label: t('px_day_image') }, { k: 'd' + w + '_x', type: 'range', label: t('px_img_x'), min: 0, max: 100, step: 1 },
      { k: 'd' + w + '_y', type: 'range', label: t('px_img_y'), min: 0, max: 100, step: 1 }, { k: 'd' + w + '_zoom', type: 'range', label: t('px_img_zoom'), min: 1, max: 3, step: 0.1 },
      pxColor('d' + w + '_ev_bg', t('px_ev_bg'), true), pxColor('d' + w + '_ev_bg2', t('px_bg2'), true), pxColor('d' + w + '_ev_fg', t('px_fg'), true)]; };
  return [
    ['design', [{ k: 'title', label: t('px_main_title'), ph: t('programme') }, { k: 'subtitle', label: t('subtitle'), ph: S.hotel?.name || '' },
      { k: 'font', type: 'select', label: t('px_font'), options: [['serif', t('tk_font_serif')], ['sans', t('tk_font_sans')]] },
      { type: 'section', label: t('px_main_colors') }, pxColor('c_head', t('px_c_head')), pxColor('c_accent', t('px_c_accent')), pxColor('c_text', t('px_c_text')),
      pxColor('c_bg', t('px_c_bg')), pxColor('c_day', t('px_c_day')), pxColor('c_card', t('px_c_card')),
      { type: 'section', label: t('px_type_colors'), hint: t('px_type_colors_hint') }, ...TYPES.map(ty => pxColor('ty_' + ty, typeLabel(ty))),
      { type: 'section', label: t('px_section_colors') }, { k: 'split', type: 'select', label: t('px_split'), options: [['diag', t('px_split_diag')], ['band', t('px_split_band')], ['half', t('px_split_half')]] },
      ...parts, pxColor('s_body', t('px_body'), true),
      { k: 'card', type: 'select', label: t('px_card'), options: [['stripe', t('px_card_stripe')], ['tint', t('px_card_tint')], ['outline', t('px_card_outline')]] },
      { k: 'empty', type: 'select', label: t('px_empty'), options: [['none', t('px_empty_none')], ['dash', '—'], ['text', t('px_no_programme')]] }]],
    ['days', PX_DAYS.flatMap(day)],
    ['visible', [{ type: 'section', label: t('px_day_info') }, ...['show_day', 'show_date', 'show_theme', 'show_restaurant'].map(k => ({ k, type: 'bool', label: t('px_' + k) })),
      { type: 'section', label: t('px_internal'), hint: t('px_internal_hint') }, ...['show_dress', 'show_dayoff', 'show_entrance', 'show_staff'].map(k => ({ k, type: 'bool', label: t('px_' + k) })),
      { type: 'section', label: t('px_cards') }, ...['show_time', 'show_name', 'show_location', 'show_type', 'show_desc', 'show_legend'].map(k => ({ k, type: 'bool', label: t('px_' + k) }))]],
    ['watermark', [{ k: 'wm_on', type: 'bool', label: t('px_wm_on') }, { k: 'wm_text', label: t('px_wm_text'), ph: S.settings?.doc_prepared_by || '' },
      { k: 'wm_pos', type: 'select', label: t('px_wm_pos'), options: ['diagonal', 'center', 'bottom', 'repeat'].map(p => [p, t('px_wm_' + p)]) },
      { k: 'wm_size', type: 'range', label: t('px_wm_size'), min: 6, max: 60, step: 1 }, { k: 'wm_opacity', type: 'range', label: t('px_wm_opacity'), min: 2, max: 30, step: 1 },
      { k: 'wm_rotate', type: 'range', label: t('px_wm_rotate'), min: -90, max: 90, step: 5 }]],
    ['document', [{ k: 'logo', type: 'bool', label: t('px_hotel_logo'), hint: S.hotel?.logo_url ? '' : t('px_no_logo') }, { k: 'ent_logo', type: 'image', label: t('px_ent_logo') },
      { k: 'show_footer', type: 'bool', label: t('px_footer'), hint: t('px_footer_hint', { who: [S.settings?.doc_prepared_by, S.settings?.doc_position].filter(Boolean).join(' · ') || '—' }) }]]];
}
const pxFieldList = data => pxGroups(data).flatMap(g => g[1]);
function pxFormHtml(d, data) {
  return pxGroups(data).map(([k, fs], i) => `<details class="px-sec" ${i === 0 ? 'open' : ''}><summary>${esc(t('px_g_' + k))}</summary>${k === 'document' ? `<p class="muted small">${esc(t('px_paper', { paper: (S.settings?.doc_paper || 'a4').toUpperCase() }))}</p>` : ''}${fieldsHtml(fs, d)}</details>`).join('');
}

/* the live preview: the very pages of the PDF (the same drawing), on every change */
let pxTimer = null;
function pxPreview() {
  clearTimeout(pxTimer);
  pxTimer = setTimeout(async () => {
    const box = $('#px-prev'); if (!box || !pxJob?.data) return;
    try {
      const r = await pxPages(pxJob.data, pxJob.design);
      box.innerHTML = r.pages.map(p => `<div class="px-page">${p}</div>`).join('');
      const info = $('#px-info'); if (info) info.textContent = t('px_pages_info', { n: r.pages.length, items: pxJob.data.items.length });
    } catch (e) { fail(e); }
  }, 140);
}
ACT.px_week = el => { const d = D.add(pxJob.from, +el.dataset.d); location.hash = '#/prog_export/' + d; };
ACT.px_all = () => { pxJob.filters = {}; route(); };
// save: into the chosen saved design; a factory design is saved as a new one of the hotel
ACT.px_save = async () => {
  const sv = pxSavedOf(pxJob.key); if (!sv) return ACT.px_saveas();
  await save('export_designs', { id: sv.id, design: pxJob.design }); pxJob.dirty = false; toast(t('saved')); route();
};
ACT.px_saveas = () => formBox(t('px_save_as'), [{ k: 'name', label: t('name'), req: true, ph: t('px_name_ph') }, { k: 'is_default', type: 'bool', label: t('px_make_default') }], { is_default: !pxJob.saved.length },
  async r => { const row = await save('export_designs', { name: r.name, kind: 'programme_week', design: pxJob.design, is_default: !!r.is_default });
    pxJob.key = 'saved:' + row.id; pxJob.dirty = false; store.set(PX_KEY(), pxJob.key); closeModals(); toast(t('saved')); route(); }, { saveLabel: t('save') });
ACT.px_default = async () => { const sv = pxSavedOf(pxJob.key); if (!sv) return; await save('export_designs', { id: sv.id, is_default: true }); toast(t('saved')); route(); };
ACT.px_delete = async () => {
  const sv = pxSavedOf(pxJob.key); if (!sv || !await confirmBox(t('px_delete_q', { name: sv.name }), t('delete'))) return;
  await del('export_designs', sv.id); pxJob.key = null; pxJob.design = null; store.set(PX_KEY(), null); toast(t('deleted')); route();
};
// the PDF: the week read again now (every change of the programme is in it), with the design on screen
ACT.px_export = async () => { try { await pxPdf(pxJob.from, pxJob.design, pxJob.filters); } catch (e) { fail(e); } };

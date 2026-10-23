'use strict';
/* AUREA · pages/ticket-designer.js — Tickets → Ticket types → Design: the template editor of a ticket type (one of its game's designs or the hotel's own,
   the information shown and its order, texts, picture, font, size) beside a live preview.
   Uses: translations/languages · supabase · core/utils · icons/icons · components/modals · core/actions · core/router · components/forms ·
         components/tables · systems/ticket-system */
let tdJob = null;
ACT.tt_design = el => {
  const ty = (CRUD.ttypes?.rows || []).find(x => x.id === +el.dataset.id); if (!ty) return;
  tdJob = { ty, key: tkTemplate(ty).key }; tdOpen();
};
const TD_TEXT = ['title', 'subtitle', 'text', 'meeting_time', 'meeting_point', 'included'];
function tdOpen() {
  const { ty, key } = tdJob, T = tkTemplate(ty, key), grid = !!T.P.grid;
  const f = [{ k: 'template', type: 'select', label: t('tk_template'), options: tplOptions(ty) },
    { type: 'section', label: t('tk_texts') }, { k: 'title', label: t('ticket_title'), hint: t('tk_title_hint') }, { k: 'subtitle', label: t('subtitle') }, { k: 'text', label: t('custom_text') },
    { k: 'meeting_time', type: 'time', label: t('meeting_time') }, { k: 'meeting_point', label: t('meeting_point') }, { k: 'included', type: 'textarea', label: t('included'), rows: 2 },
    { type: 'section', label: t('tk_look') }, { k: 'image_url', type: 'image', label: t('tk_background') },
    { k: 'font', type: 'select', label: t('tk_font'), options: [['', t('tk_font_tpl')], ['serif', t('tk_font_serif')], ['sans', t('tk_font_sans')], ['display', t('tk_font_display')]] },
    { k: 'title_size', type: 'select', label: t('tk_title_size'), options: [['s', t('size_s')], ['m', t('size_m')], ['l', t('size_l')]] },
    !grid && { k: 'orientation', type: 'select', label: t('orientation'), options: [['landscape', t('landscape')], ['portrait', t('portrait')]] },
    { k: 'size', type: 'select', label: t('tk_size'), options: Object.keys(TK_SIZE).map(k => [k, t('tks_size_' + k) + ' · ' + TK_SIZE[k][0] + ' mm']) }].filter(Boolean);
  const row = Object.assign({ template: T.key, font: T.s.font || '', title_size: T.s.title_size || 'm', orientation: T.portrait ? 'portrait' : 'landscape', size: T.s.size || 'standard' },
    Object.fromEntries(TD_TEXT.concat('image_url').map(k => [k, T.s[k] || ''])));
  const flist = `<fieldset class="field tk-fields"><legend>${esc(t('tk_fields'))}</legend><p class="muted small">${esc(t('tk_fields_hint'))}</p><div class="tk-flist">${T.order.map(fk => `<div class="tk-f" data-f="${fk}">
      <label><input type="checkbox" ${T.fields.includes(fk) ? 'checked' : ''}> ${esc(t('tf_' + fk))}${TK_STUB.includes(fk) ? ` <small class="muted">${esc(t('tk_on_stub'))}</small>` : ''}</label>
      <span class="move"><button type="button" class="icon-btn" data-mv="-1" aria-label="${esc(t('move_up'))}">${ico('up')}</button><button type="button" class="icon-btn" data-mv="1" aria-label="${esc(t('move_down'))}">${ico('down')}</button></span></div>`).join('')}</div></fieldset>`;
  modal(t('tk_design') + ' · ' + ty.name, `<div class="td-wrap"><div class="td-form" id="tdf">${formHtml(f, row)}${flist}</div><div class="td-prev"><h3>${esc(t('preview'))}</h3><div id="td-prev" class="sheet-prev"></div>
      <p class="muted small">${esc(t('tk_prev_hint'))}</p></div></div>`, {
    wide: true, cancel: true, saveLabel: t('save'),
    extra: `<button class="btn ghost" data-act="td_saveas">${ico('plus')} ${esc(t('tk_save_as'))}</button>${String(T.key).startsWith('saved:') ? `<button class="btn ghost danger" data-act="td_drop">${ico('trash')} ${esc(t('tk_drop_tpl'))}</button>` : ''}`,
    mount: root => {
      wireForm(root);
      $('[name=template]', root).addEventListener('change', e => {      // another template: what was set so far stays (not saved yet), its own look
        const draft = tdDesign(tdRead(root, f), tdJob.key); tdJob.ty = Object.assign({}, tdJob.ty, { design: draft }); tdJob.key = e.target.value; closeModals(); setTimeout(tdOpen, 30); });
      $$('.tk-f [data-mv]', root).forEach(bt => { bt.onclick = () => { const r0 = bt.closest('.tk-f'), d = +bt.dataset.mv; if (d < 0 && r0.previousElementSibling) r0.parentNode.insertBefore(r0, r0.previousElementSibling); else if (d > 0 && r0.nextElementSibling) r0.parentNode.insertBefore(r0.nextElementSibling, r0); tdPreview(root, f); }; });
      root.addEventListener('input', () => tdPreview(root, f)); root.addEventListener('change', () => tdPreview(root, f)); tdPreview(root, f);
    },
    save: async root => { await tdSave(root, f); }
  });
}
// the settings the editor shows → the design of the type (and of its chosen own template)
function tdRead(root, f) {
  const r = readForm(root, f), rows = $$('.tk-f', root);
  const set = { fields: rows.filter(x => $('input', x).checked).map(x => x.dataset.f), order: rows.map(x => x.dataset.f), font: r.font || null, title_size: r.title_size, orientation: r.orientation || 'landscape', size: r.size };
  TD_TEXT.concat('image_url').forEach(k => { set[k] = r[k] || null; });
  return set;
}
function tdDesign(set, key) {
  const d = Object.assign({}, tdJob.ty.design || {}), saved = (d.saved || []).map(x => Object.assign({}, x));
  delete d.show; delete d.style;                                    // (the old "shows" / style live on as the template)
  if (String(key).startsWith('saved:')) { const sv = saved.find(x => 'saved:' + x.id === key); if (sv) Object.assign(sv, set); }
  else Object.assign(d, set);
  return Object.assign(d, { template: key, saved });
}
let tdTimer = null;
function tdPreview(root, f) {
  clearTimeout(tdTimer);
  tdTimer = setTimeout(async () => {
    const box = $('#td-prev', root); if (!box) return;
    const ty = Object.assign({}, tdJob.ty, { design: tdDesign(tdRead(root, f), tdJob.key) }), [w, h] = tkDim(ty);
    const it = { name: t('tk_sample_event'), name_i18n: {}, date: D.add(D.today(), 2), start_time: '21:30', location: t('tk_sample_place') };
    const o = await tkInfo(ty, it, { batch: 'A', guest_name: 'Anna Muster', room: '101', seller: '#6' });
    const card = ty.game === 'bingo' ? { g: bingoNew(), s: 'preview' } : null;
    box.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" style="width:100%;max-width:${Math.round(w * 3.2)}px">${ticketSvg(ty, o, 7, card)}</svg>`;
  }, 80);
}
async function tdSave(root, f) {
  const design = tdDesign(tdRead(root, f), tdJob.key);
  await save('ticket_types', { id: tdJob.ty.id, design }); tdJob.ty.design = design; toast(t('saved')); route();
}
ACT.td_saveas = async () => {
  const root = $('#tdf')?.closest('.modal'); if (!root) return;
  const f = (() => { const T = tkTemplate(tdJob.ty, tdJob.key); return [{ k: 'template' }].concat(TD_TEXT.map(k => ({ k })), [{ k: 'image_url', type: 'image' }, { k: 'font' }, { k: 'title_size' }, !T.P.grid && { k: 'orientation' }, { k: 'size' }].filter(Boolean)); })();
  const set = tdRead(root, f), base = tkTemplate(tdJob.ty, tdJob.key).base;
  formBox(t('tk_save_as'), [{ k: 'name', label: t('name'), req: true, ph: t('tk_name_ph') }], {}, async r => {
    if (!r.name) throw new ApiError('required', { field: t('name') });
    const id = Math.random().toString(36).slice(2, 8), d = tdDesign(set, tdJob.key);
    d.saved = (d.saved || []).concat(Object.assign({ id, name: r.name, base }, set)); d.template = 'saved:' + id;
    await save('ticket_types', { id: tdJob.ty.id, design: d }); tdJob.ty.design = d; closeModals(); toast(t('saved')); route();
  }, { saveLabel: t('save') });
};
ACT.td_drop = async () => {
  if (!await confirmBox(t('tk_drop_q'), t('delete'))) return;
  const d = Object.assign({}, tdJob.ty.design || {}); d.saved = (d.saved || []).filter(x => 'saved:' + x.id !== tdJob.key); d.template = tkTemplate(Object.assign({}, tdJob.ty, { design: Object.assign({}, d, { template: null }) })).base;
  await save('ticket_types', { id: tdJob.ty.id, design: d }); closeModals(); toast(t('deleted')); route();
};

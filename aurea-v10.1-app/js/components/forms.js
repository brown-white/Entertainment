'use strict';
/* AUREA · components/forms.js — ONE generic form for every record: the fields (text, numbers, dates, choices, photos, colours, translations, offers …),
   reading and checking them, the edit form in a dialog.
   Uses: core/state · translations/languages · supabase · core/utils · icons/icons · components/modals · components/theme · core/router */
/* ---------- forms (one generic form for every simple record) ---------- */
// field: { k, label, type: text|textarea|number|date|time|select|bool|image|color|i18n|password|email|tel|stars, options:[[v,l]], req, hint, min, max, step }
function fieldHtml(f, v) {
  const id = 'f_' + f.k;
  const lab = `<label for="${id}">${esc(f.label || t(f.k))}${f.req ? ' *' : ''}</label>`;
  const hint = f.hint ? `<small class="hint">${esc(f.hint)}</small>` : '';
  const val = v ?? f.def ?? '';
  switch (f.type) {
    case 'textarea': return `<div class="field">${lab}<textarea id="${id}" name="${f.k}" rows="${f.rows || 4}">${esc(val)}</textarea>${hint}</div>`;
    case 'select': return `<div class="field">${lab}<select id="${id}" name="${f.k}">${(f.options || []).map(([ov, ol]) => `<option value="${esc(ov)}" ${String(ov) === String(val ?? '') ? 'selected' : ''}>${esc(ol)}</option>`).join('')}</select>${hint}</div>`;
    case 'bool': return `<div class="field check"><label><input type="checkbox" id="${id}" name="${f.k}" ${val === true || val === 'true' ? 'checked' : ''}> ${esc(f.label || t(f.k))}</label>${hint}</div>`;
    case 'image': return `<div class="field">${lab}<div class="img-pick" data-img="${f.k}">
        <img src="${esc(val)}" alt="" ${val ? '' : 'hidden'}><input type="hidden" name="${f.k}" value="${esc(val)}">
        <button type="button" class="btn ghost small" data-pick>${esc(t('choose_photo'))}</button>
        <button type="button" class="btn ghost small" data-clear ${val ? '' : 'hidden'}>${esc(t('remove'))}</button>
        <input type="file" accept="image/*" hidden></div>${hint}</div>`;
    case 'section': return `<div class="form-sec"><h3>${esc(f.label)}</h3>${f.hint ? `<p class="hint">${esc(f.hint)}</p>` : ''}</div>`;
    case 'country': {
      const v = val || ''; const known = COUNTRIES.some(c => c.code === v);
      return `<div class="field" data-country="${f.k}">${lab}<select id="${id}" data-csel aria-label="${esc(f.label || t(f.k))}"><option value="">${esc(t('choose_country'))}</option>${countryOpts().map(([c, n]) => `<option value="${c}" ${c === v ? 'selected' : ''}>${esc(n)}</option>`).join('')}<option value="__other" ${v && !known ? 'selected' : ''}>${esc(t('other_write'))}</option></select>
        <input name="${f.k}" value="${esc(v)}" ${v && !known ? '' : 'hidden'} placeholder="${esc(t('write_here'))}" aria-label="${esc(f.label || t(f.k))}">${hint}</div>`;
    }
    case 'phone': {
      const v = String(val || ''); const m = COUNTRIES.filter(c => v.startsWith('+' + c.dial)).sort((a, b) => b.dial.length - a.dial.length)[0];
      return `<div class="field" data-phone="${f.k}" data-link="${f.country || ''}">${lab}<div class="phone-in"><select data-dial aria-label="${esc(t('country_code'))}"><option value="">+</option>${uniq(COUNTRIES.map(c => c.dial)).sort((a, b) => a - b).map(d => `<option value="${d}" ${m && m.dial === d ? 'selected' : ''}>+${d}</option>`).join('')}</select>
        <input type="tel" data-local value="${esc(m ? v.slice(m.dial.length + 1).trim() : v)}" autocomplete="tel-national" aria-label="${esc(f.label || t(f.k))}"><input type="hidden" name="${f.k}" value="${esc(v)}"></div>${hint}</div>`;
    }
    case 'choice': return `<fieldset class="field days" data-choice="${f.k}"><legend>${esc(f.label || t(f.k))}</legend>${(f.options || []).map(([ov, ol]) => `<label class="pickchip"><input type="radio" name="${f.k}" value="${esc(ov)}" ${String(ov) === String(val ?? '') ? 'checked' : ''}> ${esc(ol)}</label>`).join('')}${hint}</fieldset>`;
    case 'multi': { const on = new Set((Array.isArray(val) ? val : []).map(String));
      return `<fieldset class="field days" data-multi="${f.k}"><legend>${esc(f.label || t(f.k))}</legend>${(f.options || []).map(([ov, ol]) => `<label class="pickchip"><input type="checkbox" value="${esc(ov)}" ${on.has(String(ov)) ? 'checked' : ''}> ${esc(ol)}</label>`).join('') || `<small class="muted">${esc(t('nothing_yet'))}</small>`}${hint}</fieldset>`; }
    case 'offers': { const rows = Array.isArray(val) && val.length ? val : [{}];
      return `<div class="field" data-offers="${f.k}">${lab}<div class="offer-rows">${rows.map(o => offerRow(o)).join('')}</div><button type="button" class="btn ghost small" data-offer-add>${ico('plus')} ${esc(t('add_offer'))}</button>${hint}</div>`; }
    case 'theme': return `<fieldset class="field theme-pick" data-themepick="${f.k}"><legend>${esc(f.label || t('theme'))}</legend>${(f.none ? [''] : []).concat(THEME_KEYS).map(k => { const th = THEMES[k] || THEMES[themeKey(S.settings || {})];
      return `<label class="theme-card ${k ? '' : 'auto'}"><input type="radio" name="${f.k}" value="${k}" ${(val || '') === k ? 'checked' : ''}>
        <span class="tc-sw" style="background:${th.bg}"><i style="background:${th.s}"></i><i style="background:${th.p}"></i><i style="background:${th.a}"></i></span>
        <b>${esc(k ? t('theme_' + k) : f.none)}</b><small>${esc(k ? t('theme_' + k + '_d') : t('theme_hotel_d'))}</small></label>`; }).join('')}</fieldset>`;
    case 'icon': return `<fieldset class="field icon-pick" data-iconpick="${f.k}"><legend>${esc(f.label || t('icon'))}</legend>${Object.keys(ICONS).filter(k => !['plus', 'minus', 'check', 'x', 'up', 'down', 'chev', 'undo', 'trash', 'dots', 'copy'].includes(k)).map(k => `<label><input type="radio" name="${f.k}" value="${k}" ${val === k ? 'checked' : ''}>${ico(k)}</label>`).join('')}</fieldset>`;
    case 'days': { const on = new Set(Array.isArray(val) ? val.map(Number) : []);
      return `<fieldset class="field days" data-days="${f.k}"><legend>${esc(f.label || t(f.k))}${f.req ? ' *' : ''}</legend>${[0, 1, 2, 3, 4, 5, 6].map(i => `<label><input type="checkbox" value="${i}" ${on.has(i) ? 'checked' : ''}> ${esc(D.wdName(i, 'short'))}</label>`).join('')}
        <button type="button" class="btn ghost small" data-days-all>${esc(t('every_day'))}</button></fieldset>`; }
    case 'stars': return `<div class="field">${lab}<div class="stars-in" data-stars="${f.k}">${[1, 2, 3, 4, 5].map(n => `<button type="button" data-n="${n}" class="${n <= (+val || 0) ? 'on' : ''}" aria-label="${n}">${ico('star')}</button>`).join('')}<input type="hidden" name="${f.k}" value="${esc(val)}"></div></div>`;
    case 'i18n': {
      const o = (val && typeof val === 'object') ? val : {};
      return `<details class="field i18n"><summary>${esc(f.label || t('translations'))}</summary>${LANGS.filter(l => f.withEn || l[0] !== 'en').map(l =>
        `<div class="row-mini"><span>${esc(l[1])}</span><input data-i18n="${f.k}" data-lang="${l[0]}" value="${esc(o[l[0]] || '')}"></div>`).join('')}</details>`;
    }
    default: {
      if (f.type === 'color') return `<div class="field">${lab}<div class="row"><input id="${id}" name="${f.k}" type="color" value="${esc(val || '#000000')}" ${val ? '' : 'data-empty="1"'}><button type="button" class="btn ghost small" data-color-reset="${f.k}">${esc(t('role_default'))}</button></div>${hint}</div>`;
      const type = { number: 'number', date: 'date', time: 'time', password: 'password', email: 'email', tel: 'tel' }[f.type] || 'text';
      return `<div class="field">${lab}<input id="${id}" name="${f.k}" type="${type}" value="${esc(type === 'time' ? hm(val) : val)}" ${attr({ min: f.min, max: f.max, step: f.step, placeholder: f.ph, autocomplete: f.ac || 'off', required: !!f.req })}>${hint}</div>`;
    }
  }
}
const fieldsHtml = (fields, row = {}) => fields.filter(f => !f.hide).map(f => fieldHtml(f, row[f.k])).join('');
const formHtml = (fields, row = {}) => `<form class="form" onsubmit="return false">${fieldsHtml(fields, row)}</form>`;
function readForm(root, fields) {
  const out = {};
  for (const f of fields) {
    if (f.hide || f.readonly) continue;
    if (f.type === 'section') continue;
    if (f.type === 'offers') { out[f.k] = $$(`[data-offers="${f.k}"] .offer-row`, root).map(r => ({ qty: +$('[data-q]', r).value, price: $('[data-p]', r).value === '' ? NaN : +$('[data-p]', r).value })).filter(o => o.qty > 1 && o.price >= 0).sort((a, b) => a.qty - b.qty); continue; }
    if (f.type === 'multi') { out[f.k] = $$(`[data-multi="${f.k}"] input:checked`, root).map(i => (f.num ? +i.value : i.value)); continue; }
    if (f.type === 'choice') { out[f.k] = $(`[data-choice="${f.k}"] input:checked`, root)?.value ?? null; continue; }
    if (f.type === 'theme') { out[f.k] = $(`[data-themepick="${f.k}"] input:checked`, root)?.value ?? null; continue; }
    if (f.type === 'icon') { out[f.k] = $(`[data-iconpick="${f.k}"] input:checked`, root)?.value || null; continue; }
    if (f.type === 'days') {
      const v = $$(`[data-days="${f.k}"] input:checked`, root).map(i => +i.value);
      if (f.req && !v.length) throw new ApiError('required', { field: f.label || t(f.k) });
      out[f.k] = v; continue;
    }
    if (f.type === 'i18n') {
      const o = {}; $$(`[data-i18n="${f.k}"]`, root).forEach(i => { if (i.value.trim()) o[i.dataset.lang] = i.value.trim(); }); out[f.k] = o; continue;
    }
    const el = root.querySelector(`[name="${f.k}"]`); if (!el) continue;
    let v = f.type === 'bool' ? el.checked : el.value;
    if (f.type === 'color' && el.dataset.empty === '1') v = null;
    if (typeof v === 'string') v = v.trim();
    if (f.type === 'number' || f.num) v = v === '' ? null : Number(v);
    if (f.type === 'stars') v = v === '' ? null : Number(v);
    if (v === '' && f.type !== 'text' && f.type !== 'textarea') v = null;
    if (f.req && (v == null || v === '')) throw new ApiError('required', { field: f.label || t(f.k) });
    out[f.k] = v === '' ? null : v;
  }
  return out;
}
document.addEventListener('aurea:page-shown', ev => wireForm(ev.detail));
function wireForm(root) {
  $$('[data-img]', root).forEach(box => {
    const file = $('input[type=file]', box), img = $('img', box), hidden = $('input[type=hidden]', box), clr = $('[data-clear]', box);
    $('[data-pick]', box).onclick = () => file.click();
    clr.onclick = () => { hidden.value = ''; img.hidden = true; clr.hidden = true; };
    file.onchange = async () => {
      if (!file.files[0]) return;
      const b = $('[data-pick]', box); b.disabled = true; b.textContent = t('uploading');
      try { const url = await uploadImage(file.files[0]); hidden.value = url; img.src = url; img.hidden = false; clr.hidden = false; }
      catch (e) { fail(e); } finally { b.disabled = false; b.textContent = t('choose_photo'); }
    };
  });
  $$('[data-offers]', root).forEach(box => {
    box.addEventListener('click', ev => {
      if (ev.target.closest('[data-offer-add]')) $('.offer-rows', box).insertAdjacentHTML('beforeend', offerRow({}));
      const del = ev.target.closest('[data-offer-del]'); if (del) del.closest('.offer-row').remove();
    });
  });
  $$('[data-country]', root).forEach(box => {
    const sel = $('[data-csel]', box), inp = $('input', box);
    sel.onchange = () => {
      if (sel.value === '__other') { inp.hidden = false; inp.value = ''; inp.focus(); } else { inp.hidden = true; inp.value = sel.value; }
      const c = COUNTRIES.find(x => x.code === sel.value);   // the phone field linked to this nationality gets the country code
      $$(`[data-phone][data-link="${box.dataset.country}"]`, root).forEach(p => { const d = $('[data-dial]', p); if (c && !$('[data-local]', p).value) { d.value = c.dial; d.dispatchEvent(new Event('change')); } });
    };
  });
  $$('[data-phone]', root).forEach(box => {
    const d = $('[data-dial]', box), l = $('[data-local]', box), h = $('input[type=hidden]', box);
    // a number typed with its own country code (+44 …, 0044 …) is kept as typed and chooses the code; otherwise the chosen code goes in front
    const upd = () => {
      const n = l.value.trim(); if (!n) { h.value = ''; return; }
      if (/^\(?\s*(\+|00)/.test(n)) {
        const dg = n.replace(/\D/g, '').replace(/^00/, ''); const c = dialOf(dg);
        if (c) { d.value = c.dial; h.value = '+' + c.dial + ' ' + dg.slice(c.dial.length); } else { d.value = ''; h.value = '+' + dg; }
        return;
      }
      h.value = (d.value ? '+' + d.value + ' ' : '') + n;
    };
    d.onchange = upd; l.oninput = upd;
  });
  $$('[data-days-all]', root).forEach(b => { b.onclick = () => $$('input', b.parentNode).forEach(i => { i.checked = true; }); });
  $$('input[type=color]', root).forEach(i => i.addEventListener('input', () => { delete i.dataset.empty; }));
  $$('[data-color-reset]', root).forEach(b => { b.onclick = () => { const i = root.querySelector(`[name="${b.dataset.colorReset}"]`); i.value = '#000000'; i.dataset.empty = '1'; }; });
  $$('[data-stars]', root).forEach(box => {
    box.onclick = ev => { const b = ev.target.closest('[data-n]'); if (!b) return; const n = +b.dataset.n; $('input', box).value = n; $$('[data-n]', box).forEach(x => x.classList.toggle('on', +x.dataset.n <= n)); };
  });
}
const opts = (rows, v = 'id', l = 'name', blank) => (blank != null ? [['', blank]] : []).concat(rows.map(r => [r[v], typeof l === 'function' ? l(r) : r[l]]));
function editForm(title, fields, row, onSave, more = {}) {
  // the record was deleted meanwhile (another phone): say so and show the list as it is now – never save it as a new record
  if (row === undefined) { toast(errText(new ApiError('notfound')), 'bad'); route(); return null; }
  return modal(title, formHtml(fields, row || {}) + (more.after || ''), Object.assign({
    // (onSave answers false when the person stopped after a question – the form stays open, nothing was saved)
    save: async root => { const data = readForm(root, fields); if (await onSave(Object.assign({}, row?.id ? { id: row.id } : {}, data), root) === false) return false; toast(t('saved')); }
  }, more, {
    // the form's own wiring (photo, translations, every day …) always, then the caller's
    mount: (root, close) => { wireForm(root); more.mount && more.mount(root, close); }
  }));
}

/* a short question form that is not a record (copy to …, print options): the answers go to onOk, nothing is saved by the form itself */
function formBox(title, fields, row, onOk, more = {}) {
  return modal(title, formHtml(fields, row || {}) + (more.after || ''), { cancel: true, saveLabel: more.saveLabel, mount: root => { wireForm(root); more.mount && more.mount(root); }, save: root => onOk(readForm(root, fields), root) });
}

const offerRow = o => `<div class="offer-row"><input type="number" data-q min="2" value="${o.qty ?? ''}" placeholder="5" aria-label="${esc(t('tickets'))}"><span>${esc(t('tickets_for'))}</span><input type="number" data-p min="0" step="0.01" value="${o.price ?? ''}" placeholder="8" aria-label="${esc(t('price'))}"><button type="button" class="icon-btn" data-offer-del aria-label="${esc(t('delete'))}">${ico('x')}</button></div>`;
const CURRENCIES = ['EGP', 'USD', 'EUR', 'GBP', 'SAR', 'AED', 'KWD', 'QAR', 'TRY', 'RUB', 'PLN', 'CZK', 'CHF'];
const curOpts = () => CURRENCIES.map(x => { let n = x; try { n = new Intl.DisplayNames([locale()], { type: 'currency' }).of(x); } catch { /* code */ } return [x, x + ' · ' + n]; });

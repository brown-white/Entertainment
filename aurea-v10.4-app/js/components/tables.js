'use strict';
/* AUREA · components/tables.js — tables and lists: the table, the ONE selection of rows (select all, the chosen ones, their actions) and the ONE list
   editor (CRUD: add, edit, delete, order) used by the settings-like pages.
   Uses: translations/languages · supabase · core/utils · icons/icons · components/modals · core/actions · components/cards · core/router ·
         components/forms */
/* ---------- ONE selection for every list whose records can be handled together (delete, take back, export …) ----------
   sel(k) is the chosen ids of list k; selHead shows "Select all (n)", the count and the actions; selBox is the box of one row */
const SEL = {}, SEL_ON = {};
const sel = k => (SEL[k] = SEL[k] || new Set());
const selKeep = (k, ids) => { const s = sel(k), keep = new Set(ids); [...s].forEach(id => { if (!keep.has(id)) s.delete(id); }); return s; };
const selIds = k => [...sel(k)];
const selHead = (k, ids, actions = '') => { const s = selKeep(k, ids), all = ids.length > 0 && ids.every(id => s.has(id));
  return `<div class="sel-bar" data-selk="${k}" data-ids="${ids.join(',')}"><label><input type="checkbox" data-act-change="sel_all" data-k="${k}" ${all ? 'checked' : ''}> ${esc(t('select_all'))} (${ids.length})</label><span class="sel-n muted small">${s.size ? esc(t('selected_n', { n: s.size })) : ''}</span><span class="grow"></span>${actions}</div>`; };
const selBox = (k, id, label) => `<input type="checkbox" class="sel-box" data-act-change="sel_pick" data-k="${k}" data-id="${id}" ${sel(k).has(id) ? 'checked' : ''} aria-label="${esc(label || t('select'))}">`;
function selUpdate(k) {
  const s = sel(k);
  $$(`[data-selk="${k}"]`).forEach(bar => { const ids = bar.dataset.ids ? bar.dataset.ids.split(',').map(Number) : [];
    const a = $('[data-act-change=sel_all]', bar); if (a) a.checked = ids.length > 0 && ids.every(id => s.has(id));
    const n = $('.sel-n', bar); if (n) n.textContent = s.size ? t('selected_n', { n: s.size }) : '';
    $$('[data-sel-need]', bar).forEach(b => { b.disabled = !s.size; }); });
  $$(`.sel-box[data-k="${k}"]`).forEach(b => { b.checked = s.has(+b.dataset.id); });
  SEL_ON[k] && SEL_ON[k](s);
}

/* ---------- print / PDF (one print sheet for every report) and Excel ---------- */
const tableHtml = (head, rows) => `<table><thead><tr>${head.map(h => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.map(r => `<tr>${r.map(c => `<td>${c && c.html != null ? c.html : esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
ACT.sel_pick = el => { const s = sel(el.dataset.k), id = +el.dataset.id; if (el.checked) s.add(id); else s.delete(id); selUpdate(el.dataset.k); };
ACT.sel_all = el => { const k = el.dataset.k, bar = el.closest('[data-selk]'), s = sel(k); if (el.checked) (bar.dataset.ids ? bar.dataset.ids.split(',') : []).forEach(id => s.add(+id)); else s.clear(); selUpdate(k); };
const CRUD = {};
function crudList(key, cfg) {
  CRUD[key] = cfg;
  return async () => {
    const rows = await list(cfg.entity, cfg.filter ? cfg.filter() : {});
    cfg.rows = rows;
    const mv = (r, i) => cfg.sortable ? `<span class="move"><button class="icon-btn" data-act="crud_move" data-k="${key}" data-i="${i}" data-d="-1" ${i === 0 ? 'disabled' : ''} aria-label="${esc(t('move_up'))}">${ico('up')}</button><button class="icon-btn" data-act="crud_move" data-k="${key}" data-i="${i}" data-d="1" ${i === rows.length - 1 ? 'disabled' : ''} aria-label="${esc(t('move_down'))}">${ico('down')}</button></span>` : '';
    return `${cfg.intro ? `<p class="hint-box">${ico('info')}<span>${esc(cfg.intro)}</span></p>` : ''}<p class="row"><span class="grow"></span>${cfg.extra || ''}<button class="btn small" data-act="crud_new" data-k="${key}">${ico('plus')} ${esc(t('add'))}</button></p>`
      + (rows.length ? `<div class="list">${rows.map((r, i) => `<div class="li crud-row"><button class="li-main" data-act="crud_edit" data-k="${key}" data-id="${r.id}">${cfg.row(r)}</button>${cfg.rowExtra ? cfg.rowExtra(r) : ''}${mv(r, i)}</div>`).join('')}</div>` : empty(t('nothing_yet')));
  };
}
const crudDone = async c => { if (c.after) await c.after(); route(); };
ACT.crud_new = el => { const c = CRUD[el.dataset.k]; editForm(t('add'), c.fields(), c.defaults ? c.defaults() : {}, async r => { if (c.sortable) r.sort = (c.rows || []).length; await save(c.entity, c.before ? c.before(r) : r); await crudDone(c); }); };
ACT.crud_edit = el => {
  const c = CRUD[el.dataset.k]; const row = c.rows.find(x => x.id === +el.dataset.id); if (!row) return;
  editForm(t('edit'), c.fields(), c.load ? c.load(row) : row, async r => { await save(c.entity, c.before ? c.before(r) : r); await crudDone(c); },
    { danger: async () => { const j = await del(c.entity, row.id); toast(j.archived ? t('archived_instead') : t('deleted'), j.archived ? 'warn' : 'ok'); await crudDone(c); } });
};
/* the ONE way to change an order: arrows (rows are renumbered 0, 1, 2 …) */
ACT.crud_move = async el => {
  const c = CRUD[el.dataset.k]; const i = +el.dataset.i, j = i + +el.dataset.d; const rows = c.rows.slice(); if (j < 0 || j >= rows.length) return;
  [rows[i], rows[j]] = [rows[j], rows[i]];
  for (const [n, r] of rows.entries()) if (r.sort !== n) await save(c.entity, { id: r.id, sort: n });
  await crudDone(c);
};

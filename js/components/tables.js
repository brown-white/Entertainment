'use strict';
/* Mr Hassan · components/tables.js — tables and lists: the table and THE data table (search, sort, columns, pages, phone cards), the ONE selection of rows (select all, the chosen ones, their actions) and the ONE list
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
const tableHtml = (head, rows) => `<table><thead><tr>${head.map(h => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.map(r => `<tr>${r.map((c, i) => `<td data-label="${esc(head[i] || '')}">${c && c.html != null ? c.html : esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;

/* ---------- (11.0) THE data table: search, sort, the columns shown, selection with bulk actions, pages, a card per row on a phone,
   a useful empty state – one component for every list of records shown as a table ----------
   dataTable(key, { cols: [{ k, label, text(row) (sort + search), html(row) (the cell), num, hide (hidden at first), nosort }], rows,
     id(row), select: html of the bulk actions (data-sel-need), tools: html beside the search, empty: text, emptyAct: html, size: rows per page,
     sort / dir: the first order (a column's key, 1 or -1) }) */
const DT = {};
function dataTable(key, cfg) {
  const st = DT[key] = Object.assign({ q: '', sort: cfg.sort || null, dir: cfg.dir || 1, page: 0, hidden: new Set(cfg.cols.filter(c => c.hide).map(c => c.k)) }, DT[key] || {}, { cfg });
  return `<div class="dt" data-dt="${esc(key)}"><div class="dt-bar">${cfg.search === false ? '' : `<label class="search-in">${ico('search')}<input type="search" data-dt-q="${esc(key)}" value="${esc(st.q)}" placeholder="${esc(t('search'))}" aria-label="${esc(t('search'))}" autocomplete="off"></label>`}
      ${cfg.tools || ''}<span class="grow"></span><button class="btn ghost small" data-act="dt_cols" data-k="${esc(key)}">${ico('columns')} ${esc(t('dt_columns'))}</button></div>
    <div class="dt-body">${dtBody(key)}</div></div>`;
}
function dtRows(key) {
  const { cfg, q, sort, dir } = DT[key], col = k => cfg.cols.find(c => c.k === k), txt = (c, r) => String(c.text ? c.text(r) : r[c.k] ?? '');
  let rows = cfg.rows;
  if (q.trim()) { const ql = q.trim().toLowerCase(); rows = rows.filter(r => cfg.cols.some(c => txt(c, r).toLowerCase().includes(ql))); }
  if (sort && col(sort)) { const c = col(sort); rows = rows.slice().sort((a, b) => { const x = c.num ? +(c.text ? c.text(a) : a[c.k]) || 0 : txt(c, a), y = c.num ? +(c.text ? c.text(b) : b[c.k]) || 0 : txt(c, b);
    return (c.num ? x - y : String(x).localeCompare(String(y), locale(), { numeric: true })) * dir; }); }
  return rows;
}
function dtBody(key) {
  const st = DT[key], { cfg } = st, all = dtRows(key), size = cfg.size || 25, pages = Math.max(1, Math.ceil(all.length / size));
  st.page = Math.min(st.page, pages - 1);
  const rows = all.slice(st.page * size, st.page * size + size), cols = cfg.cols.filter(c => !st.hidden.has(c.k)), id = cfg.id || (r => r.id);
  if (!cfg.rows.length) return empty(cfg.empty || t('nothing_yet'), cfg.emptyAct || '', cfg.emptyIcon || 'inbox');
  const head = `<tr>${cfg.select ? '<th class="dt-sel"></th>' : ''}${cols.map(c => `<th class="${c.num ? 'num' : ''}" ${st.sort === c.k ? `aria-sort="${st.dir > 0 ? 'ascending' : 'descending'}"` : ''}>${c.nosort ? esc(c.label)
    : `<button class="dt-sort" data-act="dt_sort" data-k="${esc(key)}" data-c="${esc(c.k)}">${esc(c.label)}${ico(st.sort === c.k ? (st.dir > 0 ? 'up' : 'down') : 'sort')}</button>`}</th>`).join('')}</tr>`;
  const body = rows.map(r => `<tr>${cfg.select ? `<td class="dt-sel">${selBox(key, id(r))}</td>` : ''}${cols.map(c => `<td class="${c.num ? 'num' : ''}" data-label="${esc(c.label)}">${c.html ? c.html(r) : esc(c.text ? c.text(r) : r[c.k] ?? '')}</td>`).join('')}</tr>`).join('');
  return (cfg.select ? selHead(key, all.map(id), cfg.select) : '')
    + (all.length ? `<div class="tablewrap dt-wrap ${cfg.cards === false ? '' : 'cards'}"><table><thead>${head}</thead><tbody>${body}</tbody></table></div>` : empty(t('search_nothing'), `<button class="btn secondary small" data-act="dt_clear" data-k="${esc(key)}">${esc(t('dt_clear'))}</button>`, 'search'))
    + (pages > 1 ? `<div class="dt-pager"><span>${esc(t('dt_range', { a: st.page * size + 1, b: Math.min(all.length, st.page * size + size), n: all.length }))}</span>
      <button class="icon-btn" data-act="dt_page" data-k="${esc(key)}" data-d="-1" ${st.page ? '' : 'disabled'} aria-label="${esc(t('dt_prev'))}">${ico('chev', 'flip')}</button>
      <button class="icon-btn" data-act="dt_page" data-k="${esc(key)}" data-d="1" ${st.page < pages - 1 ? '' : 'disabled'} aria-label="${esc(t('dt_next'))}">${ico('chev')}</button></div>` : '');
}
const dtRedraw = key => { const b = $(`[data-dt="${CSS.escape(key)}"] .dt-body`); if (b) b.innerHTML = dtBody(key); };
let dtTimer = null;
document.addEventListener('input', ev => { const i = ev.target.closest('[data-dt-q]'); if (!i) return; clearTimeout(dtTimer);
  dtTimer = setTimeout(() => { const k = i.dataset.dtQ; if (!DT[k]) return; DT[k].q = i.value; DT[k].page = 0; dtRedraw(k); }, 180); });
ACT.dt_sort = el => { const st = DT[el.dataset.k]; if (st.sort === el.dataset.c) st.dir = -st.dir; else { st.sort = el.dataset.c; st.dir = 1; } dtRedraw(el.dataset.k); };
ACT.dt_page = el => { DT[el.dataset.k].page += +el.dataset.d; dtRedraw(el.dataset.k); };
ACT.dt_clear = el => { const st = DT[el.dataset.k]; st.q = ''; st.page = 0; const i = $(`[data-dt-q="${CSS.escape(el.dataset.k)}"]`); if (i) i.value = ''; dtRedraw(el.dataset.k); };
// the columns shown (kept while the app is open)
ACT.dt_cols = el => { const k = el.dataset.k, st = DT[k];
  modal(t('dt_columns'), `<div class="dt-cols">${st.cfg.cols.map(c => `<label class="switch"><input type="checkbox" value="${esc(c.k)}" ${st.hidden.has(c.k) ? '' : 'checked'}> ${esc(c.label)}</label>`).join('')}</div>`, {
    cancel: true, saveLabel: t('apply'), save: root => { const on = new Set($$('input:checked', root).map(i => i.value)); if (!on.size) return false; st.hidden = new Set(st.cfg.cols.filter(c => !on.has(c.k)).map(c => c.k)); dtRedraw(k); } }); };
ACT.sel_pick = el => { const s = sel(el.dataset.k), id = +el.dataset.id; if (el.checked) s.add(id); else s.delete(id); selUpdate(el.dataset.k); };
ACT.sel_all = el => { const k = el.dataset.k, bar = el.closest('[data-selk]'), s = sel(k); if (el.checked) (bar.dataset.ids ? bar.dataset.ids.split(',') : []).forEach(id => s.add(+id)); else s.clear(); selUpdate(k); };
const CRUD = {};
function crudList(key, cfg) {
  CRUD[key] = cfg;
  return async () => {
    const rows = await list(cfg.entity, cfg.filter ? cfg.filter() : {});
    cfg.rows = rows;
    const mv = (r, i) => cfg.sortable ? `<span class="move"><button class="icon-btn" data-act="crud_move" data-k="${key}" data-i="${i}" data-d="-1" ${i === 0 ? 'disabled' : ''} aria-label="${esc(t('move_up'))}">${ico('up')}</button><button class="icon-btn" data-act="crud_move" data-k="${key}" data-i="${i}" data-d="1" ${i === rows.length - 1 ? 'disabled' : ''} aria-label="${esc(t('move_down'))}">${ico('down')}</button></span>` : '';
    return `${cfg.intro ? `<p class="hint-box">${ico('info')}<span>${esc(cfg.intro)}</span></p>` : ''}${pgActions(`${cfg.extra || ''}<button class="btn" data-act="crud_new" data-k="${key}">${ico('plus')} ${esc(t('add'))}</button>`)}`
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

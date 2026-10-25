'use strict';
/* AUREA · pages/requirements.js — Requirement sheets: requests to hotel management, read from the programme (several events per sheet), and their PDF.
   Uses: core/state · translations/languages · supabase · core/utils · icons/icons · components/modals · core/actions · components/cards ·
         core/router · components/forms · components/tables · systems/exports · systems/feedback */
/* ---------- REQUIREMENT SHEET – a request to hotel management. ONE sheet for one or several programme dates: what the event
   is (name, type, day, date, times, place, team) is READ from the programme, never typed again; under each date its requirements
   (item, quantity, reason, expected result). Statuses Draft → Submitted → Approved / Partially approved / Rejected → Completed.
   Edit, add / remove dates and requirements, duplicate on purpose, export as a management document (the ONE PDF layout). ---------- */
const RQ_STATUS = ['draft', 'submitted', 'approved', 'partially_approved', 'rejected', 'completed'];
const RQ_CLS = { approved: 'ok', completed: 'ok', partially_approved: 'warn', rejected: 'bad', submitted: '' };
let reqCache = null, reqDeps = [], rqPickNext = false;
const rqEvent = p => p ? itemName(p) : t('rq_event_gone');
const rqWhen = p => p ? D.fmt(p.date, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) : '';
const rqTime = p => p ? p.start_time + (p.end_time ? '–' + p.end_time : '') : '';
const rqQty = l => [String(+l.qty === Math.round(+l.qty) ? +l.qty : l.qty), l.unit || ''].filter(Boolean).join(' ');
page('requirements', {
  perm: 'm_requirements', icon: 'cart', group: 'manage',
  render: async arg => {
    reqDeps = await list('departments', { active: true });
    if (arg) {
      const j = await api('requirement_sheets_read', { p_id: +arg }); reqCache = j;
      const sh = j.sheet, rows = ls => ls.length ? `<div class="tablewrap"><table class="grid rq-lines"><thead><tr><th>${esc(t('item'))}</th><th>${esc(t('quantity'))}</th><th>${esc(t('rq_reason'))}</th><th>${esc(t('rq_expected'))}</th><th>${esc(t('rq_received'))}</th><th></th></tr></thead><tbody>
          ${ls.map(l => `<tr class="${l.done ? 'dim' : ''}"><td><b>${esc(l.item)}</b></td><td>${esc(rqQty(l))}</td><td>${esc(l.note || '')}</td><td>${esc(l.expected || '')}</td>
            <td><input type="checkbox" data-act-change="rl_done" data-id="${l.id}" ${l.done ? 'checked' : ''} aria-label="${esc(t('rq_received') + ' · ' + l.item)}"></td>
            <td class="nowrap"><button class="icon-btn" data-act="rl_edit" data-id="${l.id}" aria-label="${esc(t('edit') + ' · ' + l.item)}">${ico('edit')}</button><button class="icon-btn" data-act="rl_del" data-id="${l.id}" aria-label="${esc(t('delete') + ' · ' + l.item)}">${ico('trash')}</button></td></tr>`).join('')}</tbody></table></div>`
        : `<p class="muted">${esc(t('rq_no_lines'))}</p>`;
      const evs = j.items.map((x, i) => { const p = x.programme;
        return `<section class="card rq-event"><div class="row"><span class="rq-no">${i + 1}</span><div class="grow"><h3>${esc(rqEvent(p))} ${p ? chip(typeLabel(p.type), 'ty-' + p.type) : ''}${p && p.status === 'cancelled' ? ' ' + chip(t('cancelled'), 'bad') : ''}</h3>
            <p class="muted">${p ? esc([rqWhen(p), rqTime(p), p.location, p.team].filter(Boolean).join(' · ')) : esc(t('rq_event_gone_hint'))}</p></div>
            <span class="move"><button class="icon-btn" data-act="rsi_move" data-id="${x.id}" data-d="-1" ${i ? '' : 'disabled'} aria-label="${esc(t('move_up'))}">${ico('up')}</button><button class="icon-btn" data-act="rsi_move" data-id="${x.id}" data-d="1" ${i < j.items.length - 1 ? '' : 'disabled'} aria-label="${esc(t('move_down'))}">${ico('down')}</button></span>
            <button class="icon-btn" data-act="rsi_del" data-id="${x.id}" aria-label="${esc(t('rq_remove_event') + ' · ' + rqEvent(p))}">${ico('trash')}</button></div>
          ${rows(x.lines)}<p><button class="btn ghost small" data-act="rl_add" data-si="${x.id}">${ico('plus')} ${esc(t('rq_add_line'))}</button></p></section>`; }).join('');
      return `<p><a href="#/requirements">‹ ${esc(t('back'))}</a></p>
        <section class="card"><div class="row"><h2 class="grow">${esc(sh.title)}</h2>${chip(t('rqs_' + sh.status), RQ_CLS[sh.status] || '')}</div>
          <p class="muted">${esc([sh.department, sh.team, sh.needed_date ? t('needed_by') + ' ' + D.long(sh.needed_date) : '', t('rq_prepared', { date: D.long(String(sh.created_at).slice(0, 10)) })].filter(Boolean).join(' · '))}</p>
          <div class="wv-act"><button class="btn small" data-act="rsi_add">${ico('plus')} ${esc(t('rq_add_events'))}</button><button class="btn ghost small" data-act="rs_edit">${ico('edit')} ${esc(t('edit'))}</button>
            <button class="btn ghost small" data-act="rs_copy">${ico('copy')} ${esc(t('rq_duplicate'))}</button><button class="btn ghost small" data-act="rs_print">${ico('download')} ${esc(t('print_pdf'))}</button>
            <button class="btn ghost small danger" data-act="rs_del">${ico('trash')} ${esc(t('delete'))}</button></div></section>
        ${evs || `<p class="hint-box">${ico('info')}<span>${esc(t('rq_no_events'))}</span></p>`}
        <section class="card"><h3>${esc(t('rq_general'))}</h3><p class="muted small">${esc(t('rq_general_hint'))}</p>${rows(j.general)}<p><button class="btn ghost small" data-act="rl_add">${ico('plus')} ${esc(t('rq_add_line'))}</button></p></section>`;
    }
    reqCache = null;
    const j = await api('requirement_sheets_read', {});
    return `<p class="row"><span class="muted grow">${esc(t('rq_intro'))}</span><button class="btn small" data-act="rs_new">${ico('plus')} ${esc(t('new_sheet'))}</button></p>` + (j.sheets.length ? `<div class="list">${j.sheets.map(x => `<a class="li row" href="#/requirements/${x.id}"><div class="grow"><b>${esc(x.title)}</b>
        <small class="muted">${esc(x.items.slice(0, 3).map(i => (i.name ? tx(i.name_i18n, i.name) : t('rq_event_gone')) + (i.date ? ' · ' + D.short(i.date) : '')).join(' / ') + (x.items.length > 3 ? ' …' : '') || t('rq_no_events_short'))}${x.lines ? ' · ' + esc(t('rq_n_lines', { n: x.lines })) : ''}</small></div>
        <small class="muted">${esc([x.department_id ? deptName(reqDeps.find(d => d.id === x.department_id)) : '', x.needed_date ? D.dm(x.needed_date) : ''].filter(Boolean).join(' · '))}</small>${chip(t('rqs_' + x.status), RQ_CLS[x.status] || '')}</a>`).join('')}</div>` : empty(t('rq_none')));
  },
  // a sheet just made: choosing its programme dates is the next step
  mount: () => { if (rqPickNext && reqCache?.sheet) { rqPickNext = false; ACT.rsi_add(); } }
});
const sheetFields = () => [{ k: 'title', label: t('title'), req: true, ph: t('rq_title_ph') }, { k: 'department_id', type: 'select', label: t('rq_to_department'), num: true, options: opts(reqDeps, 'id', d => deptName(d), t('none')) },
  { k: 'needed_date', type: 'date', label: t('needed_by') }, { k: 'status', type: 'select', label: t('status'), options: RQ_STATUS.map(x => [x, t('rqs_' + x)]) }];
// a new sheet: its title, then straight to choosing the programme dates it is for
ACT.rs_new = () => editForm(t('new_sheet'), sheetFields(), { status: 'draft' }, async r => { const row = await save('requirement_sheets', r); rqPickNext = true; location.hash = '#/requirements/' + row.id; });
ACT.rs_edit = () => { const s0 = reqCache.sheet; editForm(t('edit'), sheetFields(), s0, async r => { await save('requirement_sheets', Object.assign(r, { id: s0.id })); route(); }); };
ACT.rs_del = async () => { const s0 = reqCache.sheet, n = reqCache.items.reduce((a, x) => a + x.lines.length, 0) + reqCache.general.length;
  if (!await delAsk({ title: t('rq_delete_q', { name: s0.title }), facts: [t('rq_fact_events', { n: reqCache.items.length }), t('rq_fact_lines', { n })], text: t('rq_delete_text') })) return;
  await del('requirement_sheets', s0.id); toast(t('deleted')); location.hash = '#/requirements'; };
ACT.rs_copy = async () => { if (!await confirmBox(t('rq_duplicate_q'), t('rq_duplicate'))) return; const j = await api('requirement_sheet_copy', { p_id: reqCache.sheet.id }); toast(t('rq_duplicated')); location.hash = '#/requirements/' + j.id; };
// choose programme dates: the programme of a period (search, type), each with what the programme says; dates already on the sheet are marked
ACT.rsi_add = async () => {
  if (!reqCache?.sheet) return;
  const from = D.today(), to = D.add(from, 30), have = new Set(reqCache.items.map(x => x.item_id));
  let rows = []; const load = async (f, tt) => { rows = (await list('program_items', { _from: f, _to: tt })).filter(i => i.status === 'scheduled').sort((x, y) => (x.date + x.start_time).localeCompare(y.date + y.start_time)); };
  await load(from, to);
  const listHtml = (q, ty) => { const v = rows.filter(i => (!ty || i.type === ty) && (!q || itemName(i).toLowerCase().includes(q.toLowerCase())));
    return v.length ? v.slice(0, 300).map(i => `<label class="li row with-row ${have.has(i.id) ? 'dim' : ''}"><input type="checkbox" value="${i.id}" ${have.has(i.id) ? 'checked disabled' : ''}><span><b>${esc(itemName(i))}</b> ${chip(typeLabel(i.type), 'ty-' + i.type)}<br><small class="muted">${esc([D.fmt(i.date, { weekday: 'short', day: 'numeric', month: 'short' }), hm(i.start_time) + (i.end_time ? '–' + hm(i.end_time) : ''), i.location].filter(Boolean).join(' · '))}</small></span></label>`).join('') : empty(t('nothing_found')); };
  modal(t('rq_add_events'), `<p class="muted small">${esc(t('rq_pick_hint'))}</p><div class="filters row"><input type="date" id="rqf" value="${from}" aria-label="${esc(t('date_from'))}"><input type="date" id="rqt" value="${to}" aria-label="${esc(t('date_to'))}">
      <input id="rqq" placeholder="${esc(t('search'))}" aria-label="${esc(t('search'))}"><select id="rqy" aria-label="${esc(t('type'))}"><option value="">${esc(t('all'))}</option>${TYPES.map(x => `<option value="${x}">${esc(typeLabel(x))}</option>`).join('')}</select></div><div class="list pick" id="rqlist">${listHtml('', '')}</div>`, {
    wide: true, cancel: true, saveLabel: t('rq_add_selected'),
    mount: root => { const upd = () => { $('#rqlist', root).innerHTML = listHtml($('#rqq', root).value.trim(), $('#rqy', root).value); };
      $('#rqq', root).addEventListener('input', upd); $('#rqy', root).addEventListener('change', upd);
      const per = async () => { const f = $('#rqf', root).value, tt = $('#rqt', root).value; if (!f || !tt || tt < f) return; await load(f, tt > D.add(f, 120) ? D.add(f, 120) : tt); upd(); };
      $('#rqf', root).addEventListener('change', () => per().catch(fail)); $('#rqt', root).addEventListener('change', () => per().catch(fail)); },
    save: async root => { const ids = $$('#rqlist input:checked:not(:disabled)', root).map(i => +i.value); if (!ids.length) throw new ApiError('required', { field: t('rq_events') });
      let k = reqCache.items.length; for (const id of ids) await save('requirement_sheet_items', { sheet_id: reqCache.sheet.id, item_id: id, sort: k++ });
      toast(t('rq_events_added', { n: ids.length })); route(); }
  });
};
ACT.rsi_del = async el => { const x = reqCache.items.find(y => y.id === +el.dataset.id); if (!x) return;
  if (!await confirmBox(t('rq_remove_event_q', { name: rqEvent(x.programme), n: x.lines.length }), t('rq_remove_event'))) return;
  await del('requirement_sheet_items', x.id); route(); };
ACT.rsi_move = async el => { const its = reqCache.items, i = its.findIndex(y => y.id === +el.dataset.id), j = i + +el.dataset.d; if (i < 0 || j < 0 || j >= its.length) return;
  const order = its.map(x => x.id); [order[i], order[j]] = [order[j], order[i]];
  for (const [k, id] of order.entries()) if (its.find(x => x.id === id).sort !== k) await save('requirement_sheet_items', { id, sort: k });
  route(); };
// one requirement: item, quantity (+ unit), reason, expected result – under a programme date, or general
const lineFields = () => [{ k: 'item', label: t('rq_item'), req: true, ph: t('rq_item_ph') }, { k: 'qty', type: 'number', label: t('quantity'), step: 'any', min: 0, def: 1 }, { k: 'unit', label: t('unit'), ph: t('rq_unit_ph') },
  { k: 'note', type: 'textarea', rows: 2, label: t('rq_reason'), hint: t('rq_reason_hint') }, { k: 'expected', type: 'textarea', rows: 2, label: t('rq_expected'), hint: t('rq_expected_hint') }];
const rqLine = id => reqCache.items.flatMap(x => x.lines).concat(reqCache.general).find(l => l.id === id);
ACT.rl_add = el => { const si = el.dataset.si ? +el.dataset.si : null, n = si ? reqCache.items.find(x => x.id === si).lines.length : reqCache.general.length;
  editForm(t('rq_add_line'), lineFields(), { qty: 1 }, async r => { await save('requirement_lines', Object.assign(r, { sheet_id: reqCache.sheet.id, sheet_item_id: si, sort: n, qty: r.qty == null ? 1 : r.qty })); route(); }); };
ACT.rl_edit = el => { const l = rqLine(+el.dataset.id); if (!l) return;
  editForm(t('edit') + ' · ' + l.item, lineFields(), l, async r => { await save('requirement_lines', Object.assign(r, { id: l.id })); route(); }, { danger: async () => { await del('requirement_lines', l.id); route(); } }); };
ACT.rl_done = async el => { await save('requirement_lines', { id: +el.dataset.id, done: el.checked }); el.closest('tr')?.classList.toggle('dim', el.checked); };
ACT.rl_del = async el => { if (!await confirmBox(t('confirm_delete'), t('delete'))) return; await del('requirement_lines', +el.dataset.id); route(); };
/* the management document: the sheet's facts, then each event (read from the programme) with its requirements table */
ACT.rs_print = () => {
  const { sheet: sh, items, general } = reqCache, dl = rows => `<dl>${rows.filter(r => r[1]).map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl>`;
  const table = ls => ls.length ? tableHtml([t('item'), t('quantity'), t('rq_reason'), t('rq_expected')], ls.map(l => [l.item, rqQty(l), l.note || '', l.expected || ''])) : `<p>${esc(t('rq_no_lines'))}</p>`;
  const full = d => D.fmt(d, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const html = dl([[t('rq_sheet'), sh.title], [t('hotel'), S.hotel?.name || ''], [t('team'), sh.team || ''], [t('rq_to_department'), sh.department || ''], [t('rq_prepared_l'), full(String(sh.created_at).slice(0, 10))],
      [t('needed_by'), sh.needed_date ? full(sh.needed_date) : ''], [t('status'), t('rqs_' + sh.status)]])
    + items.map((x, i) => { const p = x.programme; return `<h2>${esc(t('rq_event_n', { n: i + 1 }))} · ${esc(rqEvent(p))}</h2>`
      + dl([[t('rq_event'), rqEvent(p)], [t('type'), p ? typeLabel(p.type) : ''], [t('date'), rqWhen(p)], [t('time'), rqTime(p)], [t('location'), p?.location || '']]) + table(x.lines); }).join('')
    + (general.length ? `<h2>${esc(t('rq_general'))}</h2>` + table(general) : '');
  printSheet(t('rq_doc_title'), html, { sub: sh.title + ' · ' + t('rq_doc_sub') });
};

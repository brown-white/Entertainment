'use strict';
/* AUREA · pages/tickets.js — Tickets: the ONE inventory (batches → every single ticket), sellers, ticket types, printing.
   Uses: translations/languages · supabase · core/utils · icons/icons · core/permissions · components/modals · core/actions ·
         components/cards · core/router · components/forms · components/tables · systems/exports · systems/ticket-system · pages/prizes */
let tkCache = null, tkBatch = null, tkSelBatch = null, tkFilter = 'all', tkView = 'grid', tkQ = '', tkStay = null, tkPeople = null;
const tkSel = sel('tk');      // the chosen tickets – the one selection (grid taps, list boxes, search results)
// deleting needs the delete permissions themselves (the manager has them all; "Tickets and money" alone is not enough)
const tkDelOk = () => can('tickets_delete') || can('tickets_delete_sold');

page('ticketsadmin', {
  perm: 'm_tickets,tickets_view,tickets_allocate,tickets_edit,tickets_void,tickets_print,prizes_manage,prizes_draw,prizes_delete', icon: 'ticket', group: 'manage', title: 'tickets_admin',
  render: async arg => {
    const i0 = takeIntent('tickets'); if (i0) { tkQ = i0.q; tkStay = i0.stay; }
    // the tabs each person may use (role defaults + personal permissions)
    const inv = ['tickets_view', 'tickets_allocate', 'tickets_edit', 'tickets_void', 'tickets_print'].some(tkPerm);
    const allowed = [inv && ['inventory', t('ticket_inventory')], (tkPerm('tickets_view') || tkPerm('tickets_allocate')) && ['sellers', t('ticket_sellers')],
      can('m_tickets') && ['types', t('ticket_types')], (tkPerm('prizes_manage') || tkPerm('prizes_draw') || tkPerm('prizes_delete')) && ['prizes', t('prizes')]].filter(Boolean);
    const bm = /^b(\d+)$/.exec(arg || '');
    const tab = bm && inv ? 'inventory' : allowed.some(x => x[0] === arg) ? arg : allowed[0][0];
    const head = tabs('ticketsadmin', allowed, tab);
    if (tab === 'types') return head + await crudList('ttypes', {
      entity: 'ticket_types', sortable: true, intro: t('types_intro'),
      fields: () => [{ k: 'name', label: t('name'), req: true }, { k: 'game', type: 'select', label: t('game'), options: ['tombola', 'bingo', 'disco', 'other'].map(g => [g, t('game_' + g)]), hint: t('game_design_hint') }, { k: 'price', type: 'number', label: t('price'), step: '0.01', min: 0 },
        { k: 'offers', type: 'offers', label: t('offers'), hint: t('offers_rows_hint') }, { k: 'color', type: 'color', label: t('ticket_color'), def: '#B8862B' },
        { k: 'digits', type: 'number', label: t('digits'), min: 1, max: 6, def: 4, hint: t('digits_hint') }, { k: 'active', type: 'bool', label: t('active'), def: true }],
      // the design is the type's TEMPLATE, changed in its own editor (Design) – the form never touches it
      row: r => `<span class="swatch" style="--cc:${safeColor(r.color)}"></span><b>${esc(r.name)}</b> ${chip(t('game_' + r.game))} ${chip(tplName(r, tkTemplate(r).key))} ${esc(money(r.price))}${(r.offers || []).map(o => ' · ' + esc(t('offer_x_for', { n: o.qty, price: money(o.price) }))).join('')} ${r.active ? '' : chip(t('inactive'))}`,
      rowExtra: r => `<button class="btn ghost small" data-act="tt_design" data-id="${r.id}">${ico('image')} ${esc(t('tk_design'))}</button>`
    })();
    if (tab === 'prizes') return head + await prizesView();
    if (tab === 'sellers') return head + await sellersView();
    return head + (bm ? await batchView(+bm[1]) : await inventoryView());
  },
  // a prize opened from the search is shown in its list
  mount: () => prizesMount()
});

/* the inventory: every batch with its totals; a search finds one ticket by its number, the guest or the room */
const tkCounts = c => `<div class="stats tk-stats">${[['total', c.total], ['available', c.available], ['assigned', c.assigned], ['reserved', c.reserved], ['sold', c.sold], ['void', c.void]]
  .filter(([k, n]) => k === 'total' || n).map(([k, n]) => `<span class="st-${k}"><b>${n}</b>${esc(k === 'total' ? t('tickets') : tkSt(k))}</span>`).join('')}</div>`;
const batchCard = b => `<a class="card batch-card ${b.active ? '' : 'off'}" href="#/ticketsadmin/b${b.id}"><div class="row"><span class="swatch" style="--cc:${safeColor(b.color)}"></span><b class="grow">${esc(batchName(b))}</b>${b.active ? '' : chip(t('switched_off'))}${b.guest_sale ? chip(t('guest_sale'), 'ok') : ''}</div>
  <small class="muted">${esc([t('game_' + b.game), b.counts.total ? t('numbers') + ' ' + b.counts.from + '–' + b.counts.to : '', money(b.unit_price), b.counts.printed ? t('printed_n', { n: b.counts.printed }) : '', b.counts.revenue ? t('revenue') + ' ' + money(b.counts.revenue) : ''].filter(Boolean).join(' · '))}</small>
  ${tkCounts(b.counts)}${b.note ? `<small class="muted">${esc(b.note)}</small>` : ''}</a>`;
async function inventoryView() {
  const j = await api('ticket_list', { p_filter: tkStay ? { stay_id: tkStay.id } : tkQ ? { q: tkQ } : {} });
  tkCache = { batches: j.batches, tickets: j.tickets || [] }; tkBatch = null;
  if (tkSelBatch !== 'list') { tkSel.clear(); tkSelBatch = 'list'; }
  const search = `<form class="row search-row" onsubmit="return false"><input id="tk-q" type="search" value="${esc(tkQ)}" placeholder="${esc(t('ticket_search_ph'))}" aria-label="${esc(t('search'))}" class="grow"><button class="btn ghost" data-act="tk_search">${ico('search')} ${esc(t('search'))}</button></form>`;
  if (tkQ || tkStay) return search + `<p class="row"><b class="grow">${esc(tkStay ? t('tickets_of_guest', { name: tkStay.name }) : t('results_for', { q: tkQ }))}</b><button class="btn ghost small" data-act="tk_search_clear">${esc(t('clear'))}</button></p>`
    + (j.tickets.length ? selHead('tk', j.tickets.map(x => x.id)) + tkListHtml(j.tickets, j.batches, false) + tkBarHtml(false) : empty(t('nothing_found')));
  return search + `<p class="row"><span class="muted grow">${esc(t('inventory_intro'))}</span>${can('m_tickets') ? `<button class="btn small" data-act="tb_new">${ico('plus')} ${esc(t('new_batch'))}</button>` : ''}</p>`
    + (j.batches.length ? `<div class="batches">${j.batches.map(batchCard).join('')}</div>` : empty(t('no_batches')));
}
ACT.tk_search = () => { tkQ = ($('#tk-q')?.value || '').trim(); tkStay = null; route(); };
ACT.tk_search_clear = () => { tkQ = ''; tkStay = null; route(); };
document.addEventListener('keydown', ev => { if (ev.key === 'Enter' && ev.target.id === 'tk-q') { ev.preventDefault(); ACT.tk_search(); } });
// one line per ticket: code, state, seller, buyer + room, time (tap = the ticket)
const tkListHtml = (rows, batches, inBatch) => `<div class="list tk-list">${rows.map(x => { const b = batches.find(y => y.id === x.batch_id) || {};
  return `<div class="tk-li">${selBox('tk', x.id, x.code)}<button class="li row tk-row" data-act="tk_open" data-id="${x.id}"><b class="tk-code">${esc(x.code)}</b><span class="grow">${inBatch ? '' : `<small class="muted">${esc(batchName(b))}</small><br>`}${esc(tkWho(x) || (x.seller ? t('with_seller', { name: x.seller }) : ''))}${x.void_reason ? ' · ' + esc(x.void_reason) : ''}
    <small class="muted">${esc([x.seller && (x.guest_name || x.status === 'void') ? t('seller') + ': ' + x.seller : '', tkWhen(x), x.price != null && x.status !== 'available' && x.status !== 'assigned' ? money(x.price) : '', x.printed_at ? t('printed') + ' ' + t('times_n', { n: x.print_count }) : ''].filter(Boolean).join(' · '))}</small></span>${chip(tkSt(x.status), TK_CLS[x.status] || '')}</button></div>`; }).join('')}</div>`;

/* one batch: every ticket; tap to select, then give to a seller, take back, void, delete or print */
async function batchView(id) {
  const j = await api('ticket_list', { p_filter: { batch_id: id } });
  const b = j.batches[0]; if (!b) return empty(t('not_found'));
  tkBatch = { b, tickets: j.tickets };
  if (tkSelBatch !== id) { tkSel.clear(); tkSelBatch = id; }
  const f = { all: () => true, unprinted: x => !x.printed_at }, cnt = k => j.tickets.filter(f[k] || (x => x.status === k)).length;
  const show = j.tickets.filter(f[tkFilter] || (x => x.status === tkFilter));
  const pad = n => String(n).padStart(b.digits || 1, '0');
  return `<p><a class="link" href="#/ticketsadmin/inventory">‹ ${esc(t('ticket_inventory'))}</a></p>
    <section class="card"><div class="row"><span class="swatch" style="--cc:${safeColor(b.color)}"></span><h2 class="grow">${esc(batchName(b))}</h2>${b.active ? chip(t('on_sale'), 'ok') : chip(t('switched_off'))}</div>
      <small class="muted">${esc([t('game_' + b.game), money(b.unit_price), b.guest_sale ? t('guest_sale') : t('sellers_only'), b.counts.revenue ? t('revenue') + ' ' + money(b.counts.revenue) : '', b.note || ''].filter(Boolean).join(' · '))}</small>
      ${tkCounts(b.counts)}
      <div class="actions">${can('m_tickets') ? `<button class="btn ghost small" data-act="tb_edit">${ico('edit')} ${esc(t('edit_batch'))}</button><button class="btn ghost small" data-act="tb_dup">${ico('copy')} ${esc(t('tb_duplicate'))}</button>` : ''}${tkPerm('tickets_print') ? `<button class="btn ghost small" data-act="tk_print" data-w="batch">${ico('download')} ${esc(t('print_tickets'))}</button>` : ''}
        ${tkPerm('tickets_view') || tkPerm('tickets_allocate') ? `<a class="btn ghost small" href="#/ticketsadmin/sellers">${ico('users')} ${esc(t('ticket_sellers'))}</a>` : ''}
        ${tkDelOk() ? `<button class="btn ghost small danger" data-act="tb_delete">${ico('trash')} ${esc(t('delete_batch'))}</button>` : ''}</div></section>
    <div class="chips">${['all', ...TK_ST, 'unprinted'].filter(k => k === 'all' || cnt(k)).map(k => `<button class="chip-btn ${tkFilter === k ? 'on' : ''}" data-act="tk_filter" data-k="${k}">${esc(k === 'all' ? t('all') : k === 'unprinted' ? t('not_printed') : tkSt(k))} (${cnt(k)})</button>`).join('')}</div>
    <div class="row"><span class="grow muted small">${esc(t(tkView === 'grid' ? 'tk_tap_select' : 'tk_tap_open'))}</span><div class="seg" role="group" aria-label="${esc(t('view'))}">${['grid', 'list'].map(v => `<button data-act="tk_view" data-v="${v}" class="${tkView === v ? 'on' : ''}" aria-pressed="${tkView === v}">${esc(t('view_' + v))}</button>`).join('')}</div></div>
    ${show.length ? selHead('tk', show.map(x => x.id)) : ''}
    ${!show.length ? empty(t('nothing_found')) : tkView === 'grid' ? `<div class="numgrid tk-grid">${show.map(x => `<button class="st-${x.status} ${tkSel.has(x.id) ? 'on' : ''}" data-act="tk_tap" data-id="${x.id}" aria-pressed="${tkSel.has(x.id)}" title="${esc([x.code, tkSt(x.status), x.seller, tkWho(x)].filter(Boolean).join(' · '))}">${esc(pad(x.number))}${x.printed_at ? '<i aria-hidden="true"></i>' : ''}</button>`).join('')}</div>
      <p class="tk-legend muted small">${TK_ST.map(s => `<span class="st-${s}"><i></i>${esc(tkSt(s))}</span>`).join('')}<span class="printed"><i></i>${esc(t('printed'))}</span></p>` : tkListHtml(show, [b], true)}
    ${tkBarHtml(true)}`;
}
// what can be done with the chosen tickets (only the buttons the person may use)
const tkBarHtml = inBatch => `<div class="sticky-act tk-bar" id="tk-bar" ${tkSel.size ? '' : 'hidden'}><span id="tk-n">${esc(t('selected_n', { n: tkSel.size }))}</span><span class="tk-bar-btns">
  ${tkPerm('tickets_allocate') ? `<button class="btn small" data-act="tk_assign">${ico('users')} ${esc(t('give_to_seller'))}</button><button class="btn ghost small" data-act="tk_takeback">${esc(t('unassign'))}</button>` : ''}
  ${inBatch && tkPerm('tickets_print') ? `<button class="btn ghost small" data-act="tk_print" data-w="sel">${ico('download')} ${esc(t('print'))}</button>` : ''}
  ${tkPerm('tickets_void') ? `<button class="btn ghost small" data-act="tk_void">${esc(t('void'))}</button>` : ''}
  ${can('tickets_delete_sold') ? `<button class="btn ghost small danger" data-act="tk_sale_del">${esc(t('delete_sale'))}</button>` : ''}
  ${tkDelOk() ? `<button class="btn ghost small danger" data-act="tk_delete">${ico('trash')} ${esc(t('delete'))}</button>` : ''}
  <button class="icon-btn" data-act="tk_sel_none" aria-label="${esc(t('clear'))}">${ico('x')}</button></span></div>`;
const tkBarUpdate = () => { const bar = $('#tk-bar'); if (!bar) return; bar.hidden = !tkSel.size; $('#tk-n').textContent = t('selected_n', { n: tkSel.size }); };
// the grid shows the same selection as the boxes and "select all"
SEL_ON.tk = s => { $$('.tk-grid [data-act=tk_tap]').forEach(el => { const on = s.has(+el.dataset.id); el.classList.toggle('on', on); el.setAttribute('aria-pressed', on); }); tkBarUpdate(); };
ACT.tk_filter = el => { tkFilter = el.dataset.k; route(); };
ACT.tk_view = el => { tkView = el.dataset.v; route(); };
ACT.tk_tap = el => { const id = +el.dataset.id; if (tkSel.has(id)) tkSel.delete(id); else tkSel.add(id); selUpdate('tk'); };
ACT.tk_sel_none = () => { tkSel.clear(); selUpdate('tk'); };
const tkDone = msg => { tkSel.clear(); toast(msg || t('saved')); route(); };
// who may hold tickets: the sellers of this team (the database decides; loaded once per visit)
async function tkSellers() { if (!tkPeople) tkPeople = (await api('ticket_sellers', { p_staff_id: -1 })).people; return tkPeople; }
ACT.tk_assign = async (el, ev, ids) => {
  const pick = ids || [...tkSel], people = await tkSellers();
  if (!people.length) return toast(t('no_sellers'), 'bad');
  editForm(t('give_to_seller') + ' (' + pick.length + ')', [{ k: 'staff_id', type: 'select', label: t('seller'), num: true, req: true, options: opts(people, 'id', p => p.display_name + (p.staff_number ? ' #' + p.staff_number : '')) }], {},
    async r => { await api('ticket_allocate', { p_ids: pick, p_staff_id: r.staff_id }); tkSel.clear(); route(); }, { after: `<p class="muted small">${esc(t('give_hint'))}</p>` });
};
// unassign: the tickets stay in the inventory (available), the seller loses them, they can be given again
ACT.tk_takeback = async (el, ev, ids) => { const pick = ids || [...tkSel]; if (!await confirmBox(t('unassign_q', { n: pick.length }), t('unassign'))) return; await api('ticket_allocate', { p_ids: pick, p_staff_id: null }); closeModals(); tkDone(); };
ACT.tk_void = (el, ev, ids) => { const pick = ids || [...tkSel];
  editForm(t('void_tickets', { n: pick.length }), [{ k: 'reason', label: t('void_reason'), req: true, hint: t('void_hint') }], {}, async r => { await api('ticket_void', { p_ids: pick, p_reason: r.reason }); closeModals(); tkDone(); }, { saveLabel: t('void') }); };
ACT.tk_delete = (el, ev, ids) => { closeModals(); return tkDeleteAsk(ids || [...tkSel]); };
ACT.tk_sale_del = (el, ev, ids) => { closeModals(); return tkSaleDeleteAsk(ids || [...tkSel]); };
ACT.tb_delete = () => tkDeleteAsk(null, tkBatch.b.id);

/* permanent delete of tickets – one, several or a whole batch: first what is connected to them, then the manager's choice
   (the database checks every choice again and deletes exactly what was chosen, nothing unrelated) */
const tkPrizeWarn = pv => pv.prizes.map(p => t('prize_linked_warn', { code: p.code || '', prize: p.prize }));
const tkPrizeChoice = pv => pv.prizes.length ? `<fieldset class="field del-opts"><legend>${esc(t('prize_choice'))}</legend>
    <label class="del-opt"><input type="radio" name="del_p" value="unlink"><span><b>${esc(t('prize_unlink'))}</b><small class="muted">${esc(t('prize_unlink_h'))}</small></span></label>
    <label class="del-opt ${pv.can.prize_delete ? '' : 'dim'}"><input type="radio" name="del_p" value="delete" ${pv.can.prize_delete ? '' : 'disabled'}><span><b>${esc(t('prize_delete_too'))}</b><small class="muted">${esc(t('prize_delete_too_h'))}</small></span></label></fieldset>` : '';
async function tkDeleteAsk(ids, batchId) {
  if (!batchId && !(ids || []).length) return;
  const pv = await api('ticket_delete', Object.assign(batchId ? { p_batch_id: batchId } : { p_ids: ids }, { p_mode: 'all', p_preview: true }));
  const c = pv.counts, n = pv.n, sold = pv.with_sale, b = pv.batch, C = pv.can;
  if ((n > 1 || b) && !C.bulk) return toast(t('err_bulk_needed'), 'bad');
  const facts = [b || n > 1 ? t('del_fact_counts', { total: n, available: c.available, assigned: c.assigned, sold: c.sold + c.reserved, void: c.void }) : '',
    sold ? t('del_fact_sales', { n: sold, money: money(pv.revenue) }) : '', pv.guests ? t('del_fact_guests', { n: pv.guests }) : '', pv.sellers ? t('del_fact_sellers', { n: pv.sellers }) : '',
    pv.prizes.length ? t('del_fact_prizes', { n: pv.prizes.length }) : '', pv.payments ? t('del_fact_money', { n: pv.payments, money: money(pv.payments_total) }) : '',
    pv.logs ? t('del_fact_logs', { n: pv.logs }) : ''].filter(Boolean);
  const kept = pv.sold_codes.slice(0, 8).join(', ') + (pv.sold_codes.length > 8 ? ' …' : '');
  const options = [sold && sold < n ? { v: 'unsold', label: t('del_opt_unsold'), hint: t('del_opt_unsold_h', { n: n - sold, codes: kept }), off: !C.unsold } : null,
    { v: 'ticket', label: t(sold ? 'del_opt_ticket_sale' : b ? 'del_opt_batch' : 'del_opt_ticket'), hint: t(sold ? 'del_opt_ticket_sale_h' : 'del_opt_ticket_h'), off: !C.ticket },
    pv.logs || pv.payments ? { v: 'all', label: t('del_opt_all'), hint: t('del_opt_all_h'), off: !C.all } : null].filter(Boolean);
  if (b && !n) facts.unshift(t('del_fact_empty_batch'));
  if (!options.some(x => !x.off)) return toast(t('err_forbidden'), 'bad');
  const r = await delAsk({ title: b ? t('delete_batch_q', { name: batchName(b) }) : n === 1 ? t('delete_ticket_q', { code: pv.codes[0] }) : t('delete_tickets_n_q', { n }),
    facts, warn: tkPrizeWarn(pv), options, def: b && !n && pv.payments ? 'all' : 'ticket', extra: tkPrizeChoice(pv), n, text: t(b ? 'delete_batch_text' : 'delete_tickets_text'),
    check: p => { if (pv.prizes.length && p.del_m !== 'unsold' && !p.del_p) { toast(t('prize_choose'), 'bad'); return false; } } });
  if (!r) return;
  const mode = r.mode || options.find(x => !x.off).v;
  const j = await api('ticket_delete', Object.assign(b ? { p_batch_id: b.id } : { p_ids: ids }, { p_mode: mode, p_prize: r.del_p || null }));
  tkSel.clear(); tkPeople = null;
  toast((j.kept || []).length ? t('deleted_kept', { n: j.deleted, codes: j.kept.join(', ') }) : t('deleted_n', { n: j.deleted }));
  if (b && j.batch_deleted) location.hash = '#/ticketsadmin/inventory'; else route();
}
// delete only the sale: the ticket stays in the inventory (back with its seller, or on sale again); the guest no longer has it
async function tkSaleDeleteAsk(ids) {
  if (!(ids || []).length) return;
  const pv = await api('ticket_delete', { p_ids: ids, p_mode: 'sale', p_preview: true }), n = pv.with_sale;
  if (!n) return toast(t('no_sale_to_delete'), 'bad');
  if (n > 1 && !pv.can.bulk) return toast(t('err_bulk_needed'), 'bad');
  const r = await delAsk({ title: n === 1 ? t('delete_sale_q', { code: pv.sold_codes[0] }) : t('delete_sales_q', { n }), n, yes: t('delete_sale'),
    facts: [t('del_fact_sales', { n, money: money(pv.revenue) }), pv.guests ? t('del_fact_guests', { n: pv.guests }) : ''].filter(Boolean), warn: tkPrizeWarn(pv), extra: tkPrizeChoice(pv), text: t('delete_sale_text'),
    check: p => { if (pv.prizes.length && !p.del_p) { toast(t('prize_choose'), 'bad'); return false; } } });
  if (!r) return;
  const j = await api('ticket_delete', { p_ids: ids, p_mode: 'sale', p_prize: r.del_p || null });
  tkSel.clear(); toast(t('sales_deleted_n', { n: j.sales_deleted })); route();
}

/* one ticket: everything about it, and what may be done with it */
ACT.tk_open = el => {
  const src = tkBatch?.tickets?.find(x => x.id === +el.dataset.id) ? tkBatch : { tickets: tkCache.tickets, b: null };
  const x = src.tickets.find(y => y.id === +el.dataset.id), b = src.b || tkCache.batches.find(y => y.id === x.batch_id) || {};
  const unsold = ['available', 'assigned'].includes(x.status), hasSale = !unsold && (x.status !== 'void' || !!(x.guest_name || x.stay_id || x.sold_at)), rows = [[t('status'), tkSt(x.status)], [t('batch'), batchName(b)], [t('seller'), x.seller || '—'],
    [t('guest'), x.guest_name || '—'], [t('room'), x.room || '—'], [t('price'), x.price != null && !unsold ? money(x.price) : money(b.unit_price)],
    [t('sold_at'), x.sold_at ? D.stamp(x.sold_at) + (x.sold_by_name ? ' · ' + x.sold_by_name : '') : x.reserved_at ? t('tks_reserved') + ' ' + D.stamp(x.reserved_at) : '—'],
    [t('printed'), x.printed_at ? D.stamp(x.printed_at) + ' · ' + t('times_n', { n: x.print_count }) : t('no')]];
  if (x.status === 'void') rows.push([t('void_reason'), (x.void_reason || '') + (x.voided_at ? ' · ' + D.stamp(x.voided_at) : '')]);
  if (x.note) rows.push([t('note'), x.note]);
  modal(t('ticket_no') + ' ' + x.code, tableHtml([t('ticket'), ''], rows) + `<div class="sheet-actions">
    ${tkPerm('tickets_edit') && !unsold ? `<button class="btn ghost wide" data-act="tkt_edit" data-id="${x.id}">${ico('edit')} ${esc(t('edit'))}</button>` : ''}
    ${tkPerm('tickets_allocate') && unsold ? `<button class="btn ghost wide" data-act="tk_one" data-a="assign" data-id="${x.id}">${ico('users')} ${esc(t('give_to_seller'))}</button>` : ''}
    ${tkPerm('tickets_allocate') && x.status === 'assigned' ? `<button class="btn ghost wide" data-act="tk_one" data-a="takeback" data-id="${x.id}">${esc(t('unassign'))}</button>` : ''}
    ${tkPerm('tickets_print') ? `<button class="btn ghost wide" data-act="tk_one" data-a="print" data-id="${x.id}">${ico('download')} ${esc(t('print'))}</button>` : ''}
    ${tkPerm('tickets_void') && x.status !== 'void' ? `<button class="btn ghost wide" data-act="tk_one" data-a="void" data-id="${x.id}">${esc(t('void'))}</button>` : ''}
    ${can('tickets_delete_sold') && hasSale ? `<button class="btn ghost wide danger" data-act="tk_one" data-a="sale_del" data-id="${x.id}">${esc(t('delete_sale'))}</button>` : ''}
    ${(unsold && can('tickets_delete')) || (!unsold && can('tickets_delete') && can('tickets_delete_sold')) ? `<button class="btn ghost wide danger" data-act="tk_one" data-a="delete" data-id="${x.id}">${ico('trash')} ${esc(t('delete'))}</button>` : ''}</div>`, {});
};
ACT.tk_one = (el, ev) => { const id = +el.dataset.id, a = el.dataset.a;
  if (a === 'print') { closeModals(); return tkPrint([id]); }
  return ACT['tk_' + a](el, ev, [id]); };
ACT.tkt_edit = el => { const x = (tkBatch?.tickets || []).concat(tkCache?.tickets || []).find(y => y.id === +el.dataset.id);
  editForm(t('ticket_no') + ' ' + x.code, [{ k: 'guest_name', label: t('guest_name') }, { k: 'room', label: t('room') }, { k: 'price', type: 'number', label: t('price'), step: '0.01', min: 0 }, { k: 'note', label: t('note') }],
    x, async r => { await api('ticket_edit', { p_id: x.id, p_row: r }); closeModals(); tkDone(); }, { after: `<p class="muted small">${esc(t('ticket_edit_hint'))}</p>` }); };

/* a new batch: its numbers become tickets at once; bingo tickets get their unique cards */
const tbItems = async () => (await list('program_items', { _from: D.add(D.today(), -1), _to: D.add(D.today(), 60) })).filter(i => i.status === 'scheduled').sort((a, c) => (c.ticketed - a.ticketed) || (a.date + a.start_time).localeCompare(c.date + c.start_time));
const tbFields = (types, items, edit) => [!edit && { k: 'ticket_type_id', type: 'select', label: t('ticket_types'), num: true, req: true, options: opts(types, 'id', x => x.name + ' · ' + t('game_' + x.game)) },
  { k: 'item_id', type: 'select', label: t('event'), num: true, options: opts(items, 'id', i => itemName(i) + ' · ' + D.short(i.date) + ' ' + hm(i.start_time), t('none')), hint: t('batch_event_hint') },
  { k: 'label', label: t('batch'), hint: t('batch_hint') },
  { type: 'section', label: edit ? t('add_numbers') : t('numbers'), hint: edit ? t('add_numbers_hint') : '' },
  { k: 'number_from', type: 'number', label: t('number_from'), req: !edit, min: 0 }, { k: 'number_to', type: 'number', label: t('number_to'), req: !edit, min: 0 },
  { type: 'section', label: t('sale') }, { k: 'price', type: 'number', label: t('price'), step: '0.01', min: 0, hint: t('price_hint') },
  { k: 'guest_sale', type: 'bool', label: t('guest_sale'), hint: t('guest_sale_hint') }, { k: 'active', type: 'bool', label: t('on_sale'), hint: t('on_sale_hint') }, { k: 'note', label: t('note') }].filter(Boolean);
// bingo: a new card for each new number (the database refuses any card that exists for this game + event; then new ones are made)
const bingoFor = nums => nums.map(n => { const g = bingoNew(); return { n, s: bingoSig(g), g }; });
async function tbSave(row, game, newNums) {
  let cards = game === 'bingo' ? bingoFor(newNums) : undefined;
  for (let k = 0; ; k++) {
    try { return await api('ticket_batch_save', { p_row: Object.assign({}, row, cards ? { cards } : {}) }); }
    catch (e) { if (e.code !== 'bingo_duplicate' || k > 4) throw e; const dup = new Set(e.info.cards || []); cards = cards.map(c => dup.has(c.s) ? bingoFor([c.n])[0] : c); }
  }
}
const range = (a, z) => { const out = []; if (a == null || z == null) return out; for (let n = a; n <= z && out.length < 5000; n++) out.push(n); return out; };
ACT.tb_new = async () => {
  const [types, items] = await Promise.all([list('ticket_types'), tbItems()]); const act = types.filter(x => x.active);
  if (!act.length) return toast(t('add_type_first'), 'bad');
  editForm(t('new_batch'), tbFields(act, items, false), { label: 'A', number_from: 1, number_to: 100, active: true, guest_sale: false }, async r => {
    if (r.number_to < r.number_from || r.number_to - r.number_from >= 5000) throw new ApiError('range');
    const ty = act.find(x => x.id === r.ticket_type_id); const j = await tbSave(r, ty.game, range(r.number_from, r.number_to));
    location.hash = '#/ticketsadmin/b' + j.batch.id;
  });
};
ACT.tb_edit = async () => {
  const b = tkBatch.b, items = await tbItems(); if (b.item && !items.some(i => i.id === b.item.id)) items.unshift(Object.assign({ ticketed: true }, b.item));
  editForm(t('edit_batch'), tbFields([], items, true), Object.assign({}, b, { number_from: null, number_to: null }), async r => {
    const have = new Set(tkBatch.tickets.map(x => x.number)), add = range(r.number_from, r.number_to).filter(n => !have.has(n));
    if (r.number_from == null || r.number_to == null) { delete r.number_from; delete r.number_to; }
    let j;
    try { j = await tbSave(Object.assign(r, { id: b.id }), b.game, add); }
    catch (e) {
      // printed or sold tickets carry the old letter: renamed only when the manager says so (reprint them afterwards)
      if (e.code !== 'label_printed' || !await confirmBox(t('label_printed_q'), t('tb_rename'))) throw e;
      j = await tbSave(Object.assign(r, { id: b.id, force_label: true }), b.game, add);
    }
    if (j.added) toast(t('tickets_added', { n: j.added })); route();
  });
};
// a batch made again on purpose: the same game, event, price and sale settings, the next numbers (never the same ticket twice)
ACT.tb_dup = async () => {
  const b = tkBatch.b, [types, items] = await Promise.all([list('ticket_types'), tbItems()]), act = types.filter(x => x.active || x.id === b.ticket_type_id);
  if (b.item && !items.some(i => i.id === b.item.id)) items.unshift(Object.assign({ ticketed: true }, b.item));
  const n = Math.max(1, (b.counts.to || 0) - (b.counts.from || 0) + 1), from = (b.counts.to || 0) + 1;
  editForm(t('tb_duplicate'), tbFields(act, items, false), { ticket_type_id: b.ticket_type_id, item_id: b.item?.id || null, label: b.label, number_from: from, number_to: from + n - 1, price: b.price, guest_sale: b.guest_sale, active: b.active, note: b.note }, async r => {
    if (r.number_to < r.number_from || r.number_to - r.number_from >= 5000) throw new ApiError('range');
    const ty = act.find(x => x.id === r.ticket_type_id); const j = await tbSave(r, ty.game, range(r.number_from, r.number_to));
    location.hash = '#/ticketsadmin/b' + j.batch.id;
  }, { after: `<p class="muted small">${esc(t('tb_duplicate_hint'))}</p>` });
};

/* printing: the very tickets of the inventory, as they are (number, guest + room when sold, seller, the bingo card) in the type's
   TEMPLATE (or another one of it chosen here); each ticket with its own batch (event, letter); a reprint is the same ticket */
let tkPrintJob = null;
async function tkPrint(ids, which) {
  const all = tkBatch?.tickets || tkCache?.tickets || []; const b0 = tkBatch?.b || tkCache.batches.find(y => y.id === all.find(x => x.id === ids?.[0])?.batch_id);
  if (!b0) return toast(t('nothing_to_print'), 'bad');
  const type0 = tkType(b0), lay = Object.assign({ paper: 'a4', orient: 'portrait', per_page: 8, fit: 'fit', template: tkTemplate(type0).key }, b0?.layout || {});
  if (!tplOptions(type0).some(o => o[0] === lay.template)) lay.template = tkTemplate(type0).key;
  tkPrintJob = { ids, b: b0 };
  const f = [ids ? null : { k: 'which', type: 'select', label: t('which_tickets'), options: [['all', t('all_n', { n: all.length })], ['unprinted', t('not_printed_n', { n: all.filter(x => !x.printed_at).length })], ['sel', t('selected_n', { n: tkSel.size })]] },
    { k: 'template', type: 'select', label: t('tk_template'), options: tplOptions(type0) },
    { k: 'paper', type: 'select', label: t('paper'), options: [['a4', 'A4'], ['a5', 'A5'], ['letter', 'Letter'], ['item', t('paper_ticket')]] },
    { k: 'orient', type: 'select', label: t('orientation'), options: [['portrait', t('portrait')], ['landscape', t('landscape')]] },
    { k: 'fit', type: 'select', label: t('tk_size'), options: [['fit', t('tk_fit')], ['actual', t('tk_actual')]] },
    { k: 'per_page', type: 'select', label: t('per_page'), num: true, options: PER_PAGE.map(n => [n, String(n)]), hint: t('per_page_hint') }].filter(Boolean);
  tkPrintJob.f = f;
  modal(t('print_tickets'), `<p class="muted small">${esc(t('print_intro'))}</p><form id="tkp" onsubmit="return false">${fieldsHtml(f, Object.assign({ which: which || (tkSel.size ? 'sel' : 'all') }, lay))}</form><p><button class="btn ghost" data-act="tkp_preview">${ico('image')} ${esc(t('preview'))}</button></p><div id="tk-preview"></div>`,
    { save: () => tkPrintRun(true), saveLabel: t('make_pdf'), wide: true });
}
ACT.tk_print = el => tkPrint(el.dataset.w === 'sel' ? [...tkSel] : null, el.dataset.w === 'sel' ? 'sel' : null);
ACT.tkp_preview = () => tkPrintRun(false).catch(fail);
async function tkPrintRun(make) {
  const job = tkPrintJob, r = readForm($('#tkp'), job.f), all = tkBatch?.tickets || tkCache.tickets;
  const rows = (job.ids ? all.filter(x => job.ids.includes(x.id)) : r.which === 'sel' ? all.filter(x => tkSel.has(x.id)) : r.which === 'unprinted' ? all.filter(x => !x.printed_at) : all)
    .filter(x => x.status !== 'void').sort((a, c) => (a.batch_id - c.batch_id) || (a.number - c.number));
  if (!rows.length) { toast(t('nothing_to_print'), 'bad'); return false; }
  // each batch with its own type, event and letter; the chosen template for the type it belongs to, the others their own
  const batches = uniq(rows.map(x => x.batch_id)).map(id => (tkBatch?.b?.id === id ? tkBatch.b : (tkCache?.batches || []).find(y => y.id === id)) || job.b);
  const groups = [];
  for (const b of batches) {
    const type = tkType(b), key = type.id === job.b.ticket_type_id ? r.template : tkTemplate(type).key, [dw, dh] = tkDim(type, key);
    const base = await tkInfo(type, b.item, { batch: b.label }, key);
    groups.push({ b, type, key, dw, dh, base, rows: rows.filter(x => x.batch_id === b.id) });
  }
  const g0 = groups[0], L0 = sheetLayout(r.paper, r.orient, r.per_page, g0.dw, g0.dh, r.fit === 'actual');
  const pages = groups.flatMap(g => { const L = sheetLayout(r.paper, r.orient, r.per_page, g.dw, g.dh, r.fit === 'actual');
    return sheetPages(g.rows, L, g.dw, g.dh, x => ticketSvg(g.type, Object.assign({}, g.base, { guest: x.guest_name || '', room: x.room || '', seller: x.seller || '' }), x.number, x.card ? { g: x.card, s: x.card_sig } : null, g.key)); });
  if (!make) {
    $('#tk-preview').innerHTML = `<h3>${esc(t('preview'))}</h3><p class="muted small">${esc(t('layout_info', { n: L0.cells.length, w: Math.round(L0.w), h: Math.round(L0.h), pages: pages.length, paper: Math.round(L0.W) + ' × ' + Math.round(L0.H) + ' mm' }))}</p>
      <div class="sheet-prev">${pages.slice(0, 2).join('')}</div>`;
    return false;
  }
  await makePdf(pages, L0.W, L0.H, job.b.type_name + (job.b.label ? ' ' + job.b.label : '') + ' ' + rows[0].number + '-' + rows[rows.length - 1].number, { foot: r.paper === 'item' ? null : 'compact' });
  await api('ticket_printed', { p_ids: rows.map(x => x.id), p_layout: { paper: r.paper, orient: r.orient, per_page: r.per_page, fit: r.fit, template: r.template } });
  tkSel.clear(); setTimeout(route, 50);
}

/* the seller overview: per seller and batch what was given, sold, still held, the money taken, handed in and still due */
let spStaff = null;     // one seller only (opened from the search)
async function sellersView() {
  const j = await api('ticket_sellers'); tkPeople = j.people; tkCache = Object.assign(tkCache || {}, { sellers: j });
  const bat = id => j.batches.find(b => b.id === id) || {};
  const packs = spStaff ? j.packs.filter(p => p.staff_id === spStaff) : j.packs;
  const byStaff = {}; packs.forEach(p => (byStaff[p.staff_id] = byStaff[p.staff_id] || []).push(p));
  const st = p => { const tk = p.tickets, by = s => tk.filter(x => x.status === s); const rev = sum(by('sold'), x => x.price); return { tk, held: by('assigned'), sold: by('sold'), res: by('reserved'), vo: by('void'), rev, due: rev - (+p.handed_in || 0) }; };
  const people = Object.values(byStaff).sort((a, c) => (a[0].staff_number || 999) - (c[0].staff_number || 999) || a[0].staff.localeCompare(c[0].staff));
  const all = packs.filter(p => p.status === 'open').map(st);
  const acts = (tkPerm('tickets_allocate') ? `<button class="btn ghost small" data-act="sp_unassign" data-sel-need ${sel('sp').size ? '' : 'disabled'}>${esc(t('unassign_all'))}</button>` : '')
    + (can('allocations_delete') || can('m_tickets') ? `<button class="btn ghost small danger" data-act="sp_delete" data-sel-need ${sel('sp').size ? '' : 'disabled'}>${ico('trash')} ${esc(t('delete_selected'))}</button>` : '');
  return (spStaff ? `<p class="row"><b class="grow">${esc(t('seller'))}: ${esc(packs[0]?.staff || '')}</b><button class="btn ghost small" data-act="sp_all">${esc(t('all_sellers'))}</button></p>` : '') + `<div class="stats"><span><b>${sum(all, s => s.tk.length)}</b>${esc(t('allocated'))}</span><span><b>${sum(all, s => s.sold.length)}</b>${esc(t('sold'))}</span><span><b>${sum(all, s => s.held.length)}</b>${esc(t('remaining'))}</span>
      <span><b>${esc(money(sum(all, s => s.rev)))}</b>${esc(t('revenue'))}</span><span><b>${esc(money(sum(all, s => s.due)))}</b>${esc(t('due'))}</span></div><p class="muted small">${esc(t('sellers_intro'))}</p>`
    + (packs.length && acts ? selHead('sp', packs.map(p => p.id), acts) : '')
    + (people.length ? people.map(ps => { const open = ps.filter(p => p.status === 'open'), done = ps.filter(p => p.status !== 'open'), s0 = open.map(st);
      return `<section class="card seller-card"><h2>${esc(ps[0].staff)}${ps[0].staff_number ? ` <small class="muted">#${ps[0].staff_number}</small>` : ''}</h2>
        ${open.length ? `<p class="muted">${esc(t('seller_line', { a: sum(s0, s => s.tk.length), s: sum(s0, s => s.sold.length), r: sum(s0, s => s.held.length), m: money(sum(s0, s => s.rev)) }))}</p>` : ''}
        ${open.map(p => sellerPack(p, bat(p.batch_id), st(p))).join('')}${done.length ? `<details><summary>${esc(t('settled_packs'))} (${done.length})</summary>${done.map(p => sellerPack(p, bat(p.batch_id), st(p))).join('')}</details>` : ''}</section>`; }).join('')
      : empty(t('no_open_packs')));
}
const sellerPack = (p, b, s) => `<div class="pack-card seller-pack"><div class="row">${selBox('sp', p.id, p.staff + ' · ' + (batchName(b) || t('tickets')))}<b class="grow">${esc(batchName(b) || t('tickets'))}</b>${p.status === 'settled' ? chip(t('settled'), 'ok') : ''}</div>
  <div class="tk-ranges">${s.held.length ? `<p><span class="muted">${esc(t('still_held'))}:</span> ${esc(ranges(s.held.map(x => x.number)))}</p>` : ''}${s.sold.length ? `<p><span class="muted">${esc(t('sold'))}:</span> ${esc(ranges(s.sold.map(x => x.number)))}</p>` : ''}${s.res.length ? `<p><span class="muted">${esc(tkSt('reserved'))}:</span> ${esc(ranges(s.res.map(x => x.number)))}</p>` : ''}${s.vo.length ? `<p><span class="muted">${esc(tkSt('void'))}:</span> ${esc(ranges(s.vo.map(x => x.number)))}</p>` : ''}</div>
  <div class="stats"><span><b>${s.tk.length}</b>${esc(t('allocated'))}</span><span><b>${s.sold.length}</b>${esc(t('sold'))}</span><span><b>${s.held.length}</b>${esc(t('remaining'))}</span><span><b>${esc(money(s.rev))}</b>${esc(t('revenue'))}</span><span><b>${esc(money(+p.handed_in || 0))}</b>${esc(t('handed_in'))}</span><span><b>${esc(money(s.due))}</b>${esc(t('due'))}</span></div>
  <div class="actions"><button class="btn ghost small" data-act="sp_list" data-id="${p.id}">${esc(t('show_tickets'))}</button>${can('m_tickets') && p.status === 'open' ? `<button class="btn ghost small" data-act="tp_pay" data-id="${p.id}">${esc(t('money_handed_in'))}</button><button class="btn ghost small" data-act="tp_settle" data-id="${p.id}">${esc(t('settle'))}</button>` : ''}
    ${tkPerm('tickets_allocate') && s.held.length ? `<button class="btn ghost small" data-act="sp_unassign" data-id="${p.id}">${esc(t('unassign_all'))}</button>` : ''}
    ${can('allocations_delete') || (can('m_tickets') && !p.tickets.length && !p.payments.length) ? `<button class="btn ghost small danger" data-act="sp_delete" data-id="${p.id}">${ico('trash')} ${esc(t('delete_allocation'))}</button>` : ''}</div></div>`;
ACT.sp_all = () => { spStaff = null; route(); };
const spPacks = el => (el.dataset.id ? [+el.dataset.id] : selIds('sp')).map(id => tkCache.sellers.packs.find(p => p.id === id)).filter(Boolean);
// the complete allocation away from the seller: what they still hold goes back to the inventory (sold tickets and money stay)
ACT.sp_unassign = async el => { const ids = spPacks(el).flatMap(p => p.tickets.filter(x => x.status === 'assigned').map(x => x.id));
  if (!ids.length) return toast(t('nothing_held'), 'bad');
  if (!await confirmBox(t('unassign_q', { n: ids.length }), t('unassign'))) return;
  await api('ticket_allocate', { p_ids: ids, p_staff_id: null }); sel('sp').clear(); toast(t('saved')); route(); };
// delete the allocation history: the record and its money records; held tickets go back on sale, sold tickets stay sold
ACT.sp_delete = async el => {
  const ps = spPacks(el); if (!ps.length) return;
  if (ps.length > 1 && !can('bulk_delete')) return toast(t('err_bulk_needed'), 'bad');
  const cnt = f => sum(ps, p => p.tickets.filter(f).length), held = cnt(x => x.status === 'assigned'), sold = cnt(x => x.status !== 'assigned' && x.status !== 'available');
  const pays = sum(ps, p => p.payments.length), handed = sum(ps, p => +p.handed_in || 0), b = tkCache.sellers.batches.find(y => y.id === ps[0].batch_id) || {};
  const r = await delAsk({ title: ps.length === 1 ? t('delete_alloc_q', { name: ps[0].staff, batch: batchName(b) || t('tickets') }) : t('delete_allocs_q', { n: ps.length }), n: ps.length,
    facts: [held ? t('del_alloc_held', { n: held }) : '', sold ? t('del_alloc_sold', { n: sold }) : '', pays ? t('del_alloc_money', { n: pays, money: money(handed) }) : ''].filter(Boolean),
    text: t('delete_alloc_text') });
  if (!r) return;
  const j = await delMany('ticket_packs', ps.length === 1 ? { p_id: ps[0].id, p_force: true } : { p_ids: ps.map(p => p.id), p_force: true });
  sel('sp').clear(); tkPeople = null; toast(t('deleted_n', { n: j.deleted })); route();
};
ACT.sp_list = el => { const p = tkCache.sellers.packs.find(x => x.id === +el.dataset.id), b = tkCache.sellers.batches.find(y => y.id === p.batch_id) || {};
  sel('spt').clear();
  const acts = (tkPerm('tickets_allocate') ? `<button class="btn ghost small" data-act="spt_unassign" data-sel-need disabled>${esc(t('unassign'))}</button>` : '')
    + (tkDelOk() ? `<button class="btn ghost small danger" data-act="spt_delete" data-sel-need disabled>${ico('trash')} ${esc(t('delete'))}</button>` : '');
  modal(p.staff + ' · ' + batchName(b), (acts && p.tickets.length ? selHead('spt', p.tickets.map(x => x.id), acts) : '')
    + `<div class="list tk-list">${p.tickets.map(x => `<label class="li row tk-row">${acts ? selBox('spt', x.id, x.code) : ''}<b class="tk-code">${esc(x.code)}</b><span class="grow">${esc(tkWho(x))}<small class="muted"> ${esc([tkWhen(x), ['sold', 'reserved', 'void'].includes(x.status) && x.price != null ? money(x.price) : ''].filter(Boolean).join(' · '))}</small></span>${chip(tkSt(x.status), TK_CLS[x.status] || '')}</label>`).join('')}</div>`
    + (p.payments.length ? `<h3>${esc(t('handed_in'))}</h3>` + tableHtml([t('date'), t('amount'), t('note')], p.payments.map(y => [D.stamp(y.created_at), money(y.amount), y.note || ''])) : ''), { wide: true }); };
ACT.spt_unassign = el => { const ids = selIds('spt'); return ACT.tk_takeback(el, null, ids); };
ACT.spt_delete = () => { const ids = selIds('spt'); closeModals(); return tkDeleteAsk(ids); };
ACT.tp_pay = el => editForm(t('money_handed_in'), [{ k: 'amount', type: 'number', label: t('amount'), step: '0.01', req: true }, { k: 'note', label: t('note') }], {}, async r => { await save('ticket_payments', Object.assign({ pack_id: +el.dataset.id }, r)); route(); });
ACT.tp_settle = async el => { if (await confirmBox(t('settle_q'))) { await save('ticket_packs', { id: +el.dataset.id, status: 'settled', settled_at: new Date().toISOString() }); route(); } };

/* how many tickets fit on one page (the print engine places them exactly, never cut or overlapping) */
const PER_PAGE = [1, 2, 3, 4, 6, 8, 10, 12, 16, 20, 24];

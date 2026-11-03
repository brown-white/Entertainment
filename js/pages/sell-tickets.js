'use strict';
/* Mr Hassan · pages/sell-tickets.js — staff page: Sell tickets (the seller's own tickets: tap numbers, the guest, the currency and how they
   pay, sell; guests' reservations; what they collected per currency; print).
   Uses: core/state · translations/languages · supabase · core/utils · icons/icons · core/permissions · components/modals · core/actions ·
         components/cards · core/router · systems/exports · systems/ticket-system */
/* ---------- Sell tickets: the seller sees exactly the tickets given to them, taps numbers, enters the guest, sells ---------- */
let tsCache = null, tsSel = new Set();
page('tickets', {
  perm: 'tickets_sell', icon: 'ticket', group: 'programme', title: 'pg_tickets',
  render: async () => {
    const j = await api('ticket_sellers', { p_staff_id: meId() }); tsCache = j;
    [...tsSel].forEach(id => { if (!j.packs.some(p => p.tickets.some(x => x.id === id && x.status === 'assigned'))) tsSel.delete(id); });
    const open = j.packs.filter(p => p.status === 'open'), settled = j.packs.filter(p => p.status !== 'open').slice(0, 10);
    if (!j.packs.length && !j.pool_reserved.length) return empty(t('no_packs_mine'));
    return (j.pool_reserved.length ? `<section class="card"><h2>${esc(t('reserved_by_guests'))}</h2><p class="muted small">${esc(t('reserved_hint'))}</p>${tsResList(j.pool_reserved)}</section>` : '')
      + (open.length ? open.map(p => tsPackCard(p, tsBat(p.batch_id))).join('') : empty(t('no_open_packs')))
      + (settled.length ? `<details><summary>${esc(t('settled_packs'))}</summary>${settled.map(p => tsPackCard(p, tsBat(p.batch_id))).join('')}</details>` : '')
      + `<div class="sticky-act" id="ts-bar" ${tsSel.size ? '' : 'hidden'}><span id="ts-n">${esc(tsBarText())}</span><span class="row"><button class="icon-btn" data-act="ts_none" aria-label="${esc(t('clear'))}">${ico('x')}</button><button class="btn" data-act="ts_sell">${esc(t('sell'))}</button></span></div>`;
  }
});
const tsBat = id => (tsCache?.batches || []).find(b => b.id === id) || {};
const tsTickets = () => (tsCache?.packs || []).flatMap(p => p.tickets);
// what the selected numbers cost – in each currency the guest may pay in (per batch, with that currency's offers)
const tsBarText = () => { const sel = tsTickets().filter(x => tsSel.has(x.id)); return t('selected_n', { n: tsSel.size }) + (sel.length ? ' · ' + moneyBy(tkTotals(sel, tsBat)) : ''); };
const tsResList = rows => `<div class="list">${rows.map(x => `<div class="li row"><b class="tk-code">${esc(x.code)}</b><span class="grow">${esc(tkWho(x))}<br><small class="muted">${esc(batchName(tsBat(x.batch_id)))} · ${esc(tkAmount(x))} · ${esc(tkWhen(x))}</small></span>
  <button class="btn small" data-act="ts_res" data-id="${x.id}" data-paid="1">${esc(t('paid_confirm'))}</button><button class="btn ghost small" data-act="ts_res" data-id="${x.id}" data-paid="0">${esc(t('cancel'))}</button></div>`).join('')}</div>`;
function tsPackCard(p, b) {
  const tk = p.tickets, by = s => tk.filter(x => x.status === s), sold = tk.filter(x => ['sold', 'complimentary', 'refunded'].includes(x.status)), pad = n => String(n).padStart(b.digits || 1, '0');
  const live = p.status === 'open' && b.active;
  return `<section class="card pack-card"><div class="row"><span class="swatch" style="--cc:${safeColor(b.color)}"></span><h2 class="grow">${esc(batchName(b) || t('tickets'))}</h2>${p.status === 'settled' ? chip(t('settled'), 'ok') : !b.active ? chip(t('switched_off')) : ''}</div>
    <small class="muted">${esc([tkPricesTxt(b), tkOffersTxt(b.offers), b.item ? D.short(b.item.date) + ' ' + hm(b.item.start_time) : ''].filter(Boolean).join(' · '))}</small>
    <div class="stats"><span><b>${tk.length}</b>${esc(t('allocated'))}</span><span><b>${by('sold').length}</b>${esc(t('sold'))}</span>${by('complimentary').length ? `<span><b>${by('complimentary').length}</b>${esc(tkSt('complimentary'))}</span>` : ''}<span><b>${by('assigned').length}</b>${esc(t('remaining'))}</span></div>
    ${tkMoneyHtml(tkMoney(tk, p.payments))}
    ${live && by('assigned').length ? `<p class="muted small">${esc(t('tap_numbers_to_sell'))}</p>` : ''}
    <div class="numgrid tk-grid">${tk.map(x => x.status === 'assigned' && live ? `<button class="st-assigned ${tsSel.has(x.id) ? 'on' : ''}" data-act="ts_tap" data-id="${x.id}" aria-pressed="${tsSel.has(x.id)}" aria-label="${esc(t('ticket_no') + ' ' + x.code)}">${esc(pad(x.number))}</button>`
      : x.status === 'reserved' ? `<button class="st-reserved" data-act="ts_res_one" data-id="${x.id}" aria-label="${esc(x.code + ' · ' + tkSt('reserved'))}">${esc(pad(x.number))}</button>`
      : `<button class="st-${x.status}" disabled aria-label="${esc(x.code + ' · ' + tkSt(x.status))}">${esc(pad(x.number))}</button>`).join('')}</div>
    ${sold.length ? `<details><summary>${esc(t('sold_numbers'))} (${sold.length})</summary><div class="list">${sold.map(x => `<div class="li row"><b class="tk-code">${esc(x.code)}</b><span class="grow">${esc(tkWho(x))}<br><small class="muted">${esc([tkWhen(x), tkAmount(x), payName(x.pay_method), x.status === 'refunded' ? tkSt('refunded') : ''].filter(Boolean).join(' · '))}</small></span><button class="icon-btn" data-act="ts_print" data-id="${x.id}" aria-label="${esc(t('print_ticket'))}" title="${esc(t('print_ticket'))}">${ico('download')}</button></div>`).join('')}</div></details>` : ''}</section>`;
}
const tsBar = () => { const bar = $('#ts-bar'); if (!bar) return; bar.hidden = !tsSel.size; $('#ts-n').textContent = tsBarText(); };
ACT.ts_tap = el => { const id = +el.dataset.id; if (tsSel.has(id)) tsSel.delete(id); else tsSel.add(id); el.classList.toggle('on', tsSel.has(id)); el.setAttribute('aria-pressed', tsSel.has(id)); tsBar(); };
ACT.ts_none = () => { tsSel.clear(); $$('[data-act=ts_tap].on').forEach(el => { el.classList.remove('on'); el.setAttribute('aria-pressed', 'false'); }); tsBar(); };
/* the sale: THE sell form (room → the registered guest, the name, the currency, how they pay); the database sells each ticket only once */
ACT.ts_sell = () => tkSellForm({ rows: tsTickets().filter(x => tsSel.has(x.id)), bat: tsBat, done: () => { tsSel.clear(); route(); } });
ACT.ts_res = async el => { const x = tsTickets().concat(tsCache.pool_reserved).find(y => y.id === +el.dataset.id);
  if (el.dataset.paid === '1') { closeModals(); return tkPayForm([x], route); }
  if (!await confirmBox(t('cancel_reservation_q'))) return;
  await api('ticket_reservation', { p_ids: [x.id], p_paid: false }); closeModals(); toast(t('reservation_cancelled')); route(); };
ACT.ts_res_one = el => { const x = tsTickets().concat(tsCache.pool_reserved).find(y => y.id === +el.dataset.id);
  modal(t('ticket_no') + ' ' + x.code, `<p>${esc(tkSt('reserved'))}: <b>${esc(tkWho(x))}</b> · ${esc(tkAmount(x))} · ${esc(tkWhen(x))}</p><div class="sheet-actions"><button class="btn wide" data-act="ts_res" data-id="${x.id}" data-paid="1">${esc(t('paid_confirm'))}</button><button class="btn ghost wide" data-act="ts_res" data-id="${x.id}" data-paid="0">${esc(t('cancel'))}</button></div>`, {}); };
/* print one sold ticket for its guest: the same way as every ticket (ticketPages), its type's template, page = the ticket */
ACT.ts_print = async el => {
  const x0 = tsTickets().find(y => y.id === +el.dataset.id), x = Object.assign({}, x0, { seller: x0.seller || S.me?.display_name || '' });
  const b = tsBat(x.batch_id), { pages, L0 } = await ticketPages([x], () => b, { paper: 'item', per_page: 1 }, type => tkTemplate(type).key);
  await makePdf(pages, L0.W, L0.H, b.type_name + ' ' + x.code, { dpi: tkDpi(1) });
  if (can('tickets_print')) await api('ticket_printed', { p_ids: [x.id], p_layout: null }).catch(() => null);
};

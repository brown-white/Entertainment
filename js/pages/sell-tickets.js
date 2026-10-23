'use strict';
/* AUREA · pages/sell-tickets.js — staff page: Sell tickets (the seller's own tickets: tap numbers, the guest, sell, reserve, print).
   Uses: core/state · translations/languages · supabase · core/utils · icons/icons · core/permissions · components/modals · core/actions ·
         components/cards · core/router · components/forms · systems/exports · systems/ticket-system */
/* ---------- Sell tickets: the seller sees exactly the tickets given to them, taps numbers, enters the guest, sells ---------- */
let tsCache = null, tsSel = new Set();
page('tickets', {
  perm: 'tickets_sell', icon: 'ticket', group: 'programme', title: 'pg_tickets',
  render: async () => {
    const j = await api('ticket_sellers', { p_staff_id: meId() }); tsCache = j;
    [...tsSel].forEach(id => { if (!j.packs.some(p => p.tickets.some(x => x.id === id && x.status === 'assigned'))) tsSel.delete(id); });
    const open = j.packs.filter(p => p.status === 'open'), settled = j.packs.filter(p => p.status !== 'open').slice(0, 10);
    if (!j.packs.length && !j.pool_reserved.length) return empty(t('no_packs_mine'));
    const bat = id => j.batches.find(b => b.id === id) || {};
    return (j.pool_reserved.length ? `<section class="card"><h2>${esc(t('reserved_by_guests'))}</h2><p class="muted small">${esc(t('reserved_hint'))}</p>${tsResList(j.pool_reserved, bat)}</section>` : '')
      + (open.length ? open.map(p => tsPackCard(p, bat(p.batch_id))).join('') : empty(t('no_open_packs')))
      + (settled.length ? `<details><summary>${esc(t('settled_packs'))}</summary>${settled.map(p => tsPackCard(p, bat(p.batch_id))).join('')}</details>` : '')
      + `<div class="sticky-act" id="ts-bar" ${tsSel.size ? '' : 'hidden'}><span id="ts-n">${esc(tsBarText())}</span><span class="row"><button class="icon-btn" data-act="ts_none" aria-label="${esc(t('clear'))}">${ico('x')}</button><button class="btn" data-act="ts_sell">${esc(t('sell'))}</button></span></div>`;
  }
});
const tsTickets = () => (tsCache?.packs || []).flatMap(p => p.tickets);
// what the selected numbers cost (per batch, with the type's offers)
const tsTotal = () => { const by = {}; tsTickets().filter(x => tsSel.has(x.id)).forEach(x => { (by[x.batch_id] = by[x.batch_id] || []).push(x); });
  return Object.entries(by).reduce((a, [bid, xs]) => { const b = tsCache.batches.find(y => y.id === +bid) || {}; return a + tkPrice(b.unit_price, b.offers, xs.length); }, 0); };
const tsBarText = () => t('selected_n', { n: tsSel.size }) + (tsSel.size ? ' · ' + money(tsTotal()) : '');
const tsResList = (rows, bat) => `<div class="list">${rows.map(x => `<div class="li row"><b class="tk-code">${esc(x.code)}</b><span class="grow">${esc(tkWho(x))}<br><small class="muted">${esc(batchName(bat(x.batch_id)))} · ${esc(money(x.price))} · ${esc(tkWhen(x))}</small></span>
  <button class="btn small" data-act="ts_res" data-id="${x.id}" data-paid="1">${esc(t('paid_confirm'))}</button><button class="btn ghost small" data-act="ts_res" data-id="${x.id}" data-paid="0">${esc(t('cancel'))}</button></div>`).join('')}</div>`;
function tsPackCard(p, b) {
  const tk = p.tickets, by = s => tk.filter(x => x.status === s), sold = by('sold'), rev = sum(sold, x => x.price), handed = +p.handed_in || 0, pad = n => String(n).padStart(b.digits || 1, '0');
  const live = p.status === 'open' && b.active;
  return `<section class="card pack-card"><div class="row"><span class="swatch" style="--cc:${safeColor(b.color)}"></span><h2 class="grow">${esc(batchName(b) || t('tickets'))}</h2>${p.status === 'settled' ? chip(t('settled'), 'ok') : !b.active ? chip(t('switched_off')) : ''}</div>
    <small class="muted">${esc(money(b.unit_price))}${(b.offers || []).map(o => ' · ' + t('offer_x_for', { n: o.qty, price: money(o.price) })).join('')}${b.item ? ' · ' + D.short(b.item.date) + ' ' + hm(b.item.start_time) : ''}</small>
    <div class="stats"><span><b>${by('assigned').length}</b>${esc(t('remaining'))}</span><span><b>${sold.length}</b>${esc(t('sold'))}</span><span><b>${esc(money(rev))}</b>${esc(t('collected'))}</span><span><b>${esc(money(handed))}</b>${esc(t('handed_in'))}</span><span><b>${esc(money(rev - handed))}</b>${esc(t('due'))}</span></div>
    ${live && by('assigned').length ? `<p class="muted small">${esc(t('tap_numbers_to_sell'))}</p>` : ''}
    <div class="numgrid tk-grid">${tk.map(x => x.status === 'assigned' && live ? `<button class="st-assigned ${tsSel.has(x.id) ? 'on' : ''}" data-act="ts_tap" data-id="${x.id}" aria-pressed="${tsSel.has(x.id)}" aria-label="${esc(t('ticket_no') + ' ' + x.code)}">${esc(pad(x.number))}</button>`
      : x.status === 'reserved' ? `<button class="st-reserved" data-act="ts_res_one" data-id="${x.id}" aria-label="${esc(x.code + ' · ' + tkSt('reserved'))}">${esc(pad(x.number))}</button>`
      : `<button class="st-${x.status}" disabled aria-label="${esc(x.code + ' · ' + tkSt(x.status))}">${esc(pad(x.number))}</button>`).join('')}</div>
    ${sold.length ? `<details><summary>${esc(t('sold_numbers'))} (${sold.length})</summary><div class="list">${sold.map(x => `<div class="li row"><b class="tk-code">${esc(x.code)}</b><span class="grow">${esc(tkWho(x))}<br><small class="muted">${esc(tkWhen(x))} · ${esc(money(x.price))}</small></span><button class="icon-btn" data-act="ts_print" data-id="${x.id}" aria-label="${esc(t('print_ticket'))}" title="${esc(t('print_ticket'))}">${ico('download')}</button></div>`).join('')}</div></details>` : ''}</section>`;
}
const tsBar = () => { const bar = $('#ts-bar'); if (!bar) return; bar.hidden = !tsSel.size; $('#ts-n').textContent = tsBarText(); };
ACT.ts_tap = el => { const id = +el.dataset.id; if (tsSel.has(id)) tsSel.delete(id); else tsSel.add(id); el.classList.toggle('on', tsSel.has(id)); el.setAttribute('aria-pressed', tsSel.has(id)); tsBar(); };
ACT.ts_none = () => { tsSel.clear(); $$('[data-act=ts_tap].on').forEach(el => { el.classList.remove('on'); el.setAttribute('aria-pressed', 'false'); }); tsBar(); };
/* the sale: the room first (the registered guests of that room can be picked), then the name; the database sells each ticket only once */
ACT.ts_sell = () => {
  const sel = [...tsSel], codes = tsTickets().filter(x => tsSel.has(x.id)).map(x => x.code);
  let stay = null;
  const f = [{ k: 'room', label: t('room'), req: true, ac: 'off' }, { k: 'name', label: t('guest_name'), req: true }];
  modal(t('sell_tickets'), `<p><b>${esc(codes.join(', '))}</b> · ${esc(money(tsTotal()))}</p>${formHtml(f, {})}<div id="ts-guests"></div>`, {
    saveLabel: t('sell'),
    mount: root => { const rm = $('[name=room]', root), nm = $('[name=name]', root), box = $('#ts-guests', root);
      const look = async () => { stay = null; const v = rm.value.trim(); if (!v) { box.innerHTML = ''; return; }
        try { const j = await api('ticket_room_guests', { p_room: v });
          box.innerHTML = !j.known ? `<p class="hint-box warn">${esc(t('err_room'))}</p>` : j.guests.length ? `<p class="muted small">${esc(t('registered_guests'))}</p><div class="chips">${j.guests.map(g => `<button type="button" class="chip-btn" data-stay="${g.stay_id}">${esc(g.name)}</button>`).join('')}</div>` : '';
          $$('[data-stay]', box).forEach(b => { b.onclick = () => { stay = +b.dataset.stay; nm.value = b.textContent; $$('[data-stay]', box).forEach(x => x.classList.toggle('on', x === b)); }; });
        } catch { box.innerHTML = ''; } };
      rm.addEventListener('change', look); nm.addEventListener('input', () => { stay = null; $$('[data-stay]', box).forEach(x => x.classList.remove('on')); }); },
    save: async root => {
      const r = readForm(root, f);
      try { const j = await api('ticket_sell', { p_ids: sel, p_name: r.name, p_room: r.room, p_stay_id: stay }); tsSel.clear(); toast(t('sold_total', { total: money(j.total) })); route(); }
      catch (e) { if (['already_sold', 'not_yours'].includes(e.code)) { tsSel.clear(); route(); } throw e; }
    } });
};
ACT.ts_res = async el => { const paid = el.dataset.paid === '1'; if (!paid && !await confirmBox(t('cancel_reservation_q'))) return;
  await api('ticket_reservation', { p_ids: [+el.dataset.id], p_paid: paid }); closeModals(); toast(paid ? t('paid_saved') : t('reservation_cancelled')); route(); };
ACT.ts_res_one = el => { const x = tsTickets().concat(tsCache.pool_reserved).find(y => y.id === +el.dataset.id);
  modal(t('ticket_no') + ' ' + x.code, `<p>${esc(tkSt('reserved'))}: <b>${esc(tkWho(x))}</b> · ${esc(money(x.price))} · ${esc(tkWhen(x))}</p><div class="sheet-actions"><button class="btn wide" data-act="ts_res" data-id="${x.id}" data-paid="1">${esc(t('paid_confirm'))}</button><button class="btn ghost wide" data-act="ts_res" data-id="${x.id}" data-paid="0">${esc(t('cancel'))}</button></div>`, {}); };
/* print one sold ticket for its guest: the same ticket design, page = the ticket */
ACT.ts_print = async el => {
  const x = tsTickets().find(y => y.id === +el.dataset.id), b = tsCache.batches.find(y => y.id === x.batch_id), type = tkType(b);
  const info = Object.assign(await tkInfo(type, b.item, { batch: b.label }), { guest: x.guest_name || '', room: x.room || '', seller: S.me?.display_name || '' }), [dw, dh] = tkDim(type), L = sheetLayout('item', null, 1, dw, dh);
  await makePdf(sheetPages([x], L, dw, dh, y => ticketSvg(type, info, y.number, y.card ? { g: y.card, s: y.card_sig } : null)), L.W, L.H, type.name + ' ' + x.code);
  if (can('tickets_print')) await api('ticket_printed', { p_ids: [x.id], p_layout: null }).catch(() => null);
};

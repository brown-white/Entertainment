'use strict';
/* AUREA · pages/guest/tickets.js — guest app: my tickets and getting tickets (choose numbers, reserve).
   Uses: core/state · translations/languages · supabase · core/utils · components/modals · core/actions · components/cards · core/router ·
         systems/guest-lifecycle · systems/program-engine · systems/ticket-system */
page('g_tickets', {
  mode: 'guest', title: 'tickets',
  render: async () => {
    const its = gItems().filter(i => i.ticketed && i.date >= D.today() && i.status === 'scheduled');
    const mine = S.g.me?.tickets || [];
    return `${mine.length ? `<section><h2>${esc(t('my_tickets'))}</h2>${ticketList(mine)}</section>` : ''}
      <section><h2>${esc(t('ticket_events'))}</h2>${its.length ? `<div class="items">${its.map(i => itemRow(i, 'g_pack')).join('')}</div>` : empty(t('no_ticket_events'))}</section>`;
  }
});
ACT.g_tk_cancel = async el => { if (!await confirmBox(t('cancel_ticket_q'))) return; await rpc('guest_ticket_cancel', { p_key: S.g.key, p_sale_id: +el.dataset.id }); await gRefreshMe(); route(); };

/* buying tickets: only the tickets of this game that are on sale for guests (nobody holds them, nobody bought them) */
let gPick = { item: null, ids: [] };
page('g_pack', {
  mode: 'guest', title: 'get_tickets', heading: arg => { const it = gItem(arg); return it ? itemName(it) : t('get_tickets'); },
  render: async arg => {
    const it = gItem(arg); if (!it) return empty(t('not_found'));
    if (!signedIn()) return empty(t('sign_in_for_tickets'), `<a class="btn" href="#/g_stay">${esc(t('sign_in'))}</a>`);
    const o = await rpc('guest_ticket_offer', { p_key: S.g.key, p_item_id: it.id });
    if (gPick.item !== it.id) gPick = { item: it.id, ids: [] };
    const free = o.batches.flatMap(b => b.tickets.map(x => Object.assign({ b }, x)));
    gPick.ids = gPick.ids.filter(id => free.some(x => x.id === id)); gPick.offer = o;
    const left = Math.max(0, (o.max || 10) - (o.mine || 0));
    if (!free.length) return `<p class="lead">${esc(o.sellers ? t('tickets_from_team') : t('tickets_sold_out'))}</p>${(S.g.me?.tickets || []).some(x => x.item_id === it.id) ? ticketList(S.g.me.tickets.filter(x => x.item_id === it.id)) : ''}`;
    return `<p class="muted">${esc(t('pick_numbers', { max: left }))}${o.sellers ? ' ' + esc(t('also_from_team')) : ''}</p>`
      + o.batches.filter(b => b.tickets.length).map(b => `<section><h2>${esc(b.type)}${b.label ? ' · ' + esc(t('batch')) + ' ' + esc(b.label) : ''} <small class="muted">${esc(money(b.price))}${(b.offers || []).map(x => ' · ' + esc(t('offer_x_for', { n: x.qty, price: money(x.price) }))).join('')}</small></h2>
        <div class="numgrid">${b.tickets.map(x => `<button class="${gPick.ids.includes(x.id) ? 'on' : ''}" data-act="g_num" data-id="${x.id}" aria-pressed="${gPick.ids.includes(x.id)}" aria-label="${esc(t('ticket_no') + ' ' + x.code)}">${esc(String(x.number).padStart(b.digits || 1, '0'))}</button>`).join('')}</div></section>`).join('')
      + `<div class="sticky-act"><span id="g-sel">${esc(gPickText())}</span><button class="btn" data-act="g_reserve" ${gPick.ids.length ? '' : 'disabled'}>${esc(t('get_tickets'))}</button></div>`;
  }
});
const gPickText = () => { const o = gPick.offer; if (!o) return ''; let tot = 0;
  o.batches.forEach(b => { const n = b.tickets.filter(x => gPick.ids.includes(x.id)).length; if (n) tot += tkPrice(b.price, b.offers, n); });
  return t('selected_n', { n: gPick.ids.length }) + (gPick.ids.length ? ' · ' + money(tot) : ''); };
ACT.g_num = el => { const id = +el.dataset.id; const i = gPick.ids.indexOf(id); if (i >= 0) gPick.ids.splice(i, 1); else gPick.ids.push(id);
  el.classList.toggle('on', i < 0); el.setAttribute('aria-pressed', i < 0); const b = $('[data-act=g_reserve]'); if (b) b.disabled = !gPick.ids.length; const s = $('#g-sel'); if (s) s.textContent = gPickText(); };
ACT.g_reserve = async () => {
  try { const j = await rpc('guest_ticket_buy', { p_key: S.g.key, p_ids: gPick.ids });
    toast(j.paid ? t('tickets_yours') : t('reserved_total', { total: money(j.total) })); gPick = { item: null, ids: [] }; await gRefreshMe(); location.hash = '#/g_tickets'; }
  catch (e) { if (e.code === 'already_sold') { gPick.ids = []; route(); } throw e; }
};

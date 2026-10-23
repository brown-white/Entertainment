'use strict';
/* AUREA · pages/prizes.js — Tickets → Prizes: prize lists linked to a ticket game, the draw, handing over, prize cards.
   Uses: core/state · translations/languages · supabase · core/utils · icons/icons · core/permissions · components/modals · core/actions ·
         components/cards · core/router · components/forms · components/tables · systems/exports · systems/ticket-system */
/* ---------- Prizes: prize lists linked to a ticket game; the prize card is what the guest receives ---------- */
let prizeCache = null, pzFocus = null;
// a prize opened from the search is shown in its list (the Tickets page's mount)
const prizesMount = () => { if (pzFocus) { const el = $('#pz-' + pzFocus); if (el) el.scrollIntoView({ block: 'center' }); pzFocus = null; } };
async function prizesView() {
  const [sets, prizes, types, items] = await Promise.all([list('prize_sets', { _limit: 50 }), list('prizes', { _limit: 2000 }), list('ticket_types'), list('program_items', { _from: D.add(D.today(), -7), _to: D.add(D.today(), 30) })]);
  prizeCache = { sets, prizes, types, items };
  const mg = tkPerm('prizes_manage'), dr = tkPerm('prizes_draw'), dl = tkPerm('prizes_delete');
  const shown = prizes.filter(p => sets.some(x => x.id === p.set_id)).map(p => p.id);
  return `<p class="row"><span class="muted grow">${esc(t('prizes_intro'))}</span>${mg ? `<button class="btn small" data-act="ps_new">${ico('plus')} ${esc(t('new_prize_list'))}</button>` : ''}</p>`
    + (dl && shown.length ? selHead('pz', shown, `<button class="btn ghost small danger" data-act="pz_del" data-sel-need ${sel('pz').size ? '' : 'disabled'}>${ico('trash')} ${esc(t('delete_selected'))}</button>`) : '')
    + (sets.length ? sets.map(s => {
    const ps = prizes.filter(p => p.set_id === s.id).sort((a, b) => a.sort - b.sort || a.id - b.id), ty = types.find(x => x.id === s.ticket_type_id), it = items.find(i => i.id === s.item_id);
    return `<section class="card prize-set" style="--cc:${safeColor(ty?.color)}"><header><div><small>${esc(t('game_' + s.game))}${ty ? ' · ' + esc(ty.name) : ''}${s.draw_date ? ' · ' + esc(D.short(s.draw_date)) : ''}${it ? ' · ' + esc(itemName(it)) : ''}</small><h2>${esc(s.title)}</h2></div>
        ${mg ? `<label class="switch"><input type="checkbox" data-act-change="ps_announce" data-id="${s.id}" ${s.announced ? 'checked' : ''}> ${esc(t('show_winners_guests'))}</label>` : ''}</header>
      <div class="prizes">${ps.map((p, i) => `<div class="prize ${p.ticket_number ? 'won' : ''} ${pzFocus === p.id ? 'focus' : ''}" id="pz-${p.id}">${dl ? selBox('pz', p.id, p.label) : ''}<span class="place">${i + 1}</span>${p.image_url ? `<img src="${esc(p.image_url)}" alt="" loading="lazy">` : `<span class="pz-ic">${ico('trophy')}</span>`}
        <div class="grow"><b>${esc(p.label)}</b>${p.value ? `<small class="muted"> · ${esc(p.value)}</small>` : ''}<br>
          ${p.ticket_number ? `<span class="winner">${ico('ticket')} ${esc(p.ticket_number)}${p.winner_name ? ' · ' + esc(p.winner_name) : ''}${p.room ? ' · ' + esc(t('room')) + ' ' + esc(p.room) : ''}</span>` : `<small class="muted">${esc(t('not_drawn'))}</small>`}</div>
        <div class="pz-act">${p.ticket_number ? `<label class="switch small"><input type="checkbox" data-act-change="pz_hand" data-id="${p.id}" ${p.collected ? 'checked' : ''} ${mg || dr ? '' : 'disabled'}> ${esc(t('handed_over'))}</label>` : dr ? `<button class="btn small" data-act="pz_draw" data-id="${p.id}">${ico('target')} ${esc(t('draw_winner'))}</button>` : ''}
          ${p.ticket_number ? `<button class="icon-btn" data-act="pz_card" data-id="${p.id}" aria-label="${esc(t('print_prize_card'))}" title="${esc(t('print_prize_card'))}">${ico('download')}</button>` : ''}
          ${mg ? `<button class="icon-btn" data-act="pz_edit" data-id="${p.id}" aria-label="${esc(t('edit'))}">${ico('edit')}</button>` : ''}${dl ? `<button class="icon-btn" data-act="pz_del" data-id="${p.id}" aria-label="${esc(t('delete'))}">${ico('trash')}</button>` : ''}</div></div>`).join('') || `<p class="muted">${esc(t('no_prizes_yet'))}</p>`}</div>
      <p class="row">${mg ? `<button class="btn ghost small" data-act="pz_new" data-id="${s.id}">${ico('plus')} ${esc(t('add_prize'))}</button><button class="btn ghost small" data-act="ps_edit" data-id="${s.id}">${ico('edit')} ${esc(t('edit'))}</button>` : ''}
        ${ps.some(p => p.ticket_number) ? `<button class="btn ghost small" data-act="ps_cards" data-id="${s.id}">${ico('download')} ${esc(t('print_all_cards'))}</button>` : ''}
        <span class="grow"></span>${dl ? `<button class="btn ghost small danger" data-act="ps_del" data-id="${s.id}">${ico('trash')}</button>` : ''}</p></section>`; }).join('') : empty(t('nothing_yet')));
}
const setFields = () => [{ k: 'title', label: t('title'), req: true, ph: t('prize_list_ph') }, { k: 'game', type: 'select', label: t('game'), options: ['tombola', 'bingo', 'disco', 'other'].map(g => [g, t('game_' + g)]) },
  { k: 'ticket_type_id', type: 'select', label: t('ticket_types'), num: true, options: opts(prizeCache.types, 'id', 'name', t('none')), hint: t('prize_type_hint') },
  { k: 'item_id', type: 'select', label: t('event'), num: true, options: opts(prizeCache.items, 'id', i => itemName(i) + ' · ' + D.short(i.date), t('none')) }, { k: 'draw_date', type: 'date', label: t('draw_date') }];
const prizeFields = () => [{ k: 'label', label: t('prize'), req: true, ph: t('prize_ph') }, { k: 'value', label: t('prize_value'), ph: t('prize_value_ph') }, { k: 'image_url', type: 'image', label: t('photo') },
  { type: 'section', label: t('winner'), hint: t('winner_lookup_hint') }, { k: 'ticket_number', label: t('winning_ticket') }, { k: 'winner_name', label: t('winner') }, { k: 'room', label: t('room') }, { k: 'collected', type: 'bool', label: t('handed_over') }];
/* typing the winning ticket fills in the guest and room from the sold ticket (still editable) */
const winnerLookup = setId => root => { const tn = $('[name=ticket_number]', root); if (!tn) return;
  tn.addEventListener('change', async () => { if (!tn.value.trim()) return; try { const j = await api('ticket_lookup', { p_set_id: setId, p_number: tn.value });
    // another winning number: the guest and room of THAT ticket (never the previous winner's)
    const w = $('[name=winner_name]', root), r = $('[name=room]', root);
    if (j.found) { w.value = j.guest_name || ''; r.value = j.room || ''; toast(t('winner_found_short')); } else { w.value = ''; r.value = ''; toast(t('winner_not_found_short'), 'warn'); } } catch { /* typed by hand */ } }); };
async function prizeSave(setId, old, r) {
  const ticket = (r.ticket_number || '').trim(); let manualW = (r.winner_name || '').trim(), manualR = (r.room || '').trim();
  // a new winning number: the previous winner's name and room left in the form are not "typed by hand"
  if (old && ticket !== (old.ticket_number || '')) { if (manualW === (old.winner_name || '')) manualW = ''; if (manualR === (old.room || '')) manualR = ''; }
  const base = { label: r.label, value: r.value, image_url: r.image_url, collected: !!r.collected };
  const row = await save('prizes', Object.assign(old ? { id: old.id } : { set_id: setId, sort: prizeCache.prizes.filter(p => p.set_id === setId).length }, base));
  const id = old ? old.id : row?.id; let drawn = null;
  if (ticket !== (old?.ticket_number || '')) {
    // the one draw: finds the sold ticket and its guest, tells the guest; without a number the winner is cleared
    if (ticket && tkPerm('prizes_draw')) drawn = (await api('prize_draw', { p_prize_id: id, p_number: ticket })).prize;
    else await save('prizes', { id, ticket_number: ticket || null, ticket_id: null, stay_id: null, winner_name: null, room: null });
  }
  // a name or room written by hand (e.g. a guest without the app) is kept
  const cur = drawn || old || {};
  if ((manualW && manualW !== (cur.winner_name || '')) || (manualR && manualR !== (cur.room || ''))) await save('prizes', Object.assign({ id }, manualW ? { winner_name: manualW } : {}, manualR ? { room: manualR } : {}));
}
// the sold tickets of a prize list's game + event: the winner is picked from them
const soldFor = async s => (s.ticket_type_id || s.item_id ? (await api('ticket_list', { p_filter: { ticket_type_id: s.ticket_type_id, item_id: s.item_id, status: ['sold', 'reserved'] } })).tickets || [] : []);
ACT.ps_new = () => editForm(t('new_prize_list'), setFields(), { game: 'tombola', draw_date: D.today() }, async r => { await save('prize_sets', r); route(); });
ACT.ps_edit = el => editForm(t('edit'), setFields(), prizeCache.sets.find(s => s.id === +el.dataset.id), async r => { await save('prize_sets', r); route(); });
ACT.ps_del = async el => { const s0 = prizeCache.sets.find(x => x.id === +el.dataset.id), ps = prizeCache.prizes.filter(p => p.set_id === s0.id), handed = ps.filter(p => p.collected).length;
  if (!await delAsk({ title: t('delete_prize_list_q', { name: s0.title }), n: 1, text: t('delete_prize_list_text'),
    facts: [ps.length ? t('del_list_prizes', { n: ps.length }) : '', handed ? t('del_prize_handed', { n: handed }) : ''].filter(Boolean) })) return;
  await del('prize_sets', s0.id, { p_force: handed > 0 }); toast(t('deleted')); route(); };
ACT.ps_announce = async el => { await save('prize_sets', { id: +el.dataset.id, announced: el.checked }); toast(el.checked ? t('winners_shown') : t('winners_hidden')); };
ACT.pz_new = el => { const sid = +el.dataset.id; editForm(t('add_prize'), prizeFields(), {}, async r => { await prizeSave(sid, null, r); route(); }, { mount: winnerLookup(sid) }); };
ACT.pz_edit = el => { const p = prizeCache.prizes.find(x => x.id === +el.dataset.id); editForm(t('edit'), prizeFields(), p, async r => { await prizeSave(p.set_id, p, r); route(); }, { mount: winnerLookup(p.set_id) }); };
// delete prizes (one, or the chosen ones): a prize already handed over is prize history – deleted only permanently, after saying so
ACT.pz_del = async el => {
  const ids = el.dataset.id ? [+el.dataset.id] : selIds('pz'), ps = prizeCache.prizes.filter(p => ids.includes(p.id)); if (!ps.length) return;
  if (ps.length > 1 && !can('bulk_delete')) return toast(t('err_bulk_needed'), 'bad');
  const handed = ps.filter(p => p.collected), won = ps.filter(p => p.ticket_number);
  const r = await delAsk({ title: ps.length === 1 ? t('delete_prize_named_q', { prize: ps[0].label }) : t('delete_prizes_q', { n: ps.length }), n: ps.length,
    facts: [won.length ? t('del_prize_won', { n: won.length }) : '', handed.length ? t('del_prize_handed', { n: handed.length }) : ''].filter(Boolean), text: t('delete_prize_text') });
  if (!r) return;
  await delMany('prizes', ps.length === 1 ? { p_id: ps[0].id, p_force: handed.length > 0 } : { p_ids: ids, p_force: handed.length > 0 });
  sel('pz').clear(); toast(t('deleted_n', { n: ps.length })); route();
};
ACT.pz_hand = async el => { await api('prize_handover', { p_id: +el.dataset.id, p_on: el.checked }); toast(t('saved')); };
ACT.pz_draw = async el => {
  const pz = prizeCache.prizes.find(x => x.id === +el.dataset.id), sold = await soldFor(prizeCache.sets.find(s => s.id === pz.set_id));
  const f = [sold.length ? { k: 'ticket_id', type: 'select', label: t('winning_ticket'), num: true, options: opts(sold, 'id', x => x.code + (tkWho(x) ? ' · ' + tkWho(x) : ''), t('pick_ticket')), hint: t('pick_ticket_hint') } : null,
    { k: 'number', label: sold.length ? t('or_type_number') : t('winning_ticket'), hint: t('draw_hint') }].filter(Boolean);
  editForm(t('draw_winner'), f, {}, async r => {
    if (!r.ticket_id && !r.number) throw new ApiError('required', { field: t('winning_ticket') });
    const j = await api('prize_draw', { p_prize_id: pz.id, p_number: r.number || null, p_ticket_id: r.ticket_id || null });
    toast(j.found ? t('winner_found', { name: j.prize.winner_name || '', room: j.prize.room || '' }) : t('winner_not_found'), j.found ? 'ok' : 'warn'); route(); });
};
/* the prize card / voucher the guest receives */
function prizeCardSvg(p, s, o) {
  const c = safeColor(o.color), pic = o.photo, cx = pic ? 98 : 75, anchor = pic ? 'middle' : 'middle', no = 'P' + s.id + '-' + String(p.id).padStart(4, '0');
  return `<g data-design="prize"><defs><clipPath id="pp${p.id}"><rect x="9" y="30" width="42" height="52" rx="4"/></clipPath></defs>
    <rect x="0.8" y="0.8" width="148.4" height="98.4" rx="5" fill="#FFFDF8" stroke="${c}" stroke-width="1.4"/><rect x="4" y="4" width="142" height="92" rx="3.4" fill="none" stroke="${c}" stroke-width="0.35"/>
    ${[[4, 4], [146, 4], [4, 96], [146, 96]].map(([x, y]) => `<path d="M${x} ${y - 2.4}L${x + 2.4} ${y}L${x} ${y + 2.4}L${x - 2.4} ${y}Z" fill="${c}"/>`).join('')}
    ${o.logo ? `<image href="${o.logo}" x="67" y="7" width="16" height="11" preserveAspectRatio="xMidYMid meet"/>` : ''}
    ${svgT(75, o.logo ? 22 : 13, o.hotel.toUpperCase(), 2.7, 'text-anchor="middle" fill="#6b5a4c" letter-spacing="0.8" font-family="Arial"')}
    ${svgT(75, o.logo ? 27.5 : 19, t('prize_voucher').toUpperCase(), 2.9, `text-anchor="middle" fill="${c}" letter-spacing="1.6" font-family="Arial" font-weight="700"`)}
    ${pic ? `<image href="${pic}" x="9" y="30" width="42" height="52" preserveAspectRatio="xMidYMid slice" clip-path="url(#pp${p.id})"/><rect x="9" y="30" width="42" height="52" rx="4" fill="none" stroke="${c}" stroke-width="0.4"/>` : ''}
    ${svgWrap(cx, 40, p.label, p.label.length > 22 ? 8 : 10.5, pic ? 86 : 130, 2, `text-anchor="${anchor}" fill="#2a1d14" font-family="Georgia,serif"`)}
    ${p.value ? svgT(cx, 56, p.value, 3.8, `text-anchor="${anchor}" fill="#6b5a4c" font-family="Arial"`) : ''}
    ${svgT(cx, 66, p.winner_name || '', 5, `text-anchor="${anchor}" fill="#2a1d14" font-family="Arial" font-weight="700"`)}
    ${svgT(cx, 72.5, [p.room ? t('room') + ' ' + p.room : '', p.ticket_number ? t('ticket_no') + ' ' + p.ticket_number : ''].filter(Boolean).join(' · '), 3.3, `text-anchor="${anchor}" fill="#6b5a4c" font-family="Arial"`)}
    ${svgT(cx, 79, [s.title, o.date].filter(Boolean).join(' · '), 3, `text-anchor="${anchor}" fill="#9a8a7c" font-family="Arial"`)}
    <line x1="12" y1="90" x2="58" y2="90" stroke="#9a8a7c" stroke-width="0.3"/>${svgT(12, 93.4, t('handed_over_by'), 2.3, 'fill="#9a8a7c" font-family="Arial"')}
    ${svgT(140, 91, t('voucher_no'), 2.3, 'text-anchor="end" fill="#9a8a7c" font-family="Arial"')}${svgT(140, 94.6, no, 3.2, `text-anchor="end" fill="${c}" font-weight="700" font-family="Arial"`)}</g>`;
}
async function prizeCards(list2, s, a4) {
  const ty = prizeCache.types.find(x => x.id === s.ticket_type_id), it = prizeCache.items.find(i => i.id === s.item_id);
  const base = { hotel: S.hotel?.name || '', logo: await imgData(S.hotel?.logo_url), color: ty?.color, date: s.draw_date ? D.long(s.draw_date) : it ? D.long(it.date) : '' };
  const items = []; for (const p of list2) items.push({ p, o: Object.assign({}, base, { photo: await imgData(p.image_url) }) });
  const L = a4 ? sheetLayout('a4', 'portrait', 4, 150, 100) : sheetLayout('item', null, 1, 150, 100);
  await makePdf(sheetPages(items, L, 150, 100, x => prizeCardSvg(x.p, s, x.o)), L.W, L.H, t('prize_voucher') + ' ' + s.title, { foot: a4 ? 'compact' : null });
}
const prizeCardAsk = (list2, s) => modal(t('print_prize_card'), `<p class="muted">${esc(t('prize_card_paper'))}</p><div class="sheet-actions"><button class="btn wide" data-act="pz_card_go" data-a4="0">${esc(t('paper_card'))}</button><button class="btn ghost wide" data-act="pz_card_go" data-a4="1">${esc(t('paper_a4_4'))}</button></div>`, {}) && (pzPending = { list2, s });
let pzPending = null;
ACT.pz_card = el => { const p = prizeCache.prizes.find(x => x.id === +el.dataset.id); prizeCardAsk([p], prizeCache.sets.find(s => s.id === p.set_id)); };
ACT.ps_cards = el => { const s = prizeCache.sets.find(x => x.id === +el.dataset.id); prizeCardAsk(prizeCache.prizes.filter(p => p.set_id === s.id && p.ticket_number).sort((a, b) => a.sort - b.sort || a.id - b.id), s); };
ACT.pz_card_go = el => { closeModals(); prizeCards(pzPending.list2, pzPending.s, el.dataset.a4 === '1').catch(fail); };

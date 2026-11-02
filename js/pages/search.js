'use strict';
/* AUREA · pages/search.js — ONE search for the whole app (menu pages + the hotel's data the person may see).
   Uses: translations/languages · supabase · core/utils · icons/icons · core/permissions · components/modals · core/actions ·
         components/cards · core/router · components/tables */
/* ---------- ONE search for the whole app (menu pages + the hotel's data the person may see) ---------- */
let srQ = '', srFrom = '', srTo = '', srTimer = null, srLast = null;
page('search', {
  perm: 'myday', icon: 'search', hidden: true, title: 'search_all',
  render: async () => `<div class="card search-box"><div class="search-in">${ico('search')}<input type="search" id="srch" value="${esc(srQ)}" placeholder="${esc(t('search_hint'))}" aria-label="${esc(t('search'))}" autocomplete="off"></div>
      <div class="row"><input type="date" data-sr="from" value="${srFrom}" aria-label="${esc(t('date_from'))}"><input type="date" data-sr="to" value="${srTo}" aria-label="${esc(t('date_to'))}">${srFrom || srTo ? `<button class="btn ghost small" data-act="sr_clear">${esc(t('clear_dates'))}</button>` : ''}</div></div>
    <div id="srch-res">${await searchResults()}</div>`,
  mount: () => {
    const i = $('#srch'); i.focus(); i.setSelectionRange(i.value.length, i.value.length);
    i.oninput = () => { clearTimeout(srTimer); srTimer = setTimeout(async () => { srQ = i.value; $('#srch-res').innerHTML = await searchResults(); }, 280); };
    $$('[data-sr]').forEach(el => { el.onchange = () => { if (el.dataset.sr === 'from') srFrom = el.value; else srTo = el.value; route(); }; });
  }
});
ACT.sr_clear = () => { srFrom = ''; srTo = ''; route(); };
async function searchResults() {
  const q = srQ.trim(); if (q.length < 2 && !/^\d$/.test(q)) return empty(t('search_start'));
  const ql = q.toLowerCase(), co = /^[A-Z]{2}$/.test(countryCode(q)) ? countryCode(q) : null;
  const menu = menuFor(roleKey()).filter(m => m.label.toLowerCase().includes(ql));
  let j = {}; try { j = await api('search_all', { p_q: q, p_country: co, p_from: srFrom || null, p_to: srTo || null }); } catch (e) { fail(e); }
  srLast = j;
  const sec = (title, icon, items, row) => items && items.length ? `<section class="sr-sec"><h2>${ico(icon)} ${esc(title)} <small class="muted">${items.length}</small></h2><div class="list">${items.map(row).join('')}</div></section>` : '';
  const html = sec(t('menu'), 'menu', menu, m => `<a class="li row" href="#/${m.key}">${ico(m.icon || 'chev')}<b class="grow">${esc(m.label)}</b>${ico('chev')}</a>`)
    + sec(t('guests'), 'bed', j.stays, g => `<button class="li row" data-act="sr_stay" data-id="${g.id}"><b>${esc(t('room'))} ${esc(g.room)}</b><span class="grow">${esc(g.name)}${g.nationality ? ' · ' + esc(countryName(g.nationality)) : ''}</span><small class="muted">${esc(D.dm(g.arrival))} – ${esc(D.dm(g.departure))}</small></button>`)
    + sec(t('staff'), 'users', j.staff, p => `<button class="li row" data-act="sr_staff" data-id="${p.id}"><b>${esc(p.display_name)}</b>${p.staff_number ? `<small class="muted">#${p.staff_number}</small>` : ''}<span class="grow muted">${esc([p.role_name, p.team_name, countryName(p.nationality)].filter(Boolean).join(' · '))}</span></button>`)
    + sec(t('guest_feedback'), 'star', j.feedback, f => `<button class="li row ${f.lowest <= 2 ? 'fb-low' : ''}" data-act="sr_fb" data-q="${esc(f.room || f.guest_name || '')}"><b>${esc(f.guest_name || t('guest'))}</b><span class="grow muted">${f.room ? esc(t('room')) + ' ' + esc(f.room) + ' · ' : ''}${esc((f.comment || '').slice(0, 60))}</span>${f.lowest ? stars(f.lowest) : ''}<small class="muted">${esc(D.dm(hotelDate(f.created_at)))}</small></button>`)
    + sec(t('pg_gsupport'), 'buoy', j.support, g => `<button class="li row" data-act="sr_gs" data-q="${esc(g.room || '')}"><span class="chip">${esc(t('gk_' + g.kind))}</span><span class="grow">${g.room ? esc(t('room')) + ' ' + esc(g.room) + ' · ' : ''}${esc(g.body.slice(0, 70))}</span><small class="muted">${esc(D.dm(hotelDate(g.created_at)))}</small></button>`)
    + sec(t('programme'), 'list', j.items, i => `<a class="li row" href="#/item/${i.id}"><b>${esc(D.dm(i.date))} ${esc(hm(i.start_time))}</b><span class="grow">${esc(i.name)}</span>${i.status === 'cancelled' ? chip(t('cancelled'), 'bad') : ''}</a>`)
    + sec(t('tickets'), 'ticket', j.sales, s => `<button class="li row" data-act="sr_tk" data-q="${esc(s.code)}"><b>${esc(t('ticket_no'))} ${esc(s.code)}</b><span class="grow">${esc(s.guest_name || '')}${s.room ? ' · ' + esc(t('room')) + ' ' + esc(s.room) : ''}${s.seller ? ' · ' + esc(t('seller')) + ': ' + esc(s.seller) : ''}</span>${chip(t('tks_' + s.status))}</button>`)
    + sec(t('ticket_batches'), 'ticket', j.batches, b => `<a class="li row" href="#/ticketsadmin/b${b.id}"><b>${esc([b.type_name, b.label ? t('batch') + ' ' + b.label : ''].filter(Boolean).join(' · '))}</b><span class="grow muted">${esc([b.item_name, b.date ? D.dm(b.date) : ''].filter(Boolean).join(' · '))}</span><small class="muted">${esc(t('tickets_n', { n: b.n }))}</small></a>`)
    + sec(t('ticket_sellers'), 'users', j.sellers, p => `<button class="li row" data-act="sr_seller" data-id="${p.id}"><b>${esc(p.display_name)}</b>${p.staff_number ? `<small class="muted">#${p.staff_number}</small>` : ''}<span class="grow muted">${esc(t('seller_short', { held: p.held, sold: p.sold }))}</span></button>`)
    + sec(t('prizes'), 'trophy', j.prizes, z => `<button class="li row" data-act="sr_prize" data-id="${z.id}"><b>${esc(z.label)}</b><span class="grow muted">${esc([z.title, z.ticket_number, z.winner_name, z.room ? t('room') + ' ' + z.room : ''].filter(Boolean).join(' · '))}</span>${z.collected ? chip(t('handed_over'), 'ok') : ''}</button>`);
  return html || empty(t('search_nothing'));
}
ACT.sr_stay = el => { const g = srLast.stays.find(x => x.id === +el.dataset.id);
  modal(t('room') + ' ' + g.room, tableHtml([t('guest'), ''], [[t('name'), g.name], [t('nationality'), countryName(g.nationality)], [t('arrival'), D.long(g.arrival)], [t('departure'), D.long(g.departure)]]), {}); };
ACT.sr_staff = el => { const p = srLast.staff.find(x => x.id === +el.dataset.id);
  modal(p.display_name, tableHtml([t('staff'), ''], [[t('staff_number'), p.staff_number || ''], [t('role'), p.role_name || ''], [t('team'), p.team_name || ''], [t('nationality'), countryName(p.nationality)], [t('phone'), p.phone || '']])
    + (p.phone ? `<p class="row">${phoneBtns(p.phone)}</p>` : ''), {}); };
// a ticket, a seller or a prize opens where it is managed (and can be deleted there)
ACT.sr_tk = el => { openWith('tickets', { q: el.dataset.q, stay: null }); location.hash = '#/ticketsadmin/inventory'; };
ACT.sr_seller = el => { openWith('sellers', { staff: +el.dataset.id }); location.hash = '#/ticketsadmin/sellers'; };
ACT.sr_prize = el => { openWith('prizes', { prize: +el.dataset.id }); location.hash = '#/ticketsadmin/prizes'; };
ACT.sr_fb = el => { openWith('feedback', { q: el.dataset.q, status: 'all', from: srFrom || D.add(D.today(), -365), to: srTo || D.today() }); location.hash = '#/feedback'; };
ACT.sr_gs = el => { openWith('gsupport', { q: el.dataset.q, from: srFrom || D.add(D.today(), -365), to: srTo || D.today() }); location.hash = '#/gsupport/history'; };

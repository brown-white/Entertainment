'use strict';
/* Mr Hassan · pages/search.js — ONE search for the whole app (menu pages + the hotel's data the person may see).
   Uses: core/state · translations/languages · supabase · core/utils · icons/icons · core/permissions · components/modals · core/actions ·
         components/cards · components/theme · core/router · components/tables */
/* ---------- ONE search for the whole app (menu pages + the hotel's data the person may see) ---------- */
let srQ = '', srFrom = '', srTo = '', srTimer = null, srLast = null;
page('search', {
  perm: 'myday', icon: 'search', hidden: true, title: 'search_all',
  render: async () => `<div class="card search-box"><div class="search-in">${ico('search')}<input type="search" id="srch" value="${esc(srQ)}" placeholder="${esc(t('search_hint'))}" aria-label="${esc(t('search'))}" autocomplete="off"></div>
      <div class="row"><input type="date" data-sr="from" value="${srFrom}" aria-label="${esc(t('date_from'))}"><input type="date" data-sr="to" value="${srTo}" aria-label="${esc(t('date_to'))}">${srFrom || srTo ? `<button class="btn secondary small" data-act="sr_clear">${esc(t('clear_dates'))}</button>` : ''}</div></div>
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
    + sec(t('pg_suppliers'), 'truck', j.suppliers, u => `<a class="li row ${u.active ? '' : 'dim'}" href="#/attendance/suppliers/${u.id}"><b>${esc(u.name)}</b><span class="grow muted">${esc(t('sk_' + u.kind))}</span>${u.active ? '' : chip(t('inactive'))}</a>`)
    + sec(t('guest_requests'), 'gift', j.requests, r => `<a class="li row" href="#/guestreq/r${r.id}"><b>${esc(t('rq_' + r.req_type))}</b><span class="grow muted">${esc([r.req_date ? D.dm(r.req_date) : '', r.room ? t('room') + ' ' + r.room : '', r.guest_name].filter(Boolean).join(' · '))}</span>${chip(t('grs_' + r.status))}</a>`)
    + sec(t('pg_tasks'), 'tasks', j.tasks, k => `<a class="li row" href="#/tasks/${k.mine ? 'mine' : 'team'}"><b class="grow">${esc(k.title)}</b>${k.due_date ? `<small class="muted">${esc(D.dm(k.due_date))}</small>` : ''}${chip(t('ts_' + k.status), ['done', 'checked'].includes(k.status) ? 'ok' : '')}</a>`);
  return html || empty(t('search_nothing'), '', 'search');
}

/* ---------- (11.0) the command search: Ctrl / ⌘ K (or "/") anywhere – go to a page, start an action, find a record ----------
   the same menu and the same database search as the search page (permissions decide what is found); arrows + Enter, Escape */
const CMD_ACTS = () => [can('task_create,task_assign') && ['tk_new', 'plus', t('new_task')], can('reminders') && ['rem_new', 'bell', t('rem_new')],
  can('tickets_sell') && ['@tickets', 'ticket', t('pg_tickets')], can('guest_support,feedback_collect') && ['@gsupport', 'buoy', t('pg_gsupport')]].filter(Boolean);
let ckTimer = null, ckSeq = 0, ckQ = '';
function cmdkHtml(q, j) {
  const ql = q.trim().toLowerCase(), m = menuFor(roleKey()), favs = myPrefs().favs || [];
  const pages = ql ? m.filter(x => x.label.toLowerCase().includes(ql)).slice(0, 8) : m.filter(x => favs.includes(x.key)).concat(m.filter(x => !favs.includes(x.key))).slice(0, 6);
  const acts = CMD_ACTS().filter(a => !ql || a[2].toLowerCase().includes(ql));
  const link = (href, icon, label, sub, act, data = {}) => `<a href="${href ? '#/' + esc(href) : '#'}" role="option" ${act ? `data-act="${esc(act)}"` : ''} ${Object.entries(data).map(([k, v]) => `data-${k}="${esc(String(v))}"`).join(' ')}>${ico(icon)}<span>${esc(label)}</span>${sub ? `<small>${esc(sub)}</small>` : ''}</a>`;
  const grp = (title, rows) => (rows.length ? `<h3>${esc(title)}</h3>${rows.join('')}` : '');
  const rec = !j ? [] : [].concat((j.staff || []).slice(0, 4).map(p => link('', 'user', p.display_name, [p.staff_number ? '#' + p.staff_number : '', p.role_name].filter(Boolean).join(' · '), 'sr_staff', { id: p.id })),
    (j.stays || []).slice(0, 4).map(g => link('', 'bed', t('room') + ' ' + g.room + ' · ' + g.name, D.dm(g.arrival) + ' – ' + D.dm(g.departure), 'sr_stay', { id: g.id })),
    (j.suppliers || []).slice(0, 4).map(u => link('attendance/suppliers/' + u.id, 'truck', u.name, t('sk_' + u.kind))),
    (j.items || []).slice(0, 4).map(i => link('item/' + i.id, 'list', i.name, D.dm(i.date) + ' ' + hm(i.start_time))),
    (j.requests || []).slice(0, 4).map(r => link('guestreq/r' + r.id, 'gift', t('rq_' + r.req_type) + (r.room ? ' · ' + t('room') + ' ' + r.room : ''), t('grs_' + r.status))),
    (j.tasks || []).slice(0, 4).map(k => link('tasks/' + (k.mine ? 'mine' : 'team'), 'tasks', k.title, t('ts_' + k.status))),
    (j.sales || []).slice(0, 3).map(x => link('', 'ticket', t('ticket_no') + ' ' + x.code, x.guest_name || '', 'sr_tk', { q: x.code })));
  const out = grp(t('ck_go'), pages.map(x => link(x.key, x.icon || 'chev', x.label, t('grp_' + x.group))))
    + grp(t('ck_do'), acts.map(([k, ic, l]) => (k[0] === '@' ? link(k.slice(1), ic, l) : link('', ic, l, '', k))))
    + grp(t('ck_found'), rec)
    + (ql.length >= 2 ? `<h3></h3><a href="#" role="option" data-act="ck_all">${ico('search')}<span>${esc(t('ck_all', { q: q.trim() }))}</span></a>` : '');
  return out || `<p class="muted center">${esc(t('search_nothing'))}</p>`;
}
ACT.cmdk = () => {
  if (S.mode !== 'staff' || S.preview || $('.modal.cmdk')) return;
  modal(t('search'), `<div class="cmdk-in">${ico('search')}<input id="ck-q" type="search" placeholder="${esc(t('search_anything'))}" autocomplete="off" aria-label="${esc(t('search'))}" aria-controls="ck-res"><kbd class="kbd">Esc</kbd></div>
    <div class="cmdk-res" id="ck-res" role="listbox">${cmdkHtml('')}</div>`, { cls: 'cmdk', noFocus: true, mount: (root, close) => {
    const i = $('#ck-q', root), res = $('#ck-res', root);
    const sel = d => { const a = $$('a', res); if (!a.length) return; let k = a.findIndex(x => x.classList.contains('sel')); a.forEach(x => x.classList.remove('sel')); k = d === 0 ? 0 : Math.max(0, Math.min(a.length - 1, k + d)); a[k].classList.add('sel'); a[k].scrollIntoView({ block: 'nearest' }); };
    i.oninput = () => { clearTimeout(ckTimer); const q = i.value, my = ++ckSeq; ckQ = q; res.innerHTML = cmdkHtml(q); sel(0);
      if (q.trim().length >= 2) ckTimer = setTimeout(async () => { try { const j = await api('search_all', { p_q: q.trim(), p_country: null, p_from: null, p_to: null }); srLast = j; if (my === ckSeq) { res.innerHTML = cmdkHtml(q, j); sel(0); } } catch { /* the pages stay */ } }, 260); };
    i.onkeydown = ev => { if (ev.key === 'ArrowDown') { ev.preventDefault(); sel(1); } else if (ev.key === 'ArrowUp') { ev.preventDefault(); sel(-1); } else if (ev.key === 'Enter') { ev.preventDefault(); $('a.sel', res)?.click(); } };
    res.addEventListener('click', ev => { const a = ev.target.closest('a'); if (!a) return; if (!a.dataset.act) { ev.preventDefault(); close(); location.hash = a.getAttribute('href'); } else if (a.getAttribute('href') === '#') { ev.preventDefault(); close(); } });
    ckQ = ''; setTimeout(() => { i.focus(); sel(0); }, 30);
  } });
};
ACT.ck_all = () => { srQ = ckQ; if (location.hash === '#/search') route(); else location.hash = '#/search'; };
document.addEventListener('keydown', ev => {
  if (S.mode !== 'staff' || S.preview) return;
  const typing = ev.target.closest && ev.target.closest('input, textarea, select, [contenteditable]');
  if ((ev.key === 'k' || ev.key === 'K') && (ev.metaKey || ev.ctrlKey)) { ev.preventDefault(); ACT.cmdk(); }
  else if (ev.key === '/' && !typing && !modalStack.length) { ev.preventDefault(); ACT.cmdk(); }
});
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

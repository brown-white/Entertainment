'use strict';
/* AUREA · pages/performers.js — Performers & suppliers (performance control).
   Uses: translations/languages · supabase · core/utils · components/modals · core/actions · components/cards · core/router ·
         components/forms · components/tables · systems/exports */
/* ---------- Performers & suppliers (performance control) ---------- */
let pfMonth = null;
page('performers', {
  perm: 'm_performers', icon: 'mic', group: 'manage',
  render: async arg => {
    const tab = arg === 'shows' ? 'shows' : 'suppliers';
    const head = tabs('performers', [['suppliers', t('suppliers')], ['shows', t('performances')]], tab);
    if (tab === 'suppliers') return head + await crudList('sup', {
      entity: 'suppliers', fields: () => [{ k: 'name', label: t('name'), req: true }, { k: 'kind', type: 'select', label: t('kind'), options: ['performer', 'band', 'dj', 'supplier', 'other'].map(k => [k, t('sk_' + k)]) }, { k: 'phone', type: 'tel', label: t('phone') }, { k: 'email', type: 'email', label: t('email') }, { k: 'rate', type: 'number', label: t('rate'), step: '0.01' }, { k: 'note', type: 'textarea', label: t('note'), rows: 2 }, { k: 'active', type: 'bool', label: t('active'), def: true }],
      row: r => `<b>${esc(r.name)}</b> ${chip(t('sk_' + r.kind))}${r.active === false ? ' ' + chip(t('inactive')) : ''} <small class="muted">${esc(r.phone || '')}${r.rate ? ' · ' + esc(money(r.rate)) : ''}</small>`
    })();
    const sup = await list('suppliers'); supCache = sup;          // (loaded once, only for the performances)
    pfMonth = pfMonth || D.month(D.today());
    const from = pfMonth + '-01', to = D.add(D.add(from, 32).slice(0, 7) + '-01', -1);
    const rows = await list('performances', { _from: from, _to: to }); perfCache = rows;
    const sn = id => sup.find(s => s.id === id)?.name || '';
    const tot = {}; rows.filter(r => r.status === 'performed').forEach(r => { tot[r.supplier_id] = (tot[r.supplier_id] || 0) + (+r.fee || 0); });
    return head + `<div class="row"><input type="month" value="${pfMonth}" data-act-change="pf_month" aria-label="${esc(t('month'))}"><span class="grow"></span><button class="btn ghost small" data-act="pf_print">${esc(t('print_pdf'))}</button><button class="btn small" data-act="pf_new">${esc(t('add'))}</button></div>
      <div class="stats"><span><b>${rows.length}</b>${esc(t('booked'))}</span><span><b>${rows.filter(r => r.status === 'performed').length}</b>${esc(t('pf_performed'))}</span><span><b>${esc(money(sum(rows.filter(r => r.status === 'performed'), r => r.fee)))}</b>${esc(t('to_pay'))}</span><span><b>${esc(money(sum(rows.filter(r => r.paid), r => r.fee)))}</b>${esc(t('paid'))}</span></div>
      ${rows.length ? `<div class="list">${rows.map(r => `<button class="li row" data-act="pf_edit" data-id="${r.id}"><b>${esc(D.short(r.date))}</b> ${esc(sn(r.supplier_id))}<span class="grow"></span>${chip(t('pf_' + r.status), r.status === 'performed' ? 'ok' : r.status === 'no_show' ? 'bad' : '')} ${esc(money(r.fee))} ${r.paid ? chip(t('paid'), 'ok') : ''} ${stars(r.rating)}</button>`).join('')}</div>` : empty(t('nothing_yet'))}
      ${Object.keys(tot).length ? `<section><h2>${esc(t('totals_by_supplier'))}</h2>${tableHtml([t('name'), t('to_pay')], Object.entries(tot).map(([id, v]) => [sn(+id), money(v)]))}</section>` : ''}`;
  }
});
let supCache = [], perfCache = [];
ACT.pf_month = el => { pfMonth = el.value; route(); };
const perfFields = () => [{ k: 'supplier_id', type: 'select', label: t('supplier'), num: true, options: opts(supCache, 'id', s => s.name + (s.active === false ? ' · ' + t('inactive') : '')) }, { k: 'date', type: 'date', label: t('date'), req: true }, { k: 'fee', type: 'number', label: t('fee'), step: '0.01' },
  { k: 'status', type: 'select', label: t('status'), options: ['booked', 'performed', 'cancelled', 'no_show'].map(s => [s, t('pf_' + s)]) }, { k: 'paid', type: 'bool', label: t('paid') }, { k: 'rating', type: 'stars', label: t('rating') }, { k: 'note', label: t('note') }];
ACT.pf_new = () => { if (!supCache.length) return toast(t('add_supplier_first'), 'bad'); editForm(t('add'), perfFields(), { date: D.today(), status: 'booked' }, async r => { if (r.fee == null) r.fee = supCache.find(s => s.id === r.supplier_id)?.rate || 0; await save('performances', r); route(); }); };
ACT.pf_edit = el => { const p = perfCache.find(x => x.id === +el.dataset.id); editForm(t('edit'), perfFields(), p, async r => { await save('performances', r); route(); }, { danger: async () => { await del('performances', p.id); route(); } }); };
ACT.pf_print = () => printSheet(t('performances'), tableHtml([t('date'), t('supplier'), t('status'), t('fee'), t('paid')], perfCache.map(r => [D.short(r.date), supCache.find(s => s.id === r.supplier_id)?.name || '', t('pf_' + r.status), money(r.fee), r.paid ? '✓' : ''])), { sub: D.mon(pfMonth) });

'use strict';
/* Mr Hassan · systems/suppliers.js — SUPPLIER / ENTERTAINMENT SERVICE ATTENDANCE, written once for every hotel: the status of a date
   (P present · M mistake · A absent), a supplier's month as the Supplier Attendance document, and the Monthly Supplier Memo – the
   manager's own sections (texts, headings, notes, closing, signatures: in the order and with the parts the manager chose) around the
   parts calculated from the records that nobody types: the table (item, dates, quantity, unit price, total), the totals per currency
   (never added across currencies) and each total in words. A finalized memo shows the snapshot it was finalized with.
   Uses: core/state · translations/languages · core/utils · components/cards · components/tables · systems/exports */
const SUP_LETTER = { present: 'P', mistake: 'M', absent: 'A' };
const SUP_STATUS = ['expected', 'present', 'mistake', 'absent', 'cancelled'];
const SUP_TYPES = ['show', 'event', 'live_music', 'special_event', 'activity', 'other'];
const supStatus = s => t('sup_st_' + s);
const supLetter = s => SUP_LETTER[s] || '';
// the dates of a line as days of its month ("6, 13, 20, 27")
const supDays = ds => (ds || []).map(d => String(+String(d).slice(8))).join(', ');
const supMonthName = m => D.fmt(m + '-01', { month: 'long' });
const supFile = (kind, name, m) => [kind, name, m].filter(Boolean).join('-');
// the currencies offered for a supplier's prices: the hotel's own, always EGP, USD and EUR, and the one a record already has
const supCurs = extra => uniq(curList().concat(['EGP', 'USD', 'EUR'], extra ? [extra] : []));
// (10.9) the optional combined total – only when the hotel switched on its own conversion (Settings → Currencies) and every currency
// has its rate; the amounts due stay the ones per currency
function supFx(totals) {
  const st = S.settings || {}, base = st.fx_base || S.hotel?.currency, r = st.fx_rates || {};
  if (!st.fx_on || !base || (totals || []).length < 2 || totals.some(z => z.currency !== base && !(r[z.currency] > 0))) return null;
  return { base, amount: Math.round(sum(totals, z => z.currency === base ? z.amount : z.amount * r[z.currency]) * 100) / 100 };
}
/* ---------- the Supplier Attendance document of a month (no money in it) ---------- */
function supAttDoc(m) {
  const sp = m.supplier || {}, occ = m.occ || [], c = m.counts || {}, items = uniq(occ.map(o => o.name));
  const cols = [t('date'), t('day'), t('time'), t('item'), t('type'), t('status'), t('note')];
  const rows = occ.map(o => [D.dm(o.date), D.wdName(D.wd(o.date), 'short'), hm(o.start_time), o.name + (o.attendance_only ? ' *' : ''), typeLabel(o.type),
    (supLetter(o.status) ? supLetter(o.status) + ' · ' : '') + supStatus(o.status), [o.mistake, o.note].filter(Boolean).join(' · ')]);
  const html = `<dl><dt>${esc(t('supplier'))}</dt><dd>${esc(sp.name || '')}</dd>${sp.contact ? `<dt>${esc(t('contact_person'))}</dt><dd>${esc(sp.contact)}</dd>` : ''}
      <dt>${esc(t('month'))}</dt><dd>${esc(supMonthName(m.month))}</dd><dt>${esc(t('year'))}</dt><dd>${esc(m.month.slice(0, 4))}</dd><dt>${esc(t('sup_items'))}</dt><dd>${esc(items.join(', ') || '—')}</dd></dl>`
    + (rows.length ? tableHtml(cols, rows) : `<p>${esc(t('sup_no_dates'))}</p>`)
    + `<p><b>${esc(t('sup_summary', { p: c.P || 0, m: c.M || 0, a: c.A || 0 }))}</b></p>`
    + ((c.expected || 0) ? `<p class="muted">${esc(t('sup_unmarked_n', { n: c.expected }))}</p>` : '')
    + `<p class="muted">${esc(t('sup_legend'))}${occ.some(o => o.attendance_only) ? ' · ' + esc(t('sup_legend_only')) : ''}</p>`
    + `<div class="doc-sign">${t('sup_sign_def').split(';').filter(Boolean).map(l => `<span>${esc(l)}</span>`).join('')}</div>`;
  return { title: t('sup_att_title'), sub: (sp.name || '') + ' · ' + D.mon(m.month), file: supFile('supplier-attendance', sp.name, m.month), html, team: false,
    sheets: { [t('sup_att_title')]: { cols, rows } } };
}
/* ---------- the Monthly Supplier Memo ---------- */
// the parts nobody types (calculated from the records): they can move, never be changed or hidden
const MEMO_FIXED = ['table', 'totals', 'words'];
const memoDefaults = () => [{ k: 'title', kind: 'title', text: t('memo_title_def') }, { k: 'intro', kind: 'intro', text: t('memo_intro_def') }, { k: 'supplier', kind: 'supplier' },
  { k: 'table', kind: 'table' }, { k: 'totals', kind: 'totals' }, { k: 'words', kind: 'words' }, { k: 'not_charged', kind: 'not_charged' },
  { k: 'notes', kind: 'notes', title: t('memo_notes'), text: '' }, { k: 'closing', kind: 'closing', text: t('memo_closing_def') }, { k: 'signature', kind: 'signature', text: t('memo_sign_def').split(';').join('\n') }];
const memoTextKinds = ['title', 'intro', 'notes', 'closing', 'signature', 'heading', 'paragraph'];
function memoDoc(data, secs) {
  const sp = data.supplier || {}, mn = data.money || {}, mon = D.mon(data.month);
  const fill = s => String(s || '').replace(/\{supplier\}/g, sp.name || '').replace(/\{month\}/g, mon).replace(/\{hotel\}/g, data.hotel?.name || S.hotel?.name || '');
  const paras = s => fill(s).split('\n').map(x => x.trim()).filter(Boolean).map(x => `<p>${esc(x)}</p>`).join('');
  const totals = mn.totals || [], lines = mn.lines || [];
  const part = x => {
    if (x.kind === 'intro' || x.kind === 'paragraph' || x.kind === 'closing') return paras(x.text);
    if (x.kind === 'heading') return x.title || x.text ? `<h2>${esc(fill(x.title || x.text))}</h2>` : '';
    if (x.kind === 'notes') return (x.text || '').trim() ? `<h3>${esc(fill(x.title) || t('memo_notes'))}</h3>` + paras(x.text) : '';
    if (x.kind === 'supplier') return `<dl><dt>${esc(t('supplier'))}</dt><dd>${esc(sp.name || '')}</dd>${sp.contact ? `<dt>${esc(t('contact_person'))}</dt><dd>${esc(sp.contact)}</dd>` : ''}${sp.phone ? `<dt>${esc(t('phone'))}</dt><dd>${esc(sp.phone)}</dd>` : ''}${sp.email ? `<dt>${esc(t('email'))}</dt><dd>${esc(sp.email)}</dd>` : ''}<dt>${esc(t('month'))}</dt><dd>${esc(mon)}</dd></dl>`;
    if (x.kind === 'table') return lines.length ? tableHtml([t('item'), t('memo_dates'), t('quantity'), t('unit_price'), t('total')],
      lines.map(l => [l.name + (l.kind === 'partial' ? ' – ' + t('memo_partial') : ''), supDays(l.dates), l.qty, l.price == null ? '—' : money(l.price, l.currency), l.subtotal == null ? '—' : money(l.subtotal, l.currency)])) : `<p>${esc(t('memo_nothing_payable'))}</p>`;
    if (x.kind === 'totals') return totals.length ? `<h3>${esc(t('memo_totals'))}</h3>` + tableHtml([t('currency'), t('total')], totals.map(z => [z.currency, money(z.amount, z.currency)]))
      + (totals.length > 1 ? `<p class="muted">${esc(t('memo_per_currency'))}</p>` : '')
      + (supFx(totals) ? `<p class="muted">${esc(t('memo_fx_total', { total: money(supFx(totals).amount, supFx(totals).base) }))}</p>` : '') : '';
    if (x.kind === 'words') return totals.map(z => `<p><b>${esc(money(z.amount, z.currency))}</b> — ${esc(amountWords(z.amount, z.currency))}</p>`).join('');
    if (x.kind === 'not_charged') return (mn.not_charged || []).length ? `<h3>${esc(t('memo_not_charged'))}</h3>` + tableHtml([t('date'), t('item'), t('status')],
      mn.not_charged.map(z => [D.dm(z.date), z.name, z.status === 'mistake' && !z.pay ? t('memo_undecided') : z.status === 'mistake' ? t('memo_mistake_unpaid') : supStatus(z.status)])) : '';
    if (x.kind === 'signature') return `<div class="doc-sign">${fill(x.text).split('\n').map(z => z.trim()).filter(Boolean).map(z => `<span>${esc(z)}</span>`).join('')}</div>`;
    return '';
  };
  const title = fill((secs.find(x => x.kind === 'title') || {}).text) || t('memo_title_def');
  const html = secs.filter(x => !x.hidden || MEMO_FIXED.includes(x.kind)).map(part).join('');
  const lineRows = lines.map(l => [l.name, l.kind === 'partial' ? t('memo_partial') : t('memo_full'), supDays(l.dates), l.qty, l.price ?? '', l.currency || '', l.subtotal ?? '']);
  return { title, sub: (sp.name || '') + ' · ' + mon, file: supFile('supplier-memo', sp.name, data.month), html,
    sheets: { [t('memo_sheet')]: { cols: [t('item'), t('kind'), t('memo_dates'), t('quantity'), t('unit_price'), t('currency'), t('total')], rows: lineRows },
      [t('memo_totals')]: { cols: [t('currency'), t('total'), t('memo_in_words')], rows: totals.map(z => [z.currency, z.amount, amountWords(z.amount, z.currency)]) },
      [t('memo_not_charged')]: { cols: [t('date'), t('item'), t('status')], rows: (mn.not_charged || []).map(z => [z.date, z.name, supStatus(z.status)]) } } };
}

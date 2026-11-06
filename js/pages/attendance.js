'use strict';
/* Mr Hassan · pages/attendance.js — ATTENDANCE: one page for every hotel and team, in four parts (each shown by its permissions):
   STAFF ATTENDANCE – the day and the month of the team (or of every team): statuses, clock, lateness, exceptions; correct a day;
   the Detailed and Management exports · SUPPLIER ATTENDANCE – the suppliers, their items and the programme dates linked to them,
   P / M / A per date, attendance-only items, the Supplier Attendance export · SUPPLIER MEMO – the monthly memo's editor, preview and
   files · SETTINGS – who clocks in when (rules), where (places), and the Management sheet's letters.
   Uses: core/state · translations/languages · supabase · core/utils · icons/icons · core/permissions · components/modals · core/actions ·
         components/cards · core/router · components/forms · components/tables · systems/exports · systems/team-schedule ·
         systems/attendance · systems/suppliers · systems/program-engine */
let atView = 'day', atDay = null, atMonth = null, atAll = false, atJ = null, supMon = null, supCur = null, memoCur = null;
const atF = { status: 'active', role: '' };
const atTabs = () => [can('att_view') && ['staff', t('att_staff_tab')], can('sup_view,sup_edit,sup_mark,sup_manage,sup_pricing') && ['suppliers', t('att_sup_tab')],
  can('memo_generate,memo_edit') && ['memo', t('att_memo_tab')], can('att_settings') && ['settings', t('pg_settings')]].filter(Boolean);
page('attendance', {
  perm: 'att_view,sup_view,sup_edit,sup_mark,sup_manage,sup_pricing,memo_generate,memo_edit,att_settings', icon: 'clipboard', group: 'manage', title: 'attendance',
  render: async arg => {
    const [k, id] = String(arg || '').split('/'), T = atTabs();
    if (k === 'month' || k === 'today') atView = k === 'month' ? 'month' : 'day';                       // (the addresses of 10.7 still open)
    const tab = T.some(x => x[0] === k) ? k : T.some(x => x[0] === 'staff') ? 'staff' : T[0][0], head = tabs('attendance', T, tab);
    supMon = supMon || D.month(D.today());
    if (tab === 'suppliers') return head + (id ? await supProfile(+id) : await supOverview());
    if (tab === 'memo') return head + await memoView(+id || null);
    if (tab === 'settings') return head + await attSettings();
    return head + (atView === 'month' ? await attMonthView() : await attDayView());
  },
  mount: root => { const ed = $('#memo-ed', root); if (ed) ed.addEventListener('input', memoInput); }
});
/* ---------- STAFF ATTENDANCE ---------- */
const attPeople = j => j.staff.filter(p => (atF.status === 'all' || (atF.status === 'left' ? p.status === 'left' : p.status === 'active')) && (!atF.role || String(p.role_id) === atF.role));
// the filters: the view (day / month), the team or every team, the person's status and role, and the exports
function attBar(j, when) {
  const roles = uniq(j ? j.staff.map(p => p.role_id) : []).map(id => j.staff.find(p => p.role_id === id)).filter(Boolean);
  return `<div class="filters att-bar"><div class="seg" role="group">${[['day', t('by_date')], ['month', t('month_sheet')]].map(([v, l]) => `<button class="${atView === v ? 'on' : ''}" data-act="at_view" data-v="${v}" aria-pressed="${atView === v}">${esc(l)}</button>`).join('')}</div>
    ${when}<span class="muted small">${esc(S.hotel?.name || '')}</span>
    ${can('all_teams') ? `<select data-act-change="at_team" aria-label="${esc(t('team'))}"><option value="">${esc(S.team?.name || t('team'))}</option><option value="all" ${atAll ? 'selected' : ''}>${esc(t('all_teams'))}</option></select>` : ''}
    <select data-act-change="at_status" aria-label="${esc(t('att_staff_status'))}">${[['active', t('att_f_active')], ['left', t('att_f_left')], ['all', t('att_f_all')]].map(([v, l]) => `<option value="${v}" ${atF.status === v ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>
    <select data-act-change="at_role" aria-label="${esc(t('role'))}"><option value="">${esc(t('att_all_roles'))}</option>${roles.map(p => `<option value="${p.role_id}" ${atF.role === String(p.role_id) ? 'selected' : ''}>${esc(p.role_name)}</option>`).join('')}</select>
    <span class="grow"></span>${can('att_export_detail') ? `<button class="btn ghost small" data-act="at_export" data-k="detail">${ico('download')} ${esc(t('att_export_detail'))}</button>` : ''}
    ${can('att_export_mgmt') ? `<button class="btn ghost small" data-act="at_export" data-k="mgmt">${ico('download')} ${esc(t('att_export_mgmt'))}</button>` : ''}</div>`;
}
const attIssueChips = is => is.map(i => chip(i.text, i.k === 'edited' || i.k === 'excused' ? '' : 'bad')).join('');
async function attDayView() {
  if (!S.team && !atAll) return attBar(null, '') + empty(t('no_team_selected'));
  const today = D.today(); atDay = atDay || today; const d = atDay;
  const [j, b] = await Promise.all([attSheet(d, d, atAll), board(d, d, atAll)]); atJ = j;
  const people = attPeople(j).filter(p => j.dayOf(p.id, d) || j.clockOf(p.id, d)), nm = hotelNowMin(), isToday = d === today;
  const canMark = can('m_dayplan') || (can('att_edit,team_ops') && d <= today), canFix = can('att_clock_fix,att_edit,team_ops,m_dayplan');
  const busyNow = new Set(isToday ? b.items.filter(i => i.date === d && i.status === 'scheduled' && mins(i.start_time) <= nm && endMin(i) > nm).flatMap(i => i.staff.map(x => x.staff_id)) : []);
  const groups = [['working', t('st_working')], ['day_off', t('st_day_off')], ['vacation', t('st_vacation')], ['absent', t('absent_or_sick')]];
  const stOf = p => j.dayOf(p.id, d)?.status, inGroup = (g, p) => (g === 'absent' ? ['absent', 'sick'].includes(stOf(p)) : stOf(p) === g);
  const issues = people.map(p => [p, attIssues(j, p.id, d)]).filter(([, is]) => is.some(i => i.k !== 'edited' && i.k !== 'excused'));
  const row = p => { const x = j.dayOf(p.id, d) || {}, k = j.clockOf(p.id, d), is = attIssues(j, p.id, d);
    return `<div class="att-row">${avatar(p.photo_url, p.display_name, 'sm')}<div class="grow"><b>${esc(p.display_name)}</b>${p.staff_number ? ` <small class="muted">#${p.staff_number}</small>` : ''} <small class="muted">${esc([p.role_name, atAll ? p.team_name : ''].filter(Boolean).join(' · '))}</small>${!p.has_login ? ' ' + chip(t('att_only_person')) : ''}
      <div class="att-tags">${x.entrance ? chip(t('entrance')) : ''}${busyNow.has(p.id) ? chip(t('busy_now'), 'ok') : ''}
        <small class="muted">${ico('clock')} ${k?.check_in ? esc(clockSpan(k)) : esc(x.clock_req === false ? t('att_no_clock_needed') : t('not_clocked'))}${attPlan(x) ? ' · ' + esc(t('att_planned')) + ' ' + esc(attPlan(x)) : ''}</small>${attIssueChips(is)}</div></div>
      ${canMark && x.status ? `<div class="att-act"><div class="seg" role="group" aria-label="${esc(p.display_name)}">${[['working', t('present')], ['absent', t('st_absent')], ['sick', t('st_sick')]].map(([v, l]) => `<button class="${x.status === v ? 'on s-' + v : ''}" data-act="at_set" data-s="${p.id}" data-v="${v}" aria-pressed="${x.status === v}">${esc(l)}</button>`).join('')}</div></div>` : x.status ? chip(statusLabel(x.status), 'st-' + x.status) : ''}
      ${canFix ? `<button class="icon-btn" data-act="at_cell" data-s="${p.id}" data-d="${d}" aria-label="${esc(t('att_correct'))}">${ico('edit')}</button>` : ''}</div>`; };
  const later = b.items.filter(i => i.date === d && i.status === 'scheduled' && (!isToday || endMin(i) >= nm));
  return attBar(j, `<button class="btn ghost small" data-act="at_day" data-n="-1" aria-label="-1">${ico('up', 'rot-l')}</button><input type="date" value="${d}" data-act-change="at_pick" aria-label="${esc(t('date'))}"><button class="btn ghost small" data-act="at_day" data-n="1" aria-label="+1">${ico('up', 'rot-r')}</button>`)
    + (j.places ? '' : can('att_settings') ? `<p class="hint-box warn">${ico('info')}<span>${esc(t('att_no_place'))}</span></p>` : '')
    + (people.length ? `<div class="stats">${groups.map(([g, l]) => `<span><b>${people.filter(p => inGroup(g, p)).length}</b>${esc(l)}</span>`).join('')}<span><b>${people.filter(p => j.clockOf(p.id, d)?.check_in).length}</b>${esc(t('clocked_in'))}</span>
        <span><b>${people.filter(p => j.clockOf(p.id, d)?.late_min > 0).length}</b>${esc(t('att_late'))}</span></div>
      ${issues.length ? `<section class="att-exc"><h2>${esc(t('att_exceptions'))} <small class="muted">${issues.length}</small></h2><div class="list">${issues.map(([p, is]) => `<button class="li row" data-act="at_cell" data-s="${p.id}" data-d="${d}"><b>${esc(p.display_name)}</b><span class="grow"></span>${attIssueChips(is.filter(i => i.k !== 'edited'))}</button>`).join('')}</div></section>` : ''}
      ${groups.map(([g, l]) => { const ps = people.filter(p => inGroup(g, p)); return ps.length ? `<section><h2>${esc(l)} <small class="muted">${ps.length}</small></h2><div class="att-list">${ps.map(row).join('')}</div></section>` : ''; }).join('')}`
      : empty(t('no_staff_team'), can('m_staff') ? `<a class="btn" href="#/staffadmin/staff">${esc(t('add_staff'))}</a>` : ''))
    + (later.length ? `<section><h2>${esc(isToday ? t('still_today') : t('programme'))}</h2><div class="items">${later.map(i => itemRow(i, 'item')).join('')}</div></section>` : '');
}
async function attMonthView() {
  if (!S.team && !atAll) return attBar(null, '') + empty(t('no_team_selected'));
  atMonth = atMonth || D.month(D.today());
  const from = atMonth + '-01', to = monthEnd(atMonth), today = D.today(), j = await attSheet(from, to, atAll); atJ = j;
  const people = attPeople(j), canEdit = can('att_clock_fix,att_edit,team_ops,m_dayplan');
  const cell = (p, d) => {
    const x = j.dayOf(p.id, d), k = j.clockOf(p.id, d);
    if (!x && !k) return `<td class="c-out" title="${esc(t('not_employed'))}">·</td>`;
    const is = attIssues(j, p.id, d), L = ST_LETTER[x?.status] || '?', cls = [`c-${x?.status || 'none'}`, d > today ? 'fut' : '', is.some(i => i.k === 'late') ? 'late' : '', is.some(i => ['no_out', 'no_clock', 'refused'].includes(i.k)) ? 'warn' : '', is.some(i => i.k === 'edited') ? 'ed' : ''].join(' ');
    const tip = [x ? statusLabel(x.status) : '', clockSpan(k), ...is.map(i => i.text)].filter(Boolean).join(' · ');
    return `<td class="${cls}" title="${esc(tip)}">${canEdit ? `<button data-act="at_cell" data-s="${p.id}" data-d="${d}" aria-label="${esc(p.display_name + ' ' + D.short(d) + ' ' + tip)}">${L}</button>` : L}</td>`;
  };
  return attBar(j, `<input type="month" value="${atMonth}" data-act-change="at_month" aria-label="${esc(t('month'))}">`)
    + `<p class="legend">${Object.entries(ST_LETTER).map(([s, l]) => `<span class="c-${s}"><b>${l}</b> ${esc(statusLabel(s))}</span>`).join('')}<span class="fut"><b>P</b> ${esc(t('planned_not_counted'))}</span><span class="late"><b>·</b> ${esc(t('att_late'))}</span><span class="warn"><b>·</b> ${esc(t('att_check'))}</span><span class="c-out"><b>·</b> ${esc(t('not_employed'))}</span></p>`
    + (people.length ? `<div class="tablewrap att-sheet"><table><thead><tr><th class="sticky">${esc(t('name'))}</th>${j.dates.map(d => `<th class="${d === today ? 'today' : ''} ${[5, 6].includes(D.wd(d)) ? 'we' : ''}"><small>${esc(D.wdShort(D.wd(d)))}</small>${+d.slice(8)}</th>`).join('')}
        ${Object.values(ST_LETTER).map(l => `<th class="tot">${l}</th>`).join('')}<th class="tot" title="${esc(t('att_total_work_days'))}">${esc(t('att_total_short'))}</th><th class="tot">${esc(t('att_late'))}</th><th class="tot">${esc(t('hours'))}</th></tr></thead>
      <tbody>${people.map(p => { const s = attSum(j, p); return `<tr><th class="sticky"><b>${esc(p.display_name)}</b>${p.staff_number ? ` <small>#${p.staff_number}</small>` : ''}<small class="muted">${esc([atAll ? p.team_name : '', p.role_name, p.status === 'left' || !p.has_login ? attKind(p) : '', p.end_date ? t('att_until', { date: D.dm(p.end_date) }) : ''].filter(Boolean).join(' · '))}</small></th>${j.dates.map(d => cell(p, d)).join('')}
        <td class="tot">${s.working}</td><td class="tot">${s.day_off}</td><td class="tot">${s.vacation}</td><td class="tot">${s.absent}</td><td class="tot">${s.sick}</td><td class="tot"><b>${s.mgmt}</b></td><td class="tot">${s.late ? s.late + '·' + s.lateMin + "'" : ''}</td><td class="tot">${s.hours}</td></tr>`; }).join('')}</tbody></table></div>` : empty(t('no_staff_team')))
    + `<p class="muted small">${esc(t('att_month_note'))}</p>`;
}
ACT.at_view = el => { atView = el.dataset.v; route(); };
ACT.at_team = el => { atAll = el.value === 'all'; route(); };
ACT.at_status = el => { atF.status = el.value; route(); };
ACT.at_role = el => { atF.role = el.value; route(); };
ACT.at_day = el => { atDay = D.add(atDay, +el.dataset.n); route(); };
ACT.at_pick = el => { if (el.value) { atDay = el.value; route(); } };
ACT.at_month = el => { if (el.value) { atMonth = el.value; route(); } };
ACT.at_cell = el => attDayEdit(+el.dataset.s, el.dataset.d, atJ);
ACT.at_set = async el => {
  const sid = +el.dataset.s, x = atJ.dayOf(sid, atDay) || {};
  await api('day_status_set', { p_staff_id: sid, p_date: atDay, p_status: el.dataset.v, p_entrance: !!x.entrance, p_practice: !!x.practice, p_note: x.note || null }); toast(t('saved')); route();
};
// the exports of the month shown (in the day view: the month of that day), with the filters shown – the preview first, then PDF / Word / Excel
ACT.at_export = async el => {
  const m = atView === 'month' ? atMonth : D.month(atDay || D.today());
  const j = atJ && atJ.from === m + '-01' && atJ.to === monthEnd(m) ? atJ : await attSheet(m + '-01', monthEnd(m), atAll);
  const doc = (el.dataset.k === 'mgmt' ? attMgmtDoc : attDetailDoc)(j, attPeople(j), m);
  docPreview(doc.title, doc.html, { sub: doc.sub, file: doc.file, sheets: doc.sheets });
};
/* ---------- SUPPLIER ATTENDANCE ---------- */
const supMonthBar = extra => `<div class="filters"><input type="month" value="${supMon}" data-act-change="sup_month" aria-label="${esc(t('month'))}"><span class="grow"></span>${extra || ''}</div>`;
const supCounts = c => `<span class="sup-pma">${['P', 'M', 'A'].map(L => `<b class="s-${L}">${L} ${c?.[L] || 0}</b>`).join('')}${c?.expected ? `<small class="muted">${esc(t('sup_unmarked_n', { n: c.expected }))}</small>` : ''}</span>`;
async function supOverview() {
  const j = await api('supplier_overview', { p_month: supMon });
  return supMonthBar(can('sup_manage') ? `<button class="btn small" data-act="sup_new">${ico('plus')} ${esc(t('sup_add'))}</button>` : '')
    + `<p class="hint-box">${ico('info')}<span>${esc(t('sup_intro'))}</span></p>`
    + (j.suppliers.length ? `<div class="list">${j.suppliers.map(s => `<a class="li row ${s.active === false ? 'dim' : ''}" href="#/attendance/suppliers/${s.id}"><span><b>${esc(s.name)}</b> ${chip(t('sk_' + s.kind))}${s.active === false ? ' ' + chip(t('inactive')) : ''}<small class="muted"> ${esc(s.items.filter(i => i.active !== false).map(i => i.name).join(', ') || t('sup_no_items'))}</small></span><span class="grow"></span>${supCounts(s.month)}</a>`).join('')}</div>`
      : empty(t('sup_none'), can('sup_manage') ? `<button class="btn" data-act="sup_new">${esc(t('sup_add'))}</button>` : ''));
}
async function supProfile(id) {
  const [m, ov] = await Promise.all([api('supplier_month', { p_supplier: id, p_month: supMon }), api('supplier_overview', { p_month: supMon })]);
  const sp = ov.suppliers.find(s => s.id === id) || Object.assign({ items: [] }, m.supplier), price = m.pricing, final = m.final, today = m.today;
  supCur = { id, m, sp };
  const canMark = can('sup_mark') && !final, mn = m.money || {}, w = mn.warnings || {};
  const itemRowH = i => `<div class="li row ${i.active === false ? 'dim' : ''}"><span class="grow"><b>${esc(i.name)}</b> ${chip(typeLabel(i.type))}${i.active === false ? ' ' + chip(t('inactive')) : ''}
      <small class="muted"> ${price ? esc(i.unit_price != null ? money(i.unit_price, i.currency) : t('sup_no_price')) + ' · ' : ''}${esc(t('sup_links', { s: i.series, d: i.dates }))}</small></span>
      ${can('sup_manage') ? `<button class="btn ghost small" data-act="sup_assign" data-id="${i.id}">${ico('repeat')} ${esc(t('sup_assign'))}</button><button class="icon-btn" data-act="sup_item_edit" data-id="${i.id}" aria-label="${esc(t('edit'))}">${ico('edit')}</button>` : ''}</div>`;
  const occRow = (o, n) => { const past = o.date <= today;
    return `<tr class="${o.status === 'cancelled' ? 'dim' : ''}"><td>${esc(D.short(o.date))}</td><td>${esc(hm(o.start_time))}</td><td><b>${esc(o.name)}</b>${o.attendance_only ? ' ' + chip(t('sup_att_only')) : ''}<small class="muted"> ${esc(typeLabel(o.type))}</small></td>
      <td>${canMark && o.status !== 'cancelled' ? `<div class="seg pma" role="group" aria-label="${esc(o.name + ' ' + D.short(o.date))}">${['present', 'mistake', 'absent'].map(s => `<button class="${o.status === s ? 'on s-' + SUP_LETTER[s] : ''}" data-act="sup_set" data-n="${n}" data-v="${s}" aria-pressed="${o.status === s}" title="${esc(supStatus(s))}" ${past ? '' : 'disabled'}>${SUP_LETTER[s]}</button>`).join('')}</div>` : chip((supLetter(o.status) ? supLetter(o.status) + ' · ' : '') + supStatus(o.status), o.status === 'present' ? 'ok' : o.status === 'absent' || o.status === 'mistake' ? 'bad' : '')}</td>
      <td class="small">${esc([o.mistake, o.note].filter(Boolean).join(' · '))}${price && o.status === 'mistake' ? ' ' + chip(o.pay ? t('sup_pay_' + o.pay) + (o.pay === 'partial' ? ' ' + money(o.pay_amount, o.currency) : '') : t('memo_undecided'), o.pay ? '' : 'bad') : ''}${price && o.paid ? ' ' + chip(t('paid'), 'ok') : ''}${stars(o.rating)}</td>
      <td>${price ? esc(o.price != null ? money(o.price, o.currency) : '—') : ''}</td><td>${can('sup_mark,sup_edit,sup_pricing') && !final ? `<button class="icon-btn" data-act="sup_occ" data-n="${n}" aria-label="${esc(t('edit'))}">${ico('edit')}</button>` : ''}</td></tr>`; };
  return `<p class="row"><a class="btn ghost small" href="#/attendance/suppliers">${ico('up', 'rot-l')} ${esc(t('att_sup_tab'))}</a></p>
    <div class="card sup-head"><div class="row"><h2 class="grow">${esc(sp.name)} ${chip(t('sk_' + sp.kind))}${sp.active === false ? ' ' + chip(t('inactive')) : ''}</h2>${can('sup_manage') ? `<button class="btn ghost small" data-act="sup_edit" data-id="${id}">${ico('edit')} ${esc(t('edit'))}</button>` : ''}</div>
      <p class="muted">${esc([sp.contact, sp.phone, sp.email, sp.currency].filter(Boolean).join(' · '))}</p>${sp.note ? `<p class="small">${esc(sp.note)}</p>` : ''}</div>`
    + supMonthBar(`${can('sup_edit') && !final ? `<button class="btn ghost small" data-act="sup_only">${ico('plus')} ${esc(t('sup_add_only'))}</button>` : ''}${can('sup_export') ? `<button class="btn ghost small" data-act="sup_doc">${ico('download')} ${esc(t('sup_generate_att'))}</button>` : ''}${can('memo_generate,memo_edit') ? `<a class="btn small" href="#/attendance/memo/${id}">${ico('file')} ${esc(t('sup_generate_memo'))}</a>` : ''}`)
    + (final ? `<p class="hint-box">${ico('lock')}<span>${esc(t('sup_month_final'))}</span></p>` : '')
    + `<div class="stats"><span><b>${m.counts.P || 0}</b>${esc(supStatus('present'))}</span><span><b>${m.counts.M || 0}</b>${esc(supStatus('mistake'))}</span><span><b>${m.counts.A || 0}</b>${esc(supStatus('absent'))}</span><span><b>${m.counts.expected || 0}</b>${esc(t('sup_not_marked'))}</span>
      ${price ? `<span><b>${esc(moneyBy(Object.fromEntries((mn.totals || []).map(z => [z.currency, z.amount])), '0'))}</b>${esc(t('sup_payable'))}</span>` : ''}</div>`
    + (price && (w.undecided || w.no_price || w.unmarked) ? `<p class="hint-box warn">${ico('info')}<span>${esc([w.unmarked ? t('sup_w_unmarked', { n: w.unmarked }) : '', w.undecided ? t('sup_w_undecided', { n: w.undecided }) : '', w.no_price ? t('sup_w_no_price', { n: w.no_price }) : ''].filter(Boolean).join(' · '))}</span></p>` : '')
    + `<section><h2>${esc(t('sup_month_sheet'))} · ${esc(D.mon(supMon))}</h2>${m.occ.length ? `<div class="tablewrap"><table class="sup-sheet"><thead><tr><th>${esc(t('date'))}</th><th>${esc(t('time'))}</th><th>${esc(t('item'))}</th><th>${esc(t('status'))}</th><th>${esc(t('note'))}</th><th>${price ? esc(t('unit_price')) : ''}</th><th></th></tr></thead><tbody>${m.occ.map(occRow).join('')}</tbody></table></div>
      <p class="muted small">${esc(t('sup_legend'))} · ${esc(t('sup_sheet_note'))}</p>` : empty(t('sup_no_dates'))}</section>`
    + `<section><div class="row"><h2 class="grow">${esc(t('sup_items'))}</h2>${can('sup_manage') ? `<button class="btn ghost small" data-act="sup_item_new">${ico('plus')} ${esc(t('sup_item_add'))}</button>` : ''}</div>
      <p class="muted small">${esc(t('sup_items_hint'))}</p>${sp.items.length ? `<div class="list">${sp.items.map(itemRowH).join('')}</div>` : empty(t('sup_no_items'))}</section>`;
}
ACT.sup_month = el => { if (el.value) { supMon = el.value; route(); } };
// a supplier (Manage suppliers): its prices are on its items
const supFields = () => [{ k: 'name', label: t('name'), req: true }, { k: 'kind', type: 'select', label: t('kind'), options: ['performer', 'band', 'dj', 'supplier', 'other'].map(k => [k, t('sk_' + k)]) },
  { k: 'contact', label: t('contact_person') }, { k: 'phone', type: 'tel', label: t('phone') }, { k: 'email', type: 'email', label: t('email') },
  { k: 'currency', type: 'select', label: t('sup_currency'), options: [['', '—']].concat(curList().map(c => [c, c])), hint: t('sup_currency_hint') },
  { k: 'note', type: 'textarea', label: t('note'), rows: 2 }, { k: 'active', type: 'bool', label: t('active'), def: true }];
ACT.sup_new = () => editForm(t('sup_add'), supFields(), { kind: 'performer', active: true, currency: S.hotel?.currency || '' }, async r => { const row = await save('suppliers', r); location.hash = '#/attendance/suppliers/' + row.id; });
ACT.sup_edit = async el => { const s = (await list('suppliers', { id: +el.dataset.id }))[0];
  editForm(t('edit'), supFields(), s, async r => { await save('suppliers', r); route(); },
    { danger: async () => { const j = await del('suppliers', s.id); toast(j.archived ? t('sup_archived') : t('deleted'), j.archived ? 'warn' : 'ok'); location.hash = '#/attendance/suppliers'; } }); };
// an item of a supplier (Fire Show, Oriental Show …): its type and – with "Manage supplier pricing" – its unit price and currency
const supItemFields = () => [{ k: 'name', label: t('name'), req: true }, { k: 'type', type: 'select', label: t('type'), options: SUP_TYPES.map(x => [x, typeLabel(x)]) },
  ...(can('sup_pricing') ? [{ k: 'unit_price', type: 'number', label: t('unit_price'), step: '0.01', min: 0 }, { k: 'currency', type: 'select', label: t('currency'), options: [['', '—']].concat(curList().map(c => [c, c])) }] : []),
  { k: 'note', label: t('note') }, { k: 'active', type: 'bool', label: t('active'), def: true }];
ACT.sup_item_new = () => editForm(t('sup_item_add'), supItemFields(), { type: 'show', active: true, currency: supCur.sp.currency || S.hotel?.currency || '' }, async r => { await save('supplier_items', Object.assign(r, { supplier_id: supCur.id })); route(); });
ACT.sup_item_edit = el => { const i = supCur.sp.items.find(x => x.id === +el.dataset.id);
  editForm(t('edit'), supItemFields(), i, async r => { await save('supplier_items', r); route(); },
    { danger: async () => { const j = await del('supplier_items', i.id); toast(j.archived ? t('sup_item_archived') : t('deleted'), j.archived ? 'warn' : 'ok'); route(); } }); };
// ASSIGN an item to programme series (every date of them) and single dates – several at once; a link taken away goes back to none
ACT.sup_assign = async el => {
  const it = supCur.sp.items.find(x => x.id === +el.dataset.id), today = D.today();
  const [tps, its, ov] = await Promise.all([list('program_templates'), list('program_items', { _from: today, _to: D.add(today, 90) }), api('supplier_overview', { p_month: supMon })]);
  const names = new Map(ov.suppliers.flatMap(s => s.items.map(i => [i.id, s.name + ' · ' + i.name])));
  const series = tps.filter(x => x.active !== false && (!x.valid_to || x.valid_to >= today)).sort((a, b) => a.name.localeCompare(b.name));
  const dates = its.filter(x => !x.template_id && x.status === 'scheduled').sort((a, b) => (a.date + a.start_time).localeCompare(b.date + b.start_time));
  const box = (k, x, label) => `<label class="li row"><input type="checkbox" data-asg="${k}" value="${x.id}" ${x.supplier_item_id === it.id ? 'checked' : ''}><span>${label}${x.supplier_item_id && x.supplier_item_id !== it.id ? ` <small class="muted">(${esc(t('sup_linked_to', { name: names.get(x.supplier_item_id) || '?' }))})</small>` : ''}</span></label>`;
  modal(t('sup_assign') + ' · ' + it.name, `<p class="hint-box">${ico('info')}<span>${esc(t('sup_assign_hint'))}</span></p>
    <h3>${esc(t('weekly_programme'))}</h3>${series.length ? `<div class="list">${series.map(x => box('t', x, `<b>${esc(x.name)}</b> ${chip(typeLabel(x.type))} <small class="muted">${esc(ruleText(x))} · ${esc(hm(x.start_time))}</small>`)).join('')}</div>` : `<p class="muted">${esc(t('nothing_yet'))}</p>`}
    <h3>${esc(t('sup_single_dates'))}</h3>${dates.length ? `<div class="list">${dates.map(x => box('i', x, `<b>${esc(D.short(x.date))} ${esc(hm(x.start_time))}</b> ${esc(x.name)} ${chip(typeLabel(x.type))}`)).join('')}</div>` : `<p class="muted">${esc(t('nothing_yet'))}</p>`}`, {
    wide: true, noFocus: true, cancel: true,
    save: async root => {
      const on = k => $$(`[data-asg=${k}]`, root).filter(c => c.checked).map(c => +c.value), off = (k, rows) => $$(`[data-asg=${k}]`, root).filter(c => !c.checked && rows.find(x => x.id === +c.value)?.supplier_item_id === it.id).map(c => +c.value);
      await api('supplier_assign', { p_supplier_item: it.id, p_templates: on('t'), p_items: on('i') });
      const ot = off('t', series), oi = off('i', dates); if (ot.length || oi.length) await api('supplier_assign', { p_supplier_item: null, p_templates: ot, p_items: oi });
      toast(t('saved')); route();
    }
  });
};
// one date: P / M / A at once (M asks what went wrong); the date's record keeps who marked it and when
const supOcc = n => supCur.m.occ[+n];
const supKey = o => (o.perf_id ? { id: o.perf_id } : { item_id: o.item_id });
ACT.sup_set = async el => {
  const o = supOcc(el.dataset.n), v = el.dataset.v;
  if (v === 'mistake' && o.status !== 'mistake') return supOccEdit(o, 'mistake');
  await api('supplier_mark', { p_row: Object.assign(supKey(o), { status: o.status === v ? 'expected' : v }) }); route();
};
ACT.sup_occ = el => supOccEdit(supOcc(el.dataset.n));
function supOccEdit(o, preset) {
  const price = supCur.m.pricing, own = o.attendance_only && can('sup_edit');
  const f = [own && { k: 'name', label: t('name'), req: true }, own && { k: 'type', type: 'select', label: t('type'), options: SUP_TYPES.map(x => [x, typeLabel(x)]) },
    own && { k: 'date', type: 'date', label: t('date'), req: true },
    can('sup_mark') && { k: 'status', type: 'select', label: t('status'), options: SUP_STATUS.map(s => [s, (supLetter(s) ? supLetter(s) + ' · ' : '') + supStatus(s)]) },
    can('sup_mark') && { k: 'mistake', type: 'textarea', rows: 2, label: t('sup_mistake'), hint: t('sup_mistake_hint') },
    { k: 'note', label: t('note') }, can('sup_mark') && { k: 'rating', type: 'stars', label: t('rating') },
    price && { type: 'section', label: t('sup_money'), hint: t('sup_money_hint') },
    price && { k: 'pay', type: 'select', label: t('sup_pay'), options: [['', t('memo_undecided')], ['full', t('sup_pay_full')], ['partial', t('sup_pay_partial')], ['none', t('sup_pay_none')]], hint: t('sup_pay_hint') },
    price && { k: 'pay_amount', type: 'number', step: '0.01', min: 0, label: t('sup_pay_amount') },
    price && { k: 'price', type: 'number', step: '0.01', min: 0, label: t('unit_price'), hint: t('sup_price_hint') },
    price && { k: 'currency', type: 'select', label: t('currency'), options: [['', '—']].concat(uniq(curList().concat(o.currency ? [o.currency] : [])).map(c => [c, c])) },
    price && { k: 'paid', type: 'bool', label: t('paid') }].filter(Boolean);
  const cur = Object.assign({}, o, preset ? { status: preset } : {});
  editForm(o.name + ' · ' + D.short(o.date), f, cur, async r => {
    const row = supKey(o);
    for (const x of f) if (x.k && normV(r[x.k]) !== normV(o[x.k])) row[x.k] = r[x.k] ?? '';
    if ('rating' in row && !row.rating) row.rating = '';
    if (Object.keys(row).length > 1) await api('supplier_mark', { p_row: row });
    route();
  }, (o.perf_id && (!o.attendance_only || can('sup_edit'))) ? { dangerLabel: t('sup_clear'), dangerAsk: t(o.attendance_only ? 'sup_clear_only_q' : 'sup_clear_q'), danger: async () => { await api('supplier_mark', { p_row: { id: o.perf_id, status: 'clear' } }); route(); } } : {});
}
// an ATTENDANCE-ONLY item: a show that is not in the guests' programme (Special Performance on 12 Nov by XYZ) – only here
ACT.sup_only = () => {
  const price = supCur.m.pricing, items = supCur.sp.items.filter(i => i.active !== false);
  const f = [items.length && { k: 'supplier_item_id', type: 'select', num: true, label: t('sup_from_item'), options: [['', t('none')]].concat(items.map(i => [i.id, i.name])), hint: t('sup_from_item_hint') },
    { k: 'name', label: t('name') }, { k: 'type', type: 'select', label: t('type'), options: SUP_TYPES.map(x => [x, typeLabel(x)]) },
    { k: 'date', type: 'date', label: t('date'), req: true }, { k: 'start_time', type: 'time', label: t('start') },
    can('sup_mark') && { k: 'status', type: 'select', label: t('status'), options: SUP_STATUS.filter(s => s !== 'cancelled').map(s => [s, supStatus(s)]) },
    price && { k: 'price', type: 'number', step: '0.01', min: 0, label: t('unit_price'), hint: t('sup_only_price_hint') }, price && { k: 'currency', type: 'select', label: t('currency'), options: [['', '—']].concat(curList().map(c => [c, c])) },
    { k: 'note', label: t('note') }].filter(Boolean);
  editForm(t('sup_add_only'), f, { type: 'show', date: D.today() < supMon + '-01' ? supMon + '-01' : D.today().slice(0, 7) === supMon ? D.today() : monthEnd(supMon), status: 'expected', currency: supCur.sp.currency || '' }, async r => {
    const row = { new: true, supplier_id: supCur.id, supplier_item_id: r.supplier_item_id || null, name: r.name || null, type: r.type, date: r.date, start_time: r.start_time || null, note: r.note || '' };
    if (!row.name && !row.supplier_item_id) throw new ApiError('required', { field: t('name') });
    if (r.status && r.status !== 'expected') row.status = r.status;
    if (price && r.price != null && r.price !== '') Object.assign(row, { price: r.price, currency: r.currency || '' });
    await api('supplier_mark', { p_row: row }); route();
  });
};
ACT.sup_doc = () => { const d = supAttDoc(supCur.m); docPreview(d.title, d.html, { sub: d.sub, file: d.file, sheets: d.sheets, team: false }); };
/* ---------- THE MONTHLY SUPPLIER MEMO ---------- */
async function memoView(id) {
  const ov = await api('supplier_overview', { p_month: supMon }), sups = ov.suppliers.filter(s => s.active !== false || s.id === id);
  const pick = `<div class="filters"><select data-act-change="memo_pick" aria-label="${esc(t('supplier'))}"><option value="">${esc(t('memo_pick'))}</option>${sups.map(s => `<option value="${s.id}" ${s.id === id ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}</select>
    <input type="month" value="${supMon}" data-act-change="sup_month" aria-label="${esc(t('month'))}"><span class="grow"></span></div>`;
  if (!id) return pick + `<p class="hint-box">${ico('info')}<span>${esc(t('memo_intro_help'))}</span></p>`;
  const j = await api('supplier_memo', { p_supplier: id, p_month: supMon }), final = !!j.memo?.final, w = j.data.money?.warnings || {};
  memoCur = { id, j, final, secs: JSON.parse(JSON.stringify(j.memo?.sections?.length ? j.memo.sections : memoDefaults())) };
  const edit = can('memo_edit') && !final, block = (w.undecided || 0) + (w.no_price || 0);
  return pick + (final ? `<p class="hint-box">${ico('lock')}<span>${esc(t('memo_final_note', { name: j.memo.finalized_by || '', date: D.stamp(j.memo.finalized_at) }))}</span></p>` : '')
    + (!final && (w.undecided || w.no_price || w.unmarked) ? `<p class="hint-box warn">${ico('info')}<span>${esc([w.unmarked ? t('sup_w_unmarked', { n: w.unmarked }) : '', w.undecided ? t('sup_w_undecided', { n: w.undecided }) : '', w.no_price ? t('sup_w_no_price', { n: w.no_price }) : ''].filter(Boolean).join(' · '))}
        <a href="#/attendance/suppliers/${id}">${esc(t('memo_fix_records'))}</a></span></p>` : '')
    + `<div class="row memo-actions"><button class="btn" data-act="memo_preview">${ico('eye')} ${esc(t('memo_preview'))}</button>${edit ? `<button class="btn ghost" data-act="memo_save">${esc(t('save'))}</button>
      <button class="btn ghost" data-act="memo_final" ${block ? `disabled title="${esc(t('memo_cannot_final'))}"` : ''}>${ico('lock')} ${esc(t('memo_finalize'))}</button>` : ''}
      ${final && can('memo_edit') ? `<button class="btn ghost" data-act="memo_reopen">${esc(t('memo_reopen'))}</button>` : ''}<span class="grow"></span>
      ${j.memo?.updated_at ? `<small class="muted">${esc(t('memo_saved_by', { name: j.memo.updated_by || '', date: D.stamp(j.memo.updated_at) }))}</small>` : ''}</div>`
    + `<div id="memo-ed" class="memo-ed">${memoEditor(edit)}</div>`;
}
const memoKindLabel = x => t('memo_k_' + x.kind);
function memoEditor(edit) {
  const secs = memoCur.secs, data = memoCur.j.data, n = secs.length;
  return secs.map((x, i) => { const fixed = MEMO_FIXED.includes(x.kind), custom = x.kind === 'heading' || x.kind === 'paragraph';
    const body = memoTextKinds.includes(x.kind) ? (edit
      ? (x.kind === 'notes' || x.kind === 'heading' ? `<input data-memo="${x.k}" data-f="title" value="${esc(x.title || '')}" placeholder="${esc(t('memo_heading_ph'))}" aria-label="${esc(t('title'))}">` : '')
        + (x.kind === 'heading' ? '' : x.kind === 'title' ? `<input data-memo="${x.k}" data-f="text" value="${esc(x.text || '')}" aria-label="${esc(memoKindLabel(x))}">` : `<textarea data-memo="${x.k}" data-f="text" rows="${x.kind === 'signature' ? 3 : 3}" aria-label="${esc(memoKindLabel(x))}">${esc(x.text || '')}</textarea>`)
      : `<p class="small">${nl2br((x.kind === 'heading' || x.kind === 'notes' ? (x.title || '') + (x.text ? '\n' : '') : '') + (x.text || ''))}</p>`)
      : `<div class="memo-calc">${memoDoc(data, [x]).html || `<p class="muted small">${esc(t('memo_empty_part'))}</p>`}</div>`;
    return `<div class="memo-sec ${x.hidden && !fixed ? 'hidden-sec' : ''} ${fixed ? 'fixed' : ''}"><div class="row"><b class="grow">${esc(memoKindLabel(x))}${fixed ? ' ' + chip(t('memo_calculated')) : ''}${x.hidden && !fixed ? ' ' + chip(t('memo_hidden')) : ''}</b>
      ${edit ? `<button class="icon-btn" data-act="memo_move" data-i="${i}" data-d="-1" ${i === 0 ? 'disabled' : ''} aria-label="${esc(t('move_up'))}">${ico('up')}</button><button class="icon-btn" data-act="memo_move" data-i="${i}" data-d="1" ${i === n - 1 ? 'disabled' : ''} aria-label="${esc(t('move_down'))}">${ico('down')}</button>
        ${fixed || x.kind === 'title' ? '' : `<button class="btn ghost small" data-act="memo_hide" data-i="${i}">${esc(x.hidden ? t('memo_show') : t('memo_hide'))}</button>`}${custom ? `<button class="icon-btn" data-act="memo_del" data-i="${i}" aria-label="${esc(t('delete'))}">${ico('trash')}</button>` : ''}` : ''}</div>${body}</div>`; }).join('')
    + (edit ? `<p class="row"><button class="btn ghost small" data-act="memo_add" data-k="heading">${ico('plus')} ${esc(t('memo_add_heading'))}</button><button class="btn ghost small" data-act="memo_add" data-k="paragraph">${ico('plus')} ${esc(t('memo_add_paragraph'))}</button></p>
      <p class="muted small">${esc(t('memo_placeholders'))}</p>` : '');
}
// typing changes the memo being edited (saved with Save); moving / hiding / adding redraws only the editor – nothing typed is lost
function memoInput(ev) { const el = ev.target.closest('[data-memo]'); if (!el || !memoCur) return; const x = memoCur.secs.find(s => s.k === el.dataset.memo); if (x) x[el.dataset.f] = el.value; }
const memoRedraw = () => { const ed = $('#memo-ed'); if (ed) ed.innerHTML = memoEditor(can('memo_edit') && !memoCur.final); };
ACT.memo_pick = el => { location.hash = '#/attendance/memo' + (el.value ? '/' + el.value : ''); };
ACT.memo_move = el => { const s = memoCur.secs, i = +el.dataset.i, k = i + +el.dataset.d; if (k < 0 || k >= s.length) return; [s[i], s[k]] = [s[k], s[i]]; memoRedraw(); };
ACT.memo_hide = el => { const x = memoCur.secs[+el.dataset.i]; x.hidden = !x.hidden; memoRedraw(); };
ACT.memo_del = el => { memoCur.secs.splice(+el.dataset.i, 1); memoRedraw(); };
ACT.memo_add = el => { memoCur.secs.push(el.dataset.k === 'heading' ? { k: 'h' + Date.now().toString(36), kind: 'heading', title: '' } : { k: 'p' + Date.now().toString(36), kind: 'paragraph', text: '' }); memoRedraw(); };
ACT.memo_preview = () => { const d = memoDoc(memoCur.j.data, memoCur.secs); docPreview(d.title, d.html, { sub: d.sub, file: d.file, sheets: d.sheets, team: false }); };
ACT.memo_save = async () => { await api('supplier_memo_save', { p_supplier: memoCur.id, p_month: supMon, p_sections: memoCur.secs, p_action: 'save' }); toast(t('saved')); route(); };
ACT.memo_final = async () => {
  if (!await confirmBox(t('memo_final_q'), t('memo_finalize'))) return;
  await api('supplier_memo_save', { p_supplier: memoCur.id, p_month: supMon, p_sections: memoCur.secs, p_action: 'finalize' }); toast(t('memo_finalized')); route();
};
ACT.memo_reopen = async () => { if (!await confirmBox(t('memo_reopen_q'), t('memo_reopen'))) return; await api('supplier_memo_save', { p_supplier: memoCur.id, p_month: supMon, p_sections: null, p_action: 'reopen' }); route(); };
/* ---------- SETTINGS: the rules (who clocks in when), the places (where), the Management sheet's letters ---------- */
async function attSettings() {
  const rule = S.settings?.att_mgmt || {};
  const rules = await crudList('att_rules', {
    entity: 'attendance_rules', sortable: true, intro: t('att_rules_intro'),
    fields: () => [{ k: 'name', label: t('name'), req: true }, { k: 'team_id', type: 'select', label: t('team'), num: true, options: teamOpts(t('all_teams')) },
      { k: 'role_id', type: 'select', label: t('role'), num: true, options: [['', t('att_all_roles')]].concat(S.roles.map(r => [r.id, r.name])) },
      { k: 'weekdays', type: 'days', label: t('weekdays'), hint: t('att_days_hint') }, { k: 'date_from', type: 'date', label: t('sch_from') }, { k: 'date_to', type: 'date', label: t('sch_to') },
      { k: 'clock_required', type: 'bool', label: t('att_r_clock'), def: true }, { k: 'location_required', type: 'bool', label: t('att_r_place'), def: true }, { k: 'late_tracking', type: 'bool', label: t('att_r_late'), def: true },
      { k: 'clock_in', type: 'time', label: t('att_planned_in') }, { k: 'clock_out', type: 'time', label: t('att_planned_out') }, { k: 'grace_min', type: 'number', min: 0, max: 240, label: t('att_grace'), hint: t('att_grace_hint') },
      { k: 'active', type: 'bool', label: t('active'), def: true }],
    defaults: () => ({ clock_required: true, location_required: true, late_tracking: true, grace_min: 5, active: true }),
    row: r => `<b>${esc(r.name)}</b>${r.active === false ? ' ' + chip(t('inactive')) : ''} <small class="muted">${esc([r.team_id ? S.teams.find(x => x.id === r.team_id)?.name : t('all_teams'), r.role_id ? S.roles.find(x => x.id === r.role_id)?.name : t('att_all_roles'),
      (r.weekdays || []).length ? r.weekdays.map(i => D.wdName(i, 'short')).join(' ') : '', r.date_from || r.date_to ? [r.date_from && D.dm(r.date_from), r.date_to && D.dm(r.date_to)].map(x => x || '…').join(' – ') : ''].filter(Boolean).join(' · '))}</small>
      <br><small>${r.clock_required ? esc([r.clock_in ? hm(r.clock_in) + (r.clock_out ? '–' + hm(r.clock_out) : '') : '', r.grace_min ? t('att_grace_n', { n: r.grace_min }) : ''].filter(Boolean).join(' · ')) + ' ' + chip(t('att_r_clock'), 'ok') + (r.location_required ? chip(t('att_r_place'), 'ok') : '') + (r.late_tracking ? chip(t('att_r_late'), 'ok') : '') : chip(t('att_no_clock_needed'))}</small>`
  })();
  const places = await crudList('att_places', {
    entity: 'attendance_locations', intro: t('att_places_intro'),
    fields: () => [{ k: 'name', label: t('name'), req: true, hint: t('att_place_name_hint') }, { k: 'lat', type: 'number', step: 'any', label: t('att_lat'), req: true }, { k: 'lng', type: 'number', step: 'any', label: t('att_lng'), req: true },
      { k: 'radius_m', type: 'number', min: 5, max: 5000, label: t('att_radius'), hint: t('att_radius_hint') }, { k: 'max_accuracy_m', type: 'number', min: 5, max: 5000, label: t('att_accuracy'), hint: t('att_accuracy_hint') },
      { k: 'active', type: 'bool', label: t('active'), def: true }],
    defaults: () => ({ radius_m: 50, max_accuracy_m: 100, active: true }),
    extra: `<button class="btn ghost small" data-act="loc_here">${ico('pin')} ${esc(t('att_use_here'))}</button>`,
    row: r => `<b>${esc(r.name)}</b>${r.active === false ? ' ' + chip(t('inactive')) : ''} <small class="muted">${esc(t('att_radius_n', { n: r.radius_m }))} · ${esc(Number(r.lat).toFixed(5) + ', ' + Number(r.lng).toFixed(5))}</small>`,
    rowExtra: r => `<a class="icon-btn" href="https://www.openstreetmap.org/?mlat=${+r.lat}&mlon=${+r.lng}#map=18/${+r.lat}/${+r.lng}" target="_blank" rel="noopener" aria-label="${esc(t('att_on_map'))}">${ico('pin')}</a>`
  })();
  const anyPlace = (CRUD.att_places.rows || []).some(r => r.active !== false);
  return `<section><h2>${esc(t('att_rules'))}</h2>${rules}</section><section><h2>${esc(t('att_places'))}</h2>${anyPlace ? '' : `<p class="hint-box warn">${ico('info')}<span>${esc(t('att_no_place'))}</span></p>`}${places}</section>
    <section><h2>${esc(t('att_mgmt_rule'))}</h2><p class="muted small">${esc(t('att_mgmt_rule_hint'))}</p><div class="card att-mgmt">${STATUS.map(s => `<div class="row-mini"><span class="grow">${esc(statusLabel(s))}</span>
      <input data-mg-l="${s}" value="${esc(rule[s]?.l || '')}" maxlength="2" size="3" aria-label="${esc(t('att_letter') + ' · ' + statusLabel(s))}"><label><input type="checkbox" data-mg-n="${s}" ${rule[s]?.n ? 'checked' : ''}> ${esc(t('att_counts'))}</label></div>`).join('')}
      <p class="row"><span class="grow"></span><button class="btn small" data-act="att_mgmt_save">${esc(t('save'))}</button></p></div></section>`;
}
ACT.att_mgmt_save = async el => {
  const box = el.closest('.att-mgmt'), v = Object.fromEntries(STATUS.map(s => [s, { l: $(`[data-mg-l="${s}"]`, box).value.trim(), n: $(`[data-mg-n="${s}"]`, box).checked }]));
  const j = await api('attendance_settings_save', { p_mgmt: v }); S.settings.att_mgmt = j.att_mgmt; toast(t('saved')); route();
};
// a new place where the manager stands now (the phone's position, precise when it can)
ACT.loc_here = async () => {
  let p; try { p = await attPosition(); } catch (e) { throw new ApiError('geo_' + e.code); }
  editForm(t('add'), CRUD.att_places.fields(), { name: t('att_place_def'), lat: +p.lat.toFixed(6), lng: +p.lng.toFixed(6), radius_m: Math.max(30, Math.min(200, Math.round(p.acc * 2) || 50)), max_accuracy_m: 100, active: true },
    async r => { await save('attendance_locations', r); route(); }, { after: `<p class="muted small">${esc(t('att_here_acc', { n: p.acc }))}</p>` });
};

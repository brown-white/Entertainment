'use strict';
/* AUREA · pages/attendance.js — Attendance: the day and the month (day statuses + clock times; payroll counts the same).
   Uses: core/state · translations/languages · supabase · core/utils · icons/icons · core/permissions · components/modals · core/actions ·
         components/cards · core/router · components/forms · components/tables · systems/exports · systems/team-schedule ·
         systems/program-engine */
let atDay = null, atMonth = null, atCache = [];
page('attendance', {
  perm: 'team_ops,m_dayplan', icon: 'clipboard', group: 'manage', title: 'attendance',
  render: async arg => {
    if (!S.team) return empty(t('no_team_selected'));
    const tab = arg === 'month' ? 'month' : 'today';
    const head = tabs('attendance', [['today', t('by_date')], ['month', t('month_sheet')]], tab);
    if (tab === 'month') {
      atMonth = atMonth || D.month(D.today());
      const from = atMonth + '-01', to = monthEnd(atMonth), today = D.today();
      const b = await board(from, to); const days = D.range(from, +to.slice(8));
      const people = b.staff.filter(p => !p.is_manager);
      const canEdit = can('m_dayplan') || can('team_ops');
      atCache = people.map(p => Object.assign({ p, name: p.display_name, number: p.staff_number }, attendanceSummary(p, b, from, to)));
      const cell = (p, d) => {
        const out = (p.start_date && d < p.start_date) || (p.end_date && d > p.end_date), fut = d > today, s = statusOf(b, p.id, d);
        if (out) return `<td class="c-out" title="${esc(t('not_employed'))}">·</td>`;
        const L = ST_LETTER[s?.status] || '';
        const edit = can('m_dayplan') || (canEdit && !fut);
        return `<td class="c-${s?.status || 'none'} ${fut ? 'fut' : ''}">${edit ? `<button data-act="at_cell" data-s="${p.id}" data-d="${d}" aria-label="${esc(p.display_name + ' ' + D.short(d) + ' ' + (s ? statusLabel(s.status) : ''))}">${L}</button>` : L}</td>`;
      };
      return head + `<div class="row"><input type="month" value="${atMonth}" data-act-change="at_month" aria-label="${esc(t('month'))}"><span class="grow"></span><button class="btn ghost small" data-act="at_print">${esc(t('print_pdf'))}</button><button class="btn ghost small" data-act="at_xlsx">${esc(t('excel'))}</button></div>
        <p class="legend">${Object.entries(ST_LETTER).map(([s, l]) => `<span class="c-${s}"><b>${l}</b> ${esc(statusLabel(s))}</span>`).join('')}<span class="fut"><b>P</b> ${esc(t('planned_not_counted'))}</span><span class="c-out"><b>·</b> ${esc(t('not_employed'))}</span></p>
        ${people.length ? `<div class="tablewrap att-sheet"><table><thead><tr><th class="sticky">${esc(t('name'))}</th>${days.map(d => `<th class="${d === today ? 'today' : ''} ${[5, 6].includes(D.wd(d)) ? 'we' : ''}"><small>${esc(D.wdShort(D.wd(d)))}</small>${+d.slice(8)}</th>`).join('')}
          ${Object.values(ST_LETTER).map(l => `<th class="tot">${l}</th>`).join('')}<th class="tot">${esc(t('hours'))}</th></tr></thead>
          <tbody>${atCache.map(r => `<tr><th class="sticky"><b>${esc(r.name)}</b>${r.number ? ` <small>#${r.number}</small>` : ''}<small class="muted">${r.days} ${esc(t('days_counted'))}</small></th>${days.map(d => cell(r.p, d)).join('')}
            <td class="tot">${r.worked}</td><td class="tot">${r.off}</td><td class="tot">${r.vac}</td><td class="tot">${r.absent}</td><td class="tot">${r.sick}</td><td class="tot">${r.hours}</td></tr>`).join('')}</tbody></table></div>` : empty(t('no_staff_team'))}
        <p class="muted small">${esc(t('attendance_note'))}</p>`;
    }
    const today = D.today(); atDay = atDay || today;
    const d = atDay, b = await board(d, d), nm = hotelNowMin(), isToday = d === today;
    const busyNow = new Set(isToday ? b.items.filter(i => i.date === d && i.status === 'scheduled' && mins(i.start_time) <= nm && endMin(i) > nm).flatMap(i => i.staff.map(x => x.staff_id)) : []);
    const people = b.staff.filter(p => !p.is_manager && statusOf(b, p.id, d)).map(p => Object.assign({}, p, { st: statusOf(b, p.id, d), k: (b.clock || []).find(x => x.staff_id === p.id && x.date === d) }));   // not yet started / already left: not listed
    const canMark = can('m_dayplan') || (can('team_ops') && d <= today);
    const groups = [['working', t('st_working')], ['day_off', t('st_day_off')], ['vacation', t('st_vacation')], ['absent', t('absent_or_sick')]];
    const inGroup = (g, p) => (g === 'absent' ? ['absent', 'sick'].includes(p.st.status) : p.st.status === g);
    const later = b.items.filter(i => i.date === d && i.status === 'scheduled' && (!isToday || endMin(i) >= nm));
    const row = p => `<div class="att-row">${avatar(p.photo_url, p.display_name, 'sm')}<div class="grow"><b>${esc(p.display_name)}</b>${p.staff_number ? ` <small class="muted">#${p.staff_number}</small>` : ''}
        <div class="att-tags">${p.st.entrance ? chip(entranceLabel(p.st)) : ''}${p.st.practice ? chip(t('practice')) : ''}${busyNow.has(p.id) ? chip(t('busy_now'), 'ok') : ''}
        <small class="muted">${ico('clock')} ${p.k?.check_in ? esc(clockTime(p.k.check_in)) + (p.k.check_out ? ' – ' + esc(clockTime(p.k.check_out)) : '') : esc(t('not_clocked'))}</small></div></div>
      ${canMark ? `<div class="att-act"><div class="seg" role="group" aria-label="${esc(p.display_name)}">${[['working', t('present')], ['absent', t('st_absent')], ['sick', t('st_sick')]].map(([v, l]) => `<button class="${p.st.status === v ? 'on s-' + v : ''}" data-act="at_set" data-s="${p.id}" data-v="${v}" aria-pressed="${p.st.status === v}">${esc(l)}</button>`).join('')}</div>
        <span class="att-tools"><button class="icon-btn" data-act="at_clock" data-s="${p.id}" aria-label="${esc(t('clock_times'))}">${ico('clock')}</button>${can('m_dayplan') ? `<button class="icon-btn" data-act="dp_cell" data-s="${p.id}" data-d="${d}" aria-label="${esc(t('more_options'))}">${ico('dots')}</button>` : ''}</span></div>` : stChip(p.st)}</div>`;
    return head + `<div class="row"><button class="btn ghost small" data-act="at_day" data-n="-1" aria-label="-1">${ico('up', 'rot-l')}</button><input type="date" value="${d}" data-act-change="at_pick" aria-label="${esc(t('date'))}"><button class="btn ghost small" data-act="at_day" data-n="1" aria-label="+1">${ico('up', 'rot-r')}</button></div>
      <p class="hint-box">${ico('info')}<span>${esc(t('attendance_help'))}</span></p>
      ${people.length ? `<div class="stats">${groups.map(([g, l]) => `<span><b>${people.filter(p => inGroup(g, p)).length}</b>${esc(l)}</span>`).join('')}<span><b>${people.filter(p => p.k?.check_in).length}</b>${esc(t('clocked_in'))}</span></div>
        ${groups.map(([g, l]) => { const ps = people.filter(p => inGroup(g, p)); return ps.length ? `<section><h2>${esc(l)} <small class="muted">${ps.length}</small></h2><div class="att-list">${ps.map(row).join('')}</div></section>` : ''; }).join('')}`
      : empty(t('no_staff_team'), can('m_staff') ? `<a class="btn" href="#/staffadmin/staff">${esc(t('add_staff'))}</a>` : '')}
      ${later.length ? `<section><h2>${esc(isToday ? t('still_today') : t('programme'))}</h2><div class="items">${later.map(i => itemRow(i, 'item')).join('')}</div></section>` : ''}`;
  }
});
ACT.at_day = el => { atDay = D.add(atDay, +el.dataset.n); route(); };
ACT.at_pick = el => { if (el.value) { atDay = el.value; route(); } };
ACT.at_month = el => { atMonth = el.value; route(); };
ACT.at_cell = async el => {
  const sid = +el.dataset.s, d = el.dataset.d; const b = await board(d, d); const s = statusOf(b, sid, d) || {}; const p = b.staff.find(x => x.id === sid);
  const opts2 = can('m_dayplan') ? Object.keys(ST_LETTER) : ['working', 'absent', 'sick'];
  const { close } = modal(p.display_name + ' · ' + D.long(d), `<div class="st-pick">${opts2.map(v => `<button class="c-${v} ${s.status === v ? 'on' : ''}" data-v="${v}"><b>${ST_LETTER[v]}</b>${esc(statusLabel(v))}</button>`).join('')}</div>
    ${can('m_dayplan') && s.source === 'set' ? `<p><button class="btn ghost small" data-v="">${esc(t('use_pattern'))}</button></p>` : ''}`, {
    mount: root => $$('[data-v]', root).forEach(btn => { btn.onclick = async () => {
      try { await api('day_status_set', { p_staff_id: sid, p_date: d, p_status: btn.dataset.v || null, p_entrance: !!s.entrance, p_practice: !!s.practice, p_note: s.note || null }); close(); toast(t('saved')); route(); } catch (e) { fail(e); }
    }; })
  });
};
ACT.at_set = async el => {
  const sid = +el.dataset.s; const b = await board(atDay, atDay); const s = statusOf(b, sid, atDay) || {};
  try { await api('day_status_set', { p_staff_id: sid, p_date: atDay, p_status: el.dataset.v, p_entrance: !!s.entrance, p_practice: !!s.practice, p_note: s.note || null }); toast(t('saved')); } catch (e) { fail(e); }
  route();
};
ACT.at_clock = async el => {
  const sid = +el.dataset.s, d = atDay; const b = await board(d, d); const k = (b.clock || []).find(x => x.staff_id === sid);
  const cf = [{ k: 'cin', type: 'time', label: t('clock_in_btn') }, { k: 'cout', type: 'time', label: t('clock_out_btn') }];
  editForm(b.staff.find(p => p.id === sid)?.display_name || '', cf, { cin: k?.check_in ? clockHm(k.check_in) : '', cout: k?.check_out ? clockHm(k.check_out) : '' }, async r => {
    await save('staff_clock', Object.assign(k ? { id: k.id } : { staff_id: sid, date: d }, clockPair(d, r.cin, r.cout))); route();
  });
};
const atTable = () => { const days = D.range(atMonth + '-01', +monthEnd(atMonth).slice(8));
  return atCache.map(r => Object.assign({ [t('name')]: r.name, [t('staff_number')]: r.number || '' },
    Object.fromEntries(days.map(d => { const s = (r.p.start_date && d < r.p.start_date) || d > D.today() ? '' : ST_LETTER[(atBoard && statusOf(atBoard, r.p.id, d))?.status] || ''; return [D.wdShort(D.wd(d)) + ' ' + +d.slice(8), s]; })),   // not a bare number: number-like keys would jump before the name
    { P: r.worked, O: r.off, H: r.vac, A: r.absent, S: r.sick, [t('hours')]: r.hours, [t('days_counted')]: r.days })); };
let atBoard = null;
ACT.at_xlsx = async () => { atBoard = await board(atMonth + '-01', monthEnd(atMonth)); exportXlsx('attendance-' + atMonth, { [t('attendance')]: atTable() }); };
ACT.at_print = async () => { atBoard = await board(atMonth + '-01', monthEnd(atMonth)); const rows = atTable(); printSheet(t('attendance'), `<style>table{font-size:8px}td,th{padding:2px 3px;text-align:center}</style>` + tableHtml(Object.keys(rows[0] || { '-': '' }), rows.map(r => Object.values(r))), { sub: D.mon(atMonth) }); };

'use strict';
/* AUREA · pages/guest-support.js — Guest Support: records, collect feedback, history, Fast Action, guests in the hotel – and the manager's overview,
   departments and contacts.
   Uses: translations/languages · supabase · core/utils · icons/icons · core/permissions · components/modals · core/actions ·
         components/cards · core/router · components/forms · components/tables · systems/exports · systems/feedback */
/* ---------- Guest Support (records, history, Fast Action, guests in the hotel) ---------- */
const GS_KINDS = ['request', 'comment', 'complaint'];
let gsF = { kind: '', status: '', dept: '', q: '', from: null, to: null };
page('gsupport', {
  perm: 'guest_support,feedback_collect,gs_history,fast_action,guests_view', icon: 'buoy', group: 'guests',
  render: async arg => {
    const g0 = takeIntent('gsupport'); if (g0) { gsF.q = g0.q; gsF.from = g0.from; gsF.to = g0.to; }
    const tabsList = [can('guest_support') && ['new', t('gs_new')], can('feedback_collect') && ['feedback', t('collect_feedback')], can('gs_history') && ['history', t('gs_history')], can('fast_action') && ['fast', t('fast_action')], can('guests_view') && ['guests', t('guests_in_hotel')]].filter(Boolean);
    const tab = tabsList.some(x => x[0] === arg) ? arg : tabsList[0][0];
    let body = '';
    if (tab === 'new') {
      const deps = await list('departments', { active: true });
      body = `<form class="card" id="gsf" onsubmit="return false">${fieldsHtml(gsFields(deps))}<button class="btn" data-act="gs_add">${esc(t('save_record'))}</button></form>`;
    } else if (tab === 'feedback') {
      const deps = await list('departments', { active: true, rated: true });
      const head = [{ k: 'room', label: t('room'), req: true }, { k: 'guest_name', label: t('guest_name') }, { k: 'nationality', type: 'country', label: t('nationality') }];
      body = `<p class="muted">${esc(t('collect_intro'))}</p><form class="card" id="fbf" onsubmit="return false">${fieldsHtml(head)}${fieldsHtml(fbFields(deps))}<button class="btn" data-act="gs_fb">${esc(t('save_record'))}</button></form>`;
    } else if (tab === 'history') {
      const today = D.today(); gsF.from = gsF.from || D.add(today, -30); gsF.to = gsF.to || today;
      const seeFb = can('feedback_view') || can('m_support');
      const [rows, deps, fbs] = await Promise.all([list('guest_support_records', { _from: gsF.from, _to: gsF.to }), list('departments'), seeFb ? list('guest_feedback', { _from: gsF.from, _to: gsF.to, _limit: 3000 }) : []]);
      const fl = fbs.length ? await ratingsOf(fbs.map(x => x.id)) : [];
      // feedback is read from the feedback system (not copied) and listed with the records
      const fbRecs = fbs.map(f => { const rt = fl.filter(l => l.feedback_id === f.id); const dn = rt.map(l => deps.find(d => d.id === l.department_id)?.name).filter(Boolean);
        return { id: 'f' + f.id, fb: Object.assign({}, f, { ratings: rt }), kind: 'feedback', room: f.room, nationality: f.nationality, body: f.comment || '', departments: dn,
          department: rt.filter(l => l.rating <= 2).map(l => deps.find(d => d.id === l.department_id)?.name).filter(Boolean).join(', '), status: f.status === 'closed' ? 'closed' : 'open', created_at: f.created_at,
          staff_name: f.source === 'staff' ? t('collected_by_staff') : t('from_guest_app'), rating_txt: rt.map(l => (deps.find(d => d.id === l.department_id)?.name || t('activity_rating')) + ' ' + l.rating + '/5').join(', ') }; });
      const r = gsFilter(rows.concat(fbRecs).sort((a, b) => String(b.created_at).localeCompare(String(a.created_at))));
      body = `<div class="filters"><input type="date" value="${gsF.from}" data-gsf="from" aria-label="${esc(t('date_from'))}"><input type="date" value="${gsF.to}" data-gsf="to" aria-label="${esc(t('date_to'))}">
        <select data-gsf="kind"><option value="">${esc(t('all_kinds'))}</option>${GS_KINDS.concat(seeFb ? ['feedback'] : []).map(k => `<option value="${k}" ${gsF.kind === k ? 'selected' : ''}>${esc(t('gk_' + k))}</option>`).join('')}</select>
        <select data-gsf="status"><option value="">${esc(t('all_status'))}</option><option value="open" ${gsF.status === 'open' ? 'selected' : ''}>${esc(t('open'))}</option><option value="closed" ${gsF.status === 'closed' ? 'selected' : ''}>${esc(t('closed'))}</option></select>
        <select data-gsf="dept"><option value="">${esc(t('all_departments'))}</option>${deps.map(d => `<option ${gsF.dept === d.name ? 'selected' : ''}>${esc(d.name)}</option>`).join('')}</select>
        <input type="search" value="${esc(gsF.q)}" data-gsf="q" placeholder="${esc(t('search'))}"></div>
        ${can('gs_export') ? `<p class="row"><button class="btn ghost small" data-act="gs_pdf">${esc(t('print_pdf'))}</button><button class="btn ghost small" data-act="gs_xlsx">${esc(t('excel'))}</button></p>` : ''}
        ${r.length ? `<div class="list">${r.map(x => x.kind === 'feedback' ? `<div class="gs-fb"><span class="chip">${ico('star')} ${esc(t('gk_feedback'))}</span>${fbList([x.fb], deps, (f, part) => part === 'head' ? `<b>${esc(f.guest_name || t('guest'))}</b> <small class="muted">${f.room ? esc(t('room')) + ' ' + esc(f.room) + ' · ' : ''}${esc(D.stamp(f.created_at))} · ${esc(x.staff_name)}</small>` : '')}</div>` : gsRow(x)).join('')}</div>` : empty(t('no_records'))}`;
      gsCache = r;
    } else if (tab === 'fast') {
      body = await fastActionHtml();
    } else {
      const j = await api('staff_guests');
      body = j.stays.length ? tableWrap([t('room'), t('name'), t('arrival'), t('departure'), j.private && t('nationality'), j.private && t('phone'), t('bookings')].filter(Boolean),
        j.stays.map(g => [g.room, g.name, D.dm(g.arrival), D.dm(g.departure), j.private && countryName(g.nationality), j.private && (g.phone || ''), g.bookings].filter(x => x !== false))) : empty(t('no_guests'));
    }
    return tabs('gsupport', tabsList, tab) + body;
  },
  mount: () => {
    $$('[data-gsf]').forEach(el => { el.onchange = () => { gsF[el.dataset.gsf] = el.value; route(); }; });
  }
});
let gsCache = [];
const gsFields = deps => [{ k: 'kind', type: 'select', label: t('kind'), options: GS_KINDS.map(k => [k, t('gk_' + k)]) }, { k: 'room', label: t('room'), req: true },
  { k: 'nationality', type: 'country', label: t('nationality') }, { k: 'arrival', type: 'date', label: t('arrival') }, { k: 'departure', type: 'date', label: t('departure') },
  { k: 'department', type: 'select', label: t('department'), options: [['', t('none')]].concat(deps.map(d => [d.name, deptName(d)])) },
  { k: 'body', type: 'textarea', label: t('what_happened'), req: true }];
const gsFilter = rows => rows.filter(x => (!gsF.kind || x.kind === gsF.kind) && (!gsF.status || x.status === gsF.status) && (!gsF.dept || x.department === gsF.dept || (x.departments || []).includes(gsF.dept))
  && (!gsF.q || [x.room, x.body, x.staff_name, x.nationality].join(' ').toLowerCase().includes(gsF.q.toLowerCase())));
const gsRow = x => `<div class="li ${x.kind}">${chip(t('gk_' + x.kind), 'gk-' + x.kind)} <b>${esc(t('room'))} ${esc(x.room || '—')}</b> ${x.department ? chip(x.department) : ''}
  <p>${nl2br(x.body)}</p><small class="muted">${esc(x.staff_name || '')} · ${esc(D.stamp(x.created_at))}${x.status === 'closed' ? ' · ' + esc(t('closed')) : ''}</small>
  <div class="actions"><button class="btn ghost small" data-act="gs_toggle" data-id="${x.id}" data-s="${x.status === 'open' ? 'closed' : 'open'}">${esc(x.status === 'open' ? t('close_record') : t('reopen'))}</button></div></div>`;
const tableWrap = (h, rows) => `<div class="tablewrap">${tableHtml(h, rows)}</div>`;
ACT.gs_add = async () => {
  const deps = await list('departments', { active: true });
  const r = readForm($('#gsf'), gsFields(deps));
  await api('gs_add', { p_row: r }); toast(t('saved')); $('#gsf').reset(); $$('#gsf [data-n]').forEach(b => b.classList.remove('on'));
};
ACT.gs_fb = async () => {
  const deps = await list('departments', { active: true, rated: true }); const f = $('#fbf');
  const h = readForm(f, [{ k: 'room', label: t('room'), req: true }, { k: 'guest_name' }, { k: 'nationality' }]); const r = fbRead(f, deps);
  if (!r.ratings.length) return toast(t('choose_rating'), 'bad');
  await api('feedback_add', { p_row: Object.assign(h, r) }); toast(t('saved')); route();
  const low = r.ratings.filter(x => x.rating <= 2);   // low stars: the departments' Fast Action contacts right away (for who may use Fast Action)
  if (low.length && can('fast_action')) modal(t('fast_action'), `<p class="hint-box">${ico('flag')}<span>${esc(t('fast_action_low', { list: low.map(x => deptName(deps.find(d => d.id === x.department_id))).join(', ') }))}</span></p>${await fastActionHtml(low.map(x => x.department_id))}`, {});
};
ACT.gs_toggle = async el => { await save('guest_support_records', { id: +el.dataset.id, status: el.dataset.s }); route(); };   // who closed it and when: written by the database
const gsTable = rows => rows.map(x => ({ [t('date')]: D.stamp(x.created_at), [t('kind')]: t('gk_' + x.kind), [t('room')]: x.room, [t('nationality')]: x.nationality || '', [t('department')]: x.department || '', [t('what_happened')]: x.kind === 'feedback' ? [x.rating_txt, x.body].filter(Boolean).join(' – ') : x.body, [t('staff')]: x.staff_name, [t('status')]: t(x.status) }));
ACT.gs_pdf = () => { const rows = gsTable(gsCache); printSheet(t('gs_history'), tableHtml(Object.keys(rows[0] || { '-': '' }), rows.map(r => Object.values(r))), { sub: D.span(gsF.from, gsF.to) }); };
ACT.gs_xlsx = () => exportXlsx('guest-support-' + gsF.from + '-' + gsF.to, { [t('gs_history')]: gsTable(gsCache) });

/* ---------- Guest Support overview, departments, contacts ---------- */
let soDays = 30, contactDeps = [];
page('support', {
  perm: 'm_support', icon: 'headset', group: 'manage', title: 'support_overview',
  render: async arg => {
    const tab = ['overview', 'departments', 'contacts'].includes(arg) ? arg : 'overview';
    const head = tabs('support', [['overview', t('overview')], ['departments', t('departments')], ['contacts', t('fast_action_contacts')]], tab);
    if (tab === 'departments') return head + await crudList('deps', { entity: 'departments', sortable: true, intro: t('departments_intro'),
      fields: () => [{ k: 'name', label: t('name'), req: true }, { k: 'rated', type: 'bool', label: t('ask_in_feedback'), def: true }, { k: 'active', type: 'bool', label: t('active'), def: true }, { k: 'name_i18n', type: 'i18n', label: t('name_translations') }],
      row: r => `<b>${esc(deptName(r))}</b> ${r.rated ? chip(t('ask_in_feedback')) : ''} ${r.active ? '' : chip(t('inactive'))}` })();
    if (tab === 'contacts') contactDeps = await list('departments');
    if (tab === 'contacts') return head + await crudList('contacts', { entity: 'contacts', sortable: true, intro: t('contacts_intro'), fields: () => [{ k: 'name', label: t('name'), req: true }, { k: 'position', label: t('position') }, { k: 'department_id', type: 'select', num: true, label: t('department'), options: opts(contactDeps, 'id', d => deptName(d), t('none')), hint: t('contact_dept_hint') }, { k: 'phone', type: 'phone', label: t('phone') }, { k: 'active', type: 'bool', label: t('active'), def: true }], row: r => `<b>${esc(r.name)}</b> <small class="muted">${esc([r.position, r.department_id ? deptName(contactDeps.find(d => d.id === r.department_id)) : '', r.phone].filter(Boolean).join(' · '))}</small>` })();
    const to = D.today(), from = D.add(to, -(soDays - 1));
    const [recs, fb, deps] = await Promise.all([can('gs_history') ? list('guest_support_records', { _from: from, _to: to, _limit: 5000 }) : [], list('guest_feedback', { _from: from, _to: to, _limit: 5000 }), list('departments')]);
    const lines = fb.length ? await ratingsOf(fb.map(x => x.id)) : [];
    const count = (arr, f) => { const m = {}; arr.forEach(x => { const k = f(x) || '—'; m[k] = (m[k] || 0) + 1; }); return Object.entries(m).sort((a, b) => b[1] - a[1]); };
    const bars = (pairs, max) => `<div class="bars">${pairs.map(([k, v]) => `<div><span>${esc(k)}</span><i style="width:${Math.max(4, Math.round(100 * v / (max || 1)))}%"></i><b>${v}</b></div>`).join('')}</div>`;
    const kinds = count(recs, x => t('gk_' + x.kind)), depCount = count(recs, x => x.department), rooms = count(recs, x => x.room).slice(0, 8);
    const byDep = {}; lines.forEach(r => { const k = r.department_id ?? 0; (byDep[k] = byDep[k] || []).push(r.rating); });
    const depAvg = Object.entries(byDep).map(([k, a]) => [deptName(deps.find(d => d.id === +k)), +(sum(a, x => x) / a.length).toFixed(1)]).sort((a, b) => a[1] - b[1]);
    const favg = lines.length ? (sum(lines, x => x.rating) / lines.length).toFixed(1) : '–';
    const days = D.range(from, soDays).map(d => [D.dm(d), recs.filter(x => hotelDate(x.created_at) === d).length]);
    const maxDay = Math.max(1, ...days.map(x => x[1]));
    return head + `<div class="chips">${[7, 30, 90].map(n => `<button class="chip-btn ${soDays === n ? 'on' : ''}" data-act="so_days" data-n="${n}">${esc(t('last_n_days', { n }))}</button>`).join('')}</div>
      <div class="stats"><span><b>${recs.length}</b>${esc(t('records'))}</span><span><b>${recs.filter(x => x.status === 'open').length}</b>${esc(t('open'))}</span><span><b>${recs.filter(x => x.kind === 'complaint').length}</b>${esc(t('gk_complaint'))}</span><span><b>${fb.length}</b>${esc(t('guest_feedback'))}</span><span><b>${favg}</b>${esc(t('feedback_average'))}</span></div>
      <div class="cols"><section class="card"><h2>${esc(t('feedback_by_department'))}</h2>${depAvg.length ? `<div class="bars">${depAvg.map(([k, v]) => `<div><span>${esc(k)}</span><i style="width:${Math.round(20 * v)}%"></i><b>${v}</b></div>`).join('')}</div>` : empty(t('no_feedback'))}</section>
      <section class="card"><h2>${esc(t('kind'))}</h2>${bars(kinds, recs.length)}</section><section class="card"><h2>${esc(t('departments'))}</h2>${bars(depCount, recs.length)}</section><section class="card"><h2>${esc(t('rooms_most'))}</h2>${bars(rooms, rooms[0]?.[1])}</section></div>
      <section class="card"><h2>${esc(t('per_day'))}</h2><div class="spark">${days.map(([d, v]) => `<i style="height:${Math.round(100 * v / maxDay)}%" title="${esc(d + ': ' + v)}"></i>`).join('')}</div></section>
      ${recs.filter(x => x.status === 'open' && x.kind === 'complaint').length ? `<section><h2>${esc(t('open_complaints'))}</h2><div class="list">${recs.filter(x => x.status === 'open' && x.kind === 'complaint').map(gsRow).join('')}</div></section>` : ''}`;
  }
});
ACT.so_days = el => { soDays = +el.dataset.n; route(); };

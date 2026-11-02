'use strict';
/* AUREA · pages/day-plan.js — Day plan: the team's week (status grid), the week pattern, the daily standards, print.
   Uses: core/state · translations/languages · supabase · core/utils · components/modals · core/actions · components/cards · core/router ·
         components/tables · systems/exports · systems/team-schedule */
/* ---------- Day Plan: status grid, week pattern, daily standards ---------- */
let dpWeek = null;
page('dayplan', {
  perm: 'm_dayplan', icon: 'layout', group: 'manage',
  render: async arg => {
    const tab = ['week', 'pattern', 'standards'].includes(arg) ? arg : 'week';
    const head = tabs('dayplan', [['week', t('week_plan')], ['pattern', t('week_pattern')], ['standards', t('daily_standards')]], tab);
    if (tab === 'standards') return head + await crudList('std', {
      entity: 'daily_standards', intro: t('standards_intro'),
      fields: () => [{ k: 'time', type: 'time', label: t('time'), req: true }, { k: 'label', label: t('name'), req: true }, { k: 'team_id', type: 'select', label: t('team'), num: true, options: teamOpts(t('whole_hotel')) }, { k: 'label_i18n', type: 'i18n', label: t('name_translations') }],
      defaults: () => ({ team_id: S.team?.id }), row: r => `<time>${esc(hm(r.time))}</time> <b>${esc(r.label)}</b> ${r.team_id ? '' : chip(t('whole_hotel'))}`
    })();
    if (!S.team) return head + empty(t('no_team_selected'));
    const today = D.today(); dpWeek = dpWeek || D.add(today, -D.wd(today));
    if (tab === 'pattern') {
      const b = await board(dpWeek, D.add(dpWeek, 6));
      const pat = (sid, w) => b.pattern.find(p => p.staff_id === sid && p.weekday === w) || {};
      const val = p => p.day_off ? 'off' : (p.entrance && p.practice ? 'ep' : p.entrance ? 'e' : p.practice ? 'p' : '');
      const wk = w => b.week.find(x => x.weekday === w) || {};
      const dws = (await list('day_info', { _limit: 500 })).filter(x => x.weekday != null); const dw = w => dws.find(x => x.weekday === w) || {};
      return head + `<p class="muted">${esc(t('pattern_intro'))}</p><div class="tablewrap"><table class="grid"><thead><tr><th>${esc(t('staff'))}</th>${[0, 1, 2, 3, 4, 5, 6].map(w => `<th>${esc(D.wdName(w, 'short'))}</th>`).join('')}</tr></thead><tbody>
        ${b.staff.filter(s => !s.is_manager).map(s => `<tr><th>${esc(s.display_name)}${s.staff_number ? ' #' + s.staff_number : ''}</th>${[0, 1, 2, 3, 4, 5, 6].map(w => `<td><select data-pat="${s.id}" data-w="${w}" aria-label="${esc(s.display_name + ' ' + D.wdName(w))}">
          ${[['', '·'], ['off', t('st_day_off')], ['e', t('entrance')], ['p', t('practice')], ['ep', t('entrance') + '+' + t('practice')]].map(([v, l]) => `<option value="${v}" ${val(pat(s.id, w)) === v ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></td>`).join('')}</tr>`).join('')}
        <tr class="hotel-row"><th>${esc(t('day_name'))}<small>${esc(t('whole_hotel'))}</small></th>${[0, 1, 2, 3, 4, 5, 6].map(w => `<td><input data-di="day_name" data-w="${w}" value="${esc(dw(w).day_name || '')}" aria-label="${esc(t('day_name'))}"></td>`).join('')}</tr>
        <tr class="hotel-row"><th>${esc(t('restaurant_theme'))}<small>${esc(t('whole_hotel'))}</small></th>${[0, 1, 2, 3, 4, 5, 6].map(w => `<td><input data-di="restaurant_theme" data-w="${w}" value="${esc(dw(w).restaurant_theme || '')}" aria-label="${esc(t('restaurant_theme'))}"></td>`).join('')}</tr>
        <tr><th>${esc(t('dress_code'))}</th>${[0, 1, 2, 3, 4, 5, 6].map(w => `<td><input data-wk="dress_code" data-w="${w}" value="${esc(wk(w).dress_code || '')}" aria-label="${esc(t('dress_code'))}"></td>`).join('')}</tr>
        <tr><th>${esc(t('notes'))}</th>${[0, 1, 2, 3, 4, 5, 6].map(w => `<td><input data-wk="notes" data-w="${w}" value="${esc(wk(w).notes || '')}" aria-label="${esc(t('notes'))}"></td>`).join('')}</tr>
        </tbody></table></div><p><button class="btn" data-act="pat_save">${esc(t('save'))}</button></p>`;
    }
    const days = D.range(dpWeek, 7);
    const b = await board(dpWeek, D.add(dpWeek, 6));
    const warn = [];
    b.items.filter(i => i.status === 'scheduled').forEach(i => i.staff.forEach(s => { const st = statusOf(b, s.staff_id, i.date); if (st && st.status !== 'working') warn.push(t('att_assigned_off', { name: s.name, item: itemName(i), status: statusLabel(st.status), day: D.short(i.date) })); }));
    const ab = { working: '✓', day_off: t('ab_off'), vacation: t('ab_vac'), absent: t('ab_abs'), sick: t('ab_sick') };
    return head + `<div class="row"><button class="btn ghost small" data-act="dp_week" data-n="-7">‹</button><b>${esc(D.dm(dpWeek))} – ${esc(D.dm(D.add(dpWeek, 6)))}</b><button class="btn ghost small" data-act="dp_week" data-n="7">›</button><span class="grow"></span><button class="btn ghost small" data-act="dp_print">${esc(t('print_pdf'))}</button></div>
      ${warn.length ? `<div class="list attention">${warn.map(w => `<div class="li bad">${esc(w)}</div>`).join('')}</div>` : ''}
      <div class="tablewrap"><table class="grid status-grid"><thead><tr><th></th>${days.map(d => `<th class="${d === today ? 'today' : ''}"><button class="link" data-act="dp_plan" data-date="${d}">${esc(D.fmt(d, { weekday: 'short', day: 'numeric' }))}</button><small>${esc(dayName(dayOf(b.days, d)))}</small></th>`).join('')}</tr></thead>
      <tbody>${b.staff.filter(s => !s.is_manager).map(s => `<tr><th>${esc(s.display_name)}${s.staff_number ? ' #' + s.staff_number : ''}</th>${days.map(d => { const st = statusOf(b, s.id, d); return `<td class="st-${st?.status || 'none'} ${st?.source === 'set' ? 'set' : ''}"><button data-act="dp_cell" data-s="${s.id}" data-d="${d}" aria-label="${esc(s.display_name + ' ' + D.short(d))}">${st ? esc(ab[st.status]) : '–'}${st?.entrance ? `<i>E ${esc(st.entrance_at || '')}</i>` : ''}${st?.practice ? '<i>P</i>' : ''}</button></td>`; }).join('')}</tr>`).join('')}</tbody></table></div>
      <p class="muted small">${esc(t('grid_legend'))}</p>`;
  },
  mount: () => {}
});
ACT.dp_week = el => { dpWeek = D.add(dpWeek, +el.dataset.n); route(); };
ACT.pat_save = async () => {
  const staffRows = $$('[data-pat]').map(s => ({ staff_id: +s.dataset.pat, weekday: +s.dataset.w, day_off: s.value === 'off', entrance: s.value === 'e' || s.value === 'ep', practice: s.value === 'p' || s.value === 'ep' })).filter(r => r.day_off || r.entrance || r.practice);
  const teamRows = [0, 1, 2, 3, 4, 5, 6].map(w => { const r = { weekday: w }; $$(`[data-wk][data-w="${w}"]`).forEach(i => { r[i.dataset.wk] = i.value.trim(); }); return r; }).filter(r => r.dress_code || r.notes);
  const dayRows = [0, 1, 2, 3, 4, 5, 6].map(w => ({ weekday: w, day_name: $(`[data-di="day_name"][data-w="${w}"]`).value.trim(), restaurant_theme: $(`[data-di="restaurant_theme"][data-w="${w}"]`).value.trim() }));
  await api('week_pattern_save', { p_team_rows: teamRows, p_staff_rows: staffRows });
  const dws = (await list('day_info', { _limit: 500 })).filter(x => x.weekday != null);
  for (const v of dayRows) {                                   // the hotel's day names: one row per weekday
    const old = dws.find(x => x.weekday === v.weekday);
    if (!v.day_name && !v.restaurant_theme) { if (old) await del('day_info', old.id); }
    else if (!old || (old.day_name || '') !== v.day_name || (old.restaurant_theme || '') !== v.restaurant_theme) await save('day_info', Object.assign(old ? { id: old.id } : { weekday: v.weekday }, v));
  }
  toast(t('saved')); route();
};
ACT.dp_print = async () => {
  const days = D.range(dpWeek, 7); const b = await board(dpWeek, D.add(dpWeek, 6));
  const cell = (sid, d) => { const s = statusOf(b, sid, d); return s ? statusLabel(s.status) + (s.entrance ? ' · ' + entranceLabel(s) : '') + (s.practice ? ' · ' + t('practice') : '') : ''; };
  printSheet(t('week_plan'),
    tableHtml([t('staff')].concat(days.map(d => D.short(d))), b.staff.filter(s => !s.is_manager).map(s => [s.display_name].concat(days.map(d => cell(s.id, d)))))
    + tableHtml([t('date'), t('day_name'), t('restaurant_theme'), t('dress_code'), t('notes')], b.plans.map(p => { const di = dayOf(b.days, p.date); return [D.short(p.date), dayName(di), restName(di), p.dress_code || '', p.notes || '']; })), { sub: D.span(dpWeek, D.add(dpWeek, 6)) });
};

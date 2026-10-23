'use strict';
/* AUREA · pages/program.js — Programme: the page and its tabs (by date, Week overview, weekly programme, categories) and an item's detail page.
   Uses: core/state · translations/languages · supabase · core/utils · icons/icons · core/permissions · core/actions · components/cards ·
         core/auth · core/router · components/tables · systems/team-schedule · systems/assignment-system · systems/program-engine ·
         pages/weekly-overview */
/* item detail for staff (who works, bookings count, my role) */
page('item', {
  perm: 'programme_view,m_program', hidden: true, title: 'details',
  render: async arg => {
    const its = await list('program_items', { id: +arg });
    const it = its[0]; if (!it) return empty(t('not_found'));
    const b = await board(it.date, it.date); const full = b.items.find(x => x.id === it.id) || it;
    return `<div class="card"><h2>${esc(itemName(it))}</h2><p class="meta">${chip(typeLabel(it.type), 'ty-' + it.type)} ${esc(D.long(it.date))} · ${esc(hm(it.start_time))}${it.end_time ? '–' + esc(hm(it.end_time)) : ''}${it.location ? ' · ' + esc(it.location) : ''}</p>
      ${itemDesc(it) ? `<p class="prose">${nl2br(itemDesc(it))}</p>` : ''}
      <p>${esc(t('asg_rule'))}: ${esc(asgRuleText(it))}</p>${it.staff_needed > 0 || (full.staff || []).length ? `<p>${esc(t('staff'))}: ${(full.staff || []).map(s => esc(s.name)).join(', ') || esc(t('nobody_yet'))}${it.staff_needed > 0 ? ` (${(full.staff || []).length}/${it.staff_needed})` : ''}</p>` : ''}
      ${it.booking_required ? `<p>${esc(t('booked'))}: ${full.booked || 0}${it.capacity ? ' / ' + it.capacity : ''}</p>` : ''}
      <div class="actions">${can('m_program') ? `<button class="btn ghost" data-act="pi_edit" data-id="${it.id}">${esc(t('edit'))}</button>` : ''}${can('m_planner') ? `<a class="btn ghost" href="#/planner">${esc(t('pg_planner'))}</a>` : ''}</div></div>`;
  }
});

/* ---------- Programme (view for staff; full editing for m_program) ---------- */
let pDay = null, pType = 'all', pCancelled = false;
page('programme', {
  perm: 'programme_view,m_program', icon: 'list', group: 'programme',
  render: async arg => {
    if (arg === 'overview' && can('m_program')) return weekOverview();
    if (arg === 'weekly' && can('m_program')) return weeklyTemplates();
    if (arg === 'cats' && can('m_program')) return progTabs('cats') + await crudList('cats', {
      entity: 'activity_categories', intro: t('categories_intro'), sortable: true,
      fields: () => [{ k: 'name', label: t('name'), req: true }, { k: 'active', type: 'bool', label: t('active'), def: true }, { k: 'name_i18n', type: 'i18n', label: t('name_translations') }],
      row: r => `${ico('tag')} <b>${esc(catName(r))}</b> ${r.active ? '' : chip(t('inactive'))}`, after: async () => { await loadMe(); }
    })();
    const today = D.today(); pDay = pDay || today;
    const from = D.add(pDay, -D.wd(pDay)), to = D.add(from, 13);
    const b = await board(from, to);
    const types = visibleTypes();
    const dayAll = b.items.filter(i => i.date === pDay && types.includes(i.type) && (pType === 'all' || i.type === pType));
    const nCancel = dayAll.filter(i => i.status === 'cancelled').length;
    const its = dayAll.filter(i => pCancelled || i.status !== 'cancelled');
    const di = dayOf(b.days, pDay);
    return `${progTabs('day')}
      <div class="row"><button class="btn ghost small" data-act="p_week" data-n="-7">‹ ${esc(t('week'))}</button><button class="btn ghost small" data-act="p_today">${esc(t('today'))}</button><button class="btn ghost small" data-act="p_week" data-n="7">${esc(t('week'))} ›</button><span class="grow"></span>
        <button class="btn ghost small" data-act="p_print" data-from="${from}">${esc(t('print_pdf'))}</button>${can('m_program') ? `<button class="btn small" data-act="pi_new" data-date="${pDay}">${ico('plus')} ${esc(t('add_prog'))}</button>` : ''}</div>
      ${dayStrip(pDay, from, 14, 'p_day')}
      ${dayName(di) || restName(di) ? `<div class="day-line">${dayName(di) ? `<b>${esc(dayName(di))}</b>` : ''}${restName(di) ? `<span>${ico('dish')} ${esc(restName(di))}</span>` : ''}</div>` : ''}
      ${can('m_program') && nCancel ? `<p><button class="chip-btn ${pCancelled ? 'on' : ''}" data-act="p_cancelled">${esc(t('show_cancelled', { n: nCancel }))}</button></p>` : ''}
      <div class="chips">${['all'].concat(types).map(ty => `<button class="chip-btn ${pType === ty ? 'on' : ''}" data-act="p_type" data-ty="${ty}">${esc(ty === 'all' ? t('all') : typeLabel(ty))}</button>`).join('')}</div>
      ${its.length ? `<div class="items">${its.map(i => itemRow(i, 'item') ).join('')}</div>` : empty(t('no_items_day'), can('m_program') ? `<a class="btn ghost" href="#/programme/weekly">${esc(t('weekly_programme'))}</a>` : '')}`;
  },
  mount: (view, arg) => { if (arg === 'overview') wvMount(view); }
});
ACT.p_day = el => { pDay = el.dataset.date; route(); };
ACT.p_cancelled = () => { pCancelled = !pCancelled; route(); };
ACT.p_type = el => { pType = el.dataset.ty; route(); };
ACT.p_week = el => { pDay = D.add(pDay || D.today(), +el.dataset.n); route(); };
ACT.p_today = () => { pDay = D.today(); route(); };
// the programme of a week on paper: the ONE weekly print (the same as the Week overview's)
ACT.p_print = el => weekPdfAsk(el.dataset.from, {});
/* Weekly programme: the series themselves (every page shows their dates). Ended series are kept apart; a paused one is dimmed. */
async function weeklyTemplates() {
  const rows = await list('program_templates'), today = D.today(), ended = rows.filter(x => x.valid_to && x.valid_to < today), live = rows.filter(x => !ended.includes(x));
  const card = x => `<button class="item t-${esc(x.type)} ${x.active ? '' : 'cancelled'}" data-act="pt_edit" data-id="${x.id}"><time>${esc(hm(x.start_time))}${x.end_time ? `<small>${esc(hm(x.end_time))}</small>` : ''}</time><div><b>${esc(tx(x.name_i18n, x.name))}</b><span class="meta"><span class="ty-badge">${ico(TYPE_ICONS[x.type] || 'sun')}${esc(typeLabel(x.type))}</span> ${chip(ruleText(x))} ${esc(x.location || '')} · ${esc(asgRuleText(x))}${x.team_id ? ' · ' + esc(S.teams.find(z => z.id === x.team_id)?.name || '') : ''}${x.active ? '' : ' · ' + esc(t('paused'))}${x.guest_visible === false ? ' · ' + esc(t('staff_only')) : ''}</span></div></button>`;
  return progTabs('weekly') +
    `<p class="row"><span class="muted">${esc(t('weekly_intro2'))}</span><span class="grow"></span><button class="btn ghost small" data-act="pc_check">${ico('search')} ${esc(t('pc_title'))}</button><button class="btn small" data-act="pt_new">${ico('plus')} ${esc(t('add_weekly'))}</button></p>` +
    [0, 1, 2, 3, 4, 5, 6].map(w => { const r = live.filter(x => (x.weekdays || []).includes(w)).sort((a, b) => String(a.start_time).localeCompare(String(b.start_time))); return `<section><h2>${esc(D.wdName(w))}</h2>${r.length ? `<div class="items">${r.map(card).join('')}</div>` : `<p class="muted">—</p>`}</section>`; }).join('')
    + (ended.length ? `<details class="archived"><summary>${esc(t('series_ended', { n: ended.length }))}</summary><div class="items">${ended.map(card).join('')}</div></details>` : '');
}

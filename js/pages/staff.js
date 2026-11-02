'use strict';
/* AUREA · pages/staff.js — Staff management: staff, teams, roles & permissions, skills, numbers, preview a person's app.
   Uses: core/state · translations/languages · supabase · core/utils · core/permissions · components/modals · core/actions ·
         components/cards · core/auth · core/router · components/forms · components/tables · components/navigation · systems/exports ·
         systems/team-schedule */
/* ---------- Staff management: staff, teams, roles & permissions, skills, numbers ---------- */
let saTeam = '', saQ = '';
page('staffadmin', {
  perm: 'm_staff,m_roles,m_teams', icon: 'id', group: 'admin',
  render: async arg => {
    const T = [can('m_staff') && ['staff', t('staff')], can('m_teams') && ['teams', t('teams')], can('m_roles') && ['roles', t('roles_permissions')], can('m_staff') && ['skills', t('skills')], can('m_staff') && ['numbers', t('staff_numbers')]].filter(Boolean);
    const tab = T.some(x => x[0] === arg) ? arg : T[0][0];
    const head = tabs('staffadmin', T, tab);
    if (tab === 'teams') return head + await crudList('teams', {
      entity: 'teams', sortable: true, intro: t('teams_intro'),
      fields: () => [{ k: 'name', label: t('name'), req: true }, { k: 'status', type: 'select', label: t('status'), options: [['active', t('active')], ['inactive', t('inactive')]] }, { k: 'color', type: 'color', label: t('color') },
        { type: 'section', label: t('entrance'), hint: t('entrance_hint') },
        { k: 'leave_op_time', type: 'time', label: t('leave_op_at'), hint: t('time_default_hotel', { x: hm(S.settings.leave_op_time) }) },
        { k: 'entrance_time', type: 'time', label: t('entrance_at'), hint: t('time_default_hotel', { x: hm(S.settings.entrance_time) }) }],
      row: r => `<b>${esc(r.name)}</b> ${r.status === 'inactive' ? chip(t('inactive')) : ''}`
    })();
    if (tab === 'skills') return head + await crudList('skills', {
      entity: 'skills', sortable: true, fields: () => [{ k: 'name', label: t('name'), req: true }, { k: 'category', label: t('category') }],
      row: r => `<b>${esc(r.name)}</b> <small class="muted">${esc(r.category || '')}</small>`
    })();
    if (tab === 'numbers') {
      const { used } = await api('mgr_used_numbers'); const m = new Map(used.map(u => [u.n, u]));
      // (a number taken in another hotel shows that hotel, not its person)
      return head + `<p class="muted">${esc(t('numbers_intro'))}</p><div class="numgrid big">${Array.from({ length: 50 }, (_, i) => i + 1).map(n => { const u = m.get(n); return `<span class="${u ? 'used' : ''}" title="${esc(u ? [u.name, u.hotel].filter(Boolean).join(' · ') : t('free'))}"><b>${n}</b><small>${esc(u ? u.name || u.hotel : t('free'))}</small></span>`; }).join('')}</div>`;
    }
    if (tab === 'roles') {
      const j = await api('roles_list'); rolesCache = j;
      return head + `<p class="row"><span class="muted grow">${esc(t('roles_intro'))}</span><button class="btn small" data-act="role_new">${esc(t('add_role'))}</button></p><div class="list">${j.roles.map(r => `<button class="li row" data-act="role_edit" data-id="${r.id}"><b>${esc(r.name)}</b><span class="grow"></span><small class="muted">${r.staff} ${esc(t('people'))}${r.in_use > r.staff ? ' · ' + esc(t('role_in_use_more', { n: r.in_use - r.staff })) : ''}</small>${r.is_manager ? chip(t('all_permissions'), 'ok') : chip(Object.values(r.perms).filter(Boolean).length + ' ' + t('permissions'))}</button>`).join('')}</div>`;
    }
    const j = await api('mgr_staff_list', { p_all_teams: true }); staffCache = j.staff;
    const rows = j.staff.filter(s => (!saTeam || String(s.team_id) === saTeam) && (!saQ || (s.display_name + ' ' + s.username + ' ' + (s.staff_number || '')).toLowerCase().includes(saQ.toLowerCase())));
    return head + `<div class="filters"><select data-saf="team"><option value="">${esc(t('all_teams'))}</option>${S.teams.map(x => `<option value="${x.id}" ${saTeam === String(x.id) ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select>
      <input type="search" data-saf="q" value="${esc(saQ)}" placeholder="${esc(t('search'))}"><span class="grow"></span><button class="btn ghost small" data-act="sa_xlsx">${esc(t('excel'))}</button><button class="btn small" data-act="sa_new">${esc(t('add_staff'))}</button></div>
      ${rows.length ? `<div class="list">${rows.map(s => `<button class="li row ${s.status !== 'active' ? 'dim' : ''}" data-act="sa_edit" data-id="${s.id}">${avatar(s.photo_url, s.display_name, 'xs')}<span><b>${esc(s.display_name)}</b>${s.staff_number ? ' #' + s.staff_number : ''}<small class="muted"> ${esc(s.role_name)} · ${esc(s.team_name || t('no_team'))}</small></span><span class="grow"></span>${s.status !== 'active' ? chip(t('ss_' + s.status)) : ''}${Object.keys(s.overrides || {}).length ? chip(t('custom_permissions')) : ''}</button>`).join('')}</div>` : empty(t('no_staff'))}`;
  },
  mount: () => { $$('[data-saf]').forEach(el => { el.onchange = () => { if (el.dataset.saf === 'team') saTeam = el.value; else saQ = el.value; route(); }; }); }
});
let staffCache = [], rolesCache = null;
function staffFields(s) {
  return [{ k: 'display_name', label: t('name'), req: true }, { k: 'username', label: t('username'), req: true, hint: t('username_hint') },
    { k: 'password', type: 'password', label: s.id ? t('password_reset') : t('password'), req: !s.id, hint: t('password_hint'), ac: 'new-password' },
    { k: 'staff_number', type: 'number', label: t('staff_number'), min: 1, max: 50, hint: t('staff_number_hint') },
    can('all_hotels') && S.hotels.length > 1 && { k: 'hotel_id', type: 'select', label: t('hotel'), num: true, options: S.hotels.map(h => [h.id, h.name]) },
    { k: 'team_id', type: 'select', label: t('team'), num: true, options: teamOpts(t('no_team')) },
    { k: 'role_id', type: 'select', label: t('role'), num: true, options: S.roles.filter(r => !r.is_manager || S.me.is_manager).map(r => [r.id, r.name]) },
    { k: 'gender', type: 'select', label: t('gender'), options: [['', '—'], ['male', t('male')], ['female', t('female')]] },
    { k: 'nationality', type: 'country', label: t('nationality') }, { k: 'phone', type: 'phone', country: 'nationality', label: t('phone') }, { k: 'email', type: 'email', label: t('email') },
    { k: 'photo_url', type: 'image', label: t('photo') }, { k: 'bio', type: 'textarea', label: t('about_me'), rows: 2 },
    { k: 'status', type: 'select', label: t('status'), options: ['active', 'inactive', 'left'].map(x => [x, t('ss_' + x)]) },
    { k: 'start_date', type: 'date', label: t('start_date') }, { k: 'end_date', type: 'date', label: t('end_date') }].filter(Boolean);
}
async function staffEdit(s) {
  if (!rolesCache) rolesCache = await api('roles_list');
  const f = staffFields(s);
  const skillsHtml = S.skills.length ? `<details class="field" open><summary>${esc(t('skills'))}</summary>${S.skills.map(k => { const have = (s.skills || []).find(x => x.skill_id === k.id); return `<div class="row-mini"><label><input type="checkbox" data-skill="${k.id}" ${have ? 'checked' : ''}> ${esc(k.name)}</label><select data-level="${k.id}" aria-label="${esc(t('level'))}">${[1, 2, 3].map(l => `<option value="${l}" ${(have?.level || 2) === l ? 'selected' : ''}>${esc(t('level_' + l))}</option>`).join('')}</select></div>`; }).join('')}</details>` : '';
  const ov = s.overrides || {};
  const permHtml = `<details class="field"><summary>${esc(t('custom_permissions'))}</summary><p class="muted small">${esc(t('overrides_intro'))}</p>${rolesCache.catalog.map(p => `<div class="row-mini"><span>${esc(t('perm_' + p.key))}</span><select data-ov="${p.key}"><option value="">${esc(t('role_default'))}</option><option value="1" ${ov[p.key] === true ? 'selected' : ''}>${esc(t('allow'))}</option><option value="0" ${ov[p.key] === false ? 'selected' : ''}>${esc(t('deny'))}</option></select></div>`).join('')}</details>`;
  const used = (await api('mgr_used_numbers')).used.filter(u => u.id !== s.id).map(u => u.n);
  modal(s.id ? s.display_name : t('add_staff'), formHtml(f, Object.assign({ status: 'active', role_id: S.roles.find(r => !r.is_manager)?.id, team_id: S.team?.id, hotel_id: S.hotel.id }, s))
    + `<p class="muted small">${esc(t('used_numbers'))}: ${used.join(', ') || '—'}</p>` + skillsHtml + permHtml, {
    mount: root => wireForm(root),
    extra: s.id ? `<button class="btn ghost" data-act="sa_preview" data-id="${s.id}">${esc(t('preview_staff_app'))}</button>` : '',
    danger: s.id && s.id !== S.me.id ? async () => { const j = await api('mgr_staff_delete', { p_id: s.id }); toast(j.archived ? t('staff_archived') : t('deleted'), j.archived ? 'warn' : 'ok'); route(); } : null, dangerAsk: t('delete_staff_q'),
    save: async root => {
      const r = readForm(root, f); const pw = r.password; delete r.password;
      const skills = $$('[data-skill]', root).filter(c => c.checked).map(c => ({ skill_id: +c.dataset.skill, level: +$(`[data-level="${c.dataset.skill}"]`, root).value }));
      const overrides = {}; $$('[data-ov]', root).forEach(x => { if (x.value !== '') overrides[x.dataset.ov] = x.value === '1'; });
      await api('mgr_staff_save', { p_row: Object.assign(s.id ? { id: s.id } : {}, r), p_password: pw || null, p_skills: skills, p_overrides: overrides });
      toast(t('saved')); route();
    }
  });
}
ACT.sa_new = () => staffEdit({});
ACT.sa_edit = el => staffEdit(staffCache.find(s => s.id === +el.dataset.id));
ACT.sa_preview = async el => {
  const j = await api('mgr_preview', { p_staff_id: +el.dataset.id });
  closeModals();
  S.preview = { me: j.me, perms: j.perms }; renderShell(); location.hash = '#/' + homeKey(); route();
};
ACT.sa_xlsx = () => exportXlsx('staff-' + (S.hotel?.name || ''), { [t('staff')]: staffCache.map(s => ({ [t('staff_number')]: s.staff_number || '', [t('name')]: s.display_name, [t('username')]: s.username, [t('role')]: s.role_name, [t('team')]: s.team_name || '', [t('gender')]: s.gender ? t(s.gender) : '', [t('nationality')]: s.nationality || '', [t('phone')]: s.phone || '', [t('status')]: t('ss_' + s.status) })) });
function roleEdit(r) {
  const groups = uniq(rolesCache.catalog.map(p => p.grp));
  modal(r.id ? r.name : t('add_role'), formHtml([{ k: 'name', label: t('name'), req: true }], r)
    + (r.is_manager ? `<p class="muted">${esc(t('manager_all'))}</p>` : groups.map(g => `<fieldset class="perm-group"><legend>${esc(t('pgrp_' + g))}</legend>${rolesCache.catalog.filter(p => p.grp === g).map(p => `<label class="row-mini"><input type="checkbox" data-perm="${p.key}" ${r.perms?.[p.key] ? 'checked' : ''}> ${esc(t('perm_' + p.key))}</label>`).join('')}</fieldset>`).join('')), {
    wide: true,
    danger: r.id && !r.is_system ? async () => { await api('mgr_role_delete', { p_id: r.id }); route(); } : null,
    save: async root => {
      const row = readForm(root, [{ k: 'name', req: true, label: t('name') }]);
      const perms = {}; $$('[data-perm]', root).forEach(c => { perms[c.dataset.perm] = c.checked; });
      await api('mgr_role_save', { p_row: Object.assign(r.id ? { id: r.id } : {}, row), p_perms: r.is_manager ? null : perms });
      await loadMe(); toast(t('saved')); route();
    }
  });
}
ACT.role_new = () => roleEdit({ perms: { myday: true, programme_view: true } });
ACT.role_edit = el => roleEdit(rolesCache.roles.find(r => r.id === +el.dataset.id));

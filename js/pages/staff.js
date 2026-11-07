'use strict';
/* Mr Hassan · pages/staff.js — Staff management: staff, teams, roles & permissions, skills, numbers, preview a person's app.
   Uses: core/state · translations/languages · supabase · core/utils · icons/icons · core/permissions · components/modals · core/actions ·
         components/cards · core/auth · core/router · components/forms · components/tables · components/navigation · systems/exports ·
         systems/team-schedule · systems/lifecycle */
/* ---------- Staff management: staff, teams, roles & permissions, skills, numbers ---------- */
let saTeam = '', saQ = '';
page('staffadmin', {
  perm: 'm_staff,m_roles,m_teams', icon: 'id', group: 'staff',
  links: [{ arg: 'roles', icon: 'shield', title: 'roles_permissions', perm: 'm_roles' }, { arg: 'teams', group: 'settings', icon: 'users', title: 'teams', perm: 'm_teams' }],
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
      return head + `<p class="muted">${esc(t('roles_intro'))}</p>${pgActions(`<button class="btn" data-act="role_new">${ico('plus')} ${esc(t('add_role'))}</button>`)}<div class="list">${j.roles.map(r => `<button class="li row" data-act="role_edit" data-id="${r.id}"><b>${esc(r.name)}</b><span class="grow"></span><small class="muted">${r.staff} ${esc(t('people'))}${r.in_use > r.staff ? ' · ' + esc(t('role_in_use_more', { n: r.in_use - r.staff })) : ''}</small>${r.is_manager ? chip(t('all_permissions'), 'ok') : chip(Object.values(r.perms).filter(Boolean).length + ' ' + t('permissions'))}</button>`).join('')}</div>`;
    }
    const j = await api('mgr_staff_list', { p_all_teams: true }); staffCache = j.staff;
    const all = j.staff.filter(s => (!saTeam || String(s.team_id) === saTeam) && (!saQ || (s.display_name + ' ' + (s.username || '') + ' ' + (s.staff_number || '')).toLowerCase().includes(saQ.toLowerCase())));
    // (10.9) a deleted profile (its history kept) is no longer one of the people: shown apart, only for its history
    const rows = all.filter(s => !s.deleted_at), gone = all.filter(s => s.deleted_at);
    return head + `<div class="filters"><select data-saf="team"><option value="">${esc(t('all_teams'))}</option>${S.teams.map(x => `<option value="${x.id}" ${saTeam === String(x.id) ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select>
      <input type="search" data-saf="q" value="${esc(saQ)}" placeholder="${esc(t('search'))}"></div>${pgActions(`<button class="btn" data-act="sa_new">${ico('plus')} ${esc(t('add_staff'))}</button>` + moreMenu(`<button data-act="sa_xlsx">${ico('download')} ${esc(t('excel'))}</button>`))}
      ${rows.length ? `<div class="list">${rows.map(s => `<button class="li row ${s.status !== 'active' ? 'dim' : ''}" data-act="sa_edit" data-id="${s.id}">${avatar(s.photo_url, s.display_name, 'xs')}<span><b>${esc(s.display_name)}</b>${s.staff_number ? ' #' + s.staff_number : ''}<small class="muted"> ${esc(s.role_name)} · ${esc(s.team_name || t('no_team'))}</small></span><span class="grow"></span>${s.status !== 'active' ? chip(t('ss_' + s.status)) : ''}${!s.has_login ? chip(t('att_only_person')) : s.app_access === false ? chip(t('att_no_app')) : ''}${s.end_date && s.status === 'active' ? chip(t('att_until', { date: D.dm(s.end_date) })) : ''}${Object.keys(s.overrides || {}).length ? chip(t('custom_permissions')) : ''}</button>`).join('')}</div>` : empty(t('no_staff'))}
      ${gone.length ? `<details class="card"><summary>${esc(t('lf_deleted_people', { n: gone.length }))}</summary><p class="muted small">${esc(t('lf_deleted_people_hint'))}</p><div class="list">${gone.map(s => `<button class="li row dim" data-act="sa_life" data-id="${s.id}"><span><b>${esc(s.display_name)}</b>${s.staff_number ? ' #' + s.staff_number : ''}<small class="muted"> ${esc(s.role_name)} · ${esc(s.team_name || t('no_team'))}</small></span><span class="grow"></span>${chip(t('lf_profile_deleted'))}</button>`).join('')}</div></details>` : ''}`;
  },
  mount: () => { $$('[data-saf]').forEach(el => { el.onchange = () => { if (el.dataset.saf === 'team') saTeam = el.value; else saQ = el.value; route(); }; }); }
});
let staffCache = [], rolesCache = null;
/* ONE person record for every way someone works here: with the app (App access: username + password) or ATTENDANCE ONLY (no login –
   counted in attendance like everyone; App access can be given later, on the same record and its whole history). Employment: hiring
   date and end date – after the end date nobody is counted (never "absent forever"); Left / end date / no access never remove history */
function staffFields(s) {
  return [{ k: 'display_name', label: t('name'), req: true },
    { k: 'app_access', type: 'bool', label: t('att_app_access'), hint: t('att_app_access_hint'), def: true },
    { k: 'username', label: t('username'), hint: t('username_hint') },
    { k: 'password', type: 'password', label: s.has_login ? t('password_reset') : t('password'), hint: t('password_hint'), ac: 'new-password' },
    { k: 'staff_number', type: 'number', label: t('staff_number'), min: 1, max: 50, hint: t('staff_number_hint') },
    can('all_hotels') && S.hotels.length > 1 && { k: 'hotel_id', type: 'select', label: t('hotel'), num: true, options: S.hotels.map(h => [h.id, h.name]) },
    { k: 'team_id', type: 'select', label: t('team'), num: true, options: teamOpts(t('no_team')) },
    { k: 'role_id', type: 'select', label: t('role'), num: true, options: S.roles.filter(r => !r.is_manager || S.me.is_manager).map(r => [r.id, r.name]) },
    { k: 'gender', type: 'select', label: t('gender'), options: [['', '—'], ['male', t('male')], ['female', t('female')]] },
    { k: 'nationality', type: 'country', label: t('nationality') }, { k: 'phone', type: 'phone', country: 'nationality', label: t('phone') }, { k: 'email', type: 'email', label: t('email') },
    { k: 'photo_url', type: 'image', label: t('photo') }, { k: 'bio', type: 'textarea', label: t('about_me'), rows: 2 },
    { k: 'status', type: 'select', label: t('status'), options: ['active', 'inactive', 'left'].map(x => [x, t('ss_' + x)]) },
    { k: 'start_date', type: 'date', label: t('att_hiring') }, { k: 'end_date', type: 'date', label: t('att_end'), hint: t('att_end_hint') }].filter(Boolean);
}
async function staffEdit(s) {
  if (!rolesCache) rolesCache = await api('roles_list');
  const f = staffFields(s);
  const skillsHtml = S.skills.length ? `<details class="field" open><summary>${esc(t('skills'))}</summary>${S.skills.map(k => { const have = (s.skills || []).find(x => x.skill_id === k.id); return `<div class="row-mini"><label><input type="checkbox" data-skill="${k.id}" ${have ? 'checked' : ''}> ${esc(k.name)}</label><select data-level="${k.id}" aria-label="${esc(t('level'))}">${[1, 2, 3].map(l => `<option value="${l}" ${(have?.level || 2) === l ? 'selected' : ''}>${esc(t('level_' + l))}</option>`).join('')}</select></div>`; }).join('')}</details>` : '';
  const ov = s.overrides || {};
  const permHtml = `<details class="field"><summary>${esc(t('custom_permissions'))}</summary><p class="muted small">${esc(t('overrides_intro'))}</p>${rolesCache.catalog.map(p => `<div class="row-mini"><span>${esc(t('perm_' + p.key))}</span><select data-ov="${p.key}"><option value="">${esc(t('role_default'))}</option><option value="1" ${ov[p.key] === true ? 'selected' : ''}>${esc(t('allow'))}</option><option value="0" ${ov[p.key] === false ? 'selected' : ''}>${esc(t('deny'))}</option></select></div>`).join('')}</details>`;
  const used = (await api('mgr_used_numbers')).used.filter(u => u.id !== s.id).map(u => u.n);
  modal(s.id ? s.display_name : t('add_staff'), formHtml(f, Object.assign({ status: 'active', app_access: true, role_id: S.roles.find(r => !r.is_manager)?.id, team_id: S.team?.id, hotel_id: S.hotel.id }, s))
    + `<p class="muted small">${esc(t('used_numbers'))}: ${used.join(', ') || '—'}</p>` + skillsHtml + permHtml, {
    mount: root => {
      wireForm(root);
      // the login fields only with App access (an attendance-only person has none)
      const acc = $('[name=app_access]', root), sync = () => ['username', 'password'].forEach(k => { const b = $(`[name=${k}]`, root)?.closest('.field'); if (b) b.hidden = !acc.checked; });
      acc.addEventListener('change', sync); sync();
    },
    // (10.9) never one "Delete": the choices (deactivate, out of future work, out of attendance, delete a part, delete the profile …)
    extra: (s.id && s.id !== S.me.id && can('staff_deactivate,staff_delete,att_delete') ? `<button class="btn secondary danger" data-act="sa_life" data-id="${s.id}">${esc(t('lf_button'))}</button>` : '')
      + (s.id && s.has_login ? `<button class="btn secondary" data-act="sa_preview" data-id="${s.id}">${esc(t('preview_staff_app'))}</button>` : ''),
    save: async root => {
      const r = readForm(root, f); const pw = r.password; delete r.password;
      if (r.app_access && !(r.username || '').trim()) throw new ApiError('required', { field: t('username') });
      if (r.app_access && !s.has_login && !pw) throw new ApiError('required', { field: t('password') });
      if (!r.app_access && !(r.username || '').trim()) r.username = null;
      const skills = $$('[data-skill]', root).filter(c => c.checked).map(c => ({ skill_id: +c.dataset.skill, level: +$(`[data-level="${c.dataset.skill}"]`, root).value }));
      const overrides = {}; $$('[data-ov]', root).forEach(x => { if (x.value !== '') overrides[x.dataset.ov] = x.value === '1'; });
      await api('mgr_staff_save', { p_row: Object.assign(s.id ? { id: s.id } : {}, r), p_password: pw || null, p_skills: skills, p_overrides: overrides });
      toast(t('saved')); route();
    }
  });
}
ACT.sa_new = () => staffEdit({});
// a person's lifecycle: the one dialog (what changes, what goes, what stays – before anything happens)
ACT.sa_life = el => { closeModals(); lifeDialog('staff', +el.dataset.id); };
ACT.sa_edit = el => staffEdit(staffCache.find(s => s.id === +el.dataset.id));
ACT.sa_preview = async el => {
  const j = await api('mgr_preview', { p_staff_id: +el.dataset.id });
  closeModals();
  S.preview = { me: j.me, perms: j.perms }; renderShell(); location.hash = '#/' + homeKey(); route();
};
ACT.sa_xlsx = () => exportXlsx('staff-' + (S.hotel?.name || ''), { [t('staff')]: staffCache.map(s => ({ [t('staff_number')]: s.staff_number || '', [t('name')]: s.display_name, [t('username')]: s.username || '', [t('att_app_access')]: s.has_login && s.app_access !== false ? t('yes') : t('no'), [t('role')]: s.role_name, [t('team')]: s.team_name || '', [t('gender')]: s.gender ? t(s.gender) : '', [t('nationality')]: s.nationality || '', [t('phone')]: s.phone || '', [t('status')]: t('ss_' + s.status) })) });
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

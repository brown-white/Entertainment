'use strict';
/* AUREA · pages/tasks.js — staff page: Tasks.
   Uses: translations/languages · supabase · core/utils · icons/icons · core/permissions · core/actions · components/cards · core/router ·
         components/forms */
/* ---------- Tasks ---------- */
page('tasks', {
  perm: 'tasks,m_team', icon: 'tasks', group: 'team',
  render: async () => {
    const [rows, team] = await Promise.all([list('tasks', { _limit: 300 }), api('team_members')]);
    const nm = id => team.staff.find(x => x.id === id)?.display_name || t('whole_team');
    const me = meId();
    const groups = [['open', rows.filter(x => x.status === 'open')], ['accepted', rows.filter(x => x.status === 'accepted')], ['done', rows.filter(x => x.status === 'done')], ['checked', rows.filter(x => x.status === 'checked').slice(0, 20)]];
    return `${can('m_team') ? `<button class="btn" data-act="tk_new">${esc(t('new_task'))}</button>` : ''}` + groups.map(([g, r]) => r.length ? `<section><h2>${esc(t('ts_' + g))} (${r.length})</h2><div class="list">${r.map(x => `<div class="li">
      <b>${esc(x.title)}</b> ${x.repeat && x.repeat !== 'none' ? `<span class="chip">${ico('repeat')} ${esc(t('rp_' + x.repeat))}</span>` : ''} <small class="muted">${esc(nm(x.assigned_staff_id))}${x.due_date ? ' · ' + esc(D.dm(x.due_date)) : ''} · ${x.points} ${esc(t('points'))}</small>
      ${x.details ? `<p>${nl2br(x.details)}</p>` : ''}${x.staff_note ? `<p class="reply">${esc(x.staff_note)}</p>` : ''}${x.photo_url ? `<img class="thumb" src="${esc(x.photo_url)}" alt="" data-act="lightbox">` : ''}
      <div class="actions">${(x.status === 'open' && (!x.assigned_staff_id || x.assigned_staff_id === me) && can('tasks')) ? `<button class="btn small" data-act="tk_set" data-id="${x.id}" data-s="accepted">${esc(t('accept'))}</button>` : ''}
      ${(['open', 'accepted'].includes(x.status) && (!x.assigned_staff_id || x.assigned_staff_id === me) && can('tasks')) ? `<button class="btn ghost small" data-act="tk_done" data-id="${x.id}">${esc(t('mark_done'))}</button>` : ''}
      ${can('m_team') && x.status === 'done' ? `<button class="btn small" data-act="tk_set" data-id="${x.id}" data-s="checked">${esc(t('check_ok'))}</button><button class="btn ghost small" data-act="tk_set" data-id="${x.id}" data-s="open">${esc(t('send_back'))}</button>` : ''}
      ${can('m_team') ? `<button class="btn ghost small" data-act="tk_edit" data-id="${x.id}">${esc(t('edit'))}</button>` : ''}</div></div>`).join('')}</div></section>` : '').join('') || empty(t('no_tasks'));
  }
});
const taskFields = team => [{ k: 'title', label: t('title'), req: true }, { k: 'details', type: 'textarea', label: t('details'), rows: 3 }, { k: 'due_date', type: 'date', label: t('due_date') },
  { k: 'assigned_staff_id', type: 'select', label: t('assigned_to'), num: true, options: opts(team, 'id', 'display_name', t('whole_team')) }, { k: 'points', type: 'number', label: t('points'), def: 1, min: 0 },
  { k: 'repeat', type: 'select', label: t('repeat'), options: ['none', 'daily', 'weekly'].map(x => [x, t('rp_' + x)]), hint: t('repeat_hint') }];
ACT.tk_new = async () => { const team = (await api('team_members')).staff; editForm(t('new_task'), taskFields(team), {}, async r => { await save('tasks', r); route(); }); };
ACT.tk_edit = async el => { const [x] = await list('tasks', { id: +el.dataset.id }); const team = (await api('team_members')).staff; editForm(t('edit'), taskFields(team), x, async r => { await save('tasks', r); route(); }, { danger: async () => { await del('tasks', x.id); route(); } }); };
ACT.tk_set = async el => { await save('tasks', { id: +el.dataset.id, status: el.dataset.s }); route(); };
ACT.tk_done = el => editForm(t('mark_done'), [{ k: 'staff_note', type: 'textarea', label: t('note'), rows: 3 }, { k: 'photo_url', type: 'image', label: t('photo') }], {},
  async r => { await save('tasks', { id: +el.dataset.id, status: 'done', staff_note: r.staff_note, photo_url: r.photo_url }); route(); });

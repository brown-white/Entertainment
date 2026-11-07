'use strict';
/* Mr Hassan · pages/tasks.js — staff page: Tasks – MY tasks (given to me, to my role, to my whole team: accept → in progress → done),
   the TEAM's tasks (who does what, until when, done or late; check, send back, change) and my REMINDERS. One task system for everyone:
   the manager's meetings, the DJ's song for a birthday, the supervisor's setup, the team's daily jobs.
   Uses: translations/languages · core/utils · icons/icons · core/permissions · core/actions · components/cards · core/router ·
         systems/operations */
let tkShow = 'open', tkAll = false;
page('tasks', {
  perm: 'tasks,m_team,task_create,task_assign,reminders', icon: 'tasks', group: 'operations',
  links: [{ arg: 'reminders', icon: 'bell', title: 'reminders', perm: 'reminders' }],
  render: async arg => {
    const T = [can('tasks,task_create,task_assign') && ['mine', t('tk_mine')], can('task_assign,task_create,m_team') && ['team', t('tk_team')], can('reminders') && ['reminders', t('reminders')]].filter(Boolean);
    const tab = T.some(x => x[0] === arg) ? arg : T[0][0], head = tabs('tasks', T, tab);
    const add = can('task_create,task_assign') ? `<button class="btn small" data-act="tk_new">${ico('plus')} ${esc(t('new_task'))}</button>` : '';
    if (tab === 'reminders') return head + remSection(await remindersOf('mine'));
    if (tab === 'mine') {
      const rows = await tasksOf('mine', D.add(D.today(), -14), D.add(D.today(), 60)), open = rows.filter(x => ['open', 'accepted', 'in_progress'].includes(x.status));
      const today = D.today(), now = open.filter(x => !x.due_date || x.due_date <= today), later = open.filter(x => x.due_date && x.due_date > today), done = rows.filter(x => ['done', 'checked'].includes(x.status));
      const sec = (title, r) => (r.length ? `<section><h2>${esc(title)} (${r.length})</h2><div class="list">${r.map(x => taskLi(x, 'mine')).join('')}</div></section>` : '');
      return head + pgActions(add.replace('btn small', 'btn')) + (sec(t('tk_now'), now) + sec(t('tk_later'), later) + sec(t('ts_done'), done.slice(-15).reverse()) || empty(t('no_tasks')));
    }
    const rows = await tasksOf('manage', D.add(D.today(), -30), D.add(D.today(), 90), tkAll);
    const isOpen = x => ['open', 'accepted', 'in_progress'].includes(x.status), r = rows.filter(x => tkShow === 'all' || (tkShow === 'open' ? isOpen(x) : !isOpen(x)));
    const groups = tkShow === 'open' ? [['late', r.filter(x => x.late)], ['open', r.filter(x => !x.late && x.status === 'open')], ['accepted', r.filter(x => !x.late && x.status === 'accepted')], ['in_progress', r.filter(x => !x.late && x.status === 'in_progress')]]
      : [['done', r.filter(x => x.status === 'done')], ['checked', r.filter(x => x.status === 'checked').slice(-30)], ['cancelled', r.filter(x => x.status === 'cancelled').slice(-20)]].concat(tkShow === 'all' ? [['open', r.filter(isOpen)]] : []);
    return head + `<div class="filters"><div class="chips">${['open', 'done', 'all'].map(k => `<button class="chip-btn ${tkShow === k ? 'on' : ''}" data-act="tk_show" data-k="${k}">${esc(t('gr_show_' + (k === 'open' ? 'active' : k)))}</button>`).join('')}</div>
      ${can('all_teams') ? `<label class="row-mini"><input type="checkbox" data-act-change="tk_all" ${tkAll ? 'checked' : ''}> ${esc(t('all_teams'))}</label>` : ''}<span class="grow"></span>${add}</div>`
      + (groups.map(([g, x]) => (x.length ? `<section><h2>${esc(g === 'late' ? t('tk_late') : t('ts_' + g))} (${x.length})</h2><div class="list">${x.map(k => taskLi(k, 'manage')).join('')}</div></section>` : '')).join('') || empty(t('no_tasks')));
  }
});
ACT.tk_show = el => { tkShow = el.dataset.k; route(); };
ACT.tk_all = el => { tkAll = el.checked; route(); };

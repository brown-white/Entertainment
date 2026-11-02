'use strict';
/* AUREA · pages/team.js — staff page: Team (who is who).
   Uses: translations/languages · supabase · core/utils · core/permissions · components/cards · core/router · systems/team-schedule */
/* ---------- Team page ---------- */
page('team', {
  perm: 'team', icon: 'users', group: 'team', title: 'pg_team',
  render: async () => {
    const today = D.today();
    const [tm, b, tasks] = await Promise.all([api('team_members'), board(today, today), can('tasks') || can('m_team') ? safe(list('tasks', { status: 'checked', _limit: 500 })) : null]);
    const week = D.add(today, -7);
    const pts = {}; (tasks || []).filter(x => (x.done_at || x.created_at || '').slice(0, 10) >= week).forEach(x => { if (x.assigned_staff_id) pts[x.assigned_staff_id] = (pts[x.assigned_staff_id] || 0) + (x.points || 0); });
    const rank = Object.entries(pts).sort((a, b2) => b2[1] - a[1]);
    return `<div class="people">${tm.staff.map(m => { const s = statusOf(b, m.id, today); return `<div class="person">${avatar(m.photo_url, m.display_name, 'lg')}<b>${esc(m.display_name)}</b><small>${esc(m.role_name)}${m.staff_number ? ' · #' + m.staff_number : ''}</small>${stChip(s)}
      ${m.phone ? `<div class="row">${phoneBtns(m.phone, 'ghost small')}</div>` : ''}</div>`; }).join('')}</div>
      ${rank.length ? `<section><h2>${esc(t('ranking_week'))}</h2><ol class="rank">${rank.map(([id, p]) => `<li>${esc(tm.staff.find(x => x.id === +id)?.display_name || '')}<b>${p}</b></li>`).join('')}</ol></section>` : ''}`;
  }
});

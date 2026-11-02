'use strict';
/* AUREA · systems/assignment-system.js — ONE assignment system for the Assignments page and the Week overview: the item's assignment rule (roles, staff
   required) in forms and in words, the planner's input, the refusal reasons in words, the pick list (Assign staff) and
   the person menu (why this person, mark manual, replace, remove).
   Uses: core/state · translations/languages · supabase · core/utils · icons/icons · components/modals · core/actions · components/cards ·
         core/router · systems/team-schedule · systems/smart-planner */
/* the assignment rule: the roles that may be planned (never the manager role), in words for every page that shows it */
const planRoles = () => (S.roles || []).filter(r => !r.is_manager);
/* ONE set of fields for an item's assignment rule: the editor (full: with its hint and default), the Week overview's quick view, Select → Assignment */
const asgFields = full => [
  { k: 'assign', type: 'choice', label: t('asg_rule'), options: [['none', t('asg_rule_none')], ['req', t('asg_rule_req')]] },
  Object.assign({ k: 'assign_roles', type: 'multi', num: true, label: t('asg_rule_roles'), options: planRoles().map(r => [r.id, r.name]) }, full ? { hint: t('asg_rule_roles_hint') } : {}),
  Object.assign({ k: 'staff_needed', type: 'number', label: t('staff_required'), min: 1, max: 30 }, full ? { def: 1 } : {})];
const roleNames = ids => (ids || []).map(id => (S.roles || []).find(r => r.id === +id)?.name).filter(Boolean);
const asgRuleText = it => !(+it.staff_needed > 0) ? t('asg_rule_none') : (roleNames(it.assign_roles).join(' + ') || t('asg_any_role')) + ' · ' + t('asg_n_required', { n: it.staff_needed });
// the form's choice → the item's own fields: no assignment = nobody (0, no roles); required = at least one person and one role
function asgOf(r, base) {
  if (!('assign' in r)) return r;
  if (!r.assign) throw new ApiError('required', { field: t('asg_rule') });           // a new item: the manager decides, nothing is assumed
  const req = r.assign === 'req'; delete r.assign;
  if (!req) return Object.assign(r, { staff_needed: 0, assign_roles: null });
  const roles = (r.assign_roles || []).map(Number);
  // roles are chosen for every item the manager sets to "required"; an item that already allowed any role (made elsewhere) may stay so
  const anyBefore = base && +base.staff_needed > 0 && !(base.assign_roles || []).length;
  if (!roles.length && anyBefore) return Object.assign(r, { staff_needed: Math.min(30, Math.max(1, +r.staff_needed || 1)), assign_roles: null });
  if (!roles.length) throw new ApiError('required', { field: t('asg_rule_roles') });
  return Object.assign(r, { staff_needed: Math.min(30, Math.max(1, +r.staff_needed || 1)), assign_roles: roles.sort((a, b) => a - b) });
}
// everything the ONE planning engine needs: the items, the team, the database's refusals, the rules, recent history, working days per person
// (b = a day board + the database's check of one period: the Planner's own, or the Week overview's week)
const plInput = b => {
  const from = b.from, to = D.add(b.from, b.span - 1), avail = {};
  (b.status || []).forEach(x => { if (x.date >= from && x.date <= to && x.status === 'working') avail[x.staff_id] = (avail[x.staff_id] || 0) + 1; });
  // this team plans its own items and the hotel-wide ones; another team's item a person of this team works at is only their busy time
  const items = b.items.map(i => (i.team_id && i.team_id !== S.team?.id ? Object.assign({}, i, { plan: false }) : i));
  return { items, staff: b.staff.filter(s => !s.is_manager && s.status !== 'left'), refused: b.check.refused, outside: b.check.outside || [], team: S.team?.id ?? null,
    rules: b.rules, maxPerDay: b.check.max_per_day, maxPerOp: b.check.max_per_op,
    ops: b.check.ops, history: b.check.history || [], from, to, today: D.today(), nowMin: hotelNowMin(), avail };
};
// an item's real end (no end time = one hour), as the database counts it
const itemEnd = it => it.end_time ? hm(it.end_time) : (m => String(Math.floor(m / 60) % 24).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0'))(mins(it.start_time) + 60);
// entrance duty names the real times: the leave-operation time the database used ('entrance@16:00'), or that person's day record
const whyText = (r, it, b, sid) => {
  if (r === 'skill') return t('why_skill_x', { skill: b.check.skills[it.id]?.name || '' });
  if (r === 'role') return t('why_role_x', { roles: roleNames(it.assign_roles).join(' + ') || '—' });   // the manager's rule for this item
  const leave = String(r).startsWith('entrance@') ? r.slice(9) : r === 'entrance' && sid ? statusOf(b, sid, it.date)?.leave_op : null;
  return leave ? t('why_entrance_t', { leave, end: itemEnd(it) }) : t('why_' + r);
};
/* the board on screen for the ONE assignment system (Assignments page or Week overview: the pick list, the person menu, the reasons) */
let asgOn = null;
const asgShow = b => { asgOn = b; };
// a reason in words (the same words as everywhere: day off, entrance duty at …, no skill, time conflict …)
const asgWhy = (x, sid) => { const b = asgOn || { check: { skills: {} }, status: [] }, it = b.items?.find(i => i.id === x.item_id) || { id: x.item_id, start_time: x.time, date: x.date };
  try { return whyText(x.reason, it, b, sid); } catch (e) { return t('why_' + String(x.reason).split('@')[0]); } };
/* one assigned person (Week overview, Planner): remove, replace, mark as manual, why the Smart plan chose them */
ACT.as_staff = async el => {
  const iid = +el.dataset.i, sid = +el.dataset.s, b = asgOn?.items?.some(i => i.id === iid) ? asgOn : null;
  const it = b?.items.find(i => i.id === iid), s = it?.staff.find(x => x.staff_id === sid); if (!s) return;
  const sm = b.staff.find(x => x.id === sid), r = sm ? planWhy(plInput(b))(sm, it) : null, src = s.source || 'manual';
  const html = `<p><b>${esc(s.name)}</b> · ${esc(itemName(it))} · ${esc(D.short(it.date))} ${esc(hm(it.start_time))}</p>
    <p>${chip(t('src_' + src))} ${r ? chip(whyText(r, it, b, sid), 'bad') : chip(t('asg_fits'), 'ok')}</p>`;
  const k = await choiceBox(t('asg_one'), html, [{ k: 'why', label: t('why_chosen') }].concat(src === 'planner' ? [{ k: 'manual', label: t('asg_mark_manual') }] : [],
    [{ k: 'replace', label: t('asg_replace') }, { k: 'remove', label: t('asg_remove_here'), cls: 'solid-danger' }]));
  if (!k) return;
  if (k === 'remove') { if (!await confirmBox(t('asg_remove_q', { name: s.name, item: itemName(it) }), t('remove'))) return;
    await api('assignment_set', { p_item_id: iid, p_staff_ids: it.staff.map(x => x.staff_id).filter(x => x !== sid) }); toast(t('saved')); closeModals(); return route(); }
  if (k === 'manual') { await api('assignment_bulk', { p_action: 'manual', p_args: { items: [iid], staff: [sid] }, p_preview: false }); toast(t('saved')); closeModals(); return route(); }
  if (k === 'replace') { closeModals(); return asgReplaceOne(b, it, sid); }
  return asgWhyBox(b, it, sm, r, src);
};
// replace on this item: the team with each one's reason (the same rules), the database checks again
function asgReplaceOne(b, it, sid) {
  const why = planWhy(plInput(b)), on = new Set(it.staff.map(x => x.staff_id));
  const rows = b.staff.filter(x => !x.is_manager && x.status !== 'left' && !on.has(x.id)).map(x => ({ x, r: why(x, it) })).sort((p, q) => (p.r ? 1 : 0) - (q.r ? 1 : 0));
  modal(t('asg_replace') + ' · ' + itemName(it) + ' · ' + D.short(it.date) + ' ' + hm(it.start_time), `<div class="list pick">${rows.map(({ x, r }) => `<label class="li row ${r ? 'dim' : ''}"><input type="radio" name="to" value="${x.id}" ${r ? 'disabled' : ''}>
      <span>${esc((x.staff_number ? '#' + x.staff_number + ' ' : '') + x.display_name)}</span><span class="grow"></span>${r ? chip(whyText(r, it, b, x.id), 'bad') : chip(t('available'), 'ok')}</label>`).join('') || empty(t('nobody_in_team'))}</div>`, {
    cancel: true, saveLabel: t('asg_replace'),
    save: async root => { const to = +($('input[name=to]:checked', root)?.value || 0); if (!to) throw new ApiError('required', { field: t('staff') });
      const j = await api('assignment_bulk', { p_action: 'replace', p_args: { items: [it.id], staff_from: sid, staff_to: to, mode: 'keep' }, p_preview: false });
      if (j.not_possible) toast(t('asg_cannot_on') + ' ' + itemName(it) + ': ' + asgWhy(j.rows[0], to), 'bad'); else toast(t('saved')); route(); }
  });
}
// why this person: how the assignment was made, and the Smart plan's rules for this item one by one
function asgWhyBox(b, it, sm, r, src) {
  const n = b.items.filter(i => i.staff.some(x => x.staff_id === sm.id)).length, others = b.staff.filter(x => !x.is_manager && x.status !== 'left');
  const avg = others.length ? Math.round(10 * b.items.reduce((a, i) => a + i.staff.length, 0) / others.length) / 10 : 0;
  const why = planWhy(plInput(b)), match = others.filter(x => { const q = why(x, it); return !q || !['role', 'not_allowed', 'other_team', 'inactive', 'not_employed', 'no_assignment'].includes(String(q)); });
  const rule = (it.assign_roles || []).length ? t('wc_mgr_rule', { roles: roleNames(it.assign_roles).join(' + '), who: staffTag(b, sm.id) || sm.display_name, role: roleNames([sm.role_id])[0] || '', time: hm(it.start_time) }) : t('asg_why_any_role');
  const L = [t('asg_why_src_' + src), rule, r ? t('asg_why_breaks', { why: whyText(r, it, b, sm.id) }) : t('asg_why_fits')].concat(match.length === 1 ? [t('wc_only_one')] : [t('wc_load', { n, avg })]);
  modal(t('why_chosen'), `<p><b>${esc(sm.display_name)}</b> · ${esc(itemName(it))} · ${esc(D.short(it.date))} ${esc(hm(it.start_time))}</p><ul class="why-list">${L.map(x => `<li>${esc(x)}</li>`).join('')}</ul>`, {});
}
// Assign staff (an item's pick list): the team with each one's reason – the Smart plan's rules – and the ONE save (the database checks again)
ACT.pl_item = el => {
  const b = asgOn; const it = b.items.find(i => i.id === +el.dataset.id); const why = planWhy(plInput(b));
  const on = new Set(it.staff.map(s => s.staff_id));
  const rows = b.staff.filter(s => !s.is_manager).map(s => ({ s, r: why(s, it) })).sort((a, c) => (a.r ? 1 : 0) - (c.r ? 1 : 0));
  modal(itemName(it) + ' · ' + D.short(it.date) + ' ' + hm(it.start_time), `<p class="muted">${esc(t('needed_n', { n: it.staff_needed }))}</p><div class="list pick">${rows.map(({ s, r }) => `<label class="li row ${r ? 'dim' : ''}"><input type="checkbox" value="${s.id}" ${on.has(s.id) ? 'checked' : ''}>
    <span>${esc(s.display_name)}${s.team_id !== S.team.id ? ' · ' + esc(t('other_team')) : ''}</span><span class="grow"></span>${r ? chip(whyText(r, it, b, s.id), 'bad') : chip(t('available'), 'ok')}${on.has(s.id) && it.date >= D.today() ? `<button type="button" class="icon-btn" data-act="as_staff" data-i="${it.id}" data-s="${s.id}" aria-label="${esc(t('asg_one') + ' · ' + s.display_name)}">${ico('dots')}</button>` : ''}</label>`).join('')}</div>`, {
    save: async root => {
      const ids = $$('input:checked', root).map(i => +i.value);
      const j = await api('assignment_set', { p_item_id: it.id, p_staff_ids: ids });
      if (j.warnings.length) toast(t('saved_with_warnings', { n: j.warnings.length }), 'warn'); else toast(t('saved'));
      route();
    }
  });
};

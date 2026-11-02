'use strict';
/* AUREA · systems/smart-planner.js — the planning engine itself (no screens; also used by the tests in Node).
   Uses: nothing (the first files) */
/* =====================================================================
   SMART PLANNER — ONE planning engine for every hotel and team.
   It always thinks in two steps:
   A) WHO MAY do it (hard rules, never broken to fill a place):
      the database's one rule list (_eligibility: the item's ASSIGNMENT RULE first – no assignment required = the item is
      not planned at all; hotel, team, active, employed that day, may be planned at all = role + personal Allow/Deny, one of
      the ROLES the manager allowed for this item (the programme type decides nothing), skill / I can't, day off / vacation /
      absent / sick, entrance duty = the item must end by the leave-operation time, gender) + what depends on the plan itself, checked here
      exactly as the database checks it again on saving (_conflict_reason): already on the item,
      overlapping times, the most per day, the most activities per part of the day.
   B) WHO IS BEST among those (soft preferences): rotation (the same activity yesterday, this week,
      the same start time), workload per working day, parts of the day, types, categories, and
      keeping people with rare skills free for what only they can do.
   The whole period is planned together: the hardest places first, then the plan is improved by
   moving and swapping people while every hard rule still holds. Recent assignment history (14 days
   before, 2 after) is the rotation memory. Three weightings give three plans (A balanced, B variety,
   C coverage). Nothing is saved here: the chosen plan is checked again row by row in the database.
   ===================================================================== */
const PLAN_TYPES = ['activity', 'event', 'show', 'live_music', 'special_event'];
/* how much each soft preference counts in each plan (hard rules are the same for all three).
   rot = the same activity again: [same day, next day, 2 days, 3–7 days, 8–14 days]; time = the same start time [next day, within a week] */
const PLAN_PROFILES = {
  A: { rot: [30, 60, 20, 8, 2], time: [6, 2], load: 12, op: 4, type: 3, cat: 2, gender: 40, scarce: 300, unfilled: 5000, depth: 1, passes: 6 },
  B: { rot: [60, 120, 50, 25, 6], time: [15, 6], load: 4, op: 6, type: 2, cat: 8, gender: 40, scarce: 300, unfilled: 5000, depth: 1, passes: 6 },
  C: { rot: [15, 30, 8, 3, 1], time: [2, 1], load: 6, op: 2, type: 1, cat: 1, gender: 40, scarce: 500, unfilled: 50000, depth: 2, passes: 8 }
};
const DYNAMIC = ['conflict', 'max_day', 'max_op'];
const PERMISSION_REASONS = ['not_allowed', 'other_team', 'other_hotel', 'inactive', 'not_employed', 'role', 'no_assignment'];

function planAssignments(input) {
  const { items = [], staff = [], refused = [], rules = {}, mode = 'fill', maxPerDay = null, maxPerOp = null, history = [] } = input;
  const W = PLAN_PROFILES[input.profile] || PLAN_PROFILES.A;
  const toMin = s => { if (!s) return null; const [h, m] = String(s).split(':').map(Number); return h * 60 + (m || 0); };
  const dayNo = d => Math.round(Date.parse(String(d).slice(0, 10) + 'T00:00:00Z') / 864e5);
  const opBound = [toMin(input.ops?.afternoon || '13:00'), toMin(input.ops?.evening || '18:00')];
  const partOf = m => (m < opBound[0] ? 'morning' : m < opBound[1] ? 'afternoon' : 'evening');
  const keyOf = x => String(x.name || '').trim().toLowerCase().replace(/\s+/g, ' ');     // "the same activity" = the same name (weekly or one-off)
  // the database's answer: item|staff → reason (entrance duty carries its leave-operation time: 'entrance@16:00')
  const rule = new Map(refused.map(r => [r.i + '|' + r.s, r.x ? r.r + '@' + r.x : r.r]));
  // people on these items who are not planned by this team (paused, left, another team): the database's reason
  const outside = new Map((input.outside || []).map(r => [r.i + '|' + r.s, r.r]));
  const staffIds = staff.map(s => s.id), staffById = new Map(staff.map(s => [s.id, s]));
  const allDays = items.map(i => dayNo(i.date));
  const from = input.from ? dayNo(input.from) : Math.min(...allDays, Infinity), to = input.to ? dayNo(input.to) : Math.max(...allDays, -Infinity);
  const nDays = Number.isFinite(from) && Number.isFinite(to) ? to - from + 1 : 1;
  const avail = new Map(Object.entries(input.avail || {}).map(([k, v]) => [+k, v]));    // working days of each person in the period
  const today = input.today ? dayNo(input.today) : null, nowMin = input.nowMin ?? null;

  /* every item as the planner sees it */
  const view = new Map();
  for (const it of items) {
    const s = toMin(it.start_time); let e = it.end_time ? toMin(it.end_time) : s + 60; if (e <= s) e = 24 * 60;
    const dn = dayNo(it.date);
    view.set(it.id, { it, id: it.id, dn, s, e, st: String(it.start_time).slice(0, 5), key: keyOf(it), type: it.type, op: partOf(s), cats: it.categories || [],
      live: it.status !== 'cancelled', locked: today != null && (dn < today || (dn === today && nowMin != null && s <= nowMin)) });
  }
  const itemById = new Map(items.map(i => [i.id, i]));

  /* the plan's state: every assignment of each person (history, kept, proposed), indexed by person and by person + day,
     with running totals per person (work in the period, per part of the day, type, category) so a change is priced in one step */
  const byPerson = new Map(staffIds.map(id => [id, []])), byPD = new Map(), onItem = new Map(), agg = new Map();
  let eid = 0;
  const pd = (sid, dn) => sid + '|' + dn;
  const tally = (e, k) => {
    if (!agg.has(e.sid)) agg.set(e.sid, { L: 0, op: {}, ty: {}, ca: {} });
    const g = agg.get(e.sid);
    if (e.inRange) { g.L += k; g.op[e.op] = (g.op[e.op] || 0) + k; g.ty[e.type] = (g.ty[e.type] || 0) + k; for (const c of e.cats) g.ca[c] = (g.ca[c] || 0) + k; }
    else if (e.dn < from && e.dn >= from - 7) g.L += 0.5 * k;                    // last week's work counts half
  };
  const add = e => {
    if (!byPerson.has(e.sid)) byPerson.set(e.sid, []); byPerson.get(e.sid).push(e);
    const k = pd(e.sid, e.dn); if (!byPD.has(k)) byPD.set(k, []); byPD.get(k).push(e);
    if (e.itemId != null) { if (!onItem.has(e.itemId)) onItem.set(e.itemId, []); onItem.get(e.itemId).push(e.sid); }
    tally(e, 1);
  };
  const drop = (l, x) => l.splice(l.indexOf(x), 1);
  const remove = e => { drop(byPerson.get(e.sid), e); drop(byPD.get(pd(e.sid, e.dn)), e); if (e.itemId != null) drop(onItem.get(e.itemId), e.sid); tally(e, -1); };
  const entry = (sid, v, fixed, extra) => Object.assign({ id: ++eid, sid, itemId: v.id, dn: v.dn, s: v.s, e: v.e, st: v.st, key: v.key, type: v.type, op: v.op, cats: v.cats, fixed, inRange: v.dn >= from && v.dn <= to }, extra);
  // rotation memory: the database's recent history of these people (items outside the list on screen)
  for (const h of history) {
    if (view.has(h.i) || !staffById.has(h.s)) continue;
    const s = toMin(h.start_time); let e = h.end_time ? toMin(h.end_time) : s + 60; if (e <= s) e = 24 * 60;
    add(entry(h.s, { id: 'h' + h.i, dn: dayNo(h.date), s, e, st: String(h.start_time).slice(0, 5), key: keyOf(h), type: h.type, op: partOf(s), cats: h.cats || [] }, true, { history: true }));
  }
  // what stays: in 'fill' everything already planned; in 'replan' manual choices; the past always (it is history); another team's
  // assignment (only that team plans it again) and every assignment on an item this team does not plan (another team's item a
  // person of this team works at: it is their busy time)
  const keptEntries = [];
  for (const it of items) {
    const v = view.get(it.id); if (!v.live) continue;
    for (const a of it.staff || []) {
      const stays = mode === 'fill' || a.source === 'manual' || v.locked || it.plan === false || (input.team != null && a.team_id != null && a.team_id !== input.team);
      if (!stays) continue;
      const e = entry(a.staff_id, v, true, { source: a.source }); add(e); keptEntries.push(e);
    }
  }

  /* STEP A — the one check for a person and an item (the database's rules + this plan) */
  const hardFor = (sid, v) => ((onItem.get(v.id) || []).includes(sid) ? 'already' : hardRules(sid, v));
  const hardRules = (sid, v) => {
    const r = rule.get(v.id + '|' + sid); if (r) return r;
    const same = (byPD.get(pd(sid, v.dn)) || []).filter(e => e.itemId !== v.id);
    if (same.some(e => e.s < v.e && v.s < e.e)) return 'conflict';
    if (maxPerDay && same.length >= maxPerDay) return 'max_day';
    if (maxPerOp && v.type === 'activity' && same.filter(e => e.type === 'activity' && e.op === v.op).length >= maxPerOp) return 'max_op';
    return null;
  };
  const canStaffBeAssigned = (s, it, taken = []) => (taken.includes(s.id) ? 'already' : hardRules(s.id, view.get(it.id)));

  // existing assignments are never removed by the planner, but a hard rule they break is reported
  const warnings = [];
  for (const e of keptEntries) {
    if (!staffById.has(e.sid)) { const r = outside.get(e.itemId + '|' + e.sid); if (r) warnings.push({ item_id: e.itemId, staff_id: e.sid, reason: r }); continue; }
    remove(e); const r = hardFor(e.sid, view.get(e.itemId)); add(e);
    if (r && r !== 'already') warnings.push({ item_id: e.itemId, staff_id: e.sid, reason: r });
  }

  /* STEP B — what an assignment costs the plan (lower = better), priced only against what it touches:
     the same activity again (by distance in days), the same start time, and the person's running totals
     (squares make the work spread evenly: in the period per working day, per part of the day, type and category) */
  const rotW = d => (d === 0 ? W.rot[0] : d === 1 ? W.rot[1] : d === 2 ? W.rot[2] : d <= 7 ? W.rot[3] : d <= 14 ? W.rot[4] : 0);
  const pair = (a, b) => {
    if (a.fixed && b.fixed) return 0;
    const d = Math.abs(a.dn - b.dn); let c = 0;
    if (a.key === b.key) c += rotW(d);
    if (d >= 1 && d <= 7 && a.st === b.st) c += d === 1 ? W.time[0] : W.time[1];
    return c;
  };
  // k = +1: x joins sid's work; k = 0: x is already there (its share of the totals)
  const totals = (sid, x, k) => {
    if (!x.inRange) return 0;
    const g = agg.get(sid) || { L: 0, op: {}, ty: {}, ca: {} }, n = c => 2 * c + (k ? 1 : -1);
    let c = W.load * n(g.L) / Math.max(1, avail.get(sid) ?? nDays) + W.op * n(g.op[x.op] || 0) + W.type * n(g.ty[x.type] || 0);
    for (const k2 of x.cats) c += W.cat * n(g.ca[k2] || 0);
    return c;
  };
  const marginal = (sid, x) => { let c = totals(sid, x, 1); for (const e of byPerson.get(sid) || []) c += pair(x, e); return c; };       // x not yet planned
  const share = (sid, x) => { let c = totals(sid, x, 0); for (const e of byPerson.get(sid) || []) if (e !== x) c += pair(x, e); return c; }; // x planned
  const genderCost = (v, plus, minus) => {
    if (!rules.gender_rules || v.it.gender_rule !== 'mixed' || (v.it.staff_needed || 0) < 2) return 0;
    const ids = (onItem.get(v.id) || []).filter(id => id !== minus).concat(plus != null ? [plus] : []);
    const g = new Set(ids.map(id => staffById.get(id)?.gender).filter(Boolean));
    return ids.length >= 2 && g.size < 2 ? W.gender : 0;
  };
  const addCost = (sid, v) => marginal(sid, entry(sid, v, false)) + genderCost(v, sid) - genderCost(v);

  /* the places to fill */
  const live = items.filter(it => view.get(it.id).live && (it.staff_needed || 0) > 0);
  const plannable = live.filter(it => !view.get(it.id).locked && it.plan !== false);
  const slots = [];
  for (const it of plannable) { const need = Math.max(0, it.staff_needed - (onItem.get(it.id) || []).length); for (let k = 0; k < need; k++) slots.push({ v: view.get(it.id), e: null }); }
  const empty = slots.length;
  // candidates of a slot right now
  const cands = sl => staffIds.filter(sid => !hardFor(sid, sl.v));
  // taking slot sl would stop sid from doing another open place that day: how much that hurts (rare people are kept free)
  const scarcity = (sid, sl, sameDay) => {
    let p = 0; const e = entry(sid, sl.v, false); add(e);
    for (const o of sameDay) if (o !== sl && o.v.id !== sl.v.id && o.c.includes(sid) && hardFor(sid, o.v) !== null) p += W.scarce / o.c.length;
    remove(e); return p;
  };
  const tie = (sid, v) => ((sid * 7919 + v.dn * 31 + v.s) % 97) / 1000;           // stable tie-break that rotates by day

  if (!input.dryRun) {
    /* 1. build: the hardest place first (fewest people who may still take it), the best person for it */
    const open = new Set(slots);
    for (const o of open) o.c = cands(o);
    while (open.size) {
      let sl = null;
      for (const o of open) if (!sl || o.c.length < sl.c.length || (o.c.length === sl.c.length && (o.v.dn - sl.v.dn || o.v.s - sl.v.s || o.v.id - sl.v.id) < 0)) sl = o;
      open.delete(sl);
      if (!sl.c.length) continue;                                                // nobody may take it now: maybe later by moving people
      const sameDay = [...open].filter(o => o.v.dn === sl.v.dn);
      let best = null, bestCost = Infinity;
      for (const sid of sl.c) { const c = addCost(sid, sl.v) + scarcity(sid, sl, sameDay) + tie(sid, sl.v); if (c < bestCost) { bestCost = c; best = sid; } }
      sl.e = entry(best, sl.v, false); add(sl.e);
      for (const o of sameDay) if (o.c.includes(best) && hardFor(best, o.v) !== null) drop(o.c, best);   // only this person's day changed
    }
    /* 2. improve the whole period: fill what is still empty, move one person, swap two people — every hard rule still holds */
    const filledSlots = () => slots.filter(s => s.e), emptySlots = () => slots.filter(s => !s.e);
    const tryFill = (sl, depth) => {
      // someone free → take the best one
      let best = null, bestCost = Infinity;
      for (const sid of cands(sl)) { const c = addCost(sid, sl.v) + tie(sid, sl.v); if (c < bestCost) { bestCost = c; best = sid; } }
      if (best != null) { sl.e = entry(best, sl.v, false); add(sl.e); return true; }
      if (!depth) return false;
      // nobody free: move a person who is held only by another planned place, and fill that place with someone else
      for (const sid of staffIds) {
        if (!DYNAMIC.includes(hardFor(sid, sl.v))) continue;
        for (const other of filledSlots().filter(o => o.e.sid === sid && o.v.dn === sl.v.dn)) {
          const old = other.e; remove(old); other.e = null;
          if (hardFor(sid, sl.v) === null) {
            sl.e = entry(sid, sl.v, false); add(sl.e);
            if (tryFill(other, depth - 1)) return true;
            remove(sl.e); sl.e = null;
          }
          other.e = old; add(old);
        }
      }
      return false;
    };
    for (let pass = 0; pass < W.passes; pass++) {
      let changed = false;
      for (const sl of emptySlots()) if (tryFill(sl, W.depth)) changed = true;
      // move: give a planned place to someone better
      for (const sl of filledSlots()) {
        const cur = sl.e, base = share(cur.sid, cur) + genderCost(sl.v) - genderCost(sl.v, null, cur.sid);
        remove(cur);
        let best = null, bestDelta = -1e-6;
        for (const sid of cands(sl)) {
          if (sid === cur.sid) continue;
          const d = addCost(sid, sl.v) - base;
          if (d < bestDelta) { bestDelta = d; best = sid; }
        }
        if (best != null) { sl.e = entry(best, sl.v, false); add(sl.e); changed = true; } else add(cur);
      }
      // swap: two people trade places (same day or the same activity), if both may and the plan gets better
      const fs = filledSlots();
      for (let i = 0; i < fs.length; i++) for (let j = i + 1; j < fs.length; j++) {
        const a = fs[i], b = fs[j]; if (a.e.sid === b.e.sid || a.v.id === b.v.id) continue;
        if (a.v.dn !== b.v.dn && a.v.key !== b.v.key) continue;
        const ea = a.e, eb = b.e, pa = ea.sid, pb = eb.sid;
        if (rule.has(a.v.id + '|' + pb) || rule.has(b.v.id + '|' + pa)) continue;          // quick: the database already says no
        const before = share(pa, ea) + share(pb, eb) + genderCost(a.v) + genderCost(b.v);
        remove(ea); remove(eb);
        let kept = false;
        if (hardFor(pb, a.v) === null) {
          const na = entry(pb, a.v, false), ca = marginal(pb, na); add(na);
          if (hardFor(pa, b.v) === null) {
            const nb = entry(pa, b.v, false), cb = marginal(pa, nb); add(nb);
            if (ca + cb + genderCost(a.v) + genderCost(b.v) < before - 1e-6) { a.e = na; b.e = nb; changed = kept = true; }
            else remove(nb);
          }
          if (!kept) remove(na);
        }
        if (!kept) { add(ea); add(eb); }
      }
      if (!changed) break;
    }
  }

  /* the result */
  const proposed = slots.filter(s => s.e);
  const rows = proposed.map(s => ({ item_id: s.v.id, staff_id: s.e.sid }));
  const unfilled = [];
  for (const it of plannable) {
    const v = view.get(it.id), missing = slots.filter(s => s.v.id === it.id && !s.e).length;
    if (!missing) continue;
    // why nobody could take it: each person's first failing rule, counted
    const why = {}; for (const sid of staffIds) { const r = hardFor(sid, v); if (r && r !== 'already') why[r] = (why[r] || 0) + 1; }
    unfilled.push({ item_id: it.id, missing, why });
  }
  /* why this person: in words the manager can check – the MANAGER'S RULE (the roles this item allows) apart from the PLANNER'S
     CHOICE (rotation, workload); where the rule leaves no choice, the choice is not explained as fairness */
  const eligibleFor = v => staffIds.filter(sid => !rule.get(v.id + '|' + sid));
  const ruleMatch = v => staffIds.filter(sid => !PERMISSION_REASONS.includes(rule.get(v.id + '|' + sid)));   // allowed by the item's rule (free or not)
  const restricted = v => (v.it.assign_roles || []).length > 0;
  const forcedItem = v => eligibleFor(v).length <= Math.max(1, v.it.staff_needed || 1);                     // nobody else could have been chosen
  const didDayBefore = (sid, v) => (byPerson.get(sid) || []).some(e => e.key === v.key && e.dn === v.dn - 1);
  // could someone else have done it without a repeat? (allowed, free at that time, did not do it the day before)
  const repeatFree = (v, without) => { const e = without; if (e) remove(e); const n = staffIds.filter(o => o !== e?.sid && !hardFor(o, v) && !didDayBefore(o, v)).length; if (e) add(e); return n; };
  const loadOf = sid => (byPerson.get(sid) || []).filter(e => e.inRange).length;
  const explain = new Map();
  for (const sl of proposed) {
    const v = sl.v, sid = sl.e.sid, out = [], only = ruleMatch(v).length === 1, forced = forcedItem(v);
    // the manager's rule first (the roles this item allows), then whether the planner had a choice at all
    out.push(restricted(v) ? { k: 'mgr_rule', roles: v.it.assign_roles, role: staffById.get(sid)?.role_id ?? null, time: v.st } : { k: 'eligible', time: v.st });
    if (only) out.push({ k: 'only_one' });
    else if (forced) out.push({ k: 'forced', n: eligibleFor(v).length });
    const prev = (byPerson.get(sid) || []).filter(e => e !== sl.e && e.key === v.key && e.dn < v.dn).sort((a, b) => b.dn - a.dn)[0];
    if (!prev) { if (!only && !forced) out.push({ k: 'not_recent', name: v.it.name }); }
    else if (v.dn - prev.dn === 1) {
      // done the day before too: caused by the manager's rule (nobody else of the allowed roles), unavoidable, or a choice
      const free = repeatFree(v, sl.e);
      out.push({ k: free ? 'repeat' : restricted(v) ? 'repeat_rule' : 'repeat_needed', name: v.it.name, roles: v.it.assign_roles || [] });
    } else if (!only && !forced) out.push({ k: 'last_days', name: v.it.name, n: v.dn - prev.dn });
    if (!only && !forced) {
      const peers = eligibleFor(v).filter(o => o !== sid);
      const avg = peers.length ? peers.reduce((x, o) => x + loadOf(o), 0) / peers.length : 0;
      out.push({ k: 'load', n: loadOf(sid), avg: Math.round(avg * 10) / 10 });
      const ok = eligibleFor(v).length; if (ok <= 2) out.push({ k: 'scarce', n: ok });
    }
    if (v.type === 'activity' && maxPerOp) out.push({ k: 'op_free', op: v.op });
    explain.set(v.id + '|' + sid, out);
  }
  /* balance per type, only between people who may be planned for that type */
  const balance = {};
  for (const ty of PLAN_TYPES) {
    const its = live.filter(i => i.type === ty); if (!its.length) continue;
    const ok = staff.filter(s => its.some(i => !PERMISSION_REASONS.includes(rule.get(i.id + '|' + s.id))));
    if (ok.length) balance[ty] = ok.map(s => ({ staff_id: s.id, n: (byPerson.get(s.id) || []).filter(e => e.inRange && e.type === ty).length })).sort((a, b) => a.n - b.n);
  }
  /* the plan's score, from the plan itself (the same measures for every plan) */
  const required = plannable.reduce((x, it) => x + it.staff_needed, 0);
  const covered = plannable.reduce((x, it) => x + Math.min(it.staff_needed, (onItem.get(it.id) || []).length), 0);
  let assigns = 0, consecutive = 0, unavoidable = 0, sameTime = 0, repeats = 0, repeatsNeeded = 0; const keyAssigns = {};
  for (const sid of staffIds) {
    const es = (byPerson.get(sid) || []).filter(e => e.inRange && e.itemId != null && view.get(e.itemId) && !view.get(e.itemId).locked);
    const count = {};
    for (const e of es) {
      assigns++; count[e.key] = (count[e.key] || 0) + 1;
      const all = byPerson.get(sid);
      if (all.some(x => x.key === e.key && x.dn === e.dn - 1)) {
        consecutive++;
        if (!repeatFree(view.get(e.itemId), e)) unavoidable++;
      }
      if (all.some(x => x.st === e.st && x.dn === e.dn - 1)) sameTime++;
    }
    const rep = Object.values(count).reduce((x, n) => x + Math.max(0, n - 1), 0);
    // repeats nobody can avoid: more assignments than different activities this person may do
    const kinds = new Set(plannable.filter(it => !rule.get(it.id + '|' + sid)).map(it => view.get(it.id).key)).size;
    repeats += rep; repeatsNeeded += Math.min(rep, Math.max(0, es.length - kinds));
    for (const k of Object.keys(count)) keyAssigns[k] = (keyAssigns[k] || 0) + count[k];
  }
  // …and repeats an activity forces because only a few people may do it (a skill, a type): done n times by at most m people
  let byKey = 0;
  for (const [k, n] of Object.entries(keyAssigns)) {
    const m = staffIds.filter(sid => plannable.some(it => view.get(it.id).key === k && !rule.get(it.id + '|' + sid))).length;
    byKey += Math.max(0, n - m);
  }
  repeatsNeeded = Math.min(repeats, Math.max(repeatsNeeded, byKey));
  // fairness: how evenly the work is spread over the people available for it (1 − Gini of work per working day). Only the work the
  // planner could CHOOSE counts: an item the manager's rule leaves to one person (or exactly as many as it needs) is no unfairness
  const choiceLoad = sid => (byPerson.get(sid) || []).filter(e => e.inRange && !(e.itemId != null && view.get(e.itemId) && forcedItem(view.get(e.itemId)))).length;
  const people = staffIds.filter(sid => plannable.some(it => !rule.get(it.id + '|' + sid) && !forcedItem(view.get(it.id))));
  const per = people.map(sid => choiceLoad(sid) / Math.max(1, avail.get(sid) ?? nDays));
  const mean = per.length ? per.reduce((a, b) => a + b, 0) / per.length : 0;
  let gini = 0; if (mean > 0) { for (const a of per) for (const b of per) gini += Math.abs(a - b); gini /= 2 * per.length * per.length * mean; }
  const pct = (a, b) => (b ? Math.round(100 * a / b) : 100);
  const score = { required, covered, coverage: pct(covered, required), assigns, consecutive, unavoidable, rotation: pct(assigns - (consecutive - unavoidable), assigns),
    fairness: Math.round(100 * (1 - gini)), repeats, repeatsNeeded, sameTime };
  const extra = repeats - repeatsNeeded;   // repeats the plan could have avoided
  score.repetition = extra === 0 ? 'none' : extra <= assigns * 0.1 ? 'low' : extra <= assigns * 0.25 ? 'medium' : 'high';
  return { rows, unfilled, empty, filled: rows.length, missing: unfilled.reduce((a, u) => a + u.missing, 0), warnings, balance, explain, score, profile: input.profile || 'A',
    replace: mode === 'replan' ? plannable.map(i => i.id) : null, canStaffBeAssigned, itemById,
    // (copy last week: a row taken is part of the plan before the next one is checked)
    assume: (sid, itemId) => { const v = view.get(itemId); if (v) add(entry(sid, v, true)); } };
}
/* the three plans to compare: the same rules, the same engine, a different order among eligible people */
function planOptions(input) {
  const plans = {}; for (const p of ['A', 'B', 'C']) plans[p] = planAssignments(Object.assign({}, input, { profile: p }));
  const sig = r => r.rows.map(x => x.item_id + ':' + x.staff_id).sort().join(',');
  const same = {}; if (sig(plans.B) === sig(plans.A)) same.B = 'A'; if (sig(plans.C) === sig(plans.A)) same.C = 'A'; else if (sig(plans.C) === sig(plans.B)) same.C = 'B';
  return { plans, same };
}
/* the same check for one person (manual pick list, copy last week) */
function planWhy(input) { const ctx = planAssignments(Object.assign({}, input, { dryRun: true, mode: 'fill' })); return (s, item) => ctx.canStaffBeAssigned(s, item, []); }
if (typeof module !== 'undefined') module.exports = { planAssignments, planOptions, planWhy, PLAN_PROFILES };

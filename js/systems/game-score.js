'use strict';
/* Mr Hassan · systems/game-score.js — the scoring engines of the team games: ROUNDS (Boccia, Bean bags / Cornhole: points per round, first to a
   target or a number of rounds, optional cancellation scoring), SETS (Volleyball, Table tennis: points, sets, win by two, best
   of 3 / 5 / 7), QUIZ (teams, question by question, every right team or the first one) and POINTS (a simple scoreboard for the
   other sports, and every game played before 10.5). Each keeps its own record; the scores are worked out from it. A player or
   team joining during the game starts from nothing (the rounds and questions already played count 0 for them); a team game
   takes the newcomer into a team. Each has its DISPLAY SCREEN: the scoreboard (systems/games: scoreScreen) – the scores large,
   the leader or the winner marked, the rounds / sets below.
   Uses: translations/languages · core/utils · icons/icons · components/modals · core/actions · components/forms · systems/games */
const clampNum = (v, d, lo, hi) => { const n = v === '' || v == null || isNaN(+v) ? d : +v; return Math.max(lo, Math.min(hi, n)); };
const sideOut = (s, extra) => Object.assign({ name: s.name, room: s.room || null, team: s.team || null }, s.members?.length ? { members: s.members } : {}, extra);
const sideCell = s => `<b>${esc(s.name)}</b>${gameWho(s) ? `<small>${esc(gameWho(s))}</small>` : ''}`;
const winBanner = (g, d) => (d.over ? `<div class="gm-win">${ico('trophy')}<span>${esc(t('winner'))}</span><b>${esc(winnerNames(g, d.winners))}</b><button class="btn" data-act="gm_complete">${ico('check')} ${esc(t('complete_game'))}</button></div>` : '');
const rankList = (sides, val, low = false) => { const order = sides.map((s, i) => Object.assign({ i }, s)).sort((a, b) => (low ? val(a) - val(b) : val(b) - val(a)));
  return `<ol class="board">${order.map((s, r) => `<li class="${r === 0 && order.length > 1 && val(s) !== val(order[1]) ? 'lead' : ''}"><span class="rank">${r + 1}</span><span class="who">${sideCell(s)}</span><span class="pts">${esc(String(val(s)))}</span></li>`).join('')}</ol>`; };
// a side on the display's scoreboard: its score large, marked while it leads alone, and when it has won
const dmSide = (s, i, d, big, sub) => ({ name: s.name, who: gameWho(s), big, sub, on: !d.over && d.leaders.length === 1 && d.leaders[0] === i && +big > 0, win: d.over && d.winners.includes(i) });
const scoreTools = (undoOn, undoLabel) => `<div class="gm-tools"><button class="btn ghost big" data-act="gm_undo" ${undoOn ? '' : 'disabled'}>${ico('undo')} ${esc(t(undoLabel))}</button><button class="btn ghost big" data-act="gm_correct">${ico('edit')} ${esc(t('correct_score'))}</button></div>`;

/* ---------- ROUNDS: Boccia, Bean bags / Cornhole ---------- */
const roundsCfg = g => { const o = g.options || {}, bb = g.game_type === 'bean_bags';
  return { target: clampNum(o.target, bb ? 21 : 12, 1, 500), rounds: clampNum(o.rounds, bb ? 10 : 8, 1, 50), cancel: o.cancel == null ? bb : !!o.cancel }; };
function roundsPlay(g) {
  const c = roundsCfg(g), R = (g.state || {}).rounds || [], n = g.sides.length;
  // cancellation scoring: in each round only the best side scores, the difference to the next one
  const counted = R.map(r => { const v = g.sides.map((s, i) => Math.max(0, +r[i] || 0)); if (!c.cancel || n < 2) return v;
    const sorted = v.slice().sort((a, b) => b - a), lead = v.filter(x => x === sorted[0]).length === 1; return v.map(x => (lead && x === sorted[0] ? sorted[0] - sorted[1] : 0)); });
  const tot = g.sides.map((s, i) => counted.reduce((a, v) => a + v[i], 0)), lead = leadersBy(tot);
  const reached = g.mode === 'target' ? Math.max(0, ...tot) >= c.target : R.length >= c.rounds;
  const over = reached && lead.length === 1;
  return { sides: g.sides.map((s, i) => sideOut(s, { score: tot[i] })), R, counted, tot, c, over, winners: over ? lead : [], leaders: lead, tie: reached && lead.length > 1 };
}
const roundsTable = (sides, counted) => (counted.length ? `<div class="tablewrap"><table class="rd-table"><thead><tr><th>${esc(t('round'))}</th>${sides.map(s => `<th>${esc(s.name)}</th>`).join('')}</tr></thead><tbody>
  ${counted.map((v, k) => `<tr><th>${k + 1}</th>${v.map(x => `<td>${x}</td>`).join('')}</tr>`).join('')}
  <tr class="pts"><th>${esc(t('total'))}</th>${sides.map(s => `<td>${+s.score || 0}</td>`).join('')}</tr></tbody></table></div>` : '');
gameEngine('rounds', {
  options: (ty, mode) => [mode === 'target' ? { k: 'target', type: 'number', label: t('target_score'), min: 1, max: 500, def: ty === 'bean_bags' ? 21 : 12 }
    : { k: 'rounds', type: 'number', label: t('rounds'), min: 1, max: 50, def: ty === 'bean_bags' ? 10 : 8 },
    { k: 'cancel', type: 'bool', label: t('rd_cancel'), hint: t('rd_cancel_hint'), def: ty === 'bean_bags' }],
  sides: { min: 2, max: 12 },
  join: 'side',
  joinWarn: (g, d) => (d.R.length ? t('rdj_late', { n: d.R.length }) : ''),
  play: roundsPlay,
  view(g, d) {
    const cur = gmUi('cur') || g.sides.map(() => 0), no = d.R.length + 1;
    const goal = g.mode === 'target' ? t('first_to', { n: d.c.target }) : t('rd_round_of', { n: Math.min(no, d.c.rounds), m: d.c.rounds });
    return `<p class="muted small">${esc(goal)}${d.c.cancel ? ' · ' + esc(t('rd_cancel')) : ''}</p>${winBanner(g, d)}
      ${d.tie ? `<p class="hint-box warn">${ico('flag')}<span>${esc(t('tie_extra_round'))}</span></p>` : ''}
      ${d.over ? '' : `<div class="card rd-entry"><h3>${esc(t('round'))} ${no}</h3>${g.sides.map((s, i) => `<div class="rd-side"><span class="who">${sideCell(s)}<small class="muted">${esc(t('total'))}: ${d.tot[i]}</small></span>
          <span class="gm-stepper"><button class="btn ghost" data-act="rd_step" data-i="${i}" data-d="-1" aria-label="${esc(s.name)} −1">${ico('minus')}</button><input type="number" min="0" max="99" inputmode="numeric" value="${cur[i]}" data-act-change="rd_set" data-i="${i}" aria-label="${esc(s.name)}"><button class="btn ghost" data-act="rd_step" data-i="${i}" data-d="1" aria-label="${esc(s.name)} +1">${ico('plus')}</button></span></div>`).join('')}
        <button class="btn wide big" data-act="rd_save">${ico('check')} ${esc(t('rd_save_round', { n: no }))}</button></div>`}
      ${roundsTable(d.sides, d.counted)}${scoreTools(d.R.length, 'rd_undo')}`;
  },
  board: g => rankList(g.sides || [], s => +s.score || 0) + roundsTable(g.sides || [], (g.state?.rounds && g.sides ? roundsPlay(g).counted : [])),
  display: (g, d) => scoreScreen((g.mode === 'target' ? t('first_to', { n: d.c.target }) : t('rd_round_of', { n: Math.min(d.R.length + 1, d.c.rounds), m: d.c.rounds })) + (d.c.cancel ? ' · ' + t('rd_cancel') : ''),
    d.sides.map((s, i) => dmSide(s, i, d, d.tot[i])), roundsTable(d.sides, d.counted)),
  summary: g => (g.sides || []).map(s => s.name + ' ' + (+s.score || 0)).join(' · '),
  undo: st => { (st.rounds || []).pop(); return st; },
  correct(g, d) {
    if (!d.R.length) return toast(t('rd_none_yet'), 'bad');
    const k0 = d.R.length - 1, f = [{ k: 'k', type: 'select', num: true, label: t('round'), options: d.R.map((r, k) => [k, t('round') + ' ' + (k + 1)]) }]
      .concat(g.sides.map((s, i) => ({ k: 'p' + i, type: 'number', label: s.name, min: 0, max: 99 })));
    formBox(t('correct_score'), f, Object.assign({ k: k0 }, ...g.sides.map((s, i) => ({ ['p' + i]: d.R[k0][i] || 0 }))), r => {
      gmChange(st => { st.rounds[r.k] = g.sides.map((s, i) => Math.max(0, +r['p' + i] || 0)); return st; });
    }, { saveLabel: t('save'), mount: root => { $('[name=k]', root).onchange = ev => g.sides.forEach((s, i) => { $(`[name=p${i}]`, root).value = d.R[+ev.target.value][i] || 0; }); } });
  }
});
ACT.rd_step = el => { const cur = (gmUi('cur') || GM.g.sides.map(() => 0)).slice(); cur[+el.dataset.i] = Math.max(0, Math.min(99, cur[+el.dataset.i] + +el.dataset.d)); gmUi('cur', cur); gmDraw(); };
ACT.rd_set = el => { const cur = (gmUi('cur') || GM.g.sides.map(() => 0)).slice(); cur[+el.dataset.i] = Math.max(0, Math.min(99, Math.round(+el.value || 0))); gmUi('cur', cur); };
ACT.rd_save = () => { const cur = gmUi('cur') || GM.g.sides.map(() => 0); gmUi('cur', null); gmChange(st => { (st.rounds = st.rounds || []).push(cur.slice()); return st; }); };

/* ---------- SETS: Volleyball, Table tennis ---------- */
const setsCfg = g => { const o = g.options || {}, vb = g.game_type === 'volleyball', need = { best_of_3: 2, best_of_5: 3, best_of_7: 4, one_set: 1 }[g.mode] || 2;
  return { need, total: need * 2 - 1, points: clampNum(o.points, vb ? 25 : 11, 1, 99), last: clampNum(o.last_points, vb ? 15 : 11, 1, 99), by2: o.win_by_2 !== false }; };
function setsPlay(g) {
  const c = setsCfg(g); let cur = [0, 0], over = false, winners = [];
  const won = [0, 0], sets = [];
  for (const ev of (g.state || {}).pts || []) {
    if (over) break;
    if (Array.isArray(ev)) cur = [Math.max(0, +ev[0] || 0), Math.max(0, +ev[1] || 0)]; else if (ev === 0 || ev === 1) cur[ev]++; else continue;
    const tgt = c.total > 1 && sets.length === c.total - 1 ? c.last : c.points, hi = cur[0] > cur[1] ? 0 : 1;
    if (cur[0] !== cur[1] && cur[hi] >= tgt && (!c.by2 || cur[hi] - cur[1 - hi] >= 2)) {
      won[hi]++; sets.push(cur.slice()); cur = [0, 0];
      if (won[hi] >= c.need) { over = true; winners = [hi]; }
    }
  }
  const lead = won[0] !== won[1] ? [won[0] > won[1] ? 0 : 1] : cur[0] !== cur[1] ? [cur[0] > cur[1] ? 0 : 1] : [];
  return { sides: g.sides.map((s, i) => sideOut(s, { score: won[i], pts: cur[i] })), sets, cur, won, c, over, winners, leaders: lead,
    setNo: sets.length + 1, target: c.total > 1 && sets.length === c.total - 1 ? c.last : c.points };
}
const setsLine = sets => sets.map((x, k) => `<span class="chip">${esc(t('set_n', { n: k + 1 }))} ${x[0]}–${x[1]}</span>`).join(' ');
gameEngine('sets', {
  options: (ty, mode) => [{ k: 'points', type: 'number', label: t('st_points'), min: 1, max: 99, def: ty === 'volleyball' ? 25 : 11 }]
    .concat(mode === 'one_set' ? [] : [{ k: 'last_points', type: 'number', label: t('st_last_points'), min: 1, max: 99, def: ty === 'volleyball' ? 15 : 11 }])
    .concat([{ k: 'win_by_2', type: 'bool', label: t('st_win_by_2'), def: true }]),
  sides: { min: 2, max: 2 },
  join: 'member',
  joinWarn: () => t('stj_member'),
  play: setsPlay,
  view(g, d) {
    return `<p class="muted small">${esc(t('set_n', { n: Math.min(d.setNo, d.c.total) }))} · ${esc(t('st_to', { n: d.target }))}${d.c.by2 ? ' · ' + esc(t('st_win_by_2')) : ''}</p>${winBanner(g, d)}
      <div class="st-panels">${g.sides.map((s, i) => `<button class="st-panel ${d.over && d.winners.includes(i) ? 'win' : ''}" data-act="st_point" data-i="${i}" ${d.over ? 'disabled' : ''} aria-label="${esc(t('st_point_for', { name: s.name }))}">
        <span class="who">${sideCell(s)}</span><b class="big">${d.cur[i]}</b><span class="st-sets">${esc(t('st_sets'))}: <b>${d.won[i]}</b></span>${d.over ? '' : '<span class="plus">+1</span>'}</button>`).join('')}</div>
      ${d.sets.length ? `<p class="st-line">${setsLine(d.sets)}</p>` : ''}${scoreTools(((g.state || {}).pts || []).length, 'st_undo')}`;
  },
  board: g => { const s0 = g.sides || [], sets = g.state?.pts ? setsPlay(g).sets : [];
    return `<ol class="board">${s0.map(s => `<li><span class="rank">${+s.score || 0}</span><span class="who">${sideCell(s)}<small>${esc(t('st_sets'))}: ${+s.score || 0}</small></span><span class="pts">${+s.pts || 0}</span></li>`).join('')}</ol>${sets.length ? `<p class="st-line">${setsLine(sets)}</p>` : ''}`; },
  summary: g => { const s0 = g.sides || [], sets = g.state?.pts ? setsPlay(g).sets : [];
    return s0.map(s => s.name).join(' – ') + ' ' + s0.map(s => +s.score || 0).join('–') + (sets.length ? ' (' + sets.map(x => x.join('–')).join(', ') + ')' : ''); },
  display: (g, d) => scoreScreen(t('set_n', { n: Math.min(d.setNo, d.c.total) }) + ' · ' + t('st_to', { n: d.target }),
    g.sides.map((s, i) => dmSide(s, i, d, d.cur[i], t('st_sets') + ': ' + d.won[i])), d.sets.length ? `<p class="st-line">${setsLine(d.sets)}</p>` : ''),
  undo: st => { (st.pts || []).pop(); return st; },
  correct(g, d) {
    formBox(t('correct_score') + ' · ' + t('set_n', { n: Math.min(d.setNo, d.c.total) }), g.sides.map((s, i) => ({ k: 'p' + i, type: 'number', label: s.name, min: 0, max: 99, req: true })),
      { p0: d.cur[0], p1: d.cur[1] }, r => { gmChange(st => { (st.pts = st.pts || []).push([+r.p0, +r.p1]); return st; }); }, { saveLabel: t('save') });
  }
});
ACT.st_point = el => gmChange(st => { (st.pts = st.pts || []).push(+el.dataset.i); return st; });

/* ---------- QUIZ: teams, question by question (every team that answers right scores – or only the first, "buzzer") ---------- */
const quizCfg = g => { const o = g.options || {}; return { q: clampNum(o.questions, 20, 0, 200), p: clampNum(o.points, 1, 1, 100) }; };
function quizPlay(g) {
  const c = quizCfg(g), qs = (g.state || {}).qs || [], adj = (g.state || {}).adj || [];
  const tot = g.sides.map((s, i) => qs.reduce((a, q) => a + (q.includes(i) ? c.p : 0), 0) + adj.filter(x => x.i === i).reduce((a, x) => a + (+x.d || 0), 0));
  const lead = leadersBy(tot), reached = c.q > 0 && qs.length >= c.q, over = reached && lead.length === 1;
  return { sides: g.sides.map((s, i) => sideOut(s, { score: tot[i] })), qs, tot, c, over, winners: over ? lead : [], leaders: lead, tie: reached && lead.length > 1, no: qs.length + 1 };
}
gameEngine('quiz', {
  options: () => [{ k: 'questions', type: 'number', label: t('qz_questions'), min: 0, max: 200, def: 20, hint: t('qz_questions_hint') }, { k: 'points', type: 'number', label: t('qz_points'), min: 1, max: 100, def: 1 }],
  sides: { min: 2, max: 30 },
  join: 'side',
  joinWarn: (g, d) => (d.qs.length ? t('qzj_late', { n: d.qs.length }) : ''),
  play: quizPlay,
  view(g, d) {
    const sel = gmUi('sel') || [], one = g.mode === 'buzzer';
    return `<p class="muted small">${esc(d.c.q ? t('qz_question_of', { n: Math.min(d.no, d.c.q), m: d.c.q }) : t('qz_question_n', { n: d.no }))} · ${esc(t(one ? 'qz_hint_buzzer' : 'qz_hint_standard'))}</p>${winBanner(g, d)}
      ${d.tie ? `<p class="hint-box warn">${ico('flag')}<span>${esc(t('tie_extra_question'))}</span></p>` : ''}
      ${d.over ? '' : `<div class="card qz-entry"><h3>${esc(t('qz_question_n', { n: d.no }))}</h3><div class="qz-teams">${g.sides.map((s, i) => `<button class="qz-team ${sel.includes(i) ? 'on' : ''}" data-act="qz_pick" data-i="${i}" aria-pressed="${sel.includes(i)}">${ico(sel.includes(i) ? 'check' : 'plus')}<b>${esc(s.name)}</b></button>`).join('')}</div>
        <button class="btn wide big" data-act="qz_next">${ico('check')} ${esc(sel.length ? t('qz_save_right', { n: sel.length }) : t('qz_nobody'))}</button></div>`}
      ${rankList(d.sides, s => +s.score || 0)}${scoreTools(d.qs.length || ((g.state || {}).adj || []).length, 'qz_undo')}`;
  },
  board: g => rankList(g.sides || [], s => +s.score || 0),
  display: (g, d) => scoreScreen(d.c.q ? t('qz_question_of', { n: Math.min(d.no, d.c.q), m: d.c.q }) : t('qz_question_n', { n: d.no }), d.sides.map((s, i) => dmSide(s, i, d, d.tot[i]))),
  summary: g => (g.sides || []).map(s => s.name + ' ' + (+s.score || 0)).join(' · '),
  undo: st => { const a = st.adj || [], q = st.qs || []; if (a.length && (!q.length || a[a.length - 1].n >= q.length)) a.pop(); else q.pop(); return st; },
  correct(g, d) {
    formBox(t('correct_score'), [{ k: 'i', type: 'select', num: true, label: t('player_or_team'), options: g.sides.map((s, i) => [i, s.name]) }, { k: 'v', type: 'number', label: t('dt_points'), min: 0, max: 100000, req: true }],
      { i: 0, v: d.tot[0] }, r => { gmChange(st => { (st.adj = st.adj || []).push({ i: r.i, d: r.v - d.tot[r.i], n: d.qs.length }); return st; }); }, { saveLabel: t('save') });
  }
});
ACT.qz_pick = el => { const i = +el.dataset.i, cur = gmUi('sel') || [], one = GM.g.mode === 'buzzer';
  gmUi('sel', cur.includes(i) ? cur.filter(x => x !== i) : one ? [i] : cur.concat(i)); gmDraw(); };
ACT.qz_next = () => { const sel = (gmUi('sel') || []).slice().sort((a, b) => a - b); gmUi('sel', []); gmChange(st => { (st.qs = st.qs || []).push(sel); return st; }); };

/* ---------- POINTS: the simple scoreboard (football, water polo …; every game played before 10.5) ---------- */
function pointsPlay(g) {
  // (a game from before 10.5 starts from its score before the changes it kept: base)
  const tgt = clampNum((g.options || {}).target, 0, 0, 100000), tot = g.sides.map((s, i) => +((g.state || {}).base || [])[i] || 0); let over = false, winners = [];
  for (const x of (g.state || {}).log || []) { if (over) break; if (tot[x.i] == null) continue; tot[x.i] = Math.max(0, tot[x.i] + (+x.d || 0)); if (tgt && tot[x.i] >= tgt) { over = true; winners = [x.i]; } }
  return { sides: g.sides.map((s, i) => sideOut(s, { score: tot[i] })), tot, tgt, over, winners, leaders: leadersBy(tot) };
}
gameEngine('points', {
  options: () => [{ k: 'target', type: 'number', label: t('target_score'), min: 1, max: 1000, hint: t('target_hint') }],
  sides: { min: 2, max: 30 },
  join: 'side',
  joinWarn: () => t('ptj_late'),
  play: pointsPlay,
  view(g, d) {
    return `${d.tgt ? `<p class="muted small">${esc(t('first_to', { n: d.tgt }))}</p>` : ''}${winBanner(g, d)}
      <ol class="board pt-board">${g.sides.map((s, i) => `<li class="${d.leaders.length === 1 && d.leaders[0] === i && d.tot[i] > 0 ? 'lead' : ''}"><span class="who">${sideCell(s)}</span><span class="pts">${d.tot[i]}</span>
        ${d.over ? '' : `<span class="pt-btns">${[-1, 1, 2, 3].map(x => `<button class="btn ${x < 0 ? 'ghost' : ''}" data-act="pt_add" data-i="${i}" data-d="${x}" aria-label="${esc(s.name)} ${x > 0 ? '+' + x : x}">${x > 0 ? '+' + x : '−1'}</button>`).join('')}</span>`}</li>`).join('')}</ol>
      ${scoreTools(((g.state || {}).log || []).length, 'pt_undo')}`;
  },
  board: g => rankList(g.sides || [], s => +s.score || 0),
  display: (g, d) => scoreScreen(d.tgt ? t('first_to', { n: d.tgt }) : '', d.sides.map((s, i) => dmSide(s, i, d, d.tot[i]))),
  summary: g => (g.sides || []).map(s => s.name + ' ' + (+s.score || 0)).join(' · '),
  undo: st => { (st.log || []).pop(); return st; },
  correct(g, d) {
    formBox(t('correct_score'), [{ k: 'i', type: 'select', num: true, label: t('player_or_team'), options: g.sides.map((s, i) => [i, s.name]) }, { k: 'v', type: 'number', label: t('dt_points'), min: 0, max: 100000, req: true }],
      { i: 0, v: d.tot[0] }, r => { gmChange(st => { (st.log = st.log || []).push({ i: r.i, d: r.v - d.tot[r.i] }); return st; }); }, { saveLabel: t('save') });
  }
});
ACT.pt_add = el => gmChange(st => { (st.log = st.log || []).push({ i: +el.dataset.i, d: +el.dataset.d }); return st; });

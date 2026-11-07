'use strict';
/* Mr Hassan · systems/game-darts.js — the Darts engine: a real dart board to tap (1–20, single, double and triple rings, outer bull, bull), three
   darts a turn, and each mode with its own rules – 301 / 501 (count down; a bust takes the turn back; optional double out),
   Highest score (a number of rounds), Around the clock (1 → 20, optional bull), Cricket (15–20 and bull: marks, closing,
   points) and Custom (count down from or up to any number). The record is the list of darts; the scores are worked out from it.
   A player joining during the game ({ j: their place } in the record) throws from then on, after the others of that round.
   Its DISPLAY SCREEN is the scoreboard: the players, who throws now (and the darts of this turn), the scores or what is left,
   the mode, the winner – never the board to tap.
   Uses: translations/languages · core/utils · icons/icons · components/modals · core/actions · components/forms ·
         systems/games */
/* ---------- the board: the order of the numbers, the rings, a dart's value ---------- */
const DART_ORDER = [20, 1, 18, 4, 13, 6, 10, 15, 2, 17, 3, 19, 7, 16, 8, 11, 14, 9, 12, 5];
const CRICKET = [20, 19, 18, 17, 16, 15, 25];
// a dart: S20 / D20 / T20 (single, double, triple), SB (outer bull 25), DB (bull 50), M (a miss)
const dartOf = s => {
  if (s === 'M') return { n: 0, m: 0, v: 0 };
  if (s === 'SB') return { n: 25, m: 1, v: 25 };
  if (s === 'DB') return { n: 25, m: 2, v: 50 };
  const m = { S: 1, D: 2, T: 3 }[s[0]], n = +s.slice(1);
  return { n, m, v: n * m };
};
const dartName = s => (s === 'M' ? t('dt_miss') : s === 'SB' ? t('dt_outer_bull') : s === 'DB' ? t('dt_bull') : t(s[0] === 'D' ? 'dt_double' : s[0] === 'T' ? 'dt_triple' : 'dt_single') + ' ' + s.slice(1));
const dartShort = s => (s === 'M' ? '–' : s === 'SB' ? '25' : s === 'DB' ? 'BULL' : s[0] === 'S' ? s.slice(1) : s);
// the dart board as tappable areas (rings wider than a real board's, so a finger finds them on a phone)
function dartBoard(hit) {
  const P = (r, a) => [r * Math.cos(a), r * Math.sin(a)].map(v => +v.toFixed(2)), rad = d => (d * Math.PI) / 180;
  const sector = (r0, r1, a0, a1) => { const [x0, y0] = P(r1, a0), [x1, y1] = P(r1, a1), [x2, y2] = P(r0, a1), [x3, y3] = P(r0, a0);
    return `M${x0} ${y0}A${r1} ${r1} 0 0 1 ${x1} ${y1}L${x2} ${y2}A${r0} ${r0} 0 0 0 ${x3} ${y3}Z`; };
  const area = (d, s, cls) => `<path d="${d}" class="${cls}${hit === s ? ' hit' : ''}" data-act="dt_throw" data-s="${s}" role="button" tabindex="0" aria-label="${esc(dartName(s))}"/>`;
  let out = `<circle r="226" class="dt-rim"/>`;
  DART_ORDER.forEach((n, k) => {
    const a0 = rad(-99 + 18 * k), a1 = rad(-81 + 18 * k), dark = k % 2 === 0;
    out += area(sector(34, 110, a0, a1), 'S' + n, dark ? 'dt-dk' : 'dt-lt') + area(sector(110, 142, a0, a1), 'T' + n, dark ? 'dt-rd' : 'dt-gn')
      + area(sector(142, 170, a0, a1), 'S' + n, dark ? 'dt-dk' : 'dt-lt') + area(sector(170, 202, a0, a1), 'D' + n, dark ? 'dt-rd' : 'dt-gn');
    const [x, y] = P(214, rad(-90 + 18 * k));
    out += `<text x="${x}" y="${y}" class="dt-num" aria-hidden="true">${n}</text>`;
  });
  // the outer bull is a ring around the bull (each lights up on its own)
  out += `<path d="M0 -34A34 34 0 1 1 0 34A34 34 0 1 1 0 -34ZM0 -16A16 16 0 1 0 0 16A16 16 0 1 0 0 -16Z" fill-rule="evenodd" class="dt-gn${hit === 'SB' ? ' hit' : ''}" data-act="dt_throw" data-s="SB" role="button" tabindex="0" aria-label="${esc(dartName('SB'))}"/>`
    + `<circle r="16" class="dt-rd${hit === 'DB' ? ' hit' : ''}" data-act="dt_throw" data-s="DB" role="button" tabindex="0" aria-label="${esc(dartName('DB'))}"/>`;
  return `<svg class="dt-board" viewBox="-230 -230 460 460" role="group" aria-label="${esc(t('dart_board'))}">${out}</svg>`;
}

/* ---------- the rules of each mode: every dart in order, worked out again from the start (Undo = one dart less) ---------- */
const dartsKind = g => (['301', '501'].includes(g.mode) ? 'down' : g.mode === 'custom' ? ((g.options || {}).custom_kind === 'up' ? 'up' : 'down') : g.mode);
function dartsPlay(g) {
  const o = g.options || {}, kind = dartsKind(g), n = g.sides.length;
  const start = g.mode === '301' ? 301 : g.mode === '501' ? 501 : Math.max(2, Math.min(1001, +o.custom_n || 101));
  const target = Math.max(1, Math.min(10000, +o.custom_n || 100)), rounds = Math.max(1, Math.min(30, +o.rounds || 5)), dbl = !!o.double_out && kind === 'down';
  const S = g.sides.map(s => ({ name: s.name, room: s.room || null, team: s.team || null, score: kind === 'down' ? start : 0, next: 1, marks: [0, 0, 0, 0, 0, 0, 0] }));
  const turns = S.map(() => []);
  // the players there from the start; a newcomer from the moment they joined ({ j } in the record)
  const joined = new Set(((g.state || {}).throws || []).filter(ev => ev.j != null).map(ev => +ev.j)), active = S.map((s, i) => !joined.has(i));
  const nextOf = k0 => { for (let q = 1; q <= n; q++) { const k = (k0 + q) % n; if (active[k]) return k; } return k0; };
  let turn = Math.max(0, active.indexOf(true)), round = 1, cur = [], base = 0, over = false, winners = [], last = null;
  const endTurn = () => {
    turns[turn].push(cur.some(x => x.bust) ? 'bust' : cur.reduce((a, x) => a + x.v, 0)); last = { i: turn, darts: cur };
    cur = []; const nx = nextOf(turn); if (nx <= turn) round++; turn = nx;
    if (kind === 'highest' && round > rounds) { over = true; winners = leadersBy(S.map(s => s.score)); }
  };
  for (const ev of (g.state || {}).throws || []) {
    if (over) break;
    if (ev.j != null) { if (S[ev.j]) active[ev.j] = true; continue; }
    if (ev.c != null) { const s = S[ev.i]; if (!s) continue; if (kind === 'around_clock') s.next = Math.max(1, Math.min(21, +ev.c)); else s.score = Math.max(0, +ev.c || 0); continue; }
    const me = S[turn], dt = dartOf(ev.s), x = { s: ev.s, v: dt.v };
    if (!cur.length) base = me.score;
    if (kind === 'down') {
      const left = me.score - dt.v;
      // a bust: below zero, one left with double out, or zero not on a double with double out – the turn counts nothing
      if (left < 0 || (dbl && left === 1) || (left === 0 && dbl && dt.m !== 2)) { x.bust = true; me.score = base; cur.push(x); endTurn(); continue; }
      me.score = left; cur.push(x);
      if (left === 0) { over = true; winners = [turn]; me.out = ev.s; continue; }
    } else if (kind === 'up' || kind === 'highest') {
      me.score += dt.v; cur.push(x);
      if (kind === 'up' && me.score >= target) { over = true; winners = [turn]; continue; }
    } else if (kind === 'around_clock') {
      const want = me.next > 20 ? 25 : me.next;
      if (dt.n === want) { x.hit = true; me.next++; }
      cur.push(x);
      if (me.next > (o.bull_finish ? 21 : 20)) { over = true; winners = [turn]; continue; }
    } else if (kind === 'cricket') {
      const k = CRICKET.indexOf(dt.n);
      for (let q = 0; k >= 0 && q < dt.m; q++) {
        if (me.marks[k] < 3) me.marks[k]++;
        else if (S.some((s, j) => j !== turn && s.marks[k] < 3)) me.score += dt.n;
      }
      cur.push(x);
      if (me.marks.every(m => m >= 3) && S.every((s, j) => j === turn || me.score >= s.score)) { over = true; winners = [turn]; continue; }
    }
    if (cur.length === 3) endTurn();
  }
  if (kind === 'around_clock') S.forEach(s => { s.score = Math.min(s.next - 1, o.bull_finish ? 21 : 20); });
  const sides = S.map(s => Object.assign({ name: s.name, room: s.room, team: s.team, score: s.score }, kind === 'cricket' ? { marks: s.marks } : {}, kind === 'around_clock' ? { next: s.next } : {}));
  const leaders = kind === 'down' ? leadersBy(S.map(s => s.score), true) : kind === 'cricket' ? leadersBy(S.map(s => s.marks.reduce((a, m) => a + Math.min(3, m), 0) * 1000 + s.score)) : leadersBy(S.map(s => s.score));
  return { kind, sides, S, turns, turn, round, rounds, cur, last, over, winners, leaders, start, target, dbl };
}
const dartsBig = (d, s) => (d.kind === 'around_clock' ? (s.next > 20 ? (s.next > 21 ? '✓' : 'BULL') : s.next) : s.score);
const dartsBigLabel = d => t({ down: 'dt_remaining', up: 'dt_points', highest: 'dt_points', around_clock: 'dt_next_number', cricket: 'dt_points' }[d.kind]);
const markTxt = m => ['', '/', 'X', 'Ⓧ'][Math.min(3, m)];
function cricketTable(sides, nowTurn) {
  return `<div class="tablewrap"><table class="dt-cricket"><thead><tr><th></th>${sides.map((s, i) => `<th class="${i === nowTurn ? 'on' : ''}">${esc(s.name)}</th>`).join('')}</tr></thead><tbody>
    ${CRICKET.map((num, k) => `<tr><th>${num === 25 ? 'BULL' : num}</th>${sides.map(s => `<td class="${(s.marks || [])[k] >= 3 ? 'closed' : ''}">${markTxt((s.marks || [])[k] || 0)}</td>`).join('')}</tr>`).join('')}
    <tr class="pts"><th>${esc(t('dt_points'))}</th>${sides.map(s => `<td>${s.score}</td>`).join('')}</tr></tbody></table></div>`;
}

gameEngine('darts', {
  // the setup of each mode (Match setup)
  options: (ty, mode) => (['301', '501'].includes(mode) ? [{ k: 'double_out', type: 'bool', label: t('dt_double_out'), hint: t('dt_double_out_hint') }]
    : mode === 'highest' ? [{ k: 'rounds', type: 'number', label: t('rounds'), min: 1, max: 30, def: 5 }]
    : mode === 'around_clock' ? [{ k: 'bull_finish', type: 'bool', label: t('dt_bull_finish') }]
    : mode === 'custom' ? [{ k: 'custom_kind', type: 'choice', label: t('dt_custom_kind'), options: [['down', t('dt_count_down')], ['up', t('dt_count_up')]], def: 'down' },
      { k: 'custom_n', type: 'number', label: t('dt_custom_n'), min: 2, max: 1001, def: 101, hint: t('dt_custom_n_hint') },
      { k: 'double_out', type: 'bool', label: t('dt_double_out'), hint: t('dt_double_out_hint') }] : []),
  sides: { min: 1, max: 8 },
  play: dartsPlay,
  view(g, d) {
    const cur = d.cur, me = d.S[d.over ? d.winners[0] : d.turn], hit = GM?.ui?.hit;
    const sum = cur.reduce((a, x) => a + x.v, 0), lastEv = ((g.state || {}).throws || []).filter(x => x.j == null).slice(-1)[0];
    const cards = d.S.map((s, i) => { const lt = d.turns[i].slice(-1)[0];
      return `<div class="dt-side ${!d.over && i === d.turn ? 'on' : ''} ${d.over && d.winners.includes(i) ? 'win' : ''}"><span class="nm"><b>${esc(s.name)}</b>${gameWho(s) ? `<small>${esc(gameWho(s))}</small>` : ''}</span>
        <b class="big" aria-label="${esc(dartsBigLabel(d))}">${esc(String(dartsBig(d, s)))}</b><small class="muted">${lt == null ? '&nbsp;' : esc(t('dt_last_turn')) + ': ' + (lt === 'bust' ? esc(t('dt_bust')) : lt)}</small></div>`; }).join('');
    const slots = [0, 1, 2].map(k => { const x = cur[k]; return `<span class="dt-slot ${x ? 'set' : ''} ${x?.bust ? 'bust' : ''} ${x?.hit ? 'hit' : ''}"><small>${esc(t('dt_throw_n', { n: k + 1 }))}</small><b>${x ? esc(dartShort(x.s)) : '–'}</b>${x ? `<i>${x.bust ? esc(t('dt_bust')) : x.v}</i>` : ''}</span>`; }).join('');
    const info = d.over ? '' : d.kind === 'down' ? t('dt_turn_left', { sum, left: me.score }) : d.kind === 'around_clock' ? t('dt_turn_target', { n: me.next > 20 ? 'BULL' : me.next }) : t('dt_turn_sum', { sum });
    return `<div class="dt-play">
      <p class="dt-round muted small">${esc(t(d.kind === 'highest' ? 'dt_round_of' : 'dt_round', { n: Math.min(d.round, d.rounds), m: d.rounds }))}${d.dbl ? ' · ' + esc(t('dt_double_out')) : ''}${d.kind === 'up' ? ' · ' + esc(t('first_to', { n: d.target })) : ''}</p>
      <div class="dt-sides">${cards}</div>
      ${d.over ? `<div class="gm-win">${ico('trophy')}<span>${esc(t('winner'))}</span><b>${esc(winnerNames(g, d.winners))}</b><button class="btn" data-act="gm_complete">${ico('check')} ${esc(t('complete_game'))}</button></div>`
        : `<div class="dt-turn"><span class="who">${esc(t('dt_turn'))}: <b>${esc(me.name)}</b></span><div class="dt-slots">${slots}</div><small class="muted">${esc(info)}</small></div>`}
      ${d.kind === 'cricket' ? cricketTable(d.sides, d.over ? -1 : d.turn) : ''}
      ${lastEv && lastEv.s ? `<p class="dt-last" role="status">${esc(dartName(lastEv.s))} = <b>${dartOf(lastEv.s).v}</b></p>` : `<p class="dt-last muted">${esc(t('dt_tap_board'))}</p>`}
      ${d.over ? '' : `<div class="dt-board-wrap">${dartBoard(hit)}</div>`}
      <div class="gm-tools">${d.over ? '' : `<button class="btn secondary lg" data-act="dt_throw" data-s="M">${esc(t('dt_miss'))} (0)</button>`}
        <button class="btn secondary lg" data-act="gm_undo" ${lastEv ? '' : 'disabled'}>${ico('undo')} ${esc(t('dt_undo'))}</button>
        <button class="btn secondary lg" data-act="gm_correct">${ico('edit')} ${esc(t('correct_score'))}</button></div></div>`;
  },
  board(g) {
    const kind = dartsKind(g), s0 = g.sides || [];
    if (kind === 'cricket') return cricketTable(s0, -1);
    const order = s0.map((s, i) => Object.assign({ i }, s)).sort((a, b) => (kind === 'down' ? a.score - b.score : b.score - a.score));
    return `<ol class="board">${order.map((s, r) => `<li class="${r === 0 ? 'lead' : ''}"><span class="rank">${r + 1}</span><span class="who"><b>${esc(s.name)}</b>${gameWho(s) ? `<small>${esc(gameWho(s))}</small>` : ''}</span><span class="pts">${kind === 'around_clock' ? (s.next > 20 ? 'BULL' : s.next || 1) : +s.score || 0}</span></li>`).join('')}</ol>
      <p class="muted small">${esc(t(kind === 'down' ? 'dt_board_down' : kind === 'around_clock' ? 'dt_board_atc' : 'dt_board_up'))}</p>`;
  },
  // the TV: the scoreboard – each player large (who throws now marked, the winner), the darts of this turn, cricket's marks
  display(g, d) {
    const live = g.status === 'in_progress' && !d.over, me = d.S[d.turn];
    const info = [modeLabel(g.mode), t(d.kind === 'highest' ? 'dt_round_of' : 'dt_round', { n: Math.min(d.round, d.rounds), m: d.rounds }), d.dbl ? t('dt_double_out') : '', d.kind === 'up' ? t('first_to', { n: d.target }) : ''].filter(Boolean).join(' · ');
    const cards = d.S.map((s, i) => { const lt = d.turns[i].slice(-1)[0];
      return { name: s.name, who: gameWho(s), big: dartsBig(d, s), sub: dartsBigLabel(d) + (lt == null ? '' : ' · ' + t('dt_last_turn') + ': ' + (lt === 'bust' ? t('dt_bust') : lt)), on: live && i === d.turn, win: d.over && d.winners.includes(i) }; });
    const turn = live ? `<div class="dm-turn" aria-live="polite"><b>${esc(t('dt_turn'))}: ${esc(me.name)}</b>${[0, 1, 2].map(k => { const x = d.cur[k]; return `<span class="${x?.bust ? 'bust' : ''}">${x ? esc(dartShort(x.s)) : '–'}</span>`; }).join('')}</div>` : '';
    return scoreScreen(info, cards, turn + (d.kind === 'cricket' ? cricketTable(d.sides, live ? d.turn : -1) : ''));
  },
  summary: g => (g.sides || []).map(s => s.name + ' ' + (dartsKind(g) === 'around_clock' ? (s.next > 20 ? 'BULL' : s.next || 1) : +s.score || 0)).join(' · '),
  // undo takes back the last dart (or correction) – never a player who joined
  undo: st => { const a = st.throws || []; for (let k = a.length - 1; k >= 0; k--) if (a[k].j == null) { a.splice(k, 1); break; } return st; },
  join: 'side',
  joinState: (st, i) => { (st.throws = st.throws || []).push({ j: i }); return st; },
  joinWarn: (g, d) => (d.kind === 'down' ? t('dtj_down', { n: d.start }) : d.kind === 'highest' ? t('dtj_highest', { n: Math.max(0, d.rounds - d.round + 1) })
    : d.kind === 'around_clock' ? t('dtj_atc') : d.kind === 'cricket' ? t('dtj_cricket') : t('dtj_up', { n: d.target })),
  correct(g, d) {
    const f = [{ k: 'i', type: 'select', num: true, label: t('player_or_team'), options: d.S.map((s, i) => [i, s.name]) },
      d.kind === 'around_clock' ? { k: 'v', type: 'number', label: t('dt_next_number'), min: 1, max: 21, req: true, hint: t('dt_atc_hint') }
        : { k: 'v', type: 'number', label: dartsBigLabel(d), min: 0, max: 10000, req: true }];
    const i0 = d.over ? d.winners[0] : d.turn;
    formBox(t('correct_score'), f, { i: i0, v: d.kind === 'around_clock' ? d.S[i0].next : d.S[i0].score }, r => {
      gmChange(st => { (st.throws = st.throws || []).push({ i: r.i, c: r.v }); return st; });
    }, { saveLabel: t('save') });
  }
});
// a dart on the board: shown at once (the area lights up, its value is said), worked out, saved; a checkout asks first
ACT.dt_throw = async el => {
  if (!GM || !gmLive() || GM.d.over) return;
  const s = el.dataset.s; gmUi('hit', s);
  gmChange(st => { (st.throws = st.throws || []).push({ s }); return st; });
  if (GM.d.over && GM.d.kind !== 'highest') {
    const names = GM.d.winners.map(i => GM.g.sides[i]?.name).filter(Boolean).join(' & ');
    if (await confirmBox(t('dt_checkout_q', { name: names, dart: dartName(s) }), t('complete_game'))) ACT.gm_complete();
    else gmChange(st => { st.throws.pop(); return st; });
  }
};

'use strict';
/* Mr Hassan · systems/game-chance.js — the chance games of the Games Library: every draw is made by the database (game_draw) and only shown
   here. ONE WHEEL engine for every saved wheel – Roulette / Chooser ("Which game?") and Spin & Win (prizes: a prize is counted, a
   prize won out leaves the wheel until the manager resets it): the wheel turns exactly to the segment the database chose. The
   ARROW spins and stops at a direction. RANDOM NUMBER: a whole number of a range, very large; "no repeat" during the session;
   Reset. Each has its display screen (its own window follows the same session – the same draw, never one of its own) in the
   theme of the game.
   Uses: translations/languages · supabase · core/utils · icons/icons · components/modals · core/actions · components/display ·
         systems/team-schedule · systems/games */
/* ---------- the drawing: a wheel of segments, the arrow ---------- */
// readable ink on a colour (dark on light colours, white on dark ones)
const inkOn = c => { const n = parseInt(String(c || '#000000').slice(1), 16), r = n >> 16, g = (n >> 8) & 255, b = n & 255; return r * 0.299 + g * 0.587 + b * 0.114 > 150 ? '#1b140c' : '#ffffff'; };
function wheelSvg(items, rot, th) {
  const n = Math.max(1, items.length), seg = 360 / n, R = 200, pal = themeWheel(th);
  const pt = a => { const r = ((a - 90) * Math.PI) / 180; return `${(R * Math.cos(r)).toFixed(2)} ${(R * Math.sin(r)).toFixed(2)}`; };
  const fs = n > 14 ? 12 : n > 9 ? 15 : 19;
  const segs = items.map((it, i) => {
    const col = it.color || pal[i % pal.length], a0 = i * seg, mid = a0 + seg / 2, lab = it.label.length > 16 ? it.label.slice(0, 15) + '…' : it.label;
    const shape = n === 1 ? `<circle r="${R}" fill="${esc(col)}"/>` : `<path d="M0 0L${pt(a0)}A${R} ${R} 0 ${seg > 180 ? 1 : 0} 1 ${pt(a0 + seg)}Z" fill="${esc(col)}" class="wh-seg"/>`;
    // the names on the left half turned the right way up (readable without turning the head)
    return shape + `<text transform="rotate(${(mid - 90).toFixed(2)}) translate(${R * 0.6} 0)${mid > 180 ? ' rotate(180)' : ''}" fill="${inkOn(col)}" font-size="${fs}" text-anchor="middle" dominant-baseline="middle">${esc(lab)}</text>`;
  }).join('');
  return `<svg class="wh-svg" viewBox="-212 -212 424 424" role="img" aria-label="${esc(items.map(x => x.label).join(', '))}">
    <g class="wh-rot" style="transform:rotate(${rot}deg)">${segs}<circle r="${R}" class="wh-rim"/></g><circle r="24" class="wh-hub"/></svg>`;
}
function arrowSvg(rot) {
  const ticks = Array.from({ length: 12 }, (_, i) => `<line x1="0" y1="-190" x2="0" y2="${i % 3 ? -176 : -166}" transform="rotate(${i * 30})"/>`).join('');
  return `<svg class="wh-svg ar-svg" viewBox="-212 -212 424 424" role="img" aria-label="${esc(t('sp_arrow'))}"><circle r="200" class="ar-dial"/><g class="ar-ticks">${ticks}</g>
    <g class="wh-rot" style="transform:rotate(${rot}deg)"><circle r="200" fill="none"/><path d="M0 -168 30 -96 9 -104 9 120 -9 120 -9 -104 -30 -96Z" class="ar-arrow"/></g><circle r="18" class="wh-hub"/></svg>`;
}

/* ---------- turning to the result: the screen turns forward (never back) to the angle of the draw ---------- */
// where a draw stops: a wheel's segment under the pointer (a little off its middle, the same on every screen), the arrow's direction
function chanceAngle(g, last) {
  if (!last) return 0;
  if (g.game_type === 'arrow') return +last.a || 0;
  const items = last.items || [], i = Math.max(0, items.findIndex(x => x.id === last.o)), seg = 360 / Math.max(1, items.length);
  const off = ((((last.k || 0) * 37) % 60) - 30) / 100 * seg;
  return (((360 - (i + 0.5) * seg - off) % 360) + 360) % 360;
}
// the screen's own turning state: the angle it rests at, the draw it shows, whether it is turning now (never saved)
function chanceInit(g) {
  const last = g.state?.last;
  if (gmUi('shown') === undefined) { gmUi('shown', last?.k || 0); gmUi('rot', chanceAngle(g, last)); }
  return { last, pending: !!last && last.k !== gmUi('shown'), rot: gmUi('rot') || 0 };
}
// after the screen is drawn: a new draw (this phone's, or the display following another phone) turns to its result
function chanceAfter(M, root) {
  const g = M.g, last = g.state?.last, ui = M.ui;
  if (!last || last.k === ui.shown || ui.anim) return;
  if (g.game_type === 'random_number') { ui.shown = last.k; return; }             // the number appears at once (its own little animation)
  const el = $('.wh-rot', root); if (!el) return;
  const from = ui.rot || 0, base = from - (((from % 360) + 360) % 360), turns = matchMedia('(prefers-reduced-motion: reduce)').matches ? 1 : 6;
  const to = base + 360 * turns + chanceAngle(g, last), secs = matchMedia('(prefers-reduced-motion: reduce)').matches ? 0.6 : themeSpeed(gameTheme(g));
  ui.anim = true; ui.rot = to;
  el.getBoundingClientRect();
  el.style.transition = `transform ${secs}s cubic-bezier(.12,.67,.12,1)`; el.style.transform = `rotate(${to}deg)`;
  let done = false;
  const end = () => { if (done) return; done = true; ui.anim = false; ui.shown = last.k; if (GM === M) gmDraw(); };
  el.addEventListener('transitionend', end, { once: true });
  setTimeout(end, secs * 1000 + 400);
}
// every draw goes to the database, one at a time: it draws; the screen shows what it drew
async function chDraw(action) {
  const M = GM; if (!M || !gmLive() || M.ui.anim || M.ui.busy) return;
  M.ui.busy = true;
  try {
    const j = await api('game_draw', { p_id: M.g.id, p_action: action });
    if (GM !== M) return;
    if (action !== 'spin') { gmUi('shown', undefined); }                      // undo / reset: no turning, the screen rests at the result
    gmTake(j.row, M.g.access); gmDraw();
  } finally { M.ui.busy = false; }
}
ACT.ch_spin = () => chDraw('spin');
ACT.ch_undo = async () => { if (await confirmBox(t('ch_undo_q'), t('ch_undo'))) await chDraw('undo'); };
ACT.ch_reset = async () => { if (await confirmBox(t('rn_reset_q'), t('rn_reset'))) await chDraw('reset'); };
// the end of a chance game: its result (the last segment, the prizes won, the numbers drawn) stays in the history
ACT.ch_end = async () => {
  const g = GM.g, w = chanceResult(g);
  if (!await confirmBox(w ? t('ch_end_q', { result: w }) : t('end_game_q'), t('complete_game'))) return;
  await gmSet({ status: 'completed', winner: w || null }, t('game_completed'));
};
const chEnd = () => `<button class="btn ghost" data-act="ch_end">${ico('flag')} ${esc(t('end_game'))}</button>`;
const chDraws = g => (g.state || {}).draws || [];
// what a chance game came to: the last result of a roulette, the prizes of a Spin & Win, the numbers drawn
function chanceResult(g) {
  const dr = chDraws(g);
  if (!dr.length) return '';
  if (g.game_type === 'roulette') return dr[dr.length - 1].l || '';
  if (g.game_type === 'spin_win') { const won = {}; dr.filter(x => !x.miss).forEach(x => { won[x.l] = (won[x.l] || 0) + 1; }); return Object.entries(won).map(([l, n]) => (n > 1 ? `${l} ×${n}` : l)).join(', '); }
  if (g.game_type === 'random_number') return dr.slice(-12).map(x => x.n).join(', ');
  return '';
}
const chHistory = (g, fmt) => { const dr = chDraws(g).slice().reverse(); return dr.length > 1 ? `<div class="ch-hist"><small class="muted">${esc(t('ch_before'))}</small> ${dr.slice(1, 13).map(x => `<span>${esc(fmt(x))}</span>`).join('')}</div>` : ''; };
const chTools = (g, more = '') => `<div class="gm-tools"><button class="btn ghost big" data-act="ch_undo" ${chDraws(g).length ? '' : 'disabled'}>${ico('undo')} ${esc(t('ch_undo'))}</button>${more}</div>`;

/* ---------- THE WHEEL: Roulette / Chooser and Spin & Win ---------- */
// the wheel of the last spin (the one the screen turned to its result); before the first spin: the wheel as it is now
const wheelItems = (g, c) => (c.last?.items?.length ? c.last.items : g.wheel?.items || []);
function wheelResult(g, c) {
  if (!c.last || c.pending || gmUi('anim')) return `<div class="ch-res wait" aria-live="polite">${esc(t(c.pending || gmUi('anim') ? 'ch_spinning' : 'ch_ready'))}</div>`;
  const it = (c.last.items || []).find(x => x.id === c.last.o) || {};
  if (g.game_type === 'spin_win') return it.miss ? `<div class="ch-res miss" aria-live="polite"><b>${esc(it.label || '')}</b></div>`
    : `<div class="ch-res win" aria-live="polite"><span>🎉 ${esc(t('you_won'))}</span><b>${esc(it.label || '')}</b></div>`;
  return `<div class="ch-res" aria-live="polite"><span>${esc(t('ch_result'))}</span><b>${esc(it.label || '')}</b></div>`;
}
gameEngine('wheel', {
  options: () => [],
  sides: { min: 0, max: 0 },
  play: g => ({ sides: [], draws: chDraws(g), over: false, winners: [], leaders: [] }),
  view(g) {
    const c = chanceInit(g), items = wheelItems(g, c), th = gameTheme(g), left = (g.wheel?.items || []).length;
    const prizes = g.game_type === 'spin_win' ? `<ul class="wh-prizes">${(g.wheel?.items || []).filter(x => !x.miss).map(x => `<li><b>${esc(x.label)}</b><span>${x.left == null ? esc(t('wh_no_limit')) : esc(t('wh_left', { n: x.left }))}</span></li>`).join('')}</ul>` : '';
    return `<div class="ch ch-wheel"><div class="wh-box"><span class="wh-pin" aria-hidden="true"></span>${wheelSvg(items, c.rot, th)}</div>${wheelResult(g, c)}
      ${left ? `<button class="btn big wide" data-act="ch_spin" ${gmUi('anim') || c.pending ? 'disabled' : ''}>${ico('repeat')} ${esc(t(chDraws(g).length ? 'ch_spin_again' : 'ch_spin'))}</button>`
        : `<p class="hint-box warn">${ico('gift')}<span>${esc(t('wh_empty'))}</span></p>`}
      ${prizes}${chHistory(g, x => x.l)}${chTools(g)}</div>`;
  },
  board: g => { const dr = chDraws(g); return `<p class="muted">${esc(g.options?.wheel_name || '')} · ${esc(t('ch_spins', { n: dr.length }))}</p>${dr.length ? `<ol class="ch-list">${dr.slice().reverse().map(x => `<li><b>${esc(x.l)}</b>${x.at ? `<small class="muted">${esc(clockTime(x.at))}</small>` : ''}</li>`).join('')}</ol>` : ''}`; },
  // the TV: the large wheel, the title, the turning, the result – nothing to press
  display(g) {
    const c = chanceInit(g);
    return `<div class="dm-wheel"><div class="wh-box big"><span class="wh-pin" aria-hidden="true"></span>${wheelSvg(wheelItems(g, c), c.rot, gameTheme(g))}</div>${wheelResult(g, c)}</div>`;
  },
  summary: g => chanceResult(g) || t('ch_spins', { n: chDraws(g).length }),
  endButton: chEnd,
  after: chanceAfter,
  undo: st => st,
  correct: () => {}
});

/* ---------- THE ARROW: it spins and stops at a direction (who starts, which way, which team) ---------- */
gameEngine('arrow', {
  options: () => [],
  sides: { min: 0, max: 0 },
  play: g => ({ sides: [], draws: chDraws(g), over: false, winners: [], leaders: [] }),
  view(g) {
    const c = chanceInit(g);
    return `<div class="ch ch-arrow"><div class="wh-box">${arrowSvg(c.rot)}</div>
      <div class="ch-res ${c.last && !c.pending && !gmUi('anim') ? '' : 'wait'}" aria-live="polite">${esc(t(!c.last ? 'ar_ready' : c.pending || gmUi('anim') ? 'ch_spinning' : 'ar_stopped'))}</div>
      <button class="btn big wide" data-act="ch_spin" ${gmUi('anim') || c.pending ? 'disabled' : ''}>${ico('repeat')} ${esc(t(chDraws(g).length ? 'ch_spin_again' : 'ch_spin'))}</button>${chTools(g)}</div>`;
  },
  board: g => `<p class="muted">${esc(t('ch_spins', { n: chDraws(g).length }))}</p>`,
  display(g) { const c = chanceInit(g); return `<div class="dm-wheel"><div class="wh-box big">${arrowSvg(c.rot)}</div></div>`; },
  summary: g => t('ch_spins', { n: chDraws(g).length }),
  endButton: chEnd,
  after: chanceAfter,
  undo: st => st,
  correct: () => {}
});

/* ---------- RANDOM NUMBER: a whole number from … to …, very large; "no repeat during this session" (until Reset) ---------- */
const rnCfg = g => { const o = g.options || {}, dr = chDraws(g), from = Math.min(+(g.state || {}).from_k || 0, dr.length);
  const used = new Set(dr.slice(from).map(x => x.n)), size = (+o.to - +o.from) + 1; return { lo: +o.from, hi: +o.to, no: !!o.no_repeat, left: size - used.size, size }; };
function rnBig(g) {
  const c = chanceInit(g), n = c.last ? c.last.n : null;
  return `<div class="rn-big ${c.pending ? 'pop' : ''}" aria-live="polite">${n == null ? '?' : esc(String(n))}</div>`;
}
gameEngine('random', {
  options: () => [{ k: 'from', type: 'number', label: t('rn_from'), def: 1, req: true }, { k: 'to', type: 'number', label: t('rn_to'), def: 100, req: true },
    { k: 'no_repeat', type: 'bool', label: t('rn_no_repeat'), hint: t('rn_no_repeat_hint') }],
  sides: { min: 0, max: 0 },
  play: g => ({ sides: [], draws: chDraws(g), over: false, winners: [], leaders: [] }),
  view(g) {
    const r = rnCfg(g);
    return `<div class="ch ch-rand"><p class="muted">${esc(t('rn_range', { a: r.lo, b: r.hi }))}${r.no ? ' · ' + esc(t('rn_left', { n: r.left, m: r.size })) : ''}</p>${rnBig(g)}
      <button class="btn big wide" data-act="ch_spin" ${r.no && !r.left ? 'disabled' : ''}>${ico('dice')} ${esc(t(chDraws(g).length ? 'rn_again' : 'rn_generate'))}</button>
      ${r.no && !r.left ? `<p class="hint-box warn">${ico('info')}<span>${esc(t('err_numbers_all_drawn'))}</span></p>` : ''}
      ${chHistory(g, x => x.n)}${chTools(g, r.no ? `<button class="btn ghost big" data-act="ch_reset">${ico('repeat')} ${esc(t('rn_reset'))}</button>` : '')}</div>`;
  },
  board: g => { const dr = chDraws(g); return `<p class="muted">${esc(t('rn_range', { a: g.options?.from, b: g.options?.to }))} · ${esc(t('ch_spins', { n: dr.length }))}</p>${dr.length ? `<p class="rn-all">${dr.map(x => `<span>${esc(String(x.n))}</span>`).join('')}</p>` : ''}`; },
  display(g) { const r = rnCfg(g); return `<div class="dm-rand">${rnBig(g)}<p class="dm-count">${esc(t('rn_range', { a: r.lo, b: r.hi }))}</p>${chHistory(g, x => x.n)}</div>`; },
  summary: g => chanceResult(g) || t('ch_spins', { n: 0 }),
  endButton: chEnd,
  after: chanceAfter,
  undo: st => st,
  correct: () => {}
});

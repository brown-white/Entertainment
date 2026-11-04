'use strict';
/* Mr Hassan · systems/game-bingo.js — the Bingo engine: the caller (the next number drawn by the database among the numbers not called yet, a
   number by hand, undo the last, reset the board, pause / resume, start a new game, end), 90 or 75 balls (75: B-I-N-G-O), the
   board of called numbers, the winner, and its DISPLAY MODE for a TV or projector (the current number very large, the last
   ones, the board, the status – no controls – in the theme of the game). A number is called once per game, always: the
   database refuses a second time; a new game starts with none.
   Uses: translations/languages · supabase · core/utils · icons/icons · components/modals · core/actions · components/forms ·
         systems/games */
const bingoMax = g => (g.mode === '75' ? 75 : 90);
const bingoCalled = g => ((g.state || {}).called || []).map(Number);
// 75 balls: the letter of the column (B 1–15, I 16–30, N 31–45, G 46–60, O 61–75)
const bingoBall = (g, n) => (n == null ? '–' : g.mode === '75' ? 'BINGO'[Math.min(4, Math.floor((n - 1) / 15))] + ' ' + n : String(n));
function bingoGrid(g, big) {
  const on = new Set(bingoCalled(g)), last = bingoCalled(g).slice(-1)[0], cell = n => `<span class="${on.has(n) ? 'used' : ''} ${n === last ? 'last' : ''}">${n}</span>`;
  if (g.mode === '75') return `<div class="bg-grid75 ${big ? 'big' : ''}">${'BINGO'.split('').map((l, c) => `<b class="bg-l">${l}</b>${Array.from({ length: 15 }, (_, k) => cell(c * 15 + k + 1)).join('')}`).join('')}</div>`;
  return `<div class="numgrid bingo-board ${big ? 'big' : ''}">${Array.from({ length: 90 }, (_, i) => cell(i + 1)).join('')}</div>`;
}
gameEngine('bingo', {
  options: () => [],
  sides: { min: 0, max: 0 },
  play: g => { const c = bingoCalled(g); return { sides: [], called: c, last: c[c.length - 1], left: bingoMax(g) - c.length, over: false, winners: [], leaders: [] }; },
  view(g, d) {
    return `<div class="card center bingo-caller"><div class="ball" aria-live="polite">${esc(bingoBall(g, d.last))}</div>
      <p class="muted">${esc(t('bingo_count', { n: d.called.length, max: bingoMax(g) }))} · ${esc(t('bingo_left', { n: d.left }))}</p>
      <button class="btn big wide" data-act="bg_next" ${d.left ? '' : 'disabled'}>${esc(t('bingo_draw'))}</button>
      <div class="gm-tools"><button class="btn ghost big" data-act="bg_manual" ${d.left ? '' : 'disabled'}>${ico('edit')} ${esc(t('bingo_manual'))}</button>
        <button class="btn ghost big" data-act="bg_undo" ${d.called.length ? '' : 'disabled'}>${ico('undo')} ${esc(t('bingo_undo'))}</button>
        <button class="btn ghost big" data-act="bg_reset" ${d.called.length ? '' : 'disabled'}>${ico('trash')} ${esc(t('bingo_reset'))}</button>
        <button class="btn ghost big" data-act="bg_new">${ico('repeat')} ${esc(t('bingo_new'))}</button></div></div>
      ${d.called.length > 1 ? `<p class="bg-prev"><small class="muted">${esc(t('bingo_before'))}</small> ${d.called.slice(-6, -1).reverse().map(n => `<span>${esc(bingoBall(g, n))}</span>`).join('')}</p>` : ''}
      ${bingoGrid(g, false)}`;
  },
  board: g => { const c = bingoCalled(g); return `<p>${esc(t('bingo_count', { n: c.length, max: bingoMax(g) }))}${c.length ? ' · ' + esc(t('bingo_last')) + ': <b>' + esc(bingoBall(g, c[c.length - 1])) + '</b>' : ''}</p>${bingoGrid(g, false)}`; },
  // the TV: the title, the number very large, the ones before it, the board, how many are left – nothing to press
  display(g) {
    const c = bingoCalled(g), last = c[c.length - 1];
    return `<div class="dm-bingo">${g.status === 'in_progress' ? '' : `<p class="dm-status">${gameStatus(g.status)}</p>`}
      <div class="dm-left"><div class="dm-ball" aria-live="polite">${esc(bingoBall(g, last))}</div>
        <div class="dm-prev">${c.slice(-6, -1).reverse().map(n => `<span>${esc(bingoBall(g, n))}</span>`).join('')}</div>
        <p class="dm-count">${esc(t('bingo_count', { n: c.length, max: bingoMax(g) }))} · ${esc(t('bingo_left', { n: bingoMax(g) - c.length }))}</p>
        ${g.status === 'completed' && g.winner ? `<p class="dm-win">${ico('trophy')} ${esc(g.winner)}</p>` : ''}</div>${bingoGrid(g, true)}</div>`;
  },
  summary: g => t('bingo_count', { n: bingoCalled(g).length, max: bingoMax(g) }),
  endButton: () => `<button class="btn ghost" data-act="bg_end">${ico('flag')} ${esc(t('end_game'))}</button>`,
  undo: st => st,
  correct: () => {}
});
// every call goes to the database, one at a time: it draws the number (or takes the one called by hand) and refuses a repeat
async function bgCall(action, n) {
  if (!GM || !gmLive()) return;
  const j = await api('game_draw', { p_id: GM.g.id, p_action: action, p_number: n ?? null });
  gmOpen(Object.assign(j.row, { access: GM.g.access })); gmDraw();
  return j;
}
ACT.bg_next = () => bgCall('next');
// reset: the board starts again with no number called (the same game)
ACT.bg_reset = async () => { if (await confirmBox(t('bingo_reset_q'), t('bingo_reset'))) await bgCall('reset'); };
ACT.bg_undo = async () => { if (await confirmBox(t('bingo_undo_q', { n: bingoBall(GM.g, GM.d.last) }), t('bingo_undo'))) await bgCall('undo'); };
ACT.bg_manual = () => formBox(t('bingo_manual'), [{ k: 'n', type: 'number', label: t('bingo_number'), min: 1, max: bingoMax(GM.g), req: true, hint: t('bingo_manual_hint', { max: bingoMax(GM.g) }) }], {},
  async r => { await bgCall('number', r.n); }, { saveLabel: t('bingo_call') });
// the end of a game: who won (name, room, ticket – all optional)
ACT.bg_end = () => formBox(t('end_game'), [{ k: 'name', label: t('winner_name') }, { k: 'room', label: t('room') }, { k: 'ticket', label: t('ticket_no') }], {},
  async r => { const w = [r.name, r.room ? t('room') + ' ' + r.room : '', r.ticket ? t('ticket_no') + ' ' + r.ticket : ''].filter(Boolean).join(' · ');
    await gmSet({ status: 'completed', winner: w || null }, t('game_completed')); }, { saveLabel: t('complete_game') });
// a NEW game: this one ends (its numbers stay in the history), the next starts with no number called
ACT.bg_new = async () => {
  if (!await confirmBox(t('bingo_new_q'), t('bingo_new'))) return;
  const g = GM.g;
  if (GAME_OPEN.includes(g.status)) await gmSet({ status: 'completed' });
  const j = await api('game_start', { p_row: { item_id: g.item_id, game_type: 'bingo', mode: g.mode, name: g.name } });
  location.hash = '#/game/' + j.row.id;
};

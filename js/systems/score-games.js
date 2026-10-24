'use strict';
/* AUREA · systems/score-games.js — score games: the sports and the live board (staff score it, guests see the same board).
   Uses: translations/languages · core/utils · icons/icons */
/* ---------- Scores: ONE game tool (staff score live; guests see the same board) ---------- */
const SPORTS = ['darts', 'volleyball', 'water_polo', 'football', 'table_tennis', 'boccia', 'billiards', 'basketball', 'aqua_games', 'tug_of_war', 'quiz_game', 'other'];
const sportLabel = s => (SPORTS.includes(s) ? t('sp_' + s) : s || '');
function scoreBoard(g, staff) {
  const sides = (g.sides || []).map((s, i) => Object.assign({ i }, s)).sort((a, b) => (+b.score || 0) - (+a.score || 0));
  const top = sides.length ? +sides[0].score || 0 : 0;
  return `<section class="card scoreboard ${g.status}"><header><div><small>${esc(sportLabel(g.sport))}${g.target ? ' · ' + esc(t('first_to', { n: g.target })) : ''}</small><h2>${esc(g.name || sportLabel(g.sport))}</h2></div>
      ${g.status === 'live' ? `<span class="live">${esc(t('live'))}</span>` : `<span class="chip ok">${ico('trophy')} ${esc(g.winner || '')}</span>`}</header>
    <ol class="board">${sides.map((s, r) => `<li class="${(+s.score || 0) === top && top > 0 ? 'lead' : ''}"><span class="rank">${r + 1}</span><span class="who"><b>${esc(s.name)}</b>${s.room ? `<small>${esc(t('room'))} ${esc(s.room)}</small>` : ''}</span><span class="pts">${+s.score || 0}</span>
      ${staff && g.status === 'live' ? `<span class="pt-btns">${[-1, 1, 2, 3, 5].map(d => `<button class="btn ${d < 0 ? 'ghost' : ''} small" data-act="sg_pt" data-id="${g.id}" data-i="${s.i}" data-d="${d}" aria-label="${esc(s.name)} ${d > 0 ? '+' + d : d}">${d > 0 ? '+' + d : '−1'}</button>`).join('')}</span>` : ''}</li>`).join('')}</ol>
    ${staff && g.status === 'live' ? `<div class="actions"><button class="btn ghost small" data-act="sg_undo" data-id="${g.id}" ${(g.history || []).length ? '' : 'disabled'}>${ico('undo')} ${esc(t('undo'))}</button><span class="grow"></span><button class="btn small" data-act="sg_end" data-id="${g.id}">${ico('flag')} ${esc(t('finish_game'))}</button></div>` : ''}</section>`;
}

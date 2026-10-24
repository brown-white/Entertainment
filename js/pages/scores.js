'use strict';
/* AUREA · pages/scores.js — staff page: Scores (start a game, points, undo, finish).
   Uses: translations/languages · supabase · core/utils · icons/icons · components/modals · core/actions · components/cards · core/router ·
         components/forms · systems/team-schedule · systems/score-games */
page('scores', {
  perm: 'scores,m_program', icon: 'trophy', group: 'programme',
  render: async () => {
    const rows = await list('score_games', { _limit: 40 });
    const live = rows.filter(g => g.status === 'live'), done = rows.filter(g => g.status === 'finished').slice(0, 12);
    return `<p class="row"><span class="muted grow">${esc(t('scores_intro'))}</span><button class="btn" data-act="sg_new">${ico('plus')} ${esc(t('new_game'))}</button></p>
      ${live.length ? live.map(g => scoreBoard(g, true)).join('') : empty(t('no_live_games'))}
      ${done.length ? `<section><h2>${esc(t('finished_games'))}</h2><div class="list">${done.map(g => `<div class="li"><b>${esc(g.name || sportLabel(g.sport))}</b> ${chip(t('winner') + ': ' + (g.winner || '—'), 'ok')}<br><small class="muted">${(g.sides || []).map(s => esc(s.name) + ' ' + (+s.score || 0)).join(' · ')} · ${esc(D.stamp(g.finished_at || g.created_at))}</small></div>`).join('')}</div></section>` : ''}`;
  }
});
const playerRow = n => `<div class="row player"><input data-pn placeholder="${esc(t('player_or_team'))} ${n}" aria-label="${esc(t('player_or_team'))} ${n}"><input data-pr class="room-in" placeholder="${esc(t('room'))}" aria-label="${esc(t('room'))}"></div>`;
ACT.sg_new = async () => {
  const today = D.today(); const b = await board(today, today);
  const its = b.items.filter(i => i.date === today && i.status === 'scheduled');
  const f = [{ k: 'sport', type: 'select', label: t('sport'), options: SPORTS.map(x => [x, t('sp_' + x)]) }, { k: 'name', label: t('game_title'), hint: t('game_title_hint') },
    { k: 'item_id', type: 'select', num: true, label: t('programme_item'), options: opts(its, 'id', i => hm(i.start_time) + ' ' + itemName(i), t('none')) },
    { k: 'target', type: 'number', label: t('target_score'), min: 1, hint: t('target_hint') }, { k: 'show_guests', type: 'bool', label: t('show_live_to_guests') }];
  editForm(t('new_game'), f, { show_guests: true }, async (r, root) => {
    const sides = $$('.player', root).map(x => ({ name: $('[data-pn]', x).value.trim(), room: $('[data-pr]', x).value.trim().toUpperCase(), score: 0 })).filter(x => x.name);
    if (sides.length < 2) throw new ApiError('players');
    if (r.sport === 'other' && !r.name) throw new ApiError('required', { field: t('game_title') });
    await save('score_games', Object.assign(r, { sides, history: [], status: 'live' })); route();
  }, {
    after: `<div class="form-sec"><h3>${esc(t('players_or_teams'))}</h3><p class="hint">${esc(t('players_hint'))}</p></div><div id="players">${playerRow(1)}${playerRow(2)}</div><button type="button" class="btn ghost small" data-add-player>${ico('plus')} ${esc(t('add_player'))}</button>`,
    mount: root => { $('[data-add-player]', root).onclick = () => $('#players', root).insertAdjacentHTML('beforeend', playerRow($$('.player', root).length + 1)); }
  });
};
async function sgEnd(id) {
  const [g] = await list('score_games', { id }); const top = Math.max(0, ...(g.sides || []).map(s => +s.score || 0));
  const winner = (g.sides || []).filter(s => (+s.score || 0) === top).map(s => s.name).join(' & ');
  await save('score_games', { id, status: 'finished', winner, finished_at: new Date().toISOString() }); toast(t('winner') + ': ' + winner); route();
}
ACT.sg_pt = async el => {
  const [g] = await list('score_games', { id: +el.dataset.id }); const i = +el.dataset.i; const s = g.sides[i]; const before = +s.score || 0;
  s.score = Math.max(0, before + +el.dataset.d);
  await save('score_games', { id: g.id, sides: g.sides, history: (g.history || []).concat([{ i, d: s.score - before }]).slice(-300) });
  if (g.target && s.score >= g.target && before < g.target && await confirmBox(t('reached_target', { name: s.name, n: g.target }), t('finish_game'))) return sgEnd(g.id);
  route();
};
ACT.sg_undo = async el => {
  const [g] = await list('score_games', { id: +el.dataset.id }); const h = (g.history || []).slice(); const last = h.pop(); if (!last) return;
  const s = g.sides[last.i]; if (s) s.score = Math.max(0, (+s.score || 0) - last.d);
  await save('score_games', { id: g.id, sides: g.sides, history: h }); route();
};
ACT.sg_end = async el => { if (await confirmBox(t('finish_game_q'))) sgEnd(+el.dataset.id); };

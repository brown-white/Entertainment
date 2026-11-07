'use strict';
/* Mr Hassan · pages/bingo.js — staff page: the Bingo Caller – today's bingo activities and open bingo games (each one a game session of the ONE
   Games system: its numbers, its staff, its event, its history), and a new bingo game by hand.
   Uses: translations/languages · supabase · core/utils · icons/icons · components/cards · core/router · systems/team-schedule ·
         systems/games */
page('bingo', {
  perm: 'bingo_caller', icon: 'target', group: 'entertainment', title: 'bingo_caller',
  render: async () => {
    const d = D.today(), [b, open] = await Promise.all([board(d, d), api('game_list', { p_filter: { game_type: 'bingo', status: GAME_OPEN, _limit: 20 } })]);
    const its = b.items.filter(i => i.date === d && i.game_type === 'bingo' && gameMayRun(i, 'bingo'));
    const loose = open.rows.filter(g => !its.some(i => i.id === g.item_id));
    return `<p class="muted">${esc(t('bingo_intro'))}</p>
      ${its.length ? `<section><h2>${esc(t('bingo_today'))}</h2>${its.map(gameItemCard).join('')}</section>` : ''}
      ${loose.length ? `<section><h2>${esc(t('open_games'))}</h2><div class="list">${loose.map(g => gameRow(g)).join('')}</div></section>` : ''}
      ${gameModes('bingo').length ? `<p><button class="btn lg" data-act="gm_new" data-ty="bingo">${ico('plus')} ${esc(t('bingo_start_new'))}</button></p>` : empty(t('err_game_off'))}`;
  }
});

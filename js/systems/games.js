'use strict';
/* Mr Hassan · systems/games.js — THE Games system: the game types and their modes (the database checks the same list: _game_catalog), one engine per
   kind of game (its own scoring screen), the game SESSION (start, score, players joining during the game, pause, complete,
   cancel, delete – saved in the background, two phones never overwrite each other), who runs it (the assignment; the Games
   Library), HOW TO PLAY of each game and mode, the display mode (components/display) and the game card of a programme activity
   (My day, Games, the activity page). Programme activity (game type) → its assignment → the game session → the engine → the
   result → the history (the sessions). The Games Library starts the same sessions without an activity.
   Uses: core/state · translations/languages · supabase · core/utils · icons/icons · core/permissions · components/modals ·
         core/actions · components/cards · core/router · components/forms · components/tables · components/display ·
         systems/team-schedule */
/* ---------- the catalogue: every game type, its modes, its categories in the Games Library (the database: _game_catalog) ---------- */
const GAME_TYPES = {
  darts: { engine: 'darts', modes: ['301', '501', 'highest', 'around_clock', 'cricket', 'custom'], icon: 'target', cat: ['activity', 'score'] },
  boccia: { engine: 'rounds', modes: ['target', 'rounds'], icon: 'target', cat: ['activity', 'score'] },
  bean_bags: { engine: 'rounds', modes: ['target', 'rounds'], icon: 'target', cat: ['activity', 'score', 'party'] },
  volleyball: { engine: 'sets', modes: ['best_of_3', 'best_of_5', 'one_set'], icon: 'trophy', cat: ['activity', 'score'] },
  table_tennis: { engine: 'sets', modes: ['best_of_3', 'best_of_5', 'best_of_7'], icon: 'trophy', cat: ['activity', 'score'] },
  quiz_game: { engine: 'quiz', modes: ['standard', 'buzzer'], icon: 'help', cat: ['party', 'guest', 'score'] },
  bingo: { engine: 'bingo', modes: ['90', '75'], icon: 'ticket', cat: ['party', 'guest'], chance: true },
  roulette: { engine: 'wheel', modes: ['wheel'], icon: 'wheel', cat: ['chooser', 'decision', 'party'], chance: true },
  spin_win: { engine: 'wheel', modes: ['prizes'], icon: 'gift', cat: ['party', 'guest'], chance: true },
  arrow: { engine: 'arrow', modes: ['classic'], icon: 'pointer', cat: ['chooser', 'decision', 'party'], chance: true },
  random_number: { engine: 'random', modes: ['range'], icon: 'dice', cat: ['chooser', 'decision', 'guest'], chance: true },
  football: { engine: 'points', modes: ['points'], icon: 'trophy', cat: ['activity', 'score'] },
  water_polo: { engine: 'points', modes: ['points'], icon: 'trophy', cat: ['activity', 'score'] },
  basketball: { engine: 'points', modes: ['points'], icon: 'trophy', cat: ['activity', 'score'] },
  billiards: { engine: 'points', modes: ['points'], icon: 'trophy', cat: ['activity', 'score'] },
  aqua_games: { engine: 'points', modes: ['points'], icon: 'trophy', cat: ['activity', 'score', 'guest'] },
  tug_of_war: { engine: 'points', modes: ['points'], icon: 'trophy', cat: ['activity', 'score', 'party'] },
  other: { engine: 'points', modes: ['points'], icon: 'trophy', cat: ['score'] }
};
const GAME_CATS = ['all', 'activity', 'score', 'chooser', 'party', 'decision', 'guest'];
const GAME_OPEN = ['ready', 'in_progress', 'paused'];
const gameLabel = ty => (GAME_TYPES[ty] ? t('sp_' + ty) : ty || '');
const modeLabel = m => (m ? t('gm_' + m) : '');
// the modes this hotel offers for a type (Games → Game types); none = the type is switched off
const gameModes = ty => { const all = GAME_TYPES[ty]?.modes || [], on = (S.settings?.games || {})[ty]; return Array.isArray(on) ? all.filter(m => on.includes(m)) : all; };
/* the engines: each kind of game registers its own (systems/game-*.js) – { options, sides, play, view, board, summary, undo, correct,
   display, endButton, join (players coming in during the game: 'side' or 'member'), joinState, joinWarn, after (after drawing) } */
const ENGINES = {};
const gameEngine = (k, e) => { ENGINES[k] = e; };
// a game played before 10.5 keeps its simple points scoreboard (mode "points"), whatever its type
const engineOf = g => ENGINES[g.mode === 'points' ? 'points' : GAME_TYPES[g.game_type]?.engine || 'points'];
const gameStatus = st => chip(t('gst_' + st), { in_progress: 'ok', paused: 'warn', cancelled: 'bad' }[st] || '');
const gameTitle = g => g.name || (g.item ? itemName(g.item) : g.options?.wheel_name || gameLabel(g.game_type));
const gameWho = s => [s.room ? t('room') + ' ' + s.room : '', s.team || '', (s.members || []).map(m => m.name).join(', ')].filter(Boolean).join(' · ');
// the winner as the screen and the history say it: "Hassan — Room 1234", "Team A"
const sideWinName = s => (s ? s.name + (s.room ? ' — ' + t('room') + ' ' + s.room : '') : '');
const winnerNames = (g, idx) => (idx || []).map(i => sideWinName(g.sides[i])).filter(Boolean).join(' & ');
// the leaders by a number (the most, or the fewest): their positions
const leadersBy = (vals, low = false) => { if (!vals.length) return []; const best = low ? Math.min(...vals) : Math.max(...vals); return vals.map((v, i) => (v === best ? i : -1)).filter(i => i >= 0); };
// a chance game (no players, no scores: every draw is made by the database) and the permission it needs
const gameChance = ty => !!GAME_TYPES[ty]?.chance;
const gameTypePerm = ty => ({ bingo: 'bingo_caller', roulette: 'games_roulette', spin_win: 'games_spin' }[ty] || 'games_library');

/* ---------- who runs a game: the people assigned to its programme date (the existing assignment), "Start any game", a chance game:
   its own permission; a Games Library game: who started it – the database checks the same (_game_access) ---------- */
const gameAssigned = it => !!it && (it.staff || []).some(s => s.staff_id === meId());
const gameMayRun = (it, ty) => can('games_any') || (gameChance(ty) && can(gameTypePerm(ty))) || gameAssigned(it);
const gameMayStart = (it, ty) => can('games_any') || (gameChance(ty) && can(gameTypePerm(ty))) || (can('games_start') && gameAssigned(it));
// a game from the Games Library (no programme activity)
const gameMayPlay = ty => !!gameModes(ty).length && (can('games_any') || (gameChance(ty) ? can(gameTypePerm(ty)) : can('games_start') && can('games_library')));
const gameLibraryOn = () => Object.keys(GAME_TYPES).some(gameMayPlay);

/* the game card of a programme activity: its time and place, its game, its state (Ready / In progress / Completed) and the one button
   the person needs (Start game / Continue) – shown only to whoever runs it */
function gameItemCard(it) {
  const ty = it.game_type, gs = it.games || [], open = gs.find(g => GAME_OPEN.includes(g.status)), done = gs.filter(g => g.status === 'completed');
  const run = it.status === 'scheduled' && gameMayRun(it, ty);
  const btn = !run ? '' : open ? `<a class="btn" href="#/game/${open.id}">${ico('play')} ${esc(t(open.status === 'ready' ? 'start_match' : 'continue_game'))}</a>`
    : gameMayStart(it, ty) ? `<a class="btn" href="#/game/new/${it.id}">${ico('play')} ${esc(t(done.length ? 'new_match' : 'start_game'))}</a>` : '';
  const st = it.status === 'cancelled' ? 'cancelled' : open ? open.status : done.length ? 'completed' : 'ready';
  return `<div class="card game-card"><div class="gc-main"><time>${esc(hm(it.start_time))}${it.end_time ? `<small>${esc(hm(it.end_time))}</small>` : ''}</time>
    <div class="grow"><b>${esc(itemName(it))}</b><span class="meta">${ico(GAME_TYPES[ty]?.icon || 'trophy')} ${esc(gameLabel(ty))}${it.game_mode ? ' · ' + esc(modeLabel(it.game_mode)) : ''}</span>
      ${it.location ? `<small class="muted">${esc(t('location'))}: ${esc(it.location)}</small>` : ''}
      ${done.length ? `<small class="gc-done">${done.map(g => `<a href="#/game/${g.id}">${ico('trophy')} ${esc(g.winner || t('no_winner'))}</a>`).join(' ')}</small>` : ''}</div>${gameStatus(st)}</div>
    ${btn ? `<div class="gc-act">${btn}</div>` : ''}</div>`;
}

/* ---------- HOW TO PLAY: each game and each mode in its own words – the objective, how to play, the scoring, the winner, and what
   happens when someone joins during the game ---------- */
function gameRules(ty, mode, open) {
  const e = ENGINES[GAME_TYPES[ty]?.engine], row = (k, v) => (v ? `<dt>${esc(t(k))}</dt><dd>${esc(v)}</dd>` : '');
  return `<details class="card gm-rules" ${open ? 'open' : ''}><summary>${ico('help')} <b>${esc(t('how_to_play'))}</b><small class="muted">${esc(gameLabel(ty))}${mode ? ' · ' + esc(modeLabel(mode)) : ''}</small></summary>
    <dl>${row('hp_objective', t('hp_' + ty))}${row('hp_how', t('hp_' + ty + '_t'))}${mode ? row('hp_scoring', t('hpm_' + mode)) + row('hp_winner', t('hpm_' + mode + '_w')) : ''}
      ${e?.join ? row('hp_join', t('hpj_' + GAME_TYPES[ty].engine)) : ''}</dl></details>`;
}

/* ---------- the programme editor's "Game / Scoring": No game tool / Game tool required → the game type and its default mode ---------- */
const gameProgFields = () => [{ type: 'section', label: t('sec_game'), hint: t('sec_game_hint') },
  { k: 'game_tool', type: 'choice', label: t('game_tool'), options: [['none', t('game_tool_none')], ['req', t('game_tool_req')]] },
  { k: 'game_type', type: 'select', label: t('game_type'), options: [['', t('choose')]].concat(Object.keys(GAME_TYPES).map(ty => [ty, gameLabel(ty) + (gameModes(ty).length ? '' : ' (' + t('switched_off') + ')')])) },
  { k: 'game_mode', type: 'select', label: t('default_game_mode'), options: [['', t('mode_at_start')]].concat([...new Set(Object.values(GAME_TYPES).flatMap(x => x.modes))].map(m => [m, modeLabel(m)])), hint: t('default_game_mode_hint') }];
const gameProgRow = base => ({ game_tool: base?.game_type ? 'req' : 'none', game_type: base?.game_type || '', game_mode: base?.game_mode || '' });
function gameProgMount(root) {
  const tool = () => $('[data-choice=game_tool] input:checked', root)?.value === 'req', ty = $('[name=game_type]', root), md = $('[name=game_mode]', root);
  if (!ty || !md) return;
  const modes = () => { const v = md.value || '', list = ty.value ? GAME_TYPES[ty.value].modes : [];
    md.innerHTML = [['', t('mode_at_start')]].concat(list.map(m => [m, modeLabel(m) + (gameModes(ty.value).includes(m) ? '' : ' (' + t('switched_off') + ')')]))
      .map(([v2, l]) => `<option value="${esc(v2)}" ${v2 === v ? 'selected' : ''}>${esc(l)}</option>`).join(''); };
  const sync = () => { [ty, md].forEach(el => { el.closest('.field').hidden = !tool(); }); };
  $$('[data-choice=game_tool] input', root).forEach(i => i.addEventListener('change', sync));
  ty.addEventListener('change', () => { md.value = ''; modes(); });
  modes(); sync();
}
// what the editor saves: no game tool = no type and no mode
function gameOf(r) {
  if (!('game_tool' in r)) return r;
  if (r.game_tool !== 'req') return Object.assign(r, { game_type: null, game_mode: null });
  if (!r.game_type) throw new ApiError('required', { field: t('game_type') });
  return Object.assign(r, { game_mode: r.game_mode && GAME_TYPES[r.game_type].modes.includes(r.game_mode) ? r.game_mode : null });
}

/* ---------- THE game on the screen: its session, what its engine works out, saving in the background ---------- */
let GM = null;   // { g: the session, d: the engine's result, ui: the screen's own choices (not saved), busy, dirty, err, display }
const gmWork = M => { M.d = engineOf(M.g).play(M.g); M.g.sides = M.d.sides; };
// the screen's own choices (the area last tapped, a round being entered, the teams picked, a wheel turning): never saved
const gmUi = (k, v) => { if (GM && v !== undefined) GM.ui[k] = v; return GM ? GM.ui[k] : undefined; };
function gmOpen(g) {
  const same = GM && GM.g.id === g.id;
  if (GM && !same) gmClose();
  GM = Object.assign(same ? GM : { ui: {}, display: false }, { g, busy: false, dirty: false, err: false });
  GM.d = engineOf(g).play(g);              // the saved scores stay as they are until the next change
  return GM;
}
function gmClose() { if (GM?.display) displayOff(true); GM = null; }
// leaving the game's page closes it (and its display)
document.addEventListener('aurea:page-open', () => { if (GM && !(current.key === 'game' && current.arg === String(GM.g.id))) gmClose(); });
const gmCanScore = g => can('games_score') || (gameChance(g.game_type) && can(gameTypePerm(g.game_type)));
const gmLive = () => !!GM && GM.g.status === 'in_progress' && !!GM.g.access && gmCanScore(GM.g);
const gmDraw = () => { const box = $('#gm'), M = GM; if (!box || !M) return; box.innerHTML = gmHtml(); engineOf(M.g).after?.(M, box); };
// a change of the game's record (a throw, a point, a round …): worked out at once, shown, saved in the background
function gmChange(fn) {
  const M = GM; if (!M || !gmLive()) return;
  const st = fn(JSON.parse(JSON.stringify(M.g.state || {})));
  if (!st) return;
  M.g.state = st; gmWork(M); gmDraw(); gmQueue(M);
}
// one save at a time; changes made meanwhile go with the next one (each save carries the version it saw)
async function gmQueue(M) {
  M.dirty = true; if (M.busy) return;
  M.busy = true; gmMark(M);
  try {
    while (M.dirty) {
      M.dirty = false;
      const j = await api('game_save', { p_id: M.g.id, p_row: { rev: M.g.rev, state: M.g.state, sides: M.g.sides } });
      M.g.rev = j.row.rev; M.err = false;
    }
  } catch (e) {
    M.err = true;
    if (e.code === 'game_changed' && e.info.row && GM === M) { gmOpen(Object.assign(e.info.row, { access: M.g.access })); M.err = false; toast(t('game_changed'), 'warn'); gmDraw(); }
    else fail(e);
  } finally { M.busy = false; gmMark(M); }
}
const gmIdle = M => new Promise(res => { const w = () => (M.busy ? setTimeout(w, 60) : res()); w(); });
const gmMark = M => { const el = $('#gm-sync'); if (el && GM === M) el.outerHTML = gmSyncHtml(M); };
const gmSyncHtml = M => (M.err ? `<button id="gm-sync" class="gm-sync bad" data-act="gm_retry">${esc(t('not_saved_retry'))}</button>`
  : `<span id="gm-sync" class="gm-sync ${M.busy ? 'busy' : ''}" role="status">${esc(t(M.busy ? 'saving' : 'saved'))}</span>`);
ACT.gm_retry = () => GM && gmQueue(GM);
// a change of the game itself (start, pause, resume, complete, cancel, edit, a player joining): after the open saves, then the screen again
async function gmSet(patch, msg) {
  const M = GM; if (!M) return;
  await gmIdle(M);
  const j = await api('game_save', { p_id: M.g.id, p_row: Object.assign({ rev: M.g.rev }, gameChance(M.g.game_type) ? {} : { state: M.g.state, sides: M.g.sides }, patch) });
  gmOpen(Object.assign(j.row, { access: M.g.access })); if (msg) toast(msg); gmDraw();
}

/* ---------- the game screen: its head, the engine's own screen (scoring, the result, the display) and the game's buttons ---------- */
// a game's display theme: its own (chosen for this session or its wheel's), else the hotel's theme for that display
const gameTheme = g => themeOf(g.options?.theme || g.wheel?.theme, g.game_type);
function gmHtml() {
  const M = GM, g = M.g, e = engineOf(g), d = M.d;
  if (M.display) return displayFrame((e.display || e.board)(g, d), gameTheme(g), gameTitle(g));
  const it = g.item, live = gmLive(), info = [it ? D.short(it.date) + ' ' + hm(it.start_time) : D.short(g.game_date), it?.location, g.staff_name, g.team_name].filter(Boolean).join(' · ');
  const head = `<header class="gm-head"><div class="grow"><small>${ico(GAME_TYPES[g.game_type]?.icon || 'trophy')} ${esc(gameLabel(g.game_type))} · ${esc(modeLabel(g.mode))}</small><h2>${esc(gameTitle(g))}</h2><small class="muted">${esc(info)}</small></div>
    <div class="gm-st">${gameStatus(g.status)}${live ? gmSyncHtml(M) : ''}</div></header>`;
  let body;
  if (g.status === 'ready') body = `${gameRules(g.game_type, g.mode, true)}<div class="card"><h3>${esc(t('players_or_teams'))}</h3><ol class="gm-ready">${g.sides.map(s => `<li><b>${esc(s.name)}</b>${gameWho(s) ? ` <small class="muted">${esc(gameWho(s))}</small>` : ''}</li>`).join('')}</ol>
    ${g.access && gmCanScore(g) ? `<button class="btn wide big" data-act="gm_begin">${ico('play')} ${esc(t('start_match'))}</button>` : ''}</div>`;
  else if (live) body = e.view(g, d);
  else body = (g.status === 'completed' ? `<div class="gm-win">${ico('trophy')}<span>${esc(t(gameChance(g.game_type) ? 'game_result' : 'winner'))}</span><b>${esc(g.winner || t('no_winner'))}</b></div>` : '')
    + (g.status === 'paused' ? `<p class="hint-box warn">${ico('clock')}<span>${esc(t('game_is_paused'))}</span></p>` : '')
    + (g.status === 'cancelled' ? `<p class="hint-box warn">${ico('flag')}<span>${esc(t('game_was_cancelled'))}</span></p>` : '')
    + `<div class="card">${e.board(g, d)}</div>`
    + (g.started_at ? `<p class="muted small">${esc(t('game_times', { from: D.stamp(g.started_at), to: g.finished_at ? D.stamp(g.finished_at) : '…' }))}${g.ended_by_name ? ' · ' + esc(g.ended_by_name) : ''}</p>` : '');
  return head + body + gmButtons(g, e);
}
function gmButtons(g, e) {
  const run = g.access && gmCanScore(g), open = GAME_OPEN.includes(g.status), lb = (icon, k) => `${ico(icon)} ${esc(t(k))}`;
  const end = e.endButton ? e.endButton() : `<button class="btn ghost" data-act="gm_end">${lb('flag', 'end_game')}</button>`;
  const b = [];
  if (run && g.status === 'in_progress' && e.join && can('games_players') && g.sides.length < e.sides.max + (e.join === 'member' ? 1 : 0)) b.push(`<button class="btn ghost" data-act="gm_join">${lb('plus', 'add_player')}</button>`);
  if (run && g.status === 'in_progress') b.push(`<button class="btn ghost" data-act="gm_pause">${lb('pause', 'pause')}</button>`, end);
  if (run && g.status === 'paused') b.push(`<button class="btn" data-act="gm_resume">${lb('play', 'resume')}</button>`, end);
  if (run && open && can('games_cancel')) b.push(`<button class="btn ghost danger" data-act="gm_cancel">${lb('x', 'cancel_game')}</button>`);
  if (g.status !== 'ready') b.push(`<button class="btn ghost" data-act="gm_rules">${lb('help', 'how_to_play')}</button>`);
  if (e.display && can('games_display') && g.status !== 'cancelled') b.push(`<button class="btn ghost" data-act="gm_display_on">${lb('expand', 'display_mode')}</button>`, `<button class="btn ghost" data-act="gm_theme">${lb('sparkle', 'display_theme')}</button>`);
  if (!open && can('games_edit') && !gameChance(g.game_type)) b.push(`<button class="btn ghost" data-act="gm_edit">${lb('edit', 'edit_game')}</button>`);
  if (!open && can('games_edit')) b.push(`<button class="btn ghost" data-act="gm_reopen">${lb('repeat', 'reopen_game')}</button>`);
  if (open ? can('games_delete') : can('games_history_delete')) b.push(`<button class="btn ghost danger" data-act="gm_delete">${lb('trash', 'delete')}</button>`);
  return b.length ? `<div class="gm-btns">${b.join('')}</div>` : '';
}
ACT.gm_begin = () => gmSet({ status: 'in_progress' });
ACT.gm_pause = () => gmSet({ status: 'paused' }, t('game_paused_msg'));
ACT.gm_resume = () => gmSet({ status: 'in_progress' });
ACT.gm_undo = () => { const e = engineOf(GM.g); gmChange(st => e.undo(st, GM.d)); };
ACT.gm_correct = () => engineOf(GM.g).correct(GM.g, GM.d);
ACT.gm_rules = () => modal(t('how_to_play'), gameRules(GM.g.game_type, GM.g.mode, true), { cancel: false });
// complete: the winner the engine worked out – or, ended early, whoever leads
ACT.gm_end = async () => {
  const g = GM.g, d = GM.d, w = d.over ? d.winners : d.leaders || [], names = winnerNames(g, w);
  const q = d.over ? t('complete_game_q', { name: names }) : names ? t('end_game_lead_q', { name: names }) : t('end_game_q');
  if (!await confirmBox(q, t('complete_game'))) return;
  await gmSet({ status: 'completed', winner: names || null }, t('game_completed'));
};
ACT.gm_complete = async () => { const names = winnerNames(GM.g, GM.d.winners); await gmSet({ status: 'completed', winner: names || null }, t('game_completed')); };
ACT.gm_cancel = async () => { if (await confirmBox(t('cancel_game_q'), t('cancel_game'))) await gmSet({ status: 'cancelled' }, t('game_cancelled')); };
ACT.gm_reopen = async () => { if (await confirmBox(t('reopen_game_q'), t('reopen_game'))) await gmSet({ status: 'in_progress', winner: null }); };
// a manager's edit of a finished game: the names, rooms, teams and the winner (the scores themselves: reopen, correct, complete again)
ACT.gm_edit = () => {
  const g = GM.g, f = g.sides.flatMap((s, i) => [{ k: 'n' + i, label: t('player_or_team') + ' ' + (i + 1), req: true }, { k: 'r' + i, label: t('room') }, { k: 't' + i, label: t('team_name') }]).concat([{ k: 'winner', label: t('winner') }]);
  const row = Object.assign({ winner: g.winner || '' }, ...g.sides.map((s, i) => ({ ['n' + i]: s.name, ['r' + i]: s.room || '', ['t' + i]: s.team || '' })));
  editForm(t('edit_game'), f, row, async r => { await gmSet({ sides: g.sides.map((s, i) => Object.assign({}, s, { name: r['n' + i], room: r['r' + i] || null, team: r['t' + i] || null })), winner: r.winner || null }); });
};
ACT.gm_delete = async () => { if (await gameDelete([GM.g])) { gmClose(); location.hash = '#/games/history'; } };

/* ---------- ADD PLAYER during the game: a new player (or team) comes in after the others – the scores already made stay exactly as
   they are; where joining late is unfair the screen says how the newcomer joins (e.g. darts 301: from 301, from the next turn).
   A team game adds the newcomer to a team. "Add players" ---------- */
ACT.gm_join = async () => {
  const M = GM, g = M.g, e = engineOf(g); if (!gmLive() || !e.join) return;
  const warn = e.joinWarn ? e.joinWarn(g, M.d) : '', member = e.join === 'member' || g.sides.length >= e.sides.max;
  const f = (member ? [{ k: 'side', type: 'select', num: true, label: t('join_team'), options: g.sides.map((s, i) => [i, s.name]) }] : [])
    .concat([{ k: 'name', label: t(member ? 'player' : 'player_or_team'), req: true }, { k: 'room', label: t('room'), ph: '1234' }]);
  formBox(t('add_player'), f, {}, async r => {
    const name = String(r.name || '').trim(), room = String(r.room || '').trim().toUpperCase() || null;
    if (!name) throw new ApiError('required', { field: t('player_or_team') });
    await gmIdle(M);
    let sides = g.sides.map(s => Object.assign({}, s)), st = JSON.parse(JSON.stringify(g.state || {}));
    if (member) { const s = sides[r.side]; s.members = (s.members || []).concat([{ name, room }]); }
    else { sides.push({ name, room, score: 0 }); if (e.joinState) st = e.joinState(st, sides.length - 1, M.d); }
    sides = e.play(Object.assign({}, g, { sides, state: st })).sides;             // the newcomer's starting figures (301 …), the others' as they are
    const j = await api('game_save', { p_id: g.id, p_row: { rev: g.rev, sides, state: st } });
    M.ui = {}; gmOpen(Object.assign(j.row, { access: g.access })); gmWork(GM); gmDraw();
    toast(t('player_joined', { name }));
  }, { saveLabel: t('add_player'), after: warn ? `<p class="hint-box warn">${ico('info')}<span>${esc(warn)}</span></p>` : '' });
};

/* ---------- delete games: the chosen ones, or every game the history shows (the same filter as the list). An open game is deleted only
   on purpose ("Game is in progress. Delete permanently?") and needs "Delete game"; a finished one needs "Delete game history" ---------- */
async function gameDelete(rows, filter) {
  const more = filter ? { p_filter: filter } : rows.length === 1 ? { p_id: rows[0].id } : { p_ids: rows.map(g => g.id) };
  const pv = await delMany('score_games', Object.assign({ p_preview: true }, more));
  if (!pv.n) { toast(t('nothing_found'), 'bad'); return false; }
  if (pv.n > 1 && !can('bulk_delete')) { toast(t('err_bulk_needed'), 'bad'); return false; }
  if ((pv.used && !can('games_delete')) || (pv.history && !can('games_history_delete'))) { toast(errText(new ApiError('forbidden', { need: [pv.used ? 'games_delete' : 'games_history_delete'] })), 'bad'); return false; }
  const ok = pv.n === 1 && pv.used ? await choiceBox(t('please_confirm'), `<p>${esc(t('game_active_delete_q'))}</p>`, [{ k: 'del', label: t('delete'), cls: 'solid-danger' }]) === 'del'
    : !!await delAsk({ title: filter ? t('clear_history_q', { n: pv.n }) : t('delete_games_q', { n: pv.n }), n: pv.n, strong: !!filter && pv.n > 1,
      facts: [pv.used ? t('del_games_open', { n: pv.used }) : ''].filter(Boolean), text: t('delete_games_text') });
  if (!ok) return false;
  const j = await delMany('score_games', Object.assign({ p_force: pv.used > 0 }, more));
  toast(t('deleted_n', { n: j.deleted })); return true;
}

/* ---------- DISPLAY MODE of a game (components/display): only the game in its theme; it follows the session every few seconds (the
   caller's phone runs it, the TV shows it). Any engine may have one (engine.display). The theme of this session: "Display theme" ---------- */
async function gmDisplay(on) {
  const M = GM; if (!M) return;
  if (on) {
    await displayThemesLoad().catch(() => []);
    M.display = true;
    displayOn({ poll: gmPoll, exit: () => { if (GM === M) { M.display = false; gmDraw(); } }, page: () => GM === M && current.key === 'game' && current.arg === String(M.g.id) });
  } else { M.display = false; displayOff(true); }
  gmDraw();
}
async function gmPoll() {
  const M = GM; if (!M || !M.display || M.busy || M.ui.anim) return;      // (a wheel turning is never cut short)
  const j = await api('game_get', { p_id: M.g.id });
  if (GM === M && (j.row.rev !== M.g.rev || j.row.status !== M.g.status)) { gmOpen(j.row); gmDraw(); }
}
ACT.gm_display_on = () => gmDisplay(true);
ACT.gm_theme = async () => {
  const g = GM.g; await displayThemesLoad().catch(() => []);
  formBox(t('display_theme'), [{ k: 'theme', type: 'select', label: t('display_theme'), options: [['', t('theme_default_for', { name: themeOf(null, g.game_type).name })]].concat(themeChoices()), hint: t('display_theme_hint') }],
    { theme: g.options?.theme || '' }, async r => { await gmSet({ options: Object.assign({}, g.options, { theme: r.theme || null }) }, t('saved')); }, { saveLabel: t('save') });
};

/* ---------- a game for the guests' live scores and the history: the board only (never the controls, never who runs it) ---------- */
const gameBoardPublic = g => `<section class="card scoreboard ${esc(g.status)}"><header><div><small>${esc(gameLabel(g.game_type))} · ${esc(modeLabel(g.mode))}</small><h2>${esc(g.name || gameLabel(g.game_type))}</h2></div>
  ${g.status === 'in_progress' ? `<span class="live">${esc(t('live'))}</span>` : g.status === 'completed' ? `<span class="chip ok">${ico('trophy')} ${esc(g.winner || '')}</span>` : gameStatus(g.status)}</header>${engineOf(g).board(g)}</section>`;
const gameScore = g => engineOf(g).summary(g);
// one game in a list (history, open games): when, which, who ran it, the players with the final score, the winner, its state
const gameRow = (g, selK) => `<div class="li game-row ${selK ? 'sel-li' : ''}">${selK ? selBox(selK, g.id, gameTitle(g)) : ''}<a class="grow" href="#/game/${g.id}">
  <span class="gr-top"><b>${esc(gameTitle(g))}</b>${gameStatus(g.status)}</span>
  <small class="muted">${esc([D.short(g.game_date) + (g.started_at ? ' ' + clockTime(g.started_at) : ''), g.team_name, gameLabel(g.game_type) + ' · ' + modeLabel(g.mode), g.staff_name].filter(Boolean).join(' · '))}</small>
  <small>${g.winner ? ico('trophy') + ' <b>' + esc(g.winner) + '</b> · ' : ''}${esc(gameScore(g))}</small></a></div>`;

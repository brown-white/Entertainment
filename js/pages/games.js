'use strict';
/* Mr Hassan · pages/games.js — staff pages: Games (today's games from the programme and its assignments, open games, the Game history with
   delete and clear, the hotel's game types and modes) and one game (Match setup → the game's own scoring screen → the result).
   Uses: core/state · translations/languages · supabase · core/utils · icons/icons · core/permissions · components/modals ·
         core/actions · components/cards · core/auth · core/router · components/forms · components/tables · systems/team-schedule ·
         systems/games */
const GAMES_PERM = 'games_start,games_score,games_any,games_edit,games_cancel,games_delete,games_history_delete,games_manage,bingo_caller,games_display';
page('games', {
  perm: GAMES_PERM, icon: 'trophy', group: 'programme',
  render: async arg => {
    const tab = arg === 'history' ? 'history' : arg === 'types' && can('games_manage') ? 'types' : 'today';
    const tb = tabs('games', [['today', t('games_today')], ['history', t('game_history')], can('games_manage') && ['types', t('game_types')]], tab);
    if (tab === 'history') return tb + await gamesHistory();
    if (tab === 'types') return tb + gameTypesHtml();
    return tb + await gamesToday();
  }
});

/* ---------- today: the game activities of today that the person runs (their assignment; "Start any game": all), open games ---------- */
async function gamesToday() {
  const d = D.today(), [b, open] = await Promise.all([board(d, d), api('game_list', { p_filter: { status: GAME_OPEN, _limit: 50 } })]);
  const its = b.items.filter(i => i.date === d && i.game_type && gameMayRun(i, i.game_type));
  const loose = open.rows.filter(g => !its.some(i => i.id === g.item_id));
  const free = can('games_any') || can('bingo_caller');
  return `<p class="row"><span class="muted grow">${esc(t('games_intro'))}</span>${free ? `<button class="btn" data-act="gm_new" data-ty="free">${ico('plus')} ${esc(t('new_game'))}</button>` : ''}</p>
    <section><h2>${esc(t(can('games_any') ? 'games_today' : 'my_games_today'))}</h2>${its.length ? its.map(gameItemCard).join('') : empty(t('no_games_today'))}</section>
    ${loose.length ? `<section><h2>${esc(t('open_games'))}</h2><div class="list">${loose.map(g => gameRow(g)).join('')}</div></section>` : ''}`;
}

/* ---------- the Game history: the sessions themselves (there is no second history) – filter, open, select, delete, clear ---------- */
let ghF = null;
const ghFilter = () => Object.assign({ _from: ghF.from, _to: ghF.to, _limit: 500 }, ghF.type ? { game_type: ghF.type } : {}, ghF.status ? { status: ghF.status } : {});
async function gamesHistory() {
  ghF = ghF || { from: D.add(D.today(), -30), to: D.today(), type: '', status: '' };
  const rows = (await api('game_list', { p_filter: ghFilter() })).rows, dl = can('games_delete') || can('games_history_delete');
  const sel1 = (k, options) => `<label class="field"><span>${esc(t(k === 'type' ? 'game_type' : 'status'))}</span><select name="${k}" data-act-change="gh_f">${options.map(([v, l]) => `<option value="${esc(v)}" ${ghF[k] === v ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></label>`;
  return `<div class="gh-filter">
      <label class="field"><span>${esc(t('date_from'))}</span><input type="date" name="from" value="${esc(ghF.from)}" data-act-change="gh_f"></label>
      <label class="field"><span>${esc(t('date_to'))}</span><input type="date" name="to" value="${esc(ghF.to)}" data-act-change="gh_f"></label>
      ${sel1('type', [['', t('all')]].concat(Object.keys(GAME_TYPES).map(ty => [ty, gameLabel(ty)])))}
      ${sel1('status', [['', t('all')]].concat(['completed', 'cancelled', 'in_progress', 'paused', 'ready'].map(s => [s, t('gst_' + s)])))}</div>
    <p class="muted small">${esc([S.hotel?.name, S.team?.name, t('games_n', { n: rows.length })].filter(Boolean).join(' · '))}</p>
    ${dl && rows.length ? selHead('gh', rows.map(g => g.id), `<button class="btn ghost small danger" data-act="gh_del" data-sel-need ${sel('gh').size ? '' : 'disabled'}>${ico('trash')} ${esc(t('delete_selected'))}</button>`) : ''}
    ${rows.length ? `<div class="list">${rows.map(g => gameRow(g, dl ? 'gh' : null)).join('')}</div>` : empty(t('no_games_found'))}
    ${dl && rows.length ? `<p class="row"><span class="grow"></span><button class="btn ghost small danger" data-act="gh_clear">${ico('trash')} ${esc(t('clear_history'))}</button></p>` : ''}`;
}
ACT.gh_f = el => { ghF[el.name] = el.value; if (ghF.to < ghF.from) ghF[el.name === 'from' ? 'to' : 'from'] = el.value; route(); };
ACT.gh_del = async () => { const ids = selIds('gh'); if (!ids.length) return; if (await gameDelete(ids.map(id => ({ id })))) { sel('gh').clear(); route(); } };
ACT.gh_clear = async () => { if (await gameDelete([], ghFilter())) { sel('gh').clear(); route(); } };

/* ---------- the hotel's game types and modes ("Manage game types"): what staff can choose when a game starts ---------- */
function gameTypesHtml() {
  return `<p class="hint-box">${ico('info')}<span>${esc(t('game_types_intro'))}</span></p><form id="gtf" class="card gt-form" onsubmit="return false">${Object.keys(GAME_TYPES).map(ty => { const on = gameModes(ty), ms = GAME_TYPES[ty].modes;
    return `<fieldset class="gt-row"><legend><label><input type="checkbox" data-gt="${ty}" ${on.length ? 'checked' : ''}> ${ico(GAME_TYPES[ty].icon)} <b>${esc(gameLabel(ty))}</b></label></legend>
      ${ms.length > 1 ? `<div class="days">${ms.map(m => `<label class="pickchip"><input type="checkbox" data-gm="${ty}" value="${esc(m)}" ${on.includes(m) ? 'checked' : ''}> ${esc(modeLabel(m))}</label>`).join('')}</div>` : ''}</fieldset>`; }).join('')}
    <button class="btn" data-act="gt_save">${esc(t('save'))}</button></form>`;
}
ACT.gt_save = async () => {
  const out = {};
  for (const ty of Object.keys(GAME_TYPES)) {
    const ms = GAME_TYPES[ty].modes.length > 1 ? $$(`#gtf [data-gm="${ty}"]:checked`).map(i => i.value) : GAME_TYPES[ty].modes;
    if ($(`#gtf [data-gt="${ty}"]`).checked && !ms.length) throw new ApiError('game_need_mode', { type: gameLabel(ty) });
    out[ty] = $(`#gtf [data-gt="${ty}"]`).checked ? ms : [];
  }
  await api('game_settings_save', { p_games: out }); await loadMe(); toast(t('saved')); route();
};

/* ---------- one game: #/game/<id> (the game), #/game/new/<activity> (its Match setup), #/game/new/free · bingo (by hand) ---------- */
page('game', {
  perm: GAMES_PERM, hidden: true, title: 'game',
  render: async arg => {
    const [a, b] = String(arg || '').split('/');
    if (a === 'new') return gameSetupHtml(b);
    const j = await api('game_get', { p_id: +a });
    gmOpen(j.row);
    return `<div id="gm" class="gm gm-${esc(GAME_TYPES[j.row.game_type]?.engine || 'points')}">${gmHtml()}</div>`;
  }
});
/* Match setup: the mode (the hotel's modes; the activity's default first), its settings, the players / teams (name, room and team
   name optional), whether guests see the live score – then START MATCH (or save, start later) */
let gsU = null;
async function gameSetupHtml(arg) {
  let it = null;
  if (arg && !['free', 'bingo'].includes(arg)) {
    const it0 = (await list('program_items', { id: +arg }))[0]; if (!it0) return empty(t('not_found'));
    it = (await board(it0.date, it0.date)).items.find(x => x.id === it0.id) || it0;
    if (!it.game_type) return empty(t('no_game_tool'));
    const open = (it.games || []).find(g => GAME_OPEN.includes(g.status));
    if (open) return empty(t('err_game_open'), `<a class="btn" href="#/game/${open.id}">${esc(t('continue_game'))}</a>`);
    if (!gameMayStart(it, it.game_type)) return empty(t('err_game_not_assigned'));
  }
  const types = it ? [it.game_type] : gameTypesOn().filter(ty => (arg === 'bingo' ? ty === 'bingo' : true) && (can('games_any') || (ty === 'bingo' && can('bingo_caller'))));
  if (!types.length || !gameModes(types[0]).length) return empty(t('err_game_off'));
  const ty = types[0], modes = gameModes(ty);
  gsU = { item: it, types, type: ty, mode: it && modes.includes(it.game_mode) ? it.game_mode : modes[0], rows: [{}, {}] };
  return `<div id="gs" class="gs">${gsHtml()}</div>`;
}
const gsEngine = () => ENGINES[GAME_TYPES[gsU.type].engine];
function gsHtml() {
  const u = gsU, e = gsEngine(), it = u.item, n = e.sides;
  const head = it ? `<div class="card gs-item"><small>${esc(D.long(it.date))} · ${esc(hm(it.start_time))}${it.end_time ? '–' + esc(hm(it.end_time)) : ''}${it.location ? ' · ' + esc(it.location) : ''}</small><h2>${esc(itemName(it))}</h2><span class="meta">${ico(GAME_TYPES[u.type].icon)} ${esc(gameLabel(u.type))}</span></div>` : '';
  const pick = (k, label, options, cur) => `<div class="field"><label for="gs_${k}">${esc(label)}</label><select id="gs_${k}" ${k === 'type' ? 'data-act-change="gsu_type"' : 'data-act-change="gsu_mode"'}>${options.map(([v, l]) => `<option value="${esc(v)}" ${v === cur ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></div>`;
  const rows = n.max ? u.rows.slice(0, n.max) : [];
  return `${head}<form class="form card" id="gs-form" onsubmit="return false"><h2>${esc(t('match_setup'))}</h2>
    ${it ? '' : pick('type', t('game_type'), u.types.map(x => [x, gameLabel(x)]), u.type)}
    ${pick('mode', t('game_mode'), gameModes(u.type).map(m => [m, modeLabel(m)]), u.mode)}
    ${fieldsHtml(e.options(u.type, u.mode), u.opts || {})}
    ${n.max ? `<div class="form-sec"><h3>${esc(t('players_or_teams'))}</h3><p class="hint">${esc(n.max === 2 ? t('players_two') : t('players_hint_n', { n: n.min }))}</p></div>
      <div id="gs-players">${rows.map((r, i) => `<div class="gs-player"><span class="n">${i + 1}</span><input data-pn value="${esc(r.name || '')}" placeholder="${esc(t('player_or_team'))} ${i + 1}" aria-label="${esc(t('player_or_team'))} ${i + 1}">
        <input data-pr class="room-in" value="${esc(r.room || '')}" placeholder="${esc(t('room'))}" aria-label="${esc(t('room'))}"><input data-pt value="${esc(r.team || '')}" placeholder="${esc(t('team_name'))}" aria-label="${esc(t('team_name'))}">
        ${rows.length > Math.max(1, n.min) ? `<button type="button" class="icon-btn" data-act="gsu_del" data-i="${i}" aria-label="${esc(t('remove'))}">${ico('x')}</button>` : ''}</div>`).join('')}</div>
      ${rows.length < n.max ? `<button type="button" class="btn ghost small" data-act="gsu_add">${ico('plus')} ${esc(t('add_player'))}</button>` : ''}
      ${fieldsHtml([{ k: 'show_guests', type: 'bool', label: t('show_live_to_guests'), hint: t('show_live_hint') }], { show_guests: u.show ?? true })}` : ''}
    <div class="gs-go"><button class="btn big wide" data-act="gsu_start">${ico('play')} ${esc(t('start_match'))}</button>${n.max ? `<button class="btn ghost wide" data-act="gsu_later">${esc(t('save_start_later'))}</button>` : ''}</div></form>`;
}
// the setup keeps what was typed when the game type, the mode or the number of players changes
function gsRead() {
  const root = $('#gs-form'); if (!root || !gsU) return;
  gsU.rows = $$('.gs-player', root).map(r => ({ name: $('[data-pn]', r).value.trim(), room: $('[data-pr]', r).value.trim().toUpperCase(), team: $('[data-pt]', r).value.trim() }));
  try { gsU.opts = readForm(root, gsEngine().options(gsU.type, gsU.mode)); } catch { /* a field left empty: its default */ }
  const sg = $('[name=show_guests]', root); if (sg) gsU.show = sg.checked;
}
const gsDraw = () => { const box = $('#gs'); if (box) { box.innerHTML = gsHtml(); wireForm(box); } };
ACT.gsu_type = el => { gsRead(); gsU.type = el.value; gsU.mode = gameModes(el.value)[0]; gsU.opts = {}; gsDraw(); };
ACT.gsu_mode = el => { gsRead(); gsU.mode = el.value; gsU.opts = {}; gsDraw(); };
ACT.gsu_add = () => { gsRead(); gsU.rows.push({}); gsDraw(); const r = $$('#gs-players [data-pn]'); r[r.length - 1]?.focus(); };
ACT.gsu_del = el => { gsRead(); gsU.rows.splice(+el.dataset.i, 1); gsDraw(); };
async function gsGo(ready) {
  gsRead();
  const u = gsU, e = gsEngine(), root = $('#gs-form'), options = readForm(root, e.options(u.type, u.mode));
  const sides = e.sides.max ? u.rows.filter(r => r.name) : [];
  if (e.sides.max && sides.length < e.sides.min) throw new ApiError('players_min', { n: e.sides.min });
  try {
    const j = await api('game_start', { p_row: { item_id: u.item?.id || null, game_type: u.type, mode: u.mode, options, sides, show_guests: !!u.show && u.type !== 'bingo', ready } });
    toast(t(ready ? 'game_saved_ready' : 'game_started')); location.hash = '#/game/' + j.row.id;
  } catch (err) {
    if (err.code === 'game_open' && err.info.id) { toast(t('err_game_open'), 'warn'); location.hash = '#/game/' + err.info.id; } else throw err;
  }
}
// a game by hand (Games → New game, Bingo Caller → Start a new bingo game): its Match setup
ACT.gm_new = el => { location.hash = '#/game/new/' + (el.dataset.ty || 'free'); };
ACT.gsu_start = () => gsGo(false);
ACT.gsu_later = () => gsGo(true);

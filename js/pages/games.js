'use strict';
/* Mr Hassan · pages/games.js — staff pages: Games (today's games from the programme and its assignments, open games; the GAMES LIBRARY – every
   game without a programme activity, by category; the ONE Game history with delete and clear; the saved wheels; the display
   themes; the hotel's game types and modes) and one game (Match setup with HOW TO PLAY → the game's own screen → the result).
   Staff see only what they may use; the manager's tools are tabs of their own.
   Uses: core/state · translations/languages · supabase · core/utils · icons/icons · core/permissions · components/modals ·
         core/actions · components/cards · core/auth · core/router · components/forms · components/tables · components/display ·
         systems/team-schedule · systems/games · systems/game-chance */
const GAMES_PERM = 'games_start,games_score,games_any,games_edit,games_cancel,games_delete,games_history_delete,games_manage,bingo_caller,games_display,games_library,games_players,games_roulette,games_spin,games_themes,games_wheels';
page('games', {
  perm: GAMES_PERM, icon: 'trophy', group: 'programme',
  render: async arg => {
    const [a, b] = String(arg || '').split('/');
    const tab = { library: gameLibraryOn(), history: true, wheels: can('games_wheels'), themes: can('games_themes'), types: can('games_manage') }[a] ? a : 'today';
    const tb = tabs('games', [['today', t('games_today')], gameLibraryOn() && ['library', t('games_library')], ['history', t('game_history')],
      can('games_wheels') && ['wheels', t('game_wheels')], can('games_themes') && ['themes', t('display_themes')], can('games_manage') && ['types', t('game_types')]], tab);
    if (tab === 'library') return tb + gamesLibrary(b);
    if (tab === 'history') return tb + await gamesHistory();
    if (tab === 'wheels') return tb + await gameWheelsHtml();
    if (tab === 'themes') return tb + await gameThemesHtml();
    if (tab === 'types') return tb + gameTypesHtml();
    return tb + await gamesToday();
  }
});

/* ---------- today: the game activities of today that the person runs (their assignment; "Start any game": all), open games ---------- */
async function gamesToday() {
  const d = D.today(), [b, open] = await Promise.all([board(d, d), api('game_list', { p_filter: { status: GAME_OPEN, _limit: 50 } })]);
  const its = b.items.filter(i => i.date === d && i.game_type && gameMayRun(i, i.game_type));
  const loose = open.rows.filter(g => !its.some(i => i.id === g.item_id));
  return `<p class="row"><span class="muted grow">${esc(t('games_intro'))}</span>${gameLibraryOn() ? `<a class="btn" href="#/games/library">${ico('plus')} ${esc(t('new_game'))}</a>` : ''}</p>
    <section><h2>${esc(t(can('games_any') ? 'games_today' : 'my_games_today'))}</h2>${its.length ? its.map(gameItemCard).join('') : empty(t('no_games_today'))}</section>
    ${loose.length ? `<section><h2>${esc(t('open_games'))}</h2><div class="list">${loose.map(g => gameRow(g)).join('')}</div></section>` : ''}`;
}

/* ---------- the GAMES LIBRARY: every game the person may start without a programme activity – by category, each with what it is,
   its kind and Play (the same game sessions, the same history) ---------- */
function gamesLibrary(cat) {
  const c = GAME_CATS.includes(cat) ? cat : 'all', all = Object.keys(GAME_TYPES).filter(gameMayPlay), list = all.filter(ty => c === 'all' || GAME_TYPES[ty].cat.includes(c));
  const cats = GAME_CATS.filter(k => k === 'all' || all.some(ty => GAME_TYPES[ty].cat.includes(k)));
  return `<nav class="gl-cats" aria-label="${esc(t('games_library'))}">${cats.map(k => `<a class="pickchip ${k === c ? 'on' : ''}" href="#/games/library/${k}" aria-current="${k === c}">${esc(t('gc_' + k))}</a>`).join('')}</nav>
    ${list.length ? `<div class="gl-grid">${list.map(ty => `<article class="card gl-card"><span class="gl-ico">${ico(GAME_TYPES[ty].icon)}</span>
      <div class="grow"><h3>${esc(gameLabel(ty))}</h3><p>${esc(t('hp_' + ty))}</p><small class="muted">${esc(GAME_TYPES[ty].cat.map(k => t('gc_' + k)).join(' · '))}</small></div>
      <a class="btn" href="#/game/new/${ty}">${ico('play')} ${esc(t('play'))}</a></article>`).join('')}</div>` : empty(t('no_games_found'))}`;
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

/* ---------- the saved WHEELS ("Manage wheels"): Roulette / Chooser and Spin & Win – create, rename, segments (add, edit, delete,
   reorder), colours, theme, duplicate, prizes back (reset), delete. Every wheel is played by the ONE wheel engine ---------- */
async function gameWheelsHtml() {
  const [rows] = await Promise.all([list('game_wheels'), displayThemesLoad().catch(() => [])]);
  const card = w => { const prizes = w.kind === 'spin_win' ? w.items.filter(x => !x.miss && x.qty != null) : [], out = prizes.filter(x => (x.won || 0) >= x.qty).length;
    return `<article class="card wh-card"><div class="wh-mini">${wheelSvg(w.items, 0, themeOf(w.theme, w.kind))}</div><div class="grow"><h3>${esc(w.name)}</h3>
      <small class="muted">${esc(gameLabel(w.kind))} · ${esc(t('wh_segments_n', { n: w.items.length }))}${w.theme ? ' · ' + esc(themeOf(w.theme, w.kind).name) : ''}</small>
      ${prizes.length ? `<small>${prizes.map(x => `${esc(x.label)}: ${esc(t('wh_left', { n: Math.max(0, x.qty - (x.won || 0)) }))}`).join(' · ')}</small>` : ''}
      ${out ? `<small class="warn-t">${esc(t('wh_won_out_n', { n: out }))}</small>` : ''}</div>
      <div class="wh-acts"><button class="btn ghost small" data-act="wh_edit" data-id="${w.id}">${ico('edit')} ${esc(t('edit'))}</button>
        <button class="btn ghost small" data-act="wh_copy" data-id="${w.id}">${ico('copy')} ${esc(t('copy'))}</button>
        ${w.kind === 'spin_win' ? `<button class="btn ghost small" data-act="wh_reset" data-id="${w.id}">${ico('repeat')} ${esc(t('wh_reset'))}</button>` : ''}
        <button class="btn ghost small danger" data-act="wh_del" data-id="${w.id}">${ico('trash')} ${esc(t('delete'))}</button></div></article>`; };
  const part = kind => { const ws = rows.filter(w => w.kind === kind);
    return `<section><div class="row"><h2 class="grow">${esc(gameLabel(kind))}</h2><button class="btn small" data-act="wh_new" data-kind="${kind}">${ico('plus')} ${esc(t(kind === 'spin_win' ? 'wh_new_prize' : 'wh_new'))}</button></div>
      ${ws.length ? ws.map(card).join('') : empty(t(kind === 'spin_win' ? 'wh_none_prize' : 'wh_none'))}</section>`; };
  return `<p class="hint-box">${ico('info')}<span>${esc(t('wheels_intro'))}</span></p>${part('roulette')}${part('spin_win')}`;
}
// the wheel editor: name, theme, the segments (name, an own colour or the theme's, for a prize its quantity or "no prize"), a preview
const wheelFields = (kind, req = true) => [{ k: 'name', label: t('name'), req: true },
  { k: 'theme', type: 'select', label: t('display_theme'), options: [['', t('theme_default_for', { name: themeOf(null, kind).name })]].concat(themeChoices()) },
  { k: 'items', type: 'rows', label: t('wh_segments'), hint: t(kind === 'spin_win' ? 'wh_prize_hint' : 'wh_segments_hint'), min: 2, req, addLabel: t('wh_add_segment'),
    cols: [{ k: 'label', label: t('wh_segment'), max_len: 60 }, { k: 'color', type: 'color', label: t('wh_own_colour') }]
      .concat(kind === 'spin_win' ? [{ k: 'qty', type: 'number', label: t('wh_quantity'), ph: t('wh_no_limit'), min: 0, max: 100000 }, { k: 'miss', type: 'bool', label: t('wh_miss') }] : []),
    note: r => (r.won ? `<small class="muted">${esc(t('wh_won_n', { n: r.won }))}</small>` : '') }];
function wheelEditor(w) {
  const kind = w.kind;
  editForm(w.id ? t('wh_edit') : t(kind === 'spin_win' ? 'wh_new_prize' : 'wh_new'), wheelFields(kind), { name: w.name || '', theme: w.theme || '', items: w.items?.length ? w.items : [{}, {}, {}] },
    async r => { await api('wheel_save', { p_id: w.id || null, p_row: { kind, name: r.name, theme: r.theme || null, items: r.items } }); route(); },
    { wide: true, after: '<div class="wh-prev" aria-hidden="true"></div>',
      mount: root => { const f = wheelFields(kind, false), prev = () => { const its = readForm(root, f.slice(1)).items.map((x, i) => Object.assign({}, x, { id: 'p' + i }));
          const th = themeOf($('[name=theme]', root).value, kind), pal = themeWheel(th); let i = 0;
          // a segment without its own colour shows the theme's colour it gets on the wheel (dimmed until the person picks one)
          $$('.rows-list > .rows-row', root).forEach(row => { if (!$('[data-rc="label"]', row).value.trim()) return; const on = $('[data-rco="color"]', row), c = pal[i++ % pal.length];
            if (on && !on.checked && /^#[0-9a-fA-F]{6}$/.test(c)) $('[data-rc="color"]', row).value = c; });
          $('.wh-prev', root).innerHTML = its.length ? wheelSvg(its, 0, th) : ''; };
        root.addEventListener('input', prev); root.addEventListener('change', prev); prev(); } });
}
ACT.wh_new = el => wheelEditor({ kind: el.dataset.kind });
ACT.wh_edit = async el => { const w = (await list('game_wheels', { id: +el.dataset.id }))[0]; if (!w) return toast(errText(new ApiError('notfound')), 'bad'); wheelEditor(w); };
ACT.wh_copy = async el => { await api('wheel_save', { p_id: +el.dataset.id, p_row: {}, p_action: 'copy' }); toast(t('saved')); route(); };
ACT.wh_reset = async el => { if (!await confirmBox(t('wh_reset_q'), t('wh_reset'))) return; await api('wheel_save', { p_id: +el.dataset.id, p_row: {}, p_action: 'reset' }); toast(t('wh_reset_done')); route(); };
ACT.wh_del = async el => {
  if (!await delAsk({ title: t('wh_delete_q'), n: 1, text: t('wh_delete_text') })) return;
  await del('game_wheels', +el.dataset.id); toast(t('deleted_n', { n: 1 })); route();
};

/* ---------- the DISPLAY THEMES ("Manage themes"): the theme each display starts with, the built-in themes, the hotel's own (colours,
   background, typography, logo, title, number style, wheel colours, animation). Presentation only ---------- */
async function gameThemesHtml() {
  const own = await displayThemesLoad(true), cur = S.settings?.game_themes || {};
  const card = (k, th, mine) => `<article class="card th-card">${themeSwatch(th)}<div class="grow"><b>${esc(th.name)}</b><small class="muted">${esc([t('dfont_' + (th.font || 'serif')), t('dnum_' + (th.number || 'ball')), t('danim_' + (th.anim || 'normal'))].join(' · '))}</small></div>
    ${mine ? `<button class="btn ghost small" data-act="th_edit" data-id="${mine.id}">${ico('edit')} ${esc(t('edit'))}</button><button class="icon-btn" data-act="th_del" data-id="${mine.id}" aria-label="${esc(t('delete'))}">${ico('trash')}</button>` : ''}</article>`;
  return `<p class="hint-box">${ico('info')}<span>${esc(t('themes_intro'))}</span></p>
    <form id="thd" class="card form" onsubmit="return false"><h2>${esc(t('theme_defaults'))}</h2>${DISPLAY_SCREENS.map(sc => fieldHtml({ k: 'th_' + sc, type: 'select', label: t(sc === 'votes' ? 'pg_votes' : 'sp_' + sc), options: [['', t('dth_luxury')]].concat(themeChoices()) }, cur[sc] || '')).join('')}
      <button class="btn" data-act="th_defaults">${esc(t('save'))}</button></form>
    <section><div class="row"><h2 class="grow">${esc(t('display_themes'))}</h2><button class="btn small" data-act="th_new">${ico('plus')} ${esc(t('theme_new'))}</button></div>
      <div class="th-grid">${Object.keys(DISPLAY_THEMES).map(k => card(k, themeOf(k))).join('')}${own.map(r => card('c' + r.id, themeOf('c' + r.id), r)).join('')}</div></section>`;
}
ACT.th_defaults = async () => {
  const out = {}; DISPLAY_SCREENS.forEach(sc => { const v = $(`#thd [name=th_${sc}]`).value; if (v) out[sc] = v; });
  await api('game_settings_save', { p_themes: out }); await loadMe(); toast(t('saved')); route();
};
const themeFields = () => [{ k: 'name', label: t('name'), req: true }, { k: 'base', type: 'select', label: t('theme_base'), options: Object.keys(DISPLAY_THEMES).map(k => [k, t('dth_' + k)]) },
  { k: 'title', label: t('theme_title'), hint: t('theme_title_hint') },
  { k: 'logo', type: 'select', label: t('theme_logo'), options: [['', t('theme_from_base')], ['hotel', t('theme_logo_hotel')], ['image', t('theme_logo_image')], ['none', t('theme_logo_none')]] },
  { k: 'logo_url', type: 'image', label: t('theme_logo_image') },
  { type: 'section', label: t('theme_colours'), hint: t('theme_colours_hint') }]
  .concat(THEME_COLORS.map(k => ({ k, type: 'color', label: t('dcol_' + k), reset: t('theme_from_base') })))
  .concat([{ k: 'font', type: 'select', label: t('theme_font'), options: [['', t('theme_from_base')]].concat(THEME_FONTS.map(f => [f, t('dfont_' + f)])) },
    { k: 'number', type: 'select', label: t('theme_number'), options: [['', t('theme_from_base')]].concat(THEME_NUMBERS.map(f => [f, t('dnum_' + f)])) },
    { k: 'anim', type: 'select', label: t('theme_anim'), options: [['', t('theme_from_base')]].concat(THEME_ANIMS.map(f => [f, t('danim_' + f)])) },
    { k: 'wheel', label: t('theme_wheel'), hint: t('theme_wheel_hint'), ph: '#e9c77b, #2b2219, #b08a4a' }]);
function themeEditor(r) {
  const st = r?.settings || {}, row = Object.assign({ name: r?.name || '', base: r?.base || 'luxury', wheel: (st.wheel || []).join(', ') }, st, { wheel: (st.wheel || []).join(', ') });
  editForm(r ? t('theme_edit') : t('theme_new'), themeFields(), row, async x => {
    const settings = themeClean(Object.assign({}, x, { wheel: String(x.wheel || '').split(/[\s,;]+/).filter(Boolean) }));
    await save('game_themes', Object.assign(r?.id ? { id: r.id } : {}, { name: x.name, base: x.base, settings }));
    await displayThemesLoad(true); route();
  });
}
ACT.th_new = () => themeEditor(null);
ACT.th_edit = el => themeEditor(displayThemesOwn().find(r => r.id === +el.dataset.id));
ACT.th_del = async el => { if (!await delAsk({ title: t('theme_delete_q'), n: 1, text: t('theme_delete_text') })) return; await del('game_themes', +el.dataset.id); await displayThemesLoad(true); toast(t('deleted_n', { n: 1 })); route(); };

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

/* ---------- one game: #/game/<id> (the game – its CONTROL screen), #/game/<id>/display (its DISPLAY screen, in its own window: it
   reads the session itself, so it opens at once and catches up after a lost connection), #/game/new/<activity> (its Match setup),
   #/game/new/<type> (from the Games Library), #/game/new/free (any game of the library) ---------- */
page('game', {
  perm: GAMES_PERM, hidden: true, title: 'game',
  render: async arg => {
    const [a, b] = String(arg || '').split('/');
    if (a === 'new') return gameSetupHtml(b);
    if (b === 'display') return displayShell(`<div id="gm" class="gm"></div>`, t('display_reconnecting_game'));
    const [j] = await Promise.all([api('game_get', { p_id: +a }), displayThemesLoad().catch(() => [])]);
    gmOpen(j.row);
    return `<div id="gm" class="gm gm-${esc(GAME_TYPES[j.row.game_type]?.engine || 'points')}">${gmHtml()}</div>`;
  },
  mount: (root, arg) => {
    const [a, b] = String(arg || '').split('/');
    if (b === 'display') return displayStart({ key: 'game:' + a, back: 'game/' + a, every: 2000, pull: () => gmPull(+a) });
    if (GM && $('#gm')) { engineOf(GM.g).after?.(GM, $('#gm')); displayAsk('game:' + GM.g.id); }
  }
});
/* Match setup: HOW TO PLAY of the game and its mode, the mode (the hotel's modes; the activity's default first), its settings, the
   wheel (Roulette, Spin & Win), the players / teams (name, room and team name optional), whether guests see the live score –
   then START (or save, start later) */
let gsU = null;
async function gameSetupHtml(arg) {
  let it = null, types;
  if (arg && /^\d+$/.test(arg)) {
    const it0 = (await list('program_items', { id: +arg }))[0]; if (!it0) return empty(t('not_found'));
    it = (await board(it0.date, it0.date)).items.find(x => x.id === it0.id) || it0;
    if (!it.game_type) return empty(t('no_game_tool'));
    const open = (it.games || []).find(g => GAME_OPEN.includes(g.status));
    if (open) return empty(t('err_game_open'), `<a class="btn" href="#/game/${open.id}">${esc(t('continue_game'))}</a>`);
    if (!gameMayStart(it, it.game_type)) return empty(t('err_game_not_assigned'));
    types = [it.game_type];
  } else types = Object.keys(GAME_TYPES).filter(ty => (GAME_TYPES[arg] ? ty === arg : true) && gameMayPlay(ty));
  if (!types.length || !gameModes(types[0]).length) return empty(t('err_game_off'));
  const ty = types[0], modes = gameModes(ty);
  const [wheels] = await Promise.all([types.some(x => GAME_TYPES[x].engine === 'wheel') ? list('game_wheels').catch(() => []) : [], displayThemesLoad().catch(() => [])]);
  gsU = { item: it, types, type: ty, mode: it && modes.includes(it.game_mode) ? it.game_mode : modes[0], rows: [{}, {}], wheels };
  return `<div id="gs" class="gs">${gsHtml()}</div>`;
}
const gsEngine = () => ENGINES[GAME_TYPES[gsU.type].engine];
function gsHtml() {
  const u = gsU, e = gsEngine(), it = u.item, n = e.sides, chance = gameChance(u.type);
  const head = it ? `<div class="card gs-item"><small>${esc(D.long(it.date))} · ${esc(hm(it.start_time))}${it.end_time ? '–' + esc(hm(it.end_time)) : ''}${it.location ? ' · ' + esc(it.location) : ''}</small><h2>${esc(itemName(it))}</h2><span class="meta">${ico(GAME_TYPES[u.type].icon)} ${esc(gameLabel(u.type))}</span></div>` : '';
  const pick = (k, label, options, cur) => `<div class="field"><label for="gs_${k}">${esc(label)}</label><select id="gs_${k}" ${k === 'type' ? 'data-act-change="gsu_type"' : k === 'wheel' ? 'data-act-change="gsu_wheel"' : 'data-act-change="gsu_mode"'}>${options.map(([v, l]) => `<option value="${esc(v)}" ${String(v) === String(cur) ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></div>`;
  const rows = n.max ? u.rows.slice(0, n.max) : [], wheels = (u.wheels || []).filter(w => w.kind === u.type);
  if (e === ENGINES.wheel && !wheels.some(w => w.id === u.wheel)) u.wheel = wheels[0]?.id || null;
  const w = wheels.find(x => x.id === u.wheel);
  // started from the library with one game: its name heads the setup (from the programme the activity's card above says it)
  const named = !it && u.types.length < 2 ? ` <span class="meta">${ico(GAME_TYPES[u.type].icon)} ${esc(gameLabel(u.type))}</span>` : '';
  return `${head}<form class="form card" id="gs-form" onsubmit="return false"><h2>${esc(t(chance ? 'game_setup' : 'match_setup'))}${named}</h2>
    ${it || u.types.length < 2 ? '' : pick('type', t('game_type'), u.types.map(x => [x, gameLabel(x)]), u.type)}
    ${gameModes(u.type).length > 1 ? pick('mode', t('game_mode'), gameModes(u.type).map(m => [m, modeLabel(m)]), u.mode) : ''}
    ${e === ENGINES.wheel ? (wheels.length ? pick('wheel', t('game_wheel'), wheels.map(x => [x.id, x.name]), u.wheel) + (w ? `<div class="wh-mini center">${wheelSvg(w.items, 0, themeOf(w.theme, u.type))}</div>` : '')
      : `<p class="hint-box warn">${ico('info')}<span>${esc(t(can('games_wheels') ? 'wh_none_make' : 'wh_none_ask'))}</span></p>${can('games_wheels') ? `<a class="btn ghost" href="#/games/wheels">${esc(t('game_wheels'))}</a>` : ''}`) : ''}
    ${fieldsHtml(e.options(u.type, u.mode), u.opts || {})}
    ${gameRules(u.type, u.mode, true)}
    ${n.max ? `<div class="form-sec"><h3>${esc(t('players_or_teams'))}</h3><p class="hint">${esc(n.max === 2 ? t('players_two') : t('players_hint_n', { n: n.min }))}</p></div>
      <div id="gs-players">${rows.map((r, i) => `<div class="gs-player"><span class="n">${i + 1}</span><input data-pn value="${esc(r.name || '')}" placeholder="${esc(t('player_or_team'))} ${i + 1}" aria-label="${esc(t('player_or_team'))} ${i + 1}">
        <input data-pr class="room-in" value="${esc(r.room || '')}" placeholder="${esc(t('room'))}" aria-label="${esc(t('room'))}"><input data-pt value="${esc(r.team || '')}" placeholder="${esc(t('team_name'))}" aria-label="${esc(t('team_name'))}">
        ${rows.length > Math.max(1, n.min) ? `<button type="button" class="icon-btn" data-act="gsu_del" data-i="${i}" aria-label="${esc(t('remove'))}">${ico('x')}</button>` : ''}</div>`).join('')}</div>
      ${rows.length < n.max ? `<button type="button" class="btn ghost small" data-act="gsu_add">${ico('plus')} ${esc(t('add_player'))}</button>` : ''}
      ${fieldsHtml([{ k: 'show_guests', type: 'bool', label: t('show_live_to_guests'), hint: t('show_live_hint') }], { show_guests: u.show ?? true })}` : ''}
    <div class="gs-go"><button class="btn big wide" data-act="gsu_start" ${e === ENGINES.wheel && !w ? 'disabled' : ''}>${ico('play')} ${esc(t(chance ? 'start_game' : 'start_match'))}</button>${n.max ? `<button class="btn ghost wide" data-act="gsu_later">${esc(t('save_start_later'))}</button>` : ''}</div></form>`;
}
// the setup keeps what was typed when the game type, the mode or the number of players changes
function gsRead() {
  const root = $('#gs-form'); if (!root || !gsU) return;
  gsU.rows = $$('.gs-player', root).map(r => ({ name: $('[data-pn]', r).value.trim(), room: $('[data-pr]', r).value.trim().toUpperCase(), team: $('[data-pt]', r).value.trim() }));
  try { gsU.opts = readForm(root, gsEngine().options(gsU.type, gsU.mode)); } catch { /* a field left empty: its default */ }
  const sg = $('[name=show_guests]', root); if (sg) gsU.show = sg.checked;
}
const gsDraw = () => { const box = $('#gs'); if (box) { box.innerHTML = gsHtml(); wireForm(box); } };
ACT.gsu_type = async el => { gsRead(); gsU.type = el.value; gsU.mode = gameModes(el.value)[0]; gsU.opts = {};
  if (GAME_TYPES[el.value].engine === 'wheel' && !gsU.wheels.length) gsU.wheels = await list('game_wheels').catch(() => []);
  gsDraw(); };
ACT.gsu_mode = el => { gsRead(); gsU.mode = el.value; gsU.opts = {}; gsDraw(); };
ACT.gsu_wheel = el => { gsRead(); gsU.wheel = +el.value; gsDraw(); };
ACT.gsu_add = () => { gsRead(); gsU.rows.push({}); gsDraw(); const r = $$('#gs-players [data-pn]'); r[r.length - 1]?.focus(); };
ACT.gsu_del = el => { gsRead(); gsU.rows.splice(+el.dataset.i, 1); gsDraw(); };
async function gsGo(ready) {
  gsRead();
  const u = gsU, e = gsEngine(), root = $('#gs-form'), options = Object.assign(readForm(root, e.options(u.type, u.mode)), e === ENGINES.wheel ? { wheel_id: u.wheel } : {});
  const sides = e.sides.max ? u.rows.filter(r => r.name) : [];
  if (e.sides.max && sides.length < e.sides.min) throw new ApiError('players_min', { n: e.sides.min });
  try {
    const j = await api('game_start', { p_row: { item_id: u.item?.id || null, game_type: u.type, mode: u.mode, options, sides, show_guests: !!u.show && !gameChance(u.type), ready } });
    toast(t(ready ? 'game_saved_ready' : 'game_started')); location.hash = '#/game/' + j.row.id;
  } catch (err) {
    if (err.code === 'game_open' && err.info.id) { toast(t('err_game_open'), 'warn'); location.hash = '#/game/' + err.info.id; } else throw err;
  }
}
// a game by hand (Games → New game, the Games Library, Bingo Caller → Start a new bingo game): its setup
ACT.gm_new = el => { location.hash = '#/game/new/' + (el.dataset.ty || 'free'); };
ACT.gsu_start = () => gsGo(false);
ACT.gsu_later = () => gsGo(true);

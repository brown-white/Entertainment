'use strict';
/* Mr Hassan · pages/themes.js — Settings → Themes: ONE place for how the apps look. Where each theme is used (manager app, staff app,
   guest app – light, dark or the device's choice; this hotel or every hotel), the heading face and corners, the gallery of themes (built in
   and the hotel's own), the THEME EDITOR (its colours, live preview of the real components, save / duplicate / reset / delete) and the
   hotel's BRANDING (brand colours, light and dark logo, app mark, display logo and background, header). The display screens keep their own
   themes (Games → Themes). Everything here only writes settings: the Theme Engine (components/theme.js) draws them.
   Uses: core/state · translations/languages · supabase · core/utils · icons/icons · core/permissions · components/modals · core/actions ·
         components/cards · components/theme · core/auth · core/router · components/forms · components/navigation */
const TH_SCOPES = ['manager', 'staff', 'guest'];
const modeOpts = () => UI_MODES.map(m => [m, t('mode_' + m)]);
let thDraft = null, thPvMode = 'light';   // the theme being edited (not saved yet) and its preview's mode
page('themes', {
  perm: 'm_settings', icon: 'palette', group: 'settings', title: 'pg_themes',
  sub: () => t('th_sub'),
  render: async arg => {
    const [tab, key] = String(arg || '').split('/');
    const T = [['apps', t('th_tab_apps')], ['editor', t('th_tab_editor')], ['brand', t('th_tab_brand')]], cur = T.some(x => x[0] === tab) ? tab : 'apps';
    const head = tabs('themes', T, cur);
    if (cur === 'editor') return head + thEditor(key);
    if (cur === 'brand') return head + thBrand();
    return head + thApps();
  },
  mount: (view, arg) => { if (String(arg).startsWith('editor')) thEditWire(view); if (String(arg).startsWith('brand')) thBrandWire(view); }
});

/* ---------- where each theme is used, the face and corners; the gallery ---------- */
const thUsedBy = (k, st = S.settings) => TH_SCOPES.filter(sc => st['theme_' + sc] === k).map(sc => t('th_scope_' + sc));
function thApps() {
  const st = S.settings, all = can('all_hotels') && S.hotels.length > 1, own = ownThemes(st);
  const card = (k, name, desc, isOwn) => `<div class="card th-card ${thUsedBy(k).length ? 'on' : ''}">${themeSwatchApp(k, st)}<div class="grow"><b>${esc(name)}</b>
      <small class="muted">${esc(thUsedBy(k).length ? t('th_used_by', { list: thUsedBy(k).join(', ') }) : desc)}</small></div>
      ${moreMenu([`<a href="#/themes/editor/${esc(k)}">${ico(isOwn ? 'edit' : 'eye')} ${esc(t(isOwn ? 'edit' : 'th_view'))}</a>`, `<button data-act="ath_dup" data-k="${esc(k)}">${ico('copy')} ${esc(t('th_duplicate'))}</button>`,
        isOwn ? `<button class="danger" data-act="ath_del" data-k="${esc(k)}">${ico('trash')} ${esc(t('delete'))}</button>` : ''].join(''))}</div>`;
  return `<form class="card" id="thf" onsubmit="return false"><div class="card-head"><h2>${ico('layout')} ${esc(t('th_where'))}</h2></div>
      <div class="th-scope">${TH_SCOPES.map(sc => `<div class="form">${fieldHtml({ k: 'theme_' + sc, type: 'select', label: t('th_scope_' + sc), options: themeChoicesApp(st) }, st['theme_' + sc])}
        ${fieldHtml({ k: 'mode_' + sc, type: 'select', label: t('th_mode'), options: modeOpts() }, st['mode_' + sc] || 'light')}</div>`).join('')}</div>
      <div class="form-sec"><h3>${esc(t('th_type_corners'))}</h3></div>
      <div class="th-scope">${fieldHtml({ k: 'font_style', type: 'select', label: t('font_style'), options: [['theme', t('font_theme')], ['modern', t('font_modern')], ['elegant', t('font_elegant')], ['classic', t('font_classic')]] }, st.font_style || 'theme')}
        ${fieldHtml({ k: 'button_style', type: 'select', label: t('button_style'), options: [['rounded', t('btn_rounded')], ['pill', t('btn_pill')], ['square', t('btn_square')]] }, st.button_style || 'rounded')}</div>
      <p class="hint-box">${ico('screen')}<span>${esc(t('th_displays_hint'))} ${can('games_themes') ? `<a href="#/games/themes">${esc(t('th_displays_go'))}</a>` : ''}</span></p>
      ${all ? `<fieldset class="field del-opts pick-opts"><legend>${esc(t('th_apply_to'))}</legend><label class="del-opt"><input type="radio" name="th_to" value="hotel" checked><span><b>${esc(t('th_this_hotel', { name: S.hotel?.name || '' }))}</b></span></label>
        <label class="del-opt"><input type="radio" name="th_to" value="all"><span><b>${esc(t('th_all_hotels', { n: S.hotels.length }))}</b><small class="muted">${esc(t('th_all_hint'))}</small></span></label></fieldset>` : ''}
      <div class="actions"><button class="btn" data-act="ath_save">${esc(t('save'))}</button></div></form>
    <section>${secHead(t('th_gallery'), 'palette', `<button class="btn secondary small" data-act="ath_dup" data-k="executive">${ico('plus')} ${esc(t('th_new'))}</button>`)}
      <div class="th-grid">${THEME_KEYS.map(k => card(k, t('theme_' + k), t('theme_' + k + '_d'), false)).join('')}${own.map(x => card(x.key, x.name, t('th_own_based', { base: t('theme_' + x.base) }), true)).join('')}</div></section>`;
}
const thFields = () => TH_SCOPES.flatMap(sc => [{ k: 'theme_' + sc }, { k: 'mode_' + sc }]).concat([{ k: 'font_style' }, { k: 'button_style' }]);
ACT.ath_save = async () => {
  const r = readForm($('#thf'), thFields()), all = $('#thf [name=th_to]:checked')?.value === 'all';
  if (all) {
    if (!await confirmBox(t('th_all_q', { n: S.hotels.length }))) return;
    const j = await api('theme_apply_all', { p_row: Object.assign(r, { app_themes: ownThemes(S.settings) }) }); toast(t('th_all_done', { n: j.hotels }));
  } else { await api('settings_save', { p_row: r }); toast(t('saved')); }
  await loadMe(); renderShell(); route();
};
// a copy of any theme becomes one of the hotel's own (opened in the editor, saved there)
ACT.ath_dup = el => {
  const k = el.dataset.k, own = ownThemes(S.settings).find(x => x.key === k);
  thDraft = { key: 'new', name: (own ? own.name : t('theme_' + k)) + ' · ' + t('th_copy'), base: own ? own.base : (THEMES[k]?.base || k), colors: Object.assign({}, own ? own.colors : k === 'brand' ? { primary: S.settings.brand_primary, secondary: S.settings.brand_secondary, accent: S.settings.brand_accent } : {}) };
  Object.keys(thDraft.colors).forEach(c => { if (!isHex(thDraft.colors[c])) delete thDraft.colors[c]; });
  location.hash = '#/themes/editor/new';
};
ACT.ath_del = async el => {
  const k = el.dataset.k, x = ownThemes(S.settings).find(y => y.key === k); if (!x) return;
  if (!await confirmBox(t('th_del_q', { name: x.name, list: thUsedBy(k).join(', ') || '–' }))) return;
  await api('settings_save', { p_row: { app_themes: ownThemes(S.settings).filter(y => y.key !== k) } }); toast(t('deleted'));
  thDraft = null; await loadMe(); renderShell(); location.hash = '#/themes/apps';
};

/* ---------- the THEME EDITOR: a hotel's own theme – its base, its colours, the live preview of the real components ---------- */
function thEditor(key) {
  const st = S.settings, own = ownThemes(st).find(x => x.key === key), builtIn = THEMES[key] && !own;
  if (key === 'new' && thDraft) { /* the copy being made */ } else if (own) thDraft = JSON.parse(JSON.stringify(own));
  else if (builtIn) thDraft = { key, name: t('theme_' + key), base: THEMES[key].base || key, colors: key === 'brand' ? { primary: st.brand_primary, secondary: st.brand_secondary, accent: st.brand_accent } : {}, view: true };
  else thDraft = { key: 'new', name: t('th_new'), base: 'executive', colors: {} };
  const d = thDraft;
  const fields = [{ k: 'name', label: t('name'), req: true }, { k: 'base', type: 'select', label: t('theme_base'), options: THEME_KEYS.filter(k => !THEMES[k].base).map(k => [k, t('theme_' + k)]) }];
  return `<div class="th-ed"><form class="card form" id="thed" onsubmit="return false">
      ${d.view ? `<p class="hint-box">${ico('info')}<span>${esc(t('th_builtin_hint'))}</span></p>` : ''}
      <fieldset class="plain form" ${d.view ? 'disabled' : ''}>${fieldsHtml(fields, d)}
      <div class="form-sec"><h3>${esc(t('theme_colours'))}</h3><p class="hint">${esc(t('theme_colours_hint'))}</p></div>
      <div class="th-colors">${thColors(d)}</div></fieldset>
      <div class="actions">${d.view ? `<button class="btn" data-act="ath_dup" data-k="${esc(d.key)}">${ico('copy')} ${esc(t('th_duplicate'))}</button>`
        : `<button class="btn" data-act="ath_ed_save">${esc(t('save'))}</button><button class="btn secondary" data-act="ath_reset">${ico('undo')} ${esc(t('th_reset'))}</button>
          ${d.key !== 'new' ? `<button class="btn secondary" data-act="ath_dup" data-k="${esc(d.key)}">${ico('copy')} ${esc(t('th_duplicate'))}</button><span class="grow"></span><button class="btn secondary danger" data-act="ath_del" data-k="${esc(d.key)}">${ico('trash')} ${esc(t('delete'))}</button>` : ''}`}</div></form>
    <section>${secHead(t('th_preview'), 'eye', `<div class="seg" role="group" aria-label="${esc(t('th_mode'))}">${['light', 'dark'].map(m => `<button type="button" class="${thPvMode === m ? 'on' : ''}" data-act="ath_pv" data-m="${m}">${esc(t('mode_' + m))}</button>`).join('')}</div>`)}<div id="th-pv">${thPreview(d)}</div></section></div>`;
}
// the colours: each shows the colour in use – its own, else the base theme's (marked "from the base"); ↺ goes back to the base
function thColors(d) {
  const bp = THEMES[d.base].light || THEMES[d.base].dark;
  return THEME_EDIT.map(k => { const own = isHex(d.colors[k]);
    return `<div class="th-color ${own ? 'own' : ''}"><input type="color" name="c_${k}" id="f_c_${k}" value="${esc(own ? d.colors[k] : bp[k])}" ${own ? '' : 'data-empty="1"'}>
      <label for="f_c_${k}">${esc(t('tk_' + k))}<small>${esc(own ? d.colors[k].toUpperCase() : t('theme_from_base'))}</small></label>
      <button type="button" class="icon-btn" data-color-reset="c_${k}" title="${esc(t('theme_from_base'))}" aria-label="${esc(t('theme_from_base'))} – ${esc(t('tk_' + k))}" ${own ? '' : 'hidden'}>${ico('undo')}</button></div>`; }).join('');
}
// the preview: the app's real components, drawn with the theme being edited (its tokens on this box only)
function thPreview(d) {
  // the theme being edited is drawn as an own theme (its base + its colours), whatever it is called
  const st = Object.assign({}, S.settings, { app_themes: [{ key: 'u0', name: d.name || '-', base: d.base, colors: d.colors || {} }] });
  const mode = THEMES[d.base]?.only || thPvMode, p = themePalette('u0', mode, st);
  const style = Object.entries(themeTokens(p, mode)).map(([k, v]) => `${k}:${v}`).join(';');
  return `<div class="th-preview" data-tokens data-font="${esc(themeFont(S.settings, d.base))}" style="${esc(style)}">
    <div class="pv-side"><b>${esc(S.settings.app_name || 'Mr Hassan')}</b><span class="on">${ico('gauge')} ${esc(t('pg_dashboard'))}</span><span>${ico('sun')} ${esc(t('pg_myday'))}</span><span>${ico('list')} ${esc(t('pg_programme'))}</span><span>${ico('users')} ${esc(t('staff'))}</span></div>
    <div class="pv-main"><h2>${esc(t('pg_dashboard'))}</h2>
      <div class="stats small">${kpi(t('working_today'), 12)}${kpi(t('ops_action'), 3, { tone: 'warn' })}${kpi(t('tk_late'), 1, { tone: 'bad' })}</div>
      <div class="row"><button type="button" class="btn">${esc(t('save'))}</button><button type="button" class="btn secondary">${esc(t('cancel'))}</button><button type="button" class="btn ghost">${esc(t('see_all'))}</button><button type="button" class="btn danger small">${esc(t('delete'))}</button></div>
      <div class="field"><label>${esc(t('guest'))}</label><input value="${esc(t('room'))} 214" aria-label="${esc(t('guest'))}"></div>
      <div class="row">${chip(t('st_working'), 'ok')}${chip(t('ts_open'), 'warn')}${chip(t('tk_late'), 'bad')}${chip(t('type_show'), 'ty-show')}</div>
      <div class="tablewrap"><table><thead><tr><th>${esc(t('name'))}</th><th>${esc(t('time'))}</th><th>${esc(t('status'))}</th></tr></thead><tbody>
        <tr><td>${esc(t('type_activity'))}</td><td>10:00</td><td>${chip(t('st_working'), 'ok')}</td></tr><tr><td>${esc(t('type_show'))}</td><td>20:30</td><td>${chip(t('ts_open'), 'warn')}</td></tr></tbody></table></div>
      <div class="modal pv-modal"><header><h2>${esc(t('please_confirm'))}</h2></header><div class="modal-body">${esc(t('th_pv_dialog'))}</div><footer><span class="grow"></span><button type="button" class="btn ghost">${esc(t('cancel'))}</button><button type="button" class="btn">${esc(t('yes'))}</button></footer></div>
    </div></div>`;
}
function thEditRead() {
  const f = $('#thed'); if (!f || thDraft.view) return;
  const r = readForm(f, [{ k: 'name' }, { k: 'base' }].concat(THEME_EDIT.map(k => ({ k: 'c_' + k, type: 'color' }))));
  thDraft.name = r.name || ''; thDraft.base = r.base || thDraft.base;
  thDraft.colors = {}; THEME_EDIT.forEach(k => { if (isHex(r['c_' + k])) thDraft.colors[k] = r['c_' + k]; });
}
// the preview follows every change at once (nothing is saved until Save)
function thEditWire(view) {
  const f = $('#thed', view); if (!f) return;
  const upd = ev => {
    if (ev.target.type === 'color' && ev.type === 'input') delete ev.target.dataset.empty;          // a colour chosen is the theme's own
    thEditRead(); $('#th-pv').innerHTML = thPreview(thDraft);
    if (ev.type === 'change') $('.th-colors', f).innerHTML = thColors(thDraft);                    // its name, its code, ↺
  };
  f.addEventListener('input', upd); f.addEventListener('change', upd);
  f.addEventListener('click', ev => { const b = ev.target.closest('.th-color [data-color-reset]'); if (!b) return; ev.stopImmediatePropagation();
    const i = f.querySelector(`[name="${b.dataset.colorReset}"]`); i.dataset.empty = '1'; i.dispatchEvent(new Event('change', { bubbles: true })); }, true);
}
ACT.ath_pv = el => { thPvMode = el.dataset.m; $$('[data-act=ath_pv]').forEach(b => b.classList.toggle('on', b === el)); thEditRead(); $('#th-pv').innerHTML = thPreview(thDraft); };
ACT.ath_reset = () => { thEditRead(); thDraft.colors = {}; $('#thed .th-colors').innerHTML = thColors(thDraft); $('#th-pv').innerHTML = thPreview(thDraft); };
ACT.ath_ed_save = async () => {
  readForm($('#thed'), [{ k: 'name', label: t('name'), req: true }]);   // the name is needed (said at the field)
  thEditRead();
  const list = ownThemes(S.settings).slice(), at = list.findIndex(x => x.key === thDraft.key);
  if (at < 0 && list.length >= 20) throw new ApiError('th_too_many');
  const key = at >= 0 ? thDraft.key : 'u' + (Math.max(0, ...list.map(x => +x.key.slice(1))) + 1);
  const row = { key, name: thDraft.name.trim().slice(0, 60), base: thDraft.base, colors: thDraft.colors };
  if (at >= 0) list[at] = row; else list.push(row);
  await api('settings_save', { p_row: { app_themes: list } }); toast(t('saved'));
  thDraft = null; await loadMe(); renderShell(); location.hash = '#/themes/editor/' + key;
};

/* ---------- the hotel's BRANDING: brand colours (the Custom Brand theme, the Hotel brand display), logos, app mark, header ---------- */
const BRAND_FIELDS = () => [{ type: 'section', label: t('th_brand_colours'), hint: t('th_brand_colours_hint') },
  { k: 'brand_primary', type: 'color', label: t('tk_primary'), reset: t('theme_from_theme') }, { k: 'brand_secondary', type: 'color', label: t('tk_secondary'), reset: t('theme_from_theme') },
  { k: 'brand_accent', type: 'color', label: t('tk_accent'), reset: t('theme_from_theme') },
  { type: 'section', label: t('th_brand_logos'), hint: t('th_brand_logos_hint') },
  { k: 'brand_header', type: 'select', label: t('th_brand_header'), options: [['logo_name', t('bh_logo_name')], ['logo', t('bh_logo')], ['name', t('bh_name')]] },
  { k: 'logo_dark_url', type: 'image', label: t('th_logo_dark') }, { k: 'app_mark_url', type: 'image', label: t('th_app_mark'), hint: t('th_app_mark_hint') },
  { k: 'display_logo_url', type: 'image', label: t('th_display_logo') }, { k: 'brand_bg_url', type: 'image', label: t('th_display_bg'), hint: t('th_display_bg_hint') }];
function thBrand() {
  const st = S.settings;
  return `<div class="th-ed"><form class="card form" id="thb" onsubmit="return false">
      <div class="field"><span class="t-label">${esc(t('th_logo_light'))}</span><div class="row">${S.hotel?.logo_url ? `<img class="thumb" src="${esc(S.hotel.logo_url)}" alt="">` : `<span class="muted small">${esc(t('th_no_logo'))}</span>`}
        ${can('m_hotels') ? `<a class="btn secondary small" href="#/hotels">${esc(t('th_logo_in_hotels'))}</a>` : ''}</div></div>
      ${fieldsHtml(BRAND_FIELDS(), st)}<div class="actions"><button class="btn" data-act="ath_brand">${esc(t('save'))}</button></div></form>
    <section>${secHead(t('th_preview'), 'eye')}<div id="th-bpv">${thBrandPreview(st)}</div>
      <p class="muted small">${esc(t('th_brand_where'))}</p></section></div>`;
}
// the header as it looks in light and in dark: the logo for each, the brand colours on the Custom Brand theme's buttons
function thBrandPreview(st) {
  const box = mode => { const p = themePalette('brand', mode, st), style = Object.entries(themeTokens(p, mode)).map(([k, v]) => `${k}:${v}`).join(';');
    const logo = mode === 'dark' && st.logo_dark_url ? st.logo_dark_url : S.hotel?.logo_url, how = st.brand_header || 'logo_name';
    return `<div data-tokens style="${esc(style)}"><span class="brand">${logo && how !== 'name' ? `<img src="${esc(logo)}" alt="">` : !logo ? `<span class="mark">${esc((st.app_name || 'M').slice(0, 1))}</span>` : ''}${how === 'logo' && logo ? '' : `<span><b>${esc(st.app_name || 'Mr Hassan')}</b><small>${esc(S.hotel?.name || '')}</small></span>`}</span>
      <span class="grow"></span><button type="button" class="btn small">${esc(t('mode_' + mode))}</button></div>`; };
  return `<div class="brand-prev">${box('light')}${box('dark')}</div>`;
}
function thBrandWire(view) {
  const f = $('#thb', view); if (!f) return;
  const upd = () => { const r = readForm(f, BRAND_FIELDS().filter(x => x.k)); $('#th-bpv').innerHTML = thBrandPreview(Object.assign({}, S.settings, r)); };
  f.addEventListener('input', upd); f.addEventListener('change', upd);
}
ACT.ath_brand = async () => {
  const r = readForm($('#thb'), BRAND_FIELDS().filter(x => x.k));
  await api('settings_save', { p_row: r }); toast(t('saved')); await loadMe(); renderShell(); route();
};

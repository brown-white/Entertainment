'use strict';
/* Mr Hassan · components/display.js — THE display mode: one full screen of a game or a vote for a TV, a projector, a tablet or the
   reception touch screen – nothing of the app (no header, no menu, no navigation, no manager tools), full screen where the browser
   allows it, refreshed from the database every few seconds, left with Exit (or Esc; the reception screen asks first). And its
   THEMES: Luxury Hotel, Classic, Halloween, Christmas, New Year, Summer, the hotel's own colours, and the hotel's own themes
   (Games → Themes) – background, colours, typography, logo, title, number style, wheel colours, animation. A theme is presentation
   only: it never changes a game, its numbers or its results.
   Uses: core/state · translations/languages · supabase · core/utils · icons/icons · components/modals · core/actions ·
         components/theme */
/* ---------- the themes ---------- */
const DISPLAY_THEMES = {
  luxury: { bg: '#14110e', bg2: '#2b2219', fg: '#f6efe2', accent: '#e9c77b', muted: '#cbbfa8', ball: '#e9c77b', ball_fg: '#1b140c', font: 'serif', number: 'ball', anim: 'normal',
    wheel: ['#e9c77b', '#3a2d20', '#b08a4a', '#5a4630', '#f6efe2', '#7a5c33'] },
  classic: { bg: '#0b2a4a', bg2: '#15426e', fg: '#ffffff', accent: '#ffd23f', muted: '#b8c9dc', ball: '#ffd23f', ball_fg: '#0b2a4a', font: 'sans', number: 'ball', anim: 'normal',
    wheel: ['#e63946', '#f1faee', '#457b9d', '#ffd23f', '#2a9d8f', '#f4a261'] },
  halloween: { bg: '#120a12', bg2: '#2e0f2e', fg: '#fbe9d0', accent: '#ff7518', muted: '#c9a98a', ball: '#ff7518', ball_fg: '#120a12', font: 'display', number: 'tile', anim: 'slow',
    wheel: ['#ff7518', '#3b1d3b', '#6a0dad', '#1f1f1f', '#ffb347', '#8b0000'] },
  christmas: { bg: '#0c2b1c', bg2: '#5c0e17', fg: '#fff8ee', accent: '#f2c14e', muted: '#cfe3d4', ball: '#c1121f', ball_fg: '#ffffff', font: 'serif', number: 'ball', anim: 'normal',
    wheel: ['#c1121f', '#0b6e4f', '#f2c14e', '#fff8ee', '#14532d', '#9b2226'] },
  new_year: { bg: '#05060f', bg2: '#1d1650', fg: '#f8f7ff', accent: '#f5d76e', muted: '#b9b4d9', ball: '#f5d76e', ball_fg: '#05060f', font: 'display', number: 'tile', anim: 'fast',
    wheel: ['#f5d76e', '#1d1650', '#c0c0c0', '#6c3ec1', '#ffffff', '#2b2b52'] },
  summer: { bg: '#0077b6', bg2: '#00b4d8', fg: '#ffffff', accent: '#ffd166', muted: '#e0f4ff', ball: '#ffd166', ball_fg: '#023047', font: 'rounded', number: 'ball', anim: 'fast',
    wheel: ['#ef476f', '#ffd166', '#06d6a0', '#118ab2', '#f78c6b', '#073b4c'] },
  hotel: {}
};
const THEME_FONTS = ['serif', 'sans', 'display', 'rounded'];
const THEME_NUMBERS = ['ball', 'tile', 'plain'];
const THEME_ANIMS = ['slow', 'normal', 'fast'];
const THEME_COLORS = ['bg', 'bg2', 'fg', 'accent', 'muted', 'ball', 'ball_fg'];
// the displays that start with a theme of their own (Games → Themes)
const DISPLAY_SCREENS = ['bingo', 'roulette', 'spin_win', 'arrow', 'random_number', 'votes'];
let DM_OWN = null;   // the hotel's own themes { hotel, rows } – loaded when a display or the theme editor needs them
async function displayThemesLoad(force) {
  if (force || !DM_OWN || DM_OWN.hotel !== S.hotel?.id) DM_OWN = { hotel: S.hotel?.id, rows: await list('game_themes') };
  return DM_OWN.rows;
}
const displayThemesOwn = () => (DM_OWN && DM_OWN.hotel === S.hotel?.id ? DM_OWN.rows : []);
// the hotel's own colours (the guest app's theme)
function themeHotel() {
  const th = THEMES[(S.settings || {}).theme_guest] || THEMES.sand;
  return { bg: th.hd, bg2: th.p === th.hd ? th.a : th.p, fg: th.onhd, accent: th.a, muted: th.mut, ball: th.a, ball_fg: th.hd, font: 'serif', number: 'ball', anim: 'normal',
    wheel: [th.a, th.hd, th.mut, th.s2, th.p, th.line], logo: 'hotel' };
}
// only what a theme may say (a colour is a colour, a font one of the fonts …)
function themeClean(o) {
  const x = o && typeof o === 'object' ? o : {}, out = {};
  THEME_COLORS.forEach(k => { if (/^#[0-9a-fA-F]{6}$/.test(x[k] || '')) out[k] = x[k]; });
  if (THEME_FONTS.includes(x.font)) out.font = x.font;
  if (THEME_NUMBERS.includes(x.number)) out.number = x.number;
  if (THEME_ANIMS.includes(x.anim)) out.anim = x.anim;
  if (['hotel', 'none', 'image'].includes(x.logo)) out.logo = x.logo;
  if (typeof x.logo_url === 'string' && x.logo_url) out.logo_url = x.logo_url;
  if (typeof x.title === 'string' && x.title.trim()) out.title = x.title.trim().slice(0, 80);
  const w = (Array.isArray(x.wheel) ? x.wheel : []).filter(c => /^#[0-9a-fA-F]{6}$/.test(c));
  if (w.length >= 2) out.wheel = w;
  return out;
}
const themeBase = k => (k === 'hotel' ? themeHotel() : DISPLAY_THEMES[k] && k !== 'hotel' ? DISPLAY_THEMES[k] : null);
// a theme by its key – a built-in one, or "c" + the id of one of the hotel's own (on its built-in base); none or unknown: the screen's
// default theme (Games → Themes), then Luxury Hotel
function themeOf(key, screen) {
  const pick = k => {
    if (!k) return null;
    if (/^c\d+$/.test(k)) { const r = displayThemesOwn().find(x => 'c' + x.id === k); return r ? Object.assign({ logo: 'none' }, themeBase(r.base) || DISPLAY_THEMES.luxury, themeClean(r.settings), { key: k, name: r.name }) : null; }
    const b = themeBase(k); return b ? Object.assign({ logo: 'none' }, b, { key: k, name: t('dth_' + k) }) : null;
  };
  return pick(key) || pick((S.settings?.game_themes || {})[screen]) || pick('luxury');
}
// every theme to choose from: the built-in ones, then the hotel's own
const themeChoices = () => Object.keys(DISPLAY_THEMES).map(k => [k, t('dth_' + k)]).concat(displayThemesOwn().map(r => ['c' + r.id, r.name]));
const themeVars = th => THEME_COLORS.map(k => `--dm-${k.replace('_', '-')}:${th[k]}`).join(';');
const themeSwatch = th => `<span class="tc-sw" style="background:linear-gradient(135deg,${th.bg},${th.bg2})"><i style="background:${th.accent}"></i><i style="background:${th.fg}"></i>${(th.wheel || []).slice(0, 3).map(c => `<i style="background:${c}"></i>`).join('')}</span>`;
const themeWheel = th => th.wheel || DISPLAY_THEMES.luxury.wheel;
// the speed of a theme's animations (a wheel's spin, the arrow): seconds
const themeSpeed = th => ({ slow: 6, normal: 4.5, fast: 3 }[th.anim] || 4.5);

/* ---------- the screen: the theme around the content, the logo and the title, the one Exit button ---------- */
function displayFrame(inner, th, title) {
  const logo = th.logo === 'hotel' ? S.hotel?.logo_url : th.logo === 'image' ? th.logo_url : '';
  const name = th.title || title || '';
  return `<div class="dm" style="${esc(themeVars(th))}" data-font="${esc(th.font || 'serif')}" data-number="${esc(th.number || 'ball')}" data-anim="${esc(th.anim || 'normal')}">
    ${logo || name ? `<header class="dm-brand">${logo ? `<img src="${esc(logo)}" alt="">` : ''}${name ? `<h1>${esc(name)}</h1>` : ''}</header>` : ''}
    <div class="dm-body">${inner}</div>
    <button class="dm-exit" data-act="dm_exit">${ico('x')}<span>${esc(t('exit_display'))}</span></button></div>`;
}

/* ---------- on and off: one display at a time ---------- */
let DM = null;        // { poll, exit, page, ask } of the display on the screen
let dmTimer = null;   // its refresh
function displayOn(o) {
  displayOff(true);
  DM = Object.assign({ busy: false }, o);
  document.body.classList.add('display-mode');
  const el = document.documentElement;
  if (el.requestFullscreen && !document.fullscreenElement) el.requestFullscreen().catch(() => { /* a clean full page without the menus */ });
  if (o.poll) dmTimer = setInterval(dmTick, o.every || 3000);
  window.scrollTo(0, 0);
}
// quiet: the owner itself switches it off (nothing to tell it)
function displayOff(quiet) {
  const o = DM;
  clearInterval(dmTimer); dmTimer = null; DM = null;
  document.body.classList.remove('display-mode');
  if (document.fullscreenElement && document.exitFullscreen) document.exitFullscreen().catch(() => { /* already left */ });
  if (o && !quiet && o.exit) o.exit();
}
async function dmTick() {
  const o = DM; if (!o || o.busy || document.hidden) return;
  o.busy = true;
  try { await o.poll(); } catch { /* the next time */ } finally { o.busy = false; }
}
// the reception screen asks before it is left (a guest standing at it should not leave it by accident)
async function dmLeave() { if (DM && DM.ask && !await confirmBox(DM.ask, t('exit_display'))) return; displayOff(); }
ACT.dm_exit = () => dmLeave();
document.addEventListener('fullscreenchange', () => { if (!document.fullscreenElement && DM && !DM.ask) displayOff(); });
document.addEventListener('keydown', ev => { if (ev.key === 'Escape' && DM && !modalStack.length) dmLeave(); });
// leaving its page ends the display
document.addEventListener('aurea:page-open', () => { if (DM && DM.page && !DM.page()) displayOff(); });

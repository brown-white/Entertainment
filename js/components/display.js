'use strict';
/* Mr Hassan · components/display.js — THE display screen: a game or a vote in its OWN browser window or tab (drag it to a second monitor,
   the TV, the projector; on a phone a new tab) while the app stays open as the CONTROL SCREEN. The control screen opens it straight
   from the click (never blocked as a pop-up), the display window shows only the public screen – no header, menu, navigation, staff
   or manager tools – reads the SAME game session / vote from the database (nothing of its own), follows every change at once on
   the same computer (a message from the control screen) and every 2–3 seconds from anywhere, says "Reconnecting …" when the
   connection is gone and catches up by itself. Full screen with one click (optional). Closing it never ends the game. And its
   THEMES: Luxury Hotel, Classic, Halloween, Christmas, New Year, Summer, the hotel's own colours, and the hotel's own themes
   (Games → Themes) – background, colours, typography, logo, title, number style, wheel colours, animation. A theme is presentation
   only: it never changes a game, its numbers or its results.
   Uses: core/state · translations/languages · supabase · core/utils · icons/icons · components/modals · core/actions ·
         components/theme · core/router */
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

/* ---------- the screen: the theme around the content, the logo and the title ---------- */
function displayFrame(inner, th, title) {
  const logo = th.logo === 'hotel' ? S.hotel?.logo_url : th.logo === 'image' ? th.logo_url : '';
  const name = th.title || title || '';
  return `<div class="dm" style="${esc(themeVars(th))}" data-font="${esc(th.font || 'serif')}" data-number="${esc(th.number || 'ball')}" data-anim="${esc(th.anim || 'normal')}">
    ${logo || name ? `<header class="dm-brand">${logo ? `<img src="${esc(logo)}" alt="">` : ''}${name ? `<h1>${esc(name)}</h1>` : ''}</header>` : ''}
    <div class="dm-body">${inner}</div></div>`;
}

/* ---------- the CONTROL screen: open the display window of a game or a vote, see that it is open, close it ---------- */
// the display addresses: #/game/<id>/display, #/vote/<id>/display (the results), #/vote/<id>/reception (the guests' touch screen)
const DS_ROUTE = /^#\/(game|vote)\/\d+\/(display|reception)$/;
const dsRoute = () => ['game', 'vote'].includes(current.key) && /^\d+\/(display|reception)$/.test(current.arg || '');
const displayUrl = path => location.href.split('#')[0] + '#/' + path;
// one window per screen (its name): opening it again brings that window back. Called straight from the click – a browser opens a new
// window only from the click itself, so nothing is awaited before (the window loads the game itself). Desktop: a window of its own
// (drag it to the other monitor); phone / tablet: a new tab. Still blocked: a one-tap link opens it.
function displayOpen(path) {
  const name = 'mrh-' + path.replace(/[^a-z0-9]+/gi, '-'), wide = matchMedia('(min-width: 900px) and (pointer: fine)').matches;
  let w = null;
  try { w = window.open(displayUrl(path), name, wide ? 'popup,width=1280,height=760' : ''); } catch { w = null; }
  if (w) { try { w.focus(); } catch { /* the browser keeps it where it is */ } return; }
  modal(t('display_screen'), `<p>${esc(t('display_blocked'))}</p><p><a class="btn big wide" href="${esc(displayUrl(path))}" target="${esc(name)}" data-close>${ico('screen')} ${esc(t('display_open'))}</a></p>`, { cancel: true });
}
// the windows of this browser talk on one channel: the control screen says "changed" (the display reads the session again at once) and
// "close"; a display window says "here" (now and then) and "bye". Another device has no channel: it reads every few seconds.
const DS_CH = typeof BroadcastChannel === 'function' ? new BroadcastChannel('aurea.display') : null;
const DS_SEEN = {};   // the display windows that said they are open: screen key → when
const displayPing = (key, more) => { if (DS_CH) DS_CH.postMessage(Object.assign({ k: 'changed', key }, more)); };
const dsOpenNow = key => Date.now() - (DS_SEEN[key] || 0) < 12000;
// the control screen's display buttons: Open display screen (again), whether it is open, Close display screen
function displayLink(key, path) {
  const on = dsOpenNow(key);
  return `<span class="ds-link" data-ds="${esc(key)}" data-path="${esc(path)}">${on ? `<span class="chip ok">${ico('screen')} ${esc(t('display_is_open'))}</span>` : ''}
    <button class="btn ghost" data-act="ds_open" data-path="${esc(path)}">${ico('screen')} ${esc(t('display_open'))}</button>
    ${on ? `<button class="btn ghost" data-act="ds_shut" data-key="${esc(key)}">${ico('x')} ${esc(t('display_close'))}</button>` : ''}</span>`;
}
const dsLinks = key => $$(`.ds-link[data-ds="${CSS.escape(key)}"]`).forEach(el => { el.outerHTML = displayLink(key, el.dataset.path); });
ACT.ds_open = el => displayOpen(el.dataset.path);
ACT.ds_shut = el => { const key = el.dataset.key; if (DS_CH) DS_CH.postMessage({ k: 'close', key }); delete DS_SEEN[key]; dsLinks(key); };
// a control screen drawn: which of its display windows are open?
const displayAsk = key => { if (DS_CH) DS_CH.postMessage({ k: 'who', key }); };

/* ---------- the DISPLAY window: the public screen only, the same session, live; Full screen; Reconnecting … ---------- */
let DSW = null;       // the screen of this display window: { key, back, pull, every, ask, busy, again }
let dsTimer = null;   // its reading of the database (and its "here")
let dsIdle = null;    // the buttons hide when nobody moves the mouse or touches the screen
// the frame: the screen (#ds), "Reconnecting …" over the last picture, Full screen and Close (shown while the mouse moves)
function displayShell(inner, wait) {
  return `<div id="ds" class="ds">${inner}</div>
    <div id="ds-wait" class="ds-wait" role="status" hidden><span class="ds-dots" aria-hidden="true"><i></i><i></i><i></i></span><b>${esc(wait || t('display_reconnecting'))}</b></div>
    <div class="ds-bar" role="toolbar" aria-label="${esc(t('display_screen'))}">${document.fullscreenEnabled ? `<button class="ds-btn" id="ds-full" data-act="ds_full"></button>` : ''}
      <button class="ds-btn" data-act="ds_close" title="${esc(t('display_close'))}">${ico('x')}<span>${esc(t('display_close'))}</span></button></div>`;
}
// o: { key ("game:12"), back (the control page), pull (reads the database and draws what changed – throws when it cannot), every (ms),
// ask (before closing), touch (the guests use it: the reception screen) }
function displayStart(o) {
  displayStop();
  DSW = Object.assign({ busy: false, again: false }, o);
  document.body.classList.add('display-mode'); document.body.classList.toggle('ds-touch', !!o.touch);
  dsTimer = setInterval(dsTick, o.every || 5000);
  dsSay('here'); dsWake(); dsFullMark();
  if (o.pull) dsPull();
}
function displayStop() { clearInterval(dsTimer); dsTimer = null; if (DSW) dsSay('bye'); DSW = null; document.body.classList.remove('ds-touch', 'ds-down', 'ds-idle', 'ds-full'); }
const dsSay = k => { if (DS_CH && DSW) DS_CH.postMessage({ k, key: DSW.key }); };
function dsTick() { if (!DSW || document.hidden) return; dsSay('here'); dsPull(); }
// one reading at a time (a change announced meanwhile: read once more after it); the connection gone: "Reconnecting …", never a
// technical message – the next reading brings the screen back by itself. A game or vote that no longer exists: said once, plainly.
async function dsPull() {
  const o = DSW; if (!o || !o.pull) return;
  if (o.busy) { o.again = true; return; }
  o.busy = true;
  try { await o.pull(); dsDown(false); } catch (e) {
    if (['offline', 'server', 'not_installed'].includes(e?.code) || !e?.code) dsDown(true);
    else if (DSW === o) { dsDown(false); clearInterval(dsTimer); dsTimer = setInterval(dsTick, 30000); $('#ds').innerHTML = displayFrame(`<p class="dm-gone">${esc(t('display_gone'))}</p>`, themeOf(null, 'votes'), ''); }
  } finally { o.busy = false; if (o.again && DSW === o) { o.again = false; dsPull(); } }
}
const dsDown = on => { const w = $('#ds-wait'); if (w) w.hidden = !on; document.body.classList.toggle('ds-down', !!on); };
function dsWake() { document.body.classList.remove('ds-idle'); clearTimeout(dsIdle); dsIdle = setTimeout(() => { if (DSW) document.body.classList.add('ds-idle'); }, 3500); }
function dsFullMark() {
  const b = $('#ds-full'), on = !!document.fullscreenElement; document.body.classList.toggle('ds-full', on);
  if (b) { b.innerHTML = `${ico(on ? 'shrink' : 'expand')}<span>${esc(t(on ? 'fullscreen_exit' : 'fullscreen_enter'))}</span>`; b.title = t(on ? 'fullscreen_exit' : 'fullscreen_enter'); }
}
ACT.ds_full = () => {
  const r = document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen();
  if (r && r.catch) r.catch(() => { /* the browser said no: the screen stays as it is, without the app */ });
};
// Close: the window closes (it was opened by the app); opened by hand, it goes back to the control page. The game goes on.
ACT.ds_close = async () => {
  const o = DSW; if (!o) return;
  if (o.ask && !await confirmBox(o.ask, t('display_close'))) return;
  displayStop(); window.close();
  setTimeout(() => { if (!window.closed) location.hash = '#/' + (o.back || ''); }, 250);
};
if (DS_CH) DS_CH.onmessage = ev => {
  const m = ev.data || {}, mine = DSW && m.key === DSW.key;
  if (m.k === 'changed' && mine) { if (m.next) location.hash = '#/' + m.next; else dsPull(); }
  else if (m.k === 'close' && mine) { displayStop(); window.close(); }
  else if (m.k === 'who' && mine) dsSay('here');
  else if (m.k === 'here' && !DSW) { const was = dsOpenNow(m.key); DS_SEEN[m.key] = Date.now(); if (!was) dsLinks(m.key); }
  else if (m.k === 'bye' && !DSW) { delete DS_SEEN[m.key]; dsLinks(m.key); }
};
// the display address shows no app from the first moment; leaving it (another page in that window) gives the app back
if (DS_ROUTE.test(location.hash)) document.body.classList.add('display-mode');
document.addEventListener('aurea:page-open', () => { const on = dsRoute(); document.body.classList.toggle('display-mode', on); if (!on && DSW) displayStop(); });
document.addEventListener('fullscreenchange', dsFullMark);
['pointermove', 'pointerdown', 'keydown'].forEach(k => document.addEventListener(k, () => { if (DSW) dsWake(); }, { passive: true }));
window.addEventListener('online', () => dsPull());
document.addEventListener('visibilitychange', () => { if (!document.hidden) dsPull(); });
window.addEventListener('pagehide', () => dsSay('bye'));

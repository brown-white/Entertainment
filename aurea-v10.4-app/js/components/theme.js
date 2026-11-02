'use strict';
/* AUREA · components/theme.js — ONE theme system: 4 themes (exact colours) per hotel, the same status colours everywhere.
   Uses: core/state · translations/languages */
/* ---------- ONE theme system: 4 themes (exact colours), the same status colours everywhere ---------- */
const THEMES = {
  sand:     { bg: '#F7F4EF', s: '#FFFFFF', s2: '#F2EEE7', tx: '#1F2A2A', mut: '#7B7B75', a: '#C6A15B', line: '#E8E3DA', p: '#1F2A2A', onp: '#FFFFFF', hd: '#1F2A2A', onhd: '#F7F4EF', nav: '#C6A15B' },
  ivory:    { bg: '#FAF9F6', s: '#FFFFFF', s2: '#F3F2EE', tx: '#151515', mut: '#8A8A8A', a: '#B89A64', line: '#E7E5E0', p: '#151515', onp: '#FFFFFF', hd: '#151515', onhd: '#FAF9F6', nav: '#151515' },
  midnight: { bg: '#101417', s: '#181D21', s2: '#20262B', tx: '#F5F5F3', mut: '#949BA1', a: '#C9A96E', line: '#2C3238', p: '#C9A96E', onp: '#101417', hd: '#181D21', onhd: '#F5F5F3', nav: '#C9A96E', dark: true },
  coastal:  { bg: '#F5F7F6', s: '#FFFFFF', s2: '#EEF2F1', tx: '#16383B', mut: '#788382', a: '#B99B6B', line: '#E7E5E0', p: '#16383B', onp: '#FFFFFF', hd: '#16383B', onhd: '#F5F7F6', nav: '#16383B' }
};
const THEME_KEYS = Object.keys(THEMES);
/* which theme applies: a staff member's own choice, else the hotel's theme for managers / employees / guests */
function themeKey(st = {}) {
  if (S.mode === 'staff') { const me = S.preview ? S.preview.me : S.me; return (!S.preview && me?.theme) || (me?.is_manager ? st.theme_manager : st.theme_staff) || 'sand'; }
  return st.theme_guest || st.theme || 'sand';
}
function applyTheme(st = {}) {
  const k = THEMES[themeKey(st)] ? themeKey(st) : 'sand', th = THEMES[k], r = document.documentElement.style;
  [['--bg', th.bg], ['--s', th.s], ['--s2', th.s2], ['--tx', th.tx], ['--mut', th.mut], ['--a', th.a], ['--line', th.line], ['--p', th.p], ['--on-p', th.onp], ['--hd', th.hd], ['--on-hd', th.onhd], ['--nav', th.nav]]
    .forEach(([v, x]) => r.setProperty(v, x));
  document.documentElement.dataset.theme = k; document.documentElement.dataset.dark = th.dark ? '1' : '';
  document.querySelector('meta[name=theme-color]')?.setAttribute('content', th.hd);
  document.documentElement.dataset.font = st.font_style || 'elegant';
  document.documentElement.dataset.btn = st.button_style || 'rounded';
  document.documentElement.lang = S.lang; document.documentElement.dir = isRtl() ? 'rtl' : 'ltr';
  document.title = (st.app_name || 'AUREA') + (S.hotel?.name ? ' · ' + S.hotel.name : '');
}

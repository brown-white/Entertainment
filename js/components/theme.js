'use strict';
/* Mr Hassan · components/theme.js — THE Theme Engine. A theme is colours only: it writes the design tokens of css/main.css (one token set for
   every page, component, chart and dialog). Three separate layers:
     App theme     — Executive Light (default), Midnight Professional, Luxury Hotel, Sand & Bronze, Ocean, Custom Brand (the hotel's brand
                     colours) and the hotel's own themes (Settings → Themes); one for the manager app, the staff app and the guest app;
                     a staff member may choose their own; light / dark / system mode; heading face and corner style.
     Hotel brand   — the hotel's logo (light and dark), app mark, brand colours and header: used by Custom Brand and the displays.
     Display theme — the game and vote screens (components/display.js): never the app theme, never a manager page.
   Uses: core/state · translations/languages */
/* ---------- the themes: each a light and a dark palette (Midnight Professional is dark only) ----------
   a palette: brand (primary, secondary, accent), surfaces (bg, surface, nav), text (text, muted), border, status colours */
const THEMES = {
  executive: { font: 'modern',
    light: { primary: '#0F5C56', secondary: '#142027', accent: '#B5893B', bg: '#F2F4F3', surface: '#FFFFFF', nav: '#142027', text: '#15212B', muted: '#66727D', border: '#E1E5E4',
      success: '#23784A', warning: '#A86400', danger: '#C23B2B', info: '#2160A8', special: '#7354A8' },
    dark: { primary: '#4DB3A6', secondary: '#DCE5E3', accent: '#D6A653', bg: '#0D1316', surface: '#141C21', nav: '#0A0F12', text: '#E5ECEE', muted: '#8C9AA4', border: '#26323A',
      success: '#4CB37A', warning: '#E3A23C', danger: '#F0705C', info: '#62A2EA', special: '#A98BE0' } },
  midnight: { font: 'modern', only: 'dark',
    dark: { primary: '#7EA6F8', secondary: '#D5DEEC', accent: '#D9B36C', bg: '#0B0F15', surface: '#121822', nav: '#080B10', text: '#E7ECF4', muted: '#8A96A8', border: '#232D3A',
      success: '#4FB07E', warning: '#E2A53F', danger: '#EF6F5E', info: '#6FA6F0', special: '#AE90E6' } },
  luxury: { font: 'elegant',
    light: { primary: '#1C1915', secondary: '#1C1915', accent: '#A9864A', bg: '#F8F6F1', surface: '#FFFFFF', nav: '#1C1915', text: '#1C1915', muted: '#7A7166', border: '#E7E1D6',
      success: '#3E7550', warning: '#A26A12', danger: '#A8413A', info: '#3A6593', special: '#7A5A9E' },
    dark: { primary: '#D4B577', secondary: '#EFE8DC', accent: '#D4B577', bg: '#11100E', surface: '#1A1815', nav: '#0B0A08', text: '#F0EAE0', muted: '#A0968A', border: '#2F2A24',
      success: '#6DB383', warning: '#E0A548', danger: '#EA7A6C', info: '#7FA7DA', special: '#B79BD8' } },
  sand: { font: 'elegant',
    light: { primary: '#1F2A2A', secondary: '#1F2A2A', accent: '#B38945', bg: '#F6F2EB', surface: '#FFFFFF', nav: '#1F2A2A', text: '#1F2A2A', muted: '#77776F', border: '#E7E0D4',
      success: '#4F7058', warning: '#A8772F', danger: '#A65151', info: '#3D6C9E', special: '#7B62A6' },
    dark: { primary: '#CDA866', secondary: '#ECE5D8', accent: '#CDA866', bg: '#12110E', surface: '#1B1915', nav: '#0D0C0A', text: '#EEE8DD', muted: '#A39B8E', border: '#302C25',
      success: '#7CB08A', warning: '#DDA65A', danger: '#E5807A', info: '#7EA6D3', special: '#B39BD9' } },
  ocean: { font: 'modern',
    light: { primary: '#0E6474', secondary: '#0C3440', accent: '#C8924A', bg: '#F0F5F6', surface: '#FFFFFF', nav: '#0C3440', text: '#12303A', muted: '#637C85', border: '#D9E4E7',
      success: '#23785A', warning: '#A86A0A', danger: '#C0432F', info: '#1F64A6', special: '#6B57A6' },
    dark: { primary: '#4CB8C9', secondary: '#D4E6EA', accent: '#D9A65E', bg: '#091417', surface: '#0F1E23', nav: '#061013', text: '#E2EEF1', muted: '#86A0A8', border: '#1F333A',
      success: '#4CB487', warning: '#E2A447', danger: '#EE7462', info: '#64A6E8', special: '#A28FE0' } },
  // Custom Brand: Executive Light in the hotel's own brand colours (Settings → Themes → Branding); without them it is Executive Light
  brand: { base: 'executive' }
};
const THEME_KEYS = Object.keys(THEMES);
// what a hotel's own theme may set (Settings → Themes → Theme editor)
const THEME_EDIT = ['primary', 'secondary', 'accent', 'bg', 'surface', 'text', 'muted', 'border', 'success', 'warning', 'danger'];
const UI_MODES = ['light', 'dark', 'system'];
const DENSITIES = ['comfortable', 'compact', 'dense'];
const isHex = c => /^#[0-9a-fA-F]{6}$/.test(c || '');

/* ---------- colour arithmetic (only for the text on a colour and a colour lifted for the dark mode) ---------- */
const hexRgb = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
const lum = h => { const [r, g, b] = hexRgb(h).map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const contrast = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
const mixHex = (a, b, w) => '#' + hexRgb(a).map((v, i) => Math.round(v * w + hexRgb(b)[i] * (1 - w)).toString(16).padStart(2, '0')).join('');
// the readable text on a colour: white or the darkest ink
const onColor = c => (contrast(c, '#FFFFFF') >= contrast(c, '#101418') ? '#FFFFFF' : '#101418');
// a brand colour on a dark surface: lifted until it reads
const liftOn = (c, bg) => { let x = c; for (let i = 0; i < 6 && contrast(x, bg) < 3.2; i++) x = mixHex(x, '#FFFFFF', 0.78); return x; };

/* ---------- which theme, which mode ---------- */
// the scope of this screen: the manager app, the staff app or the guest app
const themeScope = () => (S.mode !== 'staff' ? 'guest' : (S.preview ? S.preview.me : S.me)?.is_manager ? 'manager' : 'staff');
const myPrefs = () => (S.mode === 'staff' && !S.preview && S.me?.ui_prefs && typeof S.me.ui_prefs === 'object' ? S.me.ui_prefs : {});
const ownThemes = (st = S.settings || {}) => (Array.isArray(st.app_themes) ? st.app_themes.filter(x => x && /^u\d{1,4}$/.test(x.key) && THEMES[x.base] && !THEMES[x.base].base) : []);
const themeExists = (k, st) => !!THEMES[k] || ownThemes(st).some(x => x.key === k);
// the theme of this screen: a staff member's own choice, else the hotel's theme for managers / employees / guests
function themeKey(st = {}) {
  const sc = themeScope(), me = S.mode === 'staff' ? (S.preview ? S.preview.me : S.me) : null;
  const k = (me && !S.preview && me.theme) || st['theme_' + sc] || 'executive';
  return themeExists(k, st) ? k : 'executive';
}
function themeMode(st = {}, key = themeKey(st)) {
  const def = THEMES[key] && THEMES[key].only;
  if (def) return def;
  const own = ownThemes(st).find(x => x.key === key); if (own && THEMES[own.base].only) return THEMES[own.base].only;
  const m = myPrefs().mode || st['mode_' + themeScope()] || 'light';
  return m === 'system' ? (window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : (m === 'dark' ? 'dark' : 'light');
}
// a theme's palette in a mode: built in, the hotel's brand colours (Custom Brand) or one of the hotel's own (on its built-in base)
function themePalette(key, mode, st = {}) {
  const own = ownThemes(st).find(x => x.key === key);
  const baseKey = own ? own.base : THEMES[key]?.base || (THEMES[key] ? key : 'executive');
  const base = THEMES[baseKey], p = Object.assign({}, base[mode] || base.dark || base.light);
  const over = own ? (own.colors || {}) : key === 'brand' ? { primary: st.brand_primary, secondary: st.brand_secondary, accent: st.brand_accent } : {};
  const set = THEME_EDIT.filter(k => isHex(over[k]));
  if (mode === 'light' || !base.light) set.forEach(k => { p[k] = over[k]; });
  else ['primary', 'accent', 'success', 'warning', 'danger'].filter(k => set.includes(k)).forEach(k => { p[k] = liftOn(over[k], p.surface); });   // dark: the brand colours, lifted; the dark surfaces stay
  if (set.includes('secondary') && mode === 'light') p.nav = over.secondary;
  return p;
}
/* the tokens of a palette (css/main.css): the derived ones (header, input, fills, borders, text on colours) follow from the palette */
function themeTokens(p, mode) {
  const dark = mode === 'dark', navDark = lum(p.nav) < 0.25;
  return {
    '--primary': p.primary, '--on-primary': onColor(p.primary), '--secondary': p.secondary, '--on-secondary': onColor(p.secondary), '--accent': p.accent, '--on-accent': onColor(p.accent),
    '--bg-app': p.bg, '--bg-nav': p.nav, '--on-nav': navDark ? mixHex('#FFFFFF', p.nav, 0.88) : p.text, '--bg-header': p.surface, '--on-header': p.text,
    '--bg-surface': p.surface, '--bg-elevated': dark ? mixHex('#FFFFFF', p.surface, 0.04) : p.surface, '--bg-input': dark ? mixHex(p.bg, p.surface, 0.5) : p.surface,
    '--bg-muted': mixHex(p.text, p.surface, dark ? 0.06 : 0.035),
    '--text': p.text, '--text-2': mixHex(p.text, p.muted, 0.55), '--text-muted': p.muted, '--text-inverse': dark ? '#101418' : '#FFFFFF',
    '--border': p.border, '--border-subtle': mixHex(p.border, p.surface, 0.6), '--border-strong': mixHex(p.text, p.border, dark ? 0.16 : 0.14),
    '--success': p.success, '--warning': p.warning, '--danger': p.danger, '--info': p.info || THEMES.executive[mode === 'dark' ? 'dark' : 'light'].info,
    '--special': p.special || THEMES.executive[mode === 'dark' ? 'dark' : 'light'].special, '--show': dark ? '#D77FA3' : '#9A3C63', '--shadow-ink': dark ? '#000000' : '#101828', 'color-scheme': mode
  };
}
const themeCss = (sel, tk) => `${sel}{${Object.entries(tk).map(([k, v]) => `${k}:${v}`).join(';')}}`;
// the heading face: the hotel's choice, or the theme's own
const themeFont = (st, key) => (['elegant', 'modern', 'classic'].includes(st.font_style) ? st.font_style : THEMES[ownThemes(st).find(x => x.key === key)?.base || THEMES[key]?.base || key]?.font || 'modern');

/* ---------- apply: the tokens, the mode, the face, the corners, the density, the logo, the app mark ---------- */
let themeNow = null;
function applyTheme(st = {}) {
  const key = themeKey(st), mode = themeMode(st, key), p = themePalette(key, mode, st), el = document.documentElement;
  let tag = document.getElementById('theme-tokens');
  if (!tag) { tag = document.createElement('style'); tag.id = 'theme-tokens'; document.head.appendChild(tag); }
  const css = themeCss(':root', themeTokens(p, mode));
  if (tag.textContent !== css) {
    // a change of hotel or theme: the colours change softly, never a flash
    if (themeNow && themeNow !== css && !matchMedia('(prefers-reduced-motion: reduce)').matches) { el.classList.add('theme-fade'); setTimeout(() => el.classList.remove('theme-fade'), 400); }
    tag.textContent = css;
  }
  themeNow = css;
  Object.assign(el.dataset, { theme: key, mode, font: themeFont(st, key), btn: st.button_style || 'rounded', density: DENSITIES.includes(myPrefs().density) ? myPrefs().density : 'comfortable' });
  document.querySelector('meta[name=theme-color]')?.setAttribute('content', p.surface);
  // the app mark (browser tab, home screen): the hotel's own, else its logo, else the app's
  const mark = st.app_mark_url || (S.mode === 'staff' ? S.hotel?.logo_url : S.g?.home?.hotel?.logo_url) || 'assets/icons/icon-192.png';
  let ic = document.querySelector('link[rel=icon]'); if (!ic) { ic = document.createElement('link'); ic.rel = 'icon'; document.head.appendChild(ic); }
  if (ic.getAttribute('href') !== mark) ic.setAttribute('href', mark);
  el.lang = S.lang; el.dir = isRtl() ? 'rtl' : 'ltr';
  document.title = (st.app_name || 'Mr Hassan') + (S.hotel?.name && S.mode === 'staff' ? ' · ' + S.hotel.name : '');
}
// the hotel's logo for this screen: the dark-mode logo on dark, the display logo on a display
function themeLogo(st = {}, where) {
  const light = S.mode === 'staff' ? S.hotel?.logo_url : S.g?.home?.hotel?.logo_url;
  if (where === 'display') return st.display_logo_url || (document.documentElement.dataset.mode === 'dark' && st.logo_dark_url) || light || '';
  return (document.documentElement.dataset.mode === 'dark' && st.logo_dark_url) || light || '';
}
// the hotel's brand colours for the displays ("Hotel brand" display theme): its brand colours, else its guest theme's
function themeBrand(st = {}) {
  const p = themePalette(st.theme_guest && themeExists(st.theme_guest, st) ? st.theme_guest : 'executive', 'light', st);
  return { primary: isHex(st.brand_primary) ? st.brand_primary : p.primary, secondary: isHex(st.brand_secondary) ? st.brand_secondary : p.nav,
    accent: isHex(st.brand_accent) ? st.brand_accent : p.accent, muted: p.muted, surface: p.surface, border: p.border };
}
// every theme to choose from (built in, then the hotel's own); swatch colours for the theme cards
const themeChoicesApp = (st = S.settings || {}) => THEME_KEYS.map(k => [k, t('theme_' + k)]).concat(ownThemes(st).map(x => [x.key, x.name]));
function themeSwatchApp(key, st = S.settings || {}) {
  const p = themePalette(key, THEMES[key]?.only || 'light', st);
  return `<span class="tc-sw" style="background:${p.bg}"><i style="background:${p.nav}"></i><i style="background:${p.surface}"></i><i style="background:${p.primary}"></i><i style="background:${p.accent}"></i></span>`;
}
// the system's light / dark changes while the app is open: the "System" mode follows at once
window.matchMedia && matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', () => {
  const st = S.mode === 'staff' ? S.settings : (S.g?.home?.settings || {});
  if (st && (myPrefs().mode || st['mode_' + themeScope()]) === 'system') applyTheme(st);
});

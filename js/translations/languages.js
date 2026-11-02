'use strict';
/* AUREA · translations/languages.js — the languages: the list, t() = the text in the reader's language, locale and right-to-left.
   Uses: core/state */
/* ---------- language ---------- */
const LANGS = [
  ['en', 'English', 'en-GB'], ['de', 'Deutsch', 'de-DE'], ['ru', 'Русский', 'ru-RU'], ['pl', 'Polski', 'pl-PL'],
  ['cs', 'Čeština', 'cs-CZ'], ['nl', 'Nederlands', 'nl-NL'], ['fr', 'Français', 'fr-FR'], ['ar', 'العربية', 'ar-EG'],
  ['it', 'Italiano', 'it-IT'], ['ro', 'Română', 'ro-RO'], ['tr', 'Türkçe', 'tr-TR'], ['sk', 'Slovenčina', 'sk-SK'],
  ['sr', 'Srpski', 'sr-Latn-RS'], ['uk', 'Українська', 'uk-UA'], ['zh', '中文', 'zh-CN'], ['hi', 'हिन्दी', 'hi-IN'],
  ['ar-tn', 'العربية · تونس', 'ar-TN'], ['ar-dz', 'العربية · الجزائر', 'ar-DZ']
];
const TR_COLS = ['en', 'de', 'ru', 'pl', 'cs', 'nl', 'fr', 'ar', 'it', 'ro', 'tr', 'sk', 'sr', 'uk', 'zh', 'hi'];
const TR = {};
(function parseTr() {
  for (const line of (window.I18N_RAW || '').split('\n')) {
    if (!line.trim() || line.startsWith('#')) continue;
    const p = line.split('|');
    TR[p[0].trim()] = p.slice(1).map(x => x.trim());
  }
})();
const trCol = l => Math.max(0, TR_COLS.indexOf(l.startsWith('ar') ? 'ar' : l)) ;
function t(key, vars) {
  const row = TR[key];
  let s = row ? (row[trCol(S.lang)] || row[0]) : key;
  if (vars) for (const k in vars) s = s.split('{' + k + '}').join(vars[k]);
  return s;
}
const tx = (obj, base) => (obj && typeof obj === 'object' && (obj[S.lang] || obj[S.lang.split('-')[0]])) || base || '';
const locale = () => (LANGS.find(l => l[0] === S.lang) || LANGS[0])[2];
const isRtl = () => S.lang.startsWith('ar');
if (!LANGS.some(l => l[0] === S.lang)) S.lang = 'en';

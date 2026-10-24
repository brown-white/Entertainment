'use strict';
/* AUREA · core/utils.js — small shared helpers: DOM, text, numbers, money, the hotel's dates and times (D), countries and phone links, scripts on demand.
   Uses: core/state · translations/languages · supabase */
/* ---------- tiny helpers ---------- */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const attr = o => Object.entries(o).filter(([, v]) => v != null && v !== false).map(([k, v]) => v === true ? k : `${k}="${esc(v)}"`).join(' ');
const nl2br = s => esc(s).replace(/\n/g, '<br>');
const sum = (arr, f) => arr.reduce((a, x) => a + (Number(f(x)) || 0), 0);
const uniq = a => [...new Set(a)];
const money = (n, cur) => { try { return new Intl.NumberFormat(locale(), { style: 'currency', currency: cur || S.hotel?.currency || 'EUR', currencyDisplay: 'narrowSymbol' }).format(Number(n) || 0); } catch { return (Number(n) || 0).toFixed(2) + ' ' + (cur || ''); } };

/* ---------- dates (always as 'YYYY-MM-DD' strings, the hotel's own date) ---------- */
const D = {
  add(d, n) { const x = new Date(d + 'T00:00:00Z'); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); },
  wd(d) { return (new Date(d + 'T00:00:00Z').getUTCDay() + 6) % 7; },          // 0 = Monday
  diff(a, b) { return Math.round((new Date(b + 'T00:00:00Z') - new Date(a + 'T00:00:00Z')) / 864e5); },
  fmt(d, o) { if (!d) return ''; try { return new Intl.DateTimeFormat(locale(), Object.assign({ timeZone: 'UTC' }, o)).format(new Date(String(d).slice(0, 10) + 'T00:00:00Z')); } catch { return d; } },
  long(d) { return D.fmt(d, { weekday: 'long', day: 'numeric', month: 'long' }); },
  short(d) { return D.fmt(d, { weekday: 'short', day: 'numeric', month: 'short' }); },
  dm(d) { return D.fmt(d, { day: 'numeric', month: 'short' }); },
  wdName(i, len = 'long') { return D.fmt(D.add('2024-01-01', i), { weekday: len }); },     // 2024-01-01 was a Monday
  /* a weekday in two letters where that is safe (Latin, Cyrillic, Greek); other scripts use their own one-letter form (cutting Arabic gives "ال" every day) */
  wdShort(i) { const n = D.wdName(i, 'short').replace(/\.$/, ''); return /^[\p{Script=Latin}\p{Script=Cyrillic}\p{Script=Greek}]+$/u.test(n) ? n.slice(0, 2) : D.wdName(i, 'narrow'); },   // Arabic خ ج, Chinese 四 五 …
  range(a, n) { return Array.from({ length: n }, (_, i) => D.add(a, i)); },
  month(d) { return String(d).slice(0, 7); },
  mon(ym) { return D.fmt(String(ym).slice(0, 7) + '-01', { month: 'long', year: 'numeric' }); },          // "October 2026" (a document's month)
  span(a, b) { return a === b ? D.fmt(a, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })                  // "12 October – 18 October 2026"
    : D.fmt(a, { day: 'numeric', month: 'long', ...(a.slice(0, 4) !== b.slice(0, 4) && { year: 'numeric' }) }) + ' – ' + D.fmt(b, { day: 'numeric', month: 'long', year: 'numeric' }); },
  stamp(ts) { if (!ts) return ''; try { return new Intl.DateTimeFormat(locale(), { dateStyle: 'medium', timeStyle: 'short', timeZone: hotelTz() }).format(new Date(ts)); } catch { return ts; } },
  today() { try { return new Intl.DateTimeFormat('en-CA', { timeZone: hotelTz(), year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()); } catch { return S.today || new Date().toISOString().slice(0, 10); } }
};
const hm = s => (s || '').slice(0, 5);
/* the hotel's time zone (signed-in staff or the guest's hotel) – every "now" and "today" uses it */
const hotelTz = () => S.hotel?.timezone || S.g?.home?.hotel?.timezone || undefined;
const hotelDate = ts => { try { return new Intl.DateTimeFormat('en-CA', { timeZone: hotelTz(), year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ts)); } catch { return String(ts).slice(0, 10); } };
/* the ONE "now" of the hotel (never the phone's own time zone) */
function hotelNowMin() {
  try { const p = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: hotelTz() }).format(new Date()).split(':'); return (+p[0]) * 60 + (+p[1]); }
  catch { const n = new Date(); return n.getHours() * 60 + n.getMinutes(); }
}
const mins = s => { if (!s) return null; const [h, m] = s.split(':').map(Number); return h * 60 + (m || 0); };
// when an item ends that day, in minutes (no end = one hour; an end over midnight = the end of the day – the planner's rule too)
const endMin = it => { const s = mins(it.start_time); const e = it.end_time ? mins(it.end_time) : s + 60; return e <= s ? 1440 : e; };
const libs = {};
function loadScript(src) {
  return libs[src] || (libs[src] = new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => { delete libs[src]; rej(new ApiError('offline')); }; document.head.appendChild(s); }));
}

/* ---------- countries: ONE list for nationality + phone code (names come from the phone's own language) ---------- */
const COUNTRIES = 'AF93 AL355 DZ213 AD376 AO244 AR54 AM374 AU61 AT43 AZ994 BH973 BD880 BY375 BE32 BJ229 BO591 BA387 BW267 BR55 BG359 BF226 KH855 CM237 CA1 CL56 CN86 CO57 CR506 HR385 CU53 CY357 CZ420 DK45 DO1 EC593 EG20 SV503 EE372 ET251 FI358 FR33 GE995 DE49 GH233 GR30 GT502 HN504 HK852 HU36 IS354 IN91 ID62 IR98 IQ964 IE353 IL972 IT39 CI225 JM1 JP81 JO962 KZ7 KE254 KW965 KG996 LV371 LB961 LY218 LI423 LT370 LU352 MK389 MG261 MY60 MV960 ML223 MT356 MU230 MX52 MD373 MC377 MN976 ME382 MA212 MZ258 NA264 NP977 NL31 NZ64 NI505 NE227 NG234 NO47 OM968 PK92 PS970 PA507 PY595 PE51 PH63 PL48 PT351 QA974 RO40 RU7 RW250 SA966 SN221 RS381 SC248 SG65 SK421 SI386 ZA27 KR82 ES34 LK94 SD249 SE46 CH41 SY963 TW886 TJ992 TZ255 TH66 TN216 TR90 TM993 UG256 UA380 AE971 GB44 US1 UY598 UZ998 VE58 VN84 YE967 ZM260 ZW263'
  .split(' ').map(x => ({ code: x.slice(0, 2), dial: x.slice(2) }));
let regionNames = null, regionLang = null;
function countryName(v) {
  if (!v) return '';
  if (!/^[A-Z]{2}$/.test(v)) return v;
  try { if (regionLang !== S.lang) { regionNames = new Intl.DisplayNames([locale()], { type: 'region' }); regionLang = S.lang; } return regionNames.of(v) || v; } catch { return v; }
}
function countryCode(text) {
  const x = String(text || '').trim(); if (!x) return '';
  if (/^[A-Za-z]{2}$/.test(x) && COUNTRIES.some(c => c.code === x.toUpperCase())) return x.toUpperCase();
  const low = x.toLowerCase();
  const hit = COUNTRIES.find(c => countryName(c.code).toLowerCase() === low || (() => { try { return new Intl.DisplayNames(['en'], { type: 'region' }).of(c.code).toLowerCase() === low; } catch { return false; } })());
  return hit ? hit.code : x;
}
const countryOpts = () => COUNTRIES.map(c => [c.code, countryName(c.code)]).sort((a, b) => a[1].localeCompare(b[1], locale()));
/* ONE WhatsApp link for every phone number (Fast Action contacts, team, staff search, the hotel's own number for guests).
   WhatsApp needs the full international number as digits only: no "+", "00", spaces, or the national "0" typed after the
   country code (Italy keeps it: it belongs to the number). A number written without a country code is a number of the
   hotel's own country (the code of the hotel's WhatsApp / phone number in Settings). If no international number can be
   made, there is no WhatsApp button instead of a broken link (the call button stays). */
const dialOf = d => COUNTRIES.filter(c => d.startsWith(c.dial)).sort((a, b) => b.dial.length - a.dial.length)[0];
function waNumber(phone, own) {
  const raw = String(phone || '').trim(); let d = raw.replace(/\D/g, '');
  if (!d) return '';
  const intl = /^\(?\s*(\+|00)/.test(raw);            // "+20 …", "0020 …", "(+20) …"
  if (intl) d = d.replace(/^00/, '');
  else {
    if (own === undefined) { const st = (S.mode === 'staff' ? S.settings : S.g.home?.settings) || {}; own = waNumber(st.whatsapp, '') || waNumber(st.phone, ''); }
    const oc = own && dialOf(own); if (!oc) return '';
    d = oc.dial + (oc.dial === '39' ? d : d.replace(/^0+/, ''));
  }
  const c = dialOf(d); if (c && c.dial !== '39') d = c.dial + d.slice(c.dial.length).replace(/^0+/, '');
  // (a country code missing from the list still works when the number was written internationally)
  return (c || intl) && d.length >= 8 && d.length <= 15 ? d : '';
}
const waUrl = phone => { const n = waNumber(phone); return n ? 'https://wa.me/' + n : ''; };
const safe = p => p.catch(() => null);
const monday = d => D.add(d, -D.wd(d));

/* ---------- Attendance: ONE page on the day status + clock times (payroll uses the same count) ---------- */
const monthEnd = m => D.add(D.add(m + '-01', 32).slice(0, 7) + '-01', -1);

'use strict';
/* AUREA · systems/ticket-system.js — tickets: statuses, batch names, prices and offers, the templates of each ticket type (every game its own
   design: tombola, disco, bingo, custom), THE drawing engine, the bingo cards (never twice), THE print path, and a guest's tickets.
   Uses: core/state · translations/languages · core/utils · core/permissions · components/cards · systems/exports */
function ticketList(rows) {
  return `<div class="tickets">${rows.map(x => `<div class="tk ${x.status}"><b>${esc(x.code || String(x.number).padStart(x.digits || 1, '0'))}</b>
    <span>${esc(x.type)}${x.item ? ' · ' + esc(tx(x.item_i18n, x.item)) : ''}${x.date ? ' · ' + esc(D.short(x.date)) : ''}${x.start_time ? ' ' + esc(hm(x.start_time)) : ''}<br><small>${x.staff ? esc(t('from_staff', { name: x.staff })) + ' · ' : ''}${esc(money(x.price))}</small></span>
    ${chip(t('tks_' + x.status), x.status === 'sold' ? 'ok' : 'warn')}${x.status === 'reserved' ? `<small class="muted tk-pay">${esc(t('pay_at_team'))}</small><button class="btn ghost small" data-act="g_tk_cancel" data-id="${x.id}">${esc(t('cancel'))}</button>` : ''}</div>`).join('')}</div>`;
}

/* ---------- Tickets: ONE inventory (batches → every single ticket), sellers, ticket types, prizes ---------- */
const TK_ST = ['available', 'assigned', 'reserved', 'sold', 'void'];
const tkSt = s => t('tks_' + s);
const TK_CLS = { sold: 'ok', reserved: 'warn', void: 'bad' };
// numbers as short ranges: 1–4, 6, 9–12
const ranges = nums => { const a = uniq(nums.map(Number)).sort((x, y) => x - y), out = []; for (let i = 0; i < a.length; i++) { let j = i; while (j + 1 < a.length && a[j + 1] === a[j] + 1) j++; out.push(i === j ? String(a[i]) : a[i] + '–' + a[j]); i = j; } return out.join(', '); };
const batchName = b => [b.type_name, b.label ? t('batch') + ' ' + b.label : '', b.item ? itemName(b.item) + ' · ' + D.short(b.item.date) : ''].filter(Boolean).join(' · ');
const tkType = b => ({ id: b.ticket_type_id, name: b.type_name, game: b.game, digits: b.digits, color: b.color, design: b.design || {}, price: b.unit_price });
// the price of n tickets of one batch, with the type's offers (the same rule as the database)
// the price of n tickets: the cheapest combination of the offers and single tickets – the same way as the database (_ticket_price)
const tkPrice = (unit, offers, n) => { const os = (offers || []).filter(o => o.qty > 1 && o.price >= 0), best = [0];
  for (let i = 1; i <= n; i++) { best[i] = best[i - 1] + (+unit || 0); for (const o of os) if (o.qty <= i) best[i] = Math.min(best[i], best[i - o.qty] + +o.price); }
  return Math.round((best[n] || 0) * 100) / 100; };
const tkWho = x => [x.guest_name, x.room ? t('room') + ' ' + x.room : ''].filter(Boolean).join(' · ');
const tkWhen = x => x.sold_at ? D.stamp(x.sold_at) : x.reserved_at ? D.stamp(x.reserved_at) : '';

/* ---------- ONE ticket system: one list of ticket types, one inventory – and TEMPLATES. Every game has its OWN design language
   (Tombola: the raffle ticket and its copy for the draw · Disco: the nightlife ticket · Bingo: the card · Custom: a modern pass);
   each type chooses one of its game's designs (or one of the hotel's own) and exactly which information appears, in which order.
   One drawing engine and one field model for all of them. ---------- */
// every piece of information a ticket can carry (the manager switches each on or off; the order of the list is the order on paper)
const TK_FIELDS = ['hotel', 'logo', 'event', 'day', 'date', 'start_time', 'meeting_time', 'meeting_point', 'location', 'included', 'text', 'price', 'seller', 'number', 'guest', 'room'];
const TK_STUB = ['number', 'guest', 'room', 'seller'];            // on the copy for the team (the tear-off part); the seller only there
const TK_ALWAYS = { tombola: ['number'], bingo: ['number'] };     // a raffle ticket and a bingo card always carry their number
const TK_BINGO_F = ['hotel', 'logo', 'event', 'day', 'date', 'start_time', 'location', 'meeting_point', 'text', 'price', 'number', 'guest', 'room'];
const tkFieldsFor = game => game === 'bingo' ? TK_BINGO_F : TK_FIELDS;
// the designs: per game a few, and the plain ones for any ticket; each is only a style – the information comes from the template settings
const TK_TPL = {
  disco_lux: { game: 'disco', bg: ['#07060C', '#170D22', '#2A0F2E'], tx: '#FFFFFF', mu: '#CDC3D9', gold: true, glow: true, sparkle: true, font: 'lux', def: ['hotel', 'event', 'day', 'date', 'meeting_time', 'meeting_point', 'included', 'price', 'number', 'guest', 'room'] },
  disco_min: { game: 'disco', bg: ['#0A0A0A'], tx: '#FFFFFF', mu: '#A3A3A3', neon: true, font: 'sans', upper: true, def: ['event', 'date', 'meeting_time', 'meeting_point', 'number', 'guest', 'room'] },
  disco_vip: { game: 'disco', bg: ['#0B0B0B', '#18150F'], tx: '#F7EFDD', mu: '#BFAE85', gold: true, deco: true, vip: true, font: 'serif', upper: true, def: ['hotel', 'event', 'date', 'meeting_time', 'meeting_point', 'included', 'number', 'guest', 'room'] },
  disco_elegant: { game: 'disco', bg: ['#0A1124', '#17203D', '#0E1630'], tx: '#F5F0E6', mu: '#B2BACF', gold: true, font: 'display', def: ['hotel', 'logo', 'event', 'day', 'date', 'meeting_time', 'meeting_point', 'location', 'price', 'number', 'guest', 'room'] },
  tombola_classic: { game: 'tombola', bg: ['#FFFBF0'], tx: '#2A1D14', mu: '#6E5D4E', font: 'serif', stub: 'left', frame: 'double', hatch: true, round: 2.5, def: ['hotel', 'logo', 'event', 'date', 'start_time', 'location', 'price', 'number', 'guest', 'room'] },
  tombola_elegant: { game: 'tombola', bg: ['#FFFFFF'], tx: '#24211E', mu: '#76706A', font: 'serif', stub: 'right', frame: 'fine', round: 1.2, def: ['hotel', 'event', 'day', 'date', 'start_time', 'price', 'number', 'guest', 'room'] },
  tombola_fun: { game: 'tombola', bg: ['#FFF3D3'], tx: '#2A1D14', mu: '#6B5A4C', font: 'display', stub: 'right', solid: true, confetti: true, round: 5, def: ['event', 'date', 'start_time', 'price', 'number', 'guest', 'room'] },
  bingo_classic: { game: 'bingo', grid: true, bg: ['#FFFFFF'], tx: '#2A1D14', mu: '#6B5A4C', font: 'serif', def: ['hotel', 'event', 'date', 'start_time', 'location', 'number', 'guest', 'room'] },
  bingo_fun: { game: 'bingo', grid: true, bg: ['#FFFDF5'], tx: '#2A1D14', mu: '#6B5A4C', font: 'display', round: 2.5, fun: true, def: ['event', 'date', 'start_time', 'number', 'guest', 'room'] },
  custom_light: { game: 'other', bg: ['#FFFFFF'], tx: '#1F2A2A', mu: '#6F7672', font: 'sans', def: ['hotel', 'logo', 'event', 'date', 'start_time', 'location', 'price', 'number', 'guest', 'room'] },
  custom_dark: { game: 'other', bg: ['#15171C'], tx: '#F5F5F3', mu: '#A9AEB6', font: 'sans', def: ['hotel', 'logo', 'event', 'date', 'start_time', 'location', 'price', 'number', 'guest', 'room'] },
  custom_elegant: { game: 'other', bg: ['#FBF7EF'], tx: '#2A1D14', mu: '#7A6A5C', font: 'serif', fine: true, def: ['hotel', 'logo', 'event', 'date', 'start_time', 'location', 'price', 'number', 'guest', 'room'] }
};
const TK_GAME_TPL = { disco: 'disco_lux', tombola: 'tombola_classic', bingo: 'bingo_classic', other: 'custom_light' };
// the sizes a ticket can have (millimetres, lying); a bingo card is taller (its grid)
const TK_SIZE = { compact: [120, 52], standard: [150, 64], large: [180, 78] };
const tplsFor = game => Object.keys(TK_TPL).filter(k => TK_TPL[k].game === game || (game !== 'bingo' && TK_TPL[k].game === 'other'));
// a type's design as saved before 9.9 (style + "shows") read as a template – nothing has to be converted in the database
const TK_OLD = { logo: ['logo'], date: ['day', 'date'], time: ['start_time', 'meeting_time'], place: ['meeting_point', 'location'], price: ['price'], included: ['included'], guest: ['guest'], room: ['room'], number: ['number'], text: ['text'] };
/* the template a type prints with: its chosen design (or one of its saved ones), its fields in order, its settings */
function tkTemplate(type, key) {
  const d = type.design || {}, game = TK_TPL[TK_GAME_TPL[type.game]] ? type.game : 'other';
  const saved = (d.saved || []).find(x => 'saved:' + x.id === (key || d.template));
  let base = saved ? saved.base : key && TK_TPL[key] ? key : d.template && TK_TPL[d.template] ? d.template : game === 'other' && d.style ? 'custom_' + d.style : TK_GAME_TPL[game];
  if (!TK_TPL[base] || (game === 'bingo') !== !!TK_TPL[base].grid) base = TK_GAME_TPL[game];
  const P = TK_TPL[base], s = Object.assign({}, d, saved || {}), allowed = tkFieldsFor(game), must = TK_ALWAYS[game] || [];
  // fields: saved order / on-off, else the old "shows" (before 9.9), else the design's own choice – and always what the game needs
  let fields = Array.isArray(s.fields) ? s.fields.filter(f => TK_FIELDS.includes(f)) : null;
  if (!fields && Array.isArray(d.show) && game === 'other') fields = uniq(['hotel', 'event'].concat(d.show.flatMap(x => TK_OLD[x] || [])));
  if (!fields) fields = P.def.concat(d.meeting_point && !P.def.includes('meeting_point') ? ['meeting_point'] : [], d.text && !P.def.includes('text') ? ['text'] : []);
  fields = uniq(fields.concat(must)).filter(f => allowed.includes(f));
  const order = (Array.isArray(s.order) ? s.order.filter(f => TK_FIELDS.includes(f)) : []).concat(TK_FIELDS).filter((f, i, a) => a.indexOf(f) === i && allowed.includes(f));
  const portrait = s.orientation === 'portrait' && !P.grid, [w0, h0] = TK_SIZE[s.size] || TK_SIZE.standard, h1 = P.grid ? Math.round(w0 * 0.573) : h0;
  const fam = P.grid ? 'bingo' : P.game === 'other' ? 'custom' : P.game, on = order.filter(f => fields.includes(f));
  // the copy for the team: always on a raffle ticket and a disco ticket; on a custom one when chosen (and it has something to carry)
  const stub = fam === 'tombola' || fam === 'disco' || (fam === 'custom' && s.stub !== false && TK_STUB.some(f => on.includes(f)));
  return { key: saved ? 'saved:' + saved.id : base, base, P, s, fam, game, must, stub, fields: on, order, portrait, w: portrait ? h0 : w0, h: portrait ? w0 : h1, image: s.image_url || (game === 'other' ? d.image_url : '') };
}
const tkDim = (type, key) => { const T = tkTemplate(type, key); return [T.w, T.h]; };
const tkUnit = T => T.portrait ? T.w / 64 : T.P.grid ? T.w / 150 : T.h / 64;     // a template's own scale (compact < standard < large)
const tkPerm = k => can('m_tickets') || can(k);
const rndN = n => crypto.getRandomValues(new Uint32Array(1))[0] % n;
const shuffleR = a => { for (let i = a.length - 1; i > 0; i--) { const j = rndN(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; };
/* a valid 90-ball card: 3 rows × 9 columns, 5 numbers in each row, 15 numbers, columns 1–9, 10–19 … 80–90 (the database checks it again) */
function bingoNew() {
  for (;;) {
    const cnt = Array(9).fill(1); let extra = 6; while (extra) { const c = rndN(9); if (cnt[c] < 3) { cnt[c]++; extra--; } }
    const grid = [Array(9).fill(0), Array(9).fill(0), Array(9).fill(0)], rowN = [0, 0, 0];
    let ok = true;
    for (const c of shuffleR([...Array(9).keys()]).sort((a, b) => cnt[b] - cnt[a])) {
      const rows = shuffleR([0, 1, 2].filter(r => rowN[r] < 5)).sort((a, b) => rowN[a] - rowN[b]).slice(0, cnt[c]);
      if (rows.length < cnt[c]) { ok = false; break; } rows.forEach(r => { grid[r][c] = 1; rowN[r]++; });
    }
    if (!ok || rowN.some(x => x !== 5)) continue;
    for (let c = 0; c < 9; c++) {
      const lo = c ? c * 10 : 1, hi = c === 8 ? 90 : c * 10 + 9, pool = []; for (let v = lo; v <= hi; v++) pool.push(v);
      const picks = shuffleR(pool).slice(0, cnt[c]).sort((a, b) => a - b); let k = 0; for (let r = 0; r < 3; r++) if (grid[r][c]) grid[r][c] = picks[k++];
    }
    return grid.flat();
  }
}
const bingoSig = g => g.filter(Boolean).sort((a, b) => a - b).join('-');
// the card code printed on the card (6 characters; the database works it out the same way and keeps it unique per event)
const cardCode = s => { let h = 2166136261; for (const ch of s) h = Math.imul(h ^ ch.charCodeAt(0), 16777619); return (h >>> 0).toString(36).toUpperCase().padStart(6, '0').slice(-6); };
// new cards for these numbers – never the same card or card code twice in the list, nor one of `taken` (codes already used)
function bingoFor(nums, taken) {
  const seen = new Set(taken || []);
  return nums.map(n => { for (;;) { const g = bingoNew(), s = bingoSig(g), k = cardCode(s); if (!seen.has(k)) { seen.add(k); return { n, s, g }; } } });
}
const tkNo = (type, batch, n) => (batch ? batch + ' ' : '') + String(n).padStart(type.digits || 1, '0');
/* what a ticket shows: the template's own texts + the event + the hotel (never written into the code) */
async function tkInfo(type, it, f = {}, key) {
  const T = tkTemplate(type, key), s = T.s;
  return { batch: f.batch || '', title: s.title || (it ? itemName(it) : '') || type.name, event: it ? itemName(it) : '', subtitle: s.subtitle || '', hotel: S.hotel?.name || '',
    logo: await imgData(S.hotel?.logo_url), photo: await imgData(T.image), day: it ? D.fmt(it.date, { weekday: 'long' }) : '', date: it ? D.fmt(it.date, { day: 'numeric', month: 'long', year: 'numeric' }) : (s.date ? D.long(s.date) : ''),
    day_s: it ? D.fmt(it.date, { weekday: 'short' }) : '', date_s: it ? D.fmt(it.date, { day: 'numeric', month: 'long' }) : '',
    start_time: it ? hm(it.start_time) : '', meeting_time: s.meeting_time ? hm(s.meeting_time) : '', meeting_point: s.meeting_point || '', location: it?.location || '',
    included: s.included || '', text: s.text || '', guest: f.guest_name || '', room: f.room || '', seller: f.seller || '', price: +type.price ? money(type.price) : '', code: f.code || '' };
}

/* ---------- THE DRAWING ENGINE: millimetres; every text is measured, so nothing runs past its place (a little smaller first, then
   pressed together – never cut, never stretched); what does not fit at all is named (the editor says so), never hidden ---------- */
const TK_FF = { serif: "Georgia,'Times New Roman',serif", sans: "'Helvetica Neue',Helvetica,Arial,sans-serif", display: "Georgia,'Times New Roman',serif", lux: "Didot,'Bodoni 72','Bodoni MT',Georgia,serif" };
const TK_NUM = "'Helvetica Neue',Helvetica,Arial,sans-serif";      // the numbers: straight (lining) figures that read at a glance
let tkCtx = null, tkSeq = 0;
function tkW(s, z, f) {
  tkCtx = tkCtx || document.createElement('canvas').getContext('2d');
  const str = String(s); if (!tkCtx) return str.length * z * 0.6 + (f.ls || 0) * str.length;
  tkCtx.font = `${f.it ? 'italic ' : ''}${f.w || 400} ${(z * 10).toFixed(1)}px ${f.ff}`;
  return tkCtx.measureText(str).width / 10 + (f.ls || 0) * str.length;
}
// one line of text in its width: f = { ff font, c colour, w weight, it italic, ls letter spacing, a anchor, up capitals, op opacity }.
// Too long: smaller (down to min), then pressed together a little (at most a fifth); only a text longer still ends in "…"
function tkText(x, y, s, z, maxW, f, min) {
  let str = String(s ?? ''); if (!str) return '';
  if (f.up) str = str.toLocaleUpperCase();
  if (f.ls && /[\u0600-\u06FF\u0900-\u097F]/.test(str)) f = Object.assign({}, f, { ls: 0 });     // joined scripts are never spaced apart
  let w = tkW(str, z, f);
  if (w > maxW && f.ls) { f = Object.assign({}, f, { ls: Math.max(0, f.ls - (w - maxW) / str.length) }); w = tkW(str, z, f); }   // spaced capitals: closer first, the size stays
  if (w > maxW) { z = Math.max(min ?? z * 0.72, z * maxW / w); w = tkW(str, z, f); }
  if (w > maxW * 1.22) { while (str.length > 2 && tkW(str + '…', z, f) > maxW * 1.22) str = str.slice(0, -1); str = str.trimEnd() + '…'; w = tkW(str, z, f); }
  return `<text x="${(+x).toFixed(2)}" y="${(+y).toFixed(2)}" font-size="${z.toFixed(2)}" font-family="${f.ff}" fill="${f.c}"${f.w ? ` font-weight="${f.w}"` : ''}${f.it ? ' font-style="italic"' : ''}${f.ls ? ` letter-spacing="${f.ls.toFixed(2)}"` : ''}${f.a ? ` text-anchor="${f.a}"` : ''}${f.op ? ` fill-opacity="${f.op}"` : ''}${w > maxW + 0.05 ? ` textLength="${maxW.toFixed(2)}" lengthAdjust="spacingAndGlyphs"` : ''}>${esc(str)}</text>`;
}
// text over at most n lines (measured; words stay whole – a long double name may break after its hyphen –, a much too long word is
// broken); a line may be a little longer than maxW when `slack` > 1 (its line is then pressed together, at most a fifth); answers the
// drawing, its lines and whether it was cut ("…")
function tkWrap(x, y, s, z, maxW, n, f, lh = 1.3, slack = 1) {
  let str = String(s ?? '').trim(); if (!str) return { svg: '', lines: 0, cut: false };
  if (f.up) str = str.toLocaleUpperCase();
  const out = [], room = maxW * slack, toks = str.split(/\s+/).flatMap(w => w.split(/(?<=-)(?=.)/).map((t2, i) => ({ t: t2, sp: i === 0 })));
  let cur = '';
  for (const tok of toks) {
    let w = tok.t; const next = cur ? cur + (tok.sp ? ' ' : '') + w : w;
    if (tkW(next, z, f) <= room) { cur = next; continue; }
    if (cur) out.push(cur);
    // a word a little too long stays whole (its line is set a little smaller); a much longer one is broken
    while (w.length > 1 && tkW(w, z, f) > room * 1.25) { let k = w.length - 1; while (k > 1 && tkW(w.slice(0, k), z, f) > room) k--; out.push(w.slice(0, k)); w = w.slice(k); }
    cur = w;
  }
  if (cur) out.push(cur);
  const lines = out.slice(0, n), cut = out.length > n;
  if (cut) { let l = lines[n - 1] + '…'; while (l.length > 2 && tkW(l, z, f) > room) l = l.slice(0, -2) + '…'; lines[n - 1] = l; }
  const g = Object.assign({}, f, { up: false });
  return { svg: lines.map((l, i) => tkText(x, y + i * z * lh, l, z, maxW, g)).join(''), lines: lines.length, cut };
}
const tkLum = hex => { const m = /^#?([0-9a-f]{6})$/i.exec(hex || ''); if (!m) return 255; const v = parseInt(m[1], 16); return 0.299 * (v >> 16) + 0.587 * ((v >> 8) & 255) + 0.114 * (v & 255); };
const tkInk = bg => tkLum(bg) > 165 ? '#1E1A16' : '#FFFFFF';                    // readable text on a colour
const tkF = (ff, c, more) => Object.assign({ ff, c }, more || {});
const tkCap = (c, z, more) => tkF(TK_NUM, c, Object.assign({ up: true, w: 600, ls: 0.32 * z }, more || {}));   // small capitals: labels
// THE ticket number – the stored code ("A 002"), as large as its place allows, centred on (cx, cy)
function tkNumber(cx, cy, no, maxW, maxZ, f) {
  const g = Object.assign({ ff: TK_NUM, w: 700, a: 'middle' }, f), w = tkW(no, maxZ, g), z = w > maxW ? maxZ * maxW / w : maxZ;
  return tkText(cx, cy + z * 0.36, no, z, maxW, g, z);
}
// a line to write on – or the value already known (a sold ticket: the guest, the room) – with its small label in front
function tkLine(x, y, w, val, label, st) {
  const z = st.z, lf = tkCap(st.mu, z, { w: 600 }), lz = 2.4 * z, L = String(label).toLocaleUpperCase(), lw = Math.min(w * 0.6, tkW(L, lz, lf)), vx = x + lw + 1.4 * z;
  const vw = x + w - vx - 0.6 * z, vf = tkF(st.ff, st.ink, { w: 700 });
  return tkText(x, y - 0.6 * z, L, lz, w * 0.6, Object.assign({}, lf, { up: false }), 1.9 * z)
    + `<line x1="${vx.toFixed(2)}" y1="${y.toFixed(2)}" x2="${(x + w).toFixed(2)}" y2="${y.toFixed(2)}" stroke="${st.line}" stroke-width="${(0.26 * z).toFixed(2)}"/>`
    + (!val ? '' : tkW(val, 2.4 * z, vf) > vw * 1.22 ? tkWrap(vx + 0.6 * z, y - 3.5 * z, val, 2.4 * z, vw, 2, vf, 1.1, 1.2).svg      // a long name: two lines, never cut
      : tkText(vx + 0.6 * z, y - 0.9 * z, val, 3.6 * z, vw, vf, 2.4 * z));
}
// "LABEL value" on one line (two texts, so right-to-left languages keep their order); a = 'middle' centres the pair in its width
function tkPair(x, y, w, label, val, k, st) {
  const z = st.z * k, lf = tkCap(st.lab || st.mu, z), L = String(label).toLocaleUpperCase(), lz = 2.4 * z, vz = 3.3 * z, vf = tkF(st.ff, st.ink, { w: st.vw || 400 });
  const lw = tkW(L, lz, lf), gap = 1.5 * z, vw = Math.min(tkW(val, vz, vf), w - lw - gap), x0 = st.a === 'middle' ? x + (w - lw - gap - vw) / 2 : x;
  return tkText(x0, y, L, lz, lw + 0.1, Object.assign({}, lf, { up: false })) + tkText(x0 + lw + gap, y, val, vz, Math.max(4, w - lw - gap), vf, 2.4 * z);
}
// the event's information in the order of the template: (day · date · time), place, meeting time and point, included, own text
function tkRows(X) {
  const { o, on, T } = X, rows = []; let when = false;
  T.fields.forEach(f => {
    if (['day', 'date', 'start_time'].includes(f)) { if (when) return; when = true; const v = ['day', 'date', 'start_time'].filter(on).map(k => o[k]).filter(Boolean).join(' · '); if (v) rows.push({ k: f, kind: 'when', v }); }
    else if (f === 'location' && o.location) rows.push({ k: f, kind: 'pair', l: t('location'), v: o.location });
    else if (f === 'meeting_time' && o.meeting_time) rows.push({ k: f, kind: 'pair', l: t('meeting_time'), v: o.meeting_time });
    else if (f === 'meeting_point' && o.meeting_point) rows.push({ k: f, kind: 'pair', l: t('meeting_point'), v: o.meeting_point });
    else if (f === 'included' && o.included) rows.push({ k: f, kind: 'wrap', l: t('included'), v: o.included });
    else if (f === 'text' && o.text) rows.push({ k: f, kind: 'note', v: o.text });
  });
  return rows;
}
/* the rows from y down to at most yMax: a little smaller first, then long texts on one line; only what still does not fit is
   left out – and named (X.drop) */
function tkFlow(X, rows, x, w, y, yMax, st) {
  const z = st.z, mid = st.a === 'middle', cx = mid ? x + w / 2 : x;
  const draw = (k, lines, keep) => {
    let yy = y; const out = [];
    for (const r of rows.slice(0, keep)) {
      if (r.kind === 'when') { yy += 3.5 * z * k; out.push(tkText(cx, yy, r.v, 3.5 * z * k, w, tkF(st.ff, st.ink, { w: 700, a: mid ? 'middle' : null }), 2.6 * z)); yy += 1.9 * z * k; }
      else if (r.kind === 'pair') { yy += 3.3 * z * k; out.push(tkPair(x, yy, w, r.l, r.v, k, st)); yy += 1.7 * z * k; }
      else {
        // "included": its small label on a line of its own (two texts – right-to-left languages keep their order), then the text
        if (r.kind === 'wrap') { yy += 2.6 * z * k; out.push(tkText(cx, yy, r.l, 2.4 * z * k, w, tkCap(st.lab || st.mu, z * k, { a: mid ? 'middle' : null }), 1.8 * z)); yy += 0.9 * z * k; }
        const zz = (r.kind === 'note' ? 3 : 2.9) * z * k, f = r.kind === 'note' ? tkF(st.ff, st.ac, { it: true, a: mid ? 'middle' : null }) : tkF(st.ff, st.ink, { a: mid ? 'middle' : null, op: 0.85 });
        const wr = tkWrap(cx, yy + zz, r.v, zz, w, lines, f);
        out.push(wr.svg); yy += zz * 1.3 * wr.lines + 0.9 * z * k;
      }
    }
    return { svg: out.join(''), y: yy };
  };
  for (let keep = rows.length; keep >= 0; keep--)
    for (const [k, lines] of [[1, 2], [0.92, 2], [0.84, 2], [0.84, 1], [0.76, 1]]) {
      const d = draw(k, lines, keep);
      if (d.y <= yMax || keep === 0) { rows.slice(keep).forEach(r => X.drop.push(r.k)); return d; }
    }
  return { svg: '', y };
}
// the paper: the template's colour (or gradient), its picture (dimmed so the text stays readable)
function tkBg(X, rr) {
  const { P, W, H, o, uid } = X, dark = tkLum(P.bg[0]) < 110, defs = [];
  let fill = P.bg[0];
  if (P.bg.length > 1) { defs.push(`<linearGradient id="bg${uid}" x1="0" y1="0" x2="${W}" y2="${H}" gradientUnits="userSpaceOnUse">${P.bg.map((x, i) => `<stop offset="${(i / (P.bg.length - 1)).toFixed(2)}" stop-color="${x}"/>`).join('')}</linearGradient>`); fill = `url(#bg${uid})`; }
  if (o.photo) defs.push(`<clipPath id="cp${uid}"><rect width="${W}" height="${H}" rx="${rr}"/></clipPath>`);
  return (defs.length ? `<defs>${defs.join('')}</defs>` : '') + `<rect x="0" y="0" width="${W}" height="${H}" rx="${rr}" fill="${fill}"/>`
    + (o.photo ? `<image href="${o.photo}" x="0" y="0" width="${W}" height="${H}" preserveAspectRatio="xMidYMid slice" clip-path="url(#cp${uid})"/><rect width="${W}" height="${H}" rx="${rr}" fill="${dark ? '#000' : '#fff'}" fill-opacity="${dark ? 0.62 : 0.78}"/>` : '');
}
// the perforation between the guest's part and the copy for the team (dashes, and the two half-moons of a real tear-off ticket)
const tkPerf = (X, vertical, at, col, notch) => {
  const { W, H } = X, z = X.z, r = 2.1 * z;
  const l = vertical ? `<line x1="${at}" y1="${(notch ? r + 1 : 2.5) * 1}" x2="${at}" y2="${H - (notch ? r + 1 : 2.5)}" stroke="${col}" stroke-width="${(0.4 * z).toFixed(2)}" stroke-dasharray="${(1.3 * z).toFixed(2)} ${(1.1 * z).toFixed(2)}"/>`
    : `<line x1="${notch ? r + 1 : 2.5}" y1="${at}" x2="${W - (notch ? r + 1 : 2.5)}" y2="${at}" stroke="${col}" stroke-width="${(0.4 * z).toFixed(2)}" stroke-dasharray="${(1.3 * z).toFixed(2)} ${(1.1 * z).toFixed(2)}"/>`;
  const n = !notch ? '' : vertical ? `<circle cx="${at}" cy="0" r="${r}" fill="#fff" stroke="${col}" stroke-width="${(0.35 * z).toFixed(2)}"/><circle cx="${at}" cy="${H}" r="${r}" fill="#fff" stroke="${col}" stroke-width="${(0.35 * z).toFixed(2)}"/>`
    : `<circle cx="0" cy="${at}" r="${r}" fill="#fff" stroke="${col}" stroke-width="${(0.35 * z).toFixed(2)}"/><circle cx="${W}" cy="${at}" r="${r}" fill="#fff" stroke="${col}" stroke-width="${(0.35 * z).toFixed(2)}"/>`;
  return l + n;
};
/* the copy for the team (the tear-off part): the same number as the guest's part, the guest, the room, the seller.
   R: its place; st: its look (cap = what it says at the top, num = the number's colour, title = the event too) */
function tkStub(X, R, st) {
  const { on, o, no } = X, z = X.z, pad = st.pad, px = st.padX ?? pad, cx = (R.x0 + R.x1) / 2, w = R.x1 - R.x0 - 2 * px, out = [];
  let y = R.y0 + pad;
  y += 2.4 * z; out.push(tkText(cx, y, st.cap, (st.capZ || 2.4) * z, w, tkCap(st.capC || st.mu, z, { a: 'middle', ls: (st.capLs || 0.32) * z, w: st.capW || 600 }), 1.7 * z)); y += 1.8 * z;
  if (st.title && o.title) { const tz = tkW(o.title, 3.2 * z, { ff: st.ff, w: 700 }) > w * 1.15 ? 2.7 * z : 3.2 * z, wr = tkWrap(cx, y + tz, o.title, tz, w, 2, tkF(st.ff, st.ink, { w: 700, a: 'middle' }), 1.15);
    out.push(wr.svg); y += tz * 1.15 * wr.lines + 0.2 * z; }
  // the lines at the bottom, then the number takes the room between
  const lines = [on('guest') && [o.guest, t('name')], on('room') && [o.room, t('room')]].filter(Boolean), sell = on('seller') && o.seller;
  // the caption at the foot: one line, or two when it is long (never pressed small)
  const fz = 2.3 * z, ff = tkCap(st.mu, z, { a: 'middle', ls: 0.15 * z }), fl = st.foot ? (tkW(String(st.foot).toLocaleUpperCase(), fz, ff) > w ? 2 : 1) : 0, fh = fl ? 1 * z + fl * fz * 1.2 : 0;
  const step = 6.6 * z, yb = R.y1 - pad - (sell ? 4 * z : 0.4 * z) - fh, top = yb - (lines.length ? (lines.length - 1) * step + 5.2 * z : 0);
  y += 3 * z; out.push(tkText(cx, y, t('ticket_no'), 2.4 * z, w, tkCap(st.ac, z, { a: 'middle' }), 1.8 * z));
  const nz = Math.max(4.4 * z, Math.min(st.numZ * z, (top - y - 1.4 * z) * 0.95));
  out.push(tkNumber(cx, y + 1.2 * z + nz / 2, no, w, nz, { c: st.num }));
  lines.forEach(([v, l], i) => out.push(tkLine(R.x0 + px, yb - (lines.length - 1 - i) * step, w, v, l, st)));
  if (sell) out.push(tkPair(R.x0 + px, R.y1 - pad - 0.6 * z - fh, w, t('seller'), o.seller, 0.85, Object.assign({}, st, { a: 'middle' })));
  if (fl) out.push(tkWrap(cx, R.y1 - pad - 0.4 * z - (fl - 1) * fz * 1.2, st.foot, fz, w, 2, ff, 1.2).svg);
  return out.join('');
}

/* ONE drawing engine: the template's design language + exactly the fields switched on, in their order; nothing outside the ticket */
function ticketSvg(type, o, n, card, key) {
  const T = tkTemplate(type, key), P = T.P, s = T.s;
  const X = { T, P, s, o, W: T.w, H: T.h, on: f => T.fields.includes(f), no: o.code || tkNo(type, o.batch, n), uid: 'k' + (++tkSeq) + '_' + T.base,
    c: P.accent || safeColor(type.color), font: s.font || P.font, ts: { s: 0.84, m: 1, l: 1.16 }[s.title_size] || 1, drop: [] };
  X.z = tkUnit(T);
  X.tf = tkF(TK_FF[X.font] || TK_FF.serif, P.tx, { it: X.font === 'display' });
  const body = T.fam === 'bingo' ? bingoSvg(X, card) : T.fam === 'disco' ? discoSvg(X) : T.fam === 'tombola' ? tombolaSvg(X) : customSvg(X);
  return `<g data-design="${T.fam}" data-template="${T.base}" data-fields="${T.fields.join(' ')}" data-number="${esc(X.no)}"${X.drop.length ? ` data-dropped="${uniq(X.drop).join(' ')}"` : ''}>${body}</g>`;
}
// the title (the ticket's name), its subtitle, and the event when the title is another text
function tkTitle(X, x, y, w, size, f, lines = 2) {
  const { o, s, on } = X, z = X.z, out = []; let yy = y;
  const t1 = X.P.upper && !s.font ? String(o.title).toLocaleUpperCase() : o.title, one = tkW(t1, size, f) <= w || tkW(t1, size * 0.8, f) <= w;
  if (one || lines < 2) { yy += size * 0.8; out.push(tkText(x, yy, t1, size, w, f, size * 0.62)); yy += size * 0.32; }
  else { const wr = tkWrap(x, yy + size * 0.72, t1, size * 0.8, w, 2, f, 1.08); out.push(wr.svg); yy += size * 0.8 * 1.08 * wr.lines + size * 0.1; }
  if (o.subtitle) { yy += 3.6 * z; out.push(tkText(x, yy, o.subtitle, 3.4 * z, w, Object.assign({}, f, { it: true, w: 400, ls: 0, c: X.P.mu, up: false }), 2.6 * z)); yy += 1 * z; }
  if (on('event') && o.event && o.event !== o.title) { yy += 3.8 * z; out.push(tkText(x, yy, o.event, 3.5 * z, w, tkF(f.ff, f.c, { w: 700, a: f.a }), 2.6 * z)); yy += 0.8 * z; }
  return { svg: out.join(''), y: yy };
}
// the hotel line (its name in small capitals; the logo in front of it when switched on)
function tkHotel(X, x, y, w, col, mid) {
  const { o, on } = X, z = X.z, ls = 6.4 * z, logo = on('logo') && o.logo, name = on('hotel') && o.hotel, out = [];
  if (!logo && !name) return { svg: '', y };
  if (mid) {
    let yy = y; if (logo) { out.push(`<image href="${o.logo}" x="${(x + w / 2 - ls / 2).toFixed(2)}" y="${yy.toFixed(2)}" width="${ls.toFixed(2)}" height="${ls.toFixed(2)}" preserveAspectRatio="xMidYMid meet"/>`); yy += ls + 1 * z; }
    if (name) { yy += 2.5 * z; out.push(tkText(x + w / 2, yy, o.hotel, 2.5 * z, w, tkCap(col, z, { a: 'middle', ls: 0.9 * z }), 1.9 * z)); yy += 1 * z; }
    return { svg: out.join(''), y: yy };
  }
  if (logo) out.push(`<image href="${o.logo}" x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${ls.toFixed(2)}" height="${ls.toFixed(2)}" preserveAspectRatio="xMidYMid meet"/>`);
  if (name) out.push(tkText(x + (logo ? ls + 1.8 * z : 0), y + (logo ? ls / 2 + 0.9 * z : 2.5 * z), o.hotel, 2.5 * z, w - (logo ? ls + 1.8 * z : 0), tkCap(col, z, { ls: 0.75 * z }), 1.9 * z));
  return { svg: out.join(''), y: y + (logo ? ls + 0.6 * z : 3.6 * z) };
}

/* TOMBOLA – the raffle ticket: the guest's part with THE NUMBER as its main element ("your ticket number"), and the copy for the
   draw (the counterfoil, torn off and put in the drum) with the same number, the name and the room */
function tombolaSvg(X) {
  const { P, o, W, H, on, c, no, uid, z } = X, port = X.T.portrait, rr = (P.round ?? 2.5) * z, ink = P.tx, mu = P.mu, solid = !!P.solid;
  const st = { z, ff: X.tf.ff, ink, mu, ac: c, line: mu, lab: mu, vw: 400 }, pad = 5 * z, out = [tkBg(X, rr)];
  const sw = port ? 0 : Math.round(W * 0.27), sh = port ? Math.round(H * 0.31) : 0, left = P.stub === 'left' && !port;
  const G = port ? { x0: 0, y0: 0, x1: W, y1: H - sh } : { x0: left ? sw : 0, y0: 0, x1: left ? W : W - sw, y1: H };
  const R = port ? { x0: 0, y0: H - sh, x1: W, y1: H } : { x0: left ? 0 : W - sw, y0: 0, x1: left ? sw : W, y1: H };
  // the frame: classic – a double rule; elegant – one fine rule; fun – round, with confetti
  out.push(`<rect x="0.35" y="0.35" width="${W - 0.7}" height="${H - 0.7}" rx="${rr}" fill="none" stroke="${c}" stroke-width="${(0.7 * z).toFixed(2)}"/>`);
  if (P.frame === 'double' || P.frame === 'fine') out.push(`<rect x="${1.7 * z}" y="${1.7 * z}" width="${W - 3.4 * z}" height="${H - 3.4 * z}" rx="${Math.max(0, rr - 1.2 * z)}" fill="none" stroke="${c}" stroke-width="${(P.frame === 'double' ? 0.3 : 0.2) * z}"/>`);
  if (P.confetti && !o.photo) (port ? [[0.08, 0.05, 1.2, c], [0.93, 0.08, 0.9, '#E07A5F'], [0.05, 0.4, 0.8, '#3D9970'], [0.95, 0.47, 1.1, c], [0.05, 0.7, 0.7, '#5B8DEF'], [0.95, 0.74, 0.9, '#E9B949']]
    : [[0.3, 0.045, 1.1, c], [0.6, 0.05, 0.8, '#E07A5F'], [0.022, 0.36, 0.9, '#3D9970'], [0.022, 0.7, 0.7, '#5B8DEF'], [0.2, 0.965, 0.9, '#E9B949'], [0.5, 0.965, 1.1, c]])
    .forEach(([fx, fy, r, col]) => { const gx = port ? fx * W : G.x0 + fx * (G.x1 - G.x0), gy = port ? fy * G.y1 : fy * H; out.push(`<circle cx="${gx.toFixed(1)}" cy="${gy.toFixed(1)}" r="${(r * z).toFixed(2)}" fill="${col}" fill-opacity="0.75"/>`); });
  // the number panel
  const gw = G.x1 - G.x0 - 2 * pad, nw = port ? gw : Math.round(gw * 0.38), px1 = G.x1 - pad, px0 = px1 - nw;
  const panel = (x0, y0, x1, y1) => {
    const pw = x1 - x0, ph = y1 - y0, pcx = (x0 + x1) / 2, fg = solid ? tkInk(c) : ink, labC = solid ? fg : c, q = [];
    if (P.hatch) q.push(`<defs><pattern id="h${uid}" width="${1.5 * z}" height="${1.5 * z}" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="${1.5 * z}" stroke="${c}" stroke-width="${0.22 * z}" stroke-opacity="0.22"/></pattern></defs>`);
    q.push(`<rect x="${x0.toFixed(2)}" y="${y0.toFixed(2)}" width="${pw.toFixed(2)}" height="${ph.toFixed(2)}" rx="${(solid ? 3.2 : 1.6) * z}" fill="${solid ? c : P.hatch ? `url(#h${uid})` : 'none'}" stroke="${c}" stroke-width="${(solid ? 0 : 0.55) * z}"/>`);
    if (!solid) q.push(`<rect x="${(x0 + 1.1 * z).toFixed(2)}" y="${(y0 + 1.1 * z).toFixed(2)}" width="${(pw - 2.2 * z).toFixed(2)}" height="${(ph - 2.2 * z).toFixed(2)}" rx="${0.9 * z}" fill="${P.bg[0]}" fill-opacity="${P.hatch ? 0.86 : 0}" stroke="${c}" stroke-width="${0.22 * z}"/>`);
    const lab = tkWrap(pcx, y0 + 5.2 * z, t('tk_your_number'), 2.4 * z, pw - 5 * z, 2, tkCap(labC, z, { a: 'middle', ls: 0.4 * z, w: 700 }), 1.25);
    q.push(lab.svg);
    const priceOn = on('price') && o.price, ny0 = y0 + 5.2 * z + (lab.lines - 1) * 3 * z + 2.2 * z, ny1 = y1 - (priceOn ? 8 * z : 2.6 * z);
    q.push(tkNumber(pcx, (ny0 + ny1) / 2, no, pw - 5 * z, Math.min(16 * z, (ny1 - ny0) * 0.82), { c: fg }));
    if (priceOn) { q.push(`<line x1="${(x0 + 4 * z).toFixed(2)}" y1="${(y1 - 7.4 * z).toFixed(2)}" x2="${(x1 - 4 * z).toFixed(2)}" y2="${(y1 - 7.4 * z).toFixed(2)}" stroke="${solid ? fg : c}" stroke-opacity="0.45" stroke-width="${0.25 * z}"/>`);
      q.push(tkText(pcx, y1 - 2.6 * z, o.price, 3.8 * z, pw - 4 * z, tkF(TK_NUM, solid ? fg : c, { w: 700, a: 'middle' }), 2.8 * z)); }
    return q.join('');
  };
  const rows = tkRows(X), lineRow = on('guest') || on('room');
  if (!port) {
    const ix0 = G.x0 + pad + (left ? 1 : 0), iw = px0 - 4 * z - ix0;
    out.push(panel(px0, pad, px1, H - pad));
    let y = pad; const hd = tkHotel(X, ix0, y, iw, c); out.push(hd.svg); y = hd.y + (hd.svg ? 0.8 * z : 0);
    const tt = tkTitle(X, ix0, y, iw, 8.2 * z * X.ts, X.tf); out.push(tt.svg); y = tt.y;
    out.push(`<line x1="${ix0.toFixed(2)}" y1="${(y + 1.6 * z).toFixed(2)}" x2="${(ix0 + Math.min(iw, 16 * z)).toFixed(2)}" y2="${(y + 1.6 * z).toFixed(2)}" stroke="${c}" stroke-width="${0.45 * z}"/>`); y += 2.4 * z;
    const yb = H - pad - 0.6 * z, fl = tkFlow(X, rows, ix0, iw, y, (lineRow ? yb - 6.4 * z : yb), st); out.push(fl.svg);
    if (lineRow) { const gwL = on('room') && on('guest') ? iw * 0.64 : iw;
      if (on('guest')) out.push(tkLine(ix0, yb, gwL, o.guest, t('name'), st));
      if (on('room')) out.push(tkLine(on('guest') ? ix0 + gwL + 3 * z : ix0, yb, on('guest') ? iw - gwL - 3 * z : iw * 0.5, o.room, t('room'), st)); }
    out.push(tkPerf(X, true, left ? sw : W - sw, c, true));
  } else {
    const ix0 = pad, iw = W - 2 * pad; let y = pad;
    const hd = tkHotel(X, ix0, y, iw, c, true); out.push(hd.svg); y = hd.y + (hd.svg ? 1 * z : 0);
    const tt = tkTitle(X, W / 2, y, iw, 7.4 * z * X.ts, Object.assign({}, X.tf, { a: 'middle' })); out.push(tt.svg); y = tt.y + 2.2 * z;
    // the number panel and the information as one block, in the middle of the free room
    const yb = G.y1 - pad - 0.4 * z, yMax = lineRow ? yb - (on('guest') && on('room') ? 13 : 6.4) * z : yb;
    const block = y0 => { const fl = tkFlow(X, rows, ix0, iw, y0 + 35.5 * z, yMax, Object.assign({}, st, { a: 'middle' })); return { svg: panel(ix0, y0, ix0 + iw, y0 + 33 * z) + fl.svg, y: fl.y }; };
    let bl = block(y); if (yMax - bl.y > 4 * z) bl = block(y + (yMax - bl.y) * 0.4); out.push(bl.svg);
    if (on('guest')) out.push(tkLine(ix0, on('room') ? yb - 6.6 * z : yb, iw, o.guest, t('name'), st));
    if (on('room')) out.push(tkLine(ix0, yb, iw * 0.6, o.room, t('room'), st));
    out.push(tkPerf(X, false, H - sh, c, true));
  }
  out.push(tkStub(X, R, Object.assign({}, st, { pad: 4 * z, cap: t('tk_copy_team'), num: ink, numZ: port ? 11 : 10, title: !port })));
  return out.join('');
}

/* DISCO – the nightlife ticket: dark and gold, a centred composition, the information as columns (date · time · meeting point),
   the number in gold, and the control strip "Admit one" with the same number for the entrance */
function discoSvg(X) {
  const { P, o, W, H, on, no, uid, z } = X, port = X.T.portrait, rr = 1.6 * z, ink = P.tx, mu = P.mu;
  const gold = P.gold ? `url(#fo${uid})` : (tkLum(X.c) < 70 ? '#E8C45E' : X.c), goldS = P.gold ? '#DDBD6E' : gold;   // foil for the large parts, a solid gold for small text
  const st = { z, ff: X.tf.ff, ink, mu, ac: goldS, line: goldS, lab: goldS, vw: 600 }, pad = (P.deco ? 6.4 : 4.6) * z, defs = [];
  if (P.gold) defs.push(`<linearGradient id="fo${uid}" x1="0" y1="0" x2="${W}" y2="${H}" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#8E6B2C"/><stop offset="0.28" stop-color="#E9CF86"/><stop offset="0.5" stop-color="#B68D3D"/><stop offset="0.74" stop-color="#F4E3AA"/><stop offset="1" stop-color="#9C7634"/></linearGradient>`);
  const sw = port ? 0 : Math.round(W * 0.22), sh = port ? Math.round(H * (P.deco ? 0.32 : 0.3)) : 0;
  const G = port ? { x0: 0, y0: 0, x1: W, y1: H - sh } : { x0: 0, y0: 0, x1: W - sw, y1: H }, R = port ? { x0: 0, y0: H - sh, x1: W, y1: H } : { x0: W - sw, y0: 0, x1: W, y1: H };
  if (P.glow && !o.photo) defs.push(`<radialGradient id="gl${uid}" cx="${(G.x1 * 0.72).toFixed(1)}" cy="${(H * 0.05).toFixed(1)}" r="${(Math.max(W, H) * 0.55).toFixed(1)}" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#C04BD0" stop-opacity="0.42"/><stop offset="0.55" stop-color="#6A1F7A" stop-opacity="0.12"/><stop offset="1" stop-color="#000" stop-opacity="0"/></radialGradient>`);
  const out = [`<defs>${defs.join('')}</defs>`, tkBg(X, rr)];
  if (P.glow && !o.photo) out.push(`<rect width="${W}" height="${H}" rx="${rr}" fill="url(#gl${uid})"/>`);
  // the control strip a little darker, the frame: a fine gold line (VIP: a double one with art-deco corners; minimal: one neon line)
  out.push(port ? `<rect x="0" y="${H - sh}" width="${W}" height="${sh}" fill="#000" fill-opacity="0.32"/>` : `<rect x="${W - sw}" y="0" width="${sw}" height="${H}" fill="#000" fill-opacity="0.32"/>`);
  const fi = 2.2 * z;
  if (P.neon) out.push(port ? `<rect x="${fi}" y="${(G.y1 * 0.06).toFixed(2)}" width="${0.9 * z}" height="${(G.y1 * 0.88).toFixed(2)}" fill="${gold}"/>` : `<rect x="${fi}" y="${(H * 0.14).toFixed(2)}" width="${0.9 * z}" height="${(H * 0.72).toFixed(2)}" fill="${gold}"/>`);
  else {
    out.push(`<rect x="${fi}" y="${fi}" width="${W - 2 * fi}" height="${H - 2 * fi}" rx="${0.8 * z}" fill="none" stroke="${gold}" stroke-width="${0.4 * z}"/>`);
    if (P.deco) { const L = 6 * z, e = fi + 1.4 * z;
      out.push(`<rect x="${e}" y="${e}" width="${W - 2 * e}" height="${H - 2 * e}" fill="none" stroke="${gold}" stroke-width="${0.2 * z}"/>`);
      [[e, e, 1, 1], [W - e, e, -1, 1], [e, H - e, 1, -1], [W - e, H - e, -1, -1]].forEach(([x, y, dx, dy]) => out.push(`<path d="M${x} ${y + dy * L}L${x} ${y}L${x + dx * L} ${y}M${x + dx * 1.4 * z} ${y + dy * (L - 1.6 * z)}L${x + dx * 1.4 * z} ${y + dy * 1.4 * z}L${x + dx * (L - 1.6 * z)} ${y + dy * 1.4 * z}" fill="none" stroke="${gold}" stroke-width="${0.45 * z}"/><rect x="${(x + dx * 2.6 * z - 0.7 * z).toFixed(2)}" y="${(y + dy * 2.6 * z - 0.7 * z).toFixed(2)}" width="${1.4 * z}" height="${1.4 * z}" transform="rotate(45 ${(x + dx * 2.6 * z).toFixed(2)} ${(y + dy * 2.6 * z).toFixed(2)})" fill="${gold}"/>`)); }
  }
  if (P.sparkle && !o.photo) (port ? [[0.1, 0.17, 1.3], [0.9, 0.3, 0.8], [0.08, 0.62, 0.9], [0.92, 0.7, 1.1]] : [[0.045, 0.2, 1.4], [0.08, 0.36, 0.7], [0.05, 0.55, 1], [0.09, 0.72, 0.6]]).forEach(([fx, fy, r]) => {
    const x = G.x0 + fx * (G.x1 - G.x0), y = fy * G.y1, q = r * z, i = q * 0.22;
    out.push(`<path d="M${x} ${y - q}L${x + i} ${y - i}L${x + q} ${y}L${x + i} ${y + i}L${x} ${y + q}L${x - i} ${y + i}L${x - q} ${y}L${x - i} ${y - i}Z" fill="${gold}" fill-opacity="0.9"/>`); });
  // the guest's part
  const gx0 = G.x0 + pad + 2 * z, gw = G.x1 - pad - 2 * z - gx0, cx = gx0 + gw / 2, titleF = tkF(X.tf.ff, ink, { a: 'middle', it: X.tf.it, w: P.upper ? 700 : 400, ls: P.upper ? 0.45 * z : 0 });
  let y = G.y0 + pad + 0.6 * z;
  // top: the logo (left), the hotel (centre; its own line when upright), the number (right)
  if (on('logo') && o.logo) out.push(`<image href="${o.logo}" x="${gx0.toFixed(2)}" y="${y.toFixed(2)}" width="${6.6 * z}" height="${6.6 * z}" preserveAspectRatio="xMidYMid meet"/>`);
  const nW = Math.min(30 * z, gw * (port ? 0.6 : 0.3));
  out.push(tkText(G.x1 - pad - 2 * z, y + 2.2 * z, t('ticket_no'), 2.4 * z, nW, tkCap(mu, z, { a: 'end' }), 1.7 * z) + tkText(G.x1 - pad - 2 * z, y + 7.4 * z, no, 5 * z, nW, tkF(TK_NUM, gold, { w: 700, a: 'end' }), 3.6 * z));
  if (on('hotel') && o.hotel) out.push(port ? tkText(cx, y + 13.4 * z, o.hotel, 2.5 * z, gw, tkCap(goldS, z, { a: 'middle', ls: 0.9 * z }), 1.9 * z)
    : tkText(cx, y + 2.8 * z, o.hotel, 2.5 * z, gw - 2 * nW - 4 * z, tkCap(goldS, z, { a: 'middle', ls: 1 * z }), 1.9 * z));
  y += port ? (on('hotel') && o.hotel ? 15 : 10) * z : 4.6 * z;
  const lineRow = on('guest') || on('room'), yb = G.y1 - pad - 0.8 * z, yMax = lineRow ? yb - (port && on('guest') && on('room') ? 13.6 : 7) * z : yb - ((on('price') && o.price && !lineRow) ? 5 * z : 0);
  const main = y => { const out = [];
  if (P.vip) { y += 4.6 * z; out.push(tkText(cx, y, 'VIP', 5 * z, gw, tkF(X.tf.ff, gold, { a: 'middle', w: 700, ls: 1.8 * z }))); const vw = tkW('VIP', 5 * z, { ff: X.tf.ff, w: 700, ls: 1.8 * z });
    out.push(`<line x1="${(cx - vw / 2 - 9 * z).toFixed(2)}" y1="${(y - 1.6 * z).toFixed(2)}" x2="${(cx - vw / 2 - 2 * z).toFixed(2)}" y2="${(y - 1.6 * z).toFixed(2)}" stroke="${gold}" stroke-width="${0.35 * z}"/><line x1="${(cx + vw / 2 + 1 * z).toFixed(2)}" y1="${(y - 1.6 * z).toFixed(2)}" x2="${(cx + vw / 2 + 8 * z).toFixed(2)}" y2="${(y - 1.6 * z).toFixed(2)}" stroke="${gold}" stroke-width="${0.35 * z}"/>`); y += 0.6 * z; }
  const tW = port ? gw : gw - 2 * (Math.min(nW, tkW(no, 5 * z, { ff: TK_NUM, w: 700 })) + 3 * z);
  const tt = tkTitle(X, cx, y, tW, (port ? 9 : P.upper ? 8.4 : 10.4) * z * X.ts, titleF, 2); out.push(tt.svg); y = tt.y + 1.2 * z;
  // the gold divider ◆
  const dw = Math.min(gw * 0.5, 34 * z), dy = y + 1 * z;
  out.push(`<line x1="${(cx - dw / 2).toFixed(2)}" y1="${dy.toFixed(2)}" x2="${(cx - 1.6 * z).toFixed(2)}" y2="${dy.toFixed(2)}" stroke="${gold}" stroke-width="${0.3 * z}"/><line x1="${(cx + 1.6 * z).toFixed(2)}" y1="${dy.toFixed(2)}" x2="${(cx + dw / 2).toFixed(2)}" y2="${dy.toFixed(2)}" stroke="${gold}" stroke-width="${0.3 * z}"/><rect x="${(cx - 0.75 * z).toFixed(2)}" y="${(dy - 0.75 * z).toFixed(2)}" width="${1.5 * z}" height="${1.5 * z}" transform="rotate(45 ${cx.toFixed(2)} ${dy.toFixed(2)})" fill="${gold}"/>`);
  y = dy + 2.4 * z;
  // the columns: date · time · meeting time · meeting point · place (in the template's order), then included and the own text
  const cols = [], rest = []; let when = false;
  X.T.fields.forEach(f => {
    if (f === 'day' || f === 'date') { if (when) return; when = true; const v = [on('day') && (port ? o.day : o.day_s), on('date') && (port ? o.date : o.date_s)].filter(Boolean).join(' '); if (v) cols.push({ k: f, l: t('date'), v }); }
    else if (f === 'start_time' && o.start_time) cols.push({ k: f, l: t('start'), v: o.start_time });
    else if (f === 'meeting_time' && o.meeting_time) cols.push({ k: f, l: t('meeting_time'), v: o.meeting_time });
    else if (f === 'meeting_point' && o.meeting_point) cols.push({ k: f, l: t('meeting_point'), v: o.meeting_point });
    else if (f === 'location' && o.location) cols.push({ k: f, l: t('location'), v: o.location });
    else if (f === 'included' && o.included) rest.push({ k: f, kind: 'wrap', l: t('included'), v: o.included });
    else if (f === 'text' && o.text) rest.push({ k: f, kind: 'note', v: o.text });
  });
  const per = port ? 1 : Math.min(cols.length > 3 ? 4 : 3, cols.length) || 1, rowsN = Math.ceil(cols.length / per), cw = gw / per;
  cols.forEach((col, i) => { const r = Math.floor(i / per), q = i % per, inRow = Math.min(per, cols.length - r * per), x0 = gx0 + (gw - inRow * cw) / 2 + q * cw, yy = y + r * (port ? 8.6 : 9.6) * z;
    if (yy + 8 * z > yMax) { X.drop.push(col.k); return; }
    out.push(tkText(x0 + cw / 2, yy + 2.4 * z, col.l, 2.4 * z, cw - 3 * z, tkCap(goldS, z, { a: 'middle', ls: 0.5 * z }), 1.7 * z));
    out.push(tkText(x0 + cw / 2, yy + 6.6 * z, col.v, 3.6 * z, cw - 3 * z, tkF(TK_FF.sans, ink, { a: 'middle', w: 700 }), 2.5 * z));
    if (q && !port) out.push(`<line x1="${x0.toFixed(2)}" y1="${(yy + 0.6 * z).toFixed(2)}" x2="${x0.toFixed(2)}" y2="${(yy + 7.4 * z).toFixed(2)}" stroke="${goldS}" stroke-opacity="0.45" stroke-width="${0.25 * z}"/>`); });
  y += rowsN * (port ? 8.6 : 9.6) * z + (cols.length ? 0.6 * z : 0);
  const fl = tkFlow(X, rest, gx0, gw, y, yMax, Object.assign({}, st, { a: 'middle', ac: goldS })); out.push(fl.svg);
  return { svg: out.join(''), y: fl.y }; };
  // upright: the block in the middle of the free room (never a gap at the bottom); lying: from the top
  let m = main(y); if (port && yMax - m.y > 4 * z) m = main(y + (yMax - m.y) * 0.45);
  out.push(m.svg);
  // the bottom: name and room to write on (gold hairlines), the price
  const priceOn = on('price') && o.price, pw = priceOn ? Math.min(22 * z, tkW(o.price, 4 * z, { ff: TK_NUM, w: 700 }) + 2 * z) : 0;
  if (priceOn) out.push(tkText(G.x1 - pad - 2 * z, yb - 0.6 * z, o.price, 4 * z, pw, tkF(TK_NUM, gold, { w: 700, a: 'end' }), 3 * z));
  const lw = gw - (priceOn ? pw + 4 * z : 0);
  if (port) { if (on('guest')) out.push(tkLine(gx0, on('room') ? yb - 6.6 * z : yb, lw, o.guest, t('name'), st)); if (on('room')) out.push(tkLine(gx0, yb, lw * 0.7, o.room, t('room'), st)); }
  else { const nwL = on('room') && on('guest') ? lw * 0.62 : lw;
    if (on('guest')) out.push(tkLine(gx0, yb, nwL, o.guest, t('name'), st));
    if (on('room')) out.push(tkLine(on('guest') ? gx0 + nwL + 3 * z : gx0, yb, on('guest') ? lw - nwL - 3 * z : lw * 0.5, o.room, t('room'), st)); }
  out.push(tkPerf(X, !port, port ? H - sh : W - sw, goldS, false));
  out.push(tkStub(X, R, Object.assign({}, st, { pad: (P.deco ? 6.4 : 4.2) * z, padX: (P.deco ? 5.8 : 4) * z, cap: t('tk_admit_one'), capC: goldS, capZ: 2.7, capLs: 0.9, capW: 700, num: gold, numZ: port ? 10 : 9, foot: t('tk_copy_team'), ink })));
  return out.join('');
}

/* CUSTOM – a modern pass (excursions, VIP, any event): a colour band, the title, the information as a grid, the number in a pill;
   the copy for the team only when the template asks for it */
function customSvg(X) {
  const { P, o, W, H, on, c, no, z } = X, port = X.T.portrait, rr = 2.4 * z, ink = P.tx, mu = P.mu, st = { z, ff: TK_FF.sans, ink, mu, ac: c, line: mu, lab: mu, vw: 600 }, pad = 5 * z;
  const out = [tkBg(X, rr)], stub = X.T.stub, sw = stub && !port ? Math.round(W * 0.25) : 0, sh = stub && port ? Math.round(H * 0.28) : 0;
  const G = port ? { x0: 0, y0: 0, x1: W, y1: H - sh } : { x0: 0, y0: 0, x1: W - sw, y1: H }, R = port ? { x0: 0, y0: H - sh, x1: W, y1: H } : { x0: W - sw, y0: 0, x1: W, y1: H };
  out.push(`<rect x="0.3" y="0.3" width="${W - 0.6}" height="${H - 0.6}" rx="${rr}" fill="none" stroke="${P.fine ? c : mu}" stroke-opacity="${P.fine ? 1 : 0.45}" stroke-width="${0.35 * z}"/>`);
  // the colour band (left; at the top when upright), or two fine lines (elegant)
  if (P.fine) out.push(port ? `<rect x="${pad}" y="${3 * z}" width="${W - 2 * pad}" height="${0.6 * z}" fill="${c}"/><rect x="${pad}" y="${4.2 * z}" width="${W - 2 * pad}" height="${0.2 * z}" fill="${c}"/>` : `<rect x="${3 * z}" y="${pad}" width="${0.6 * z}" height="${H - 2 * pad}" fill="${c}"/><rect x="${4.2 * z}" y="${pad}" width="${0.2 * z}" height="${H - 2 * pad}" fill="${c}"/>`);
  else out.push(port ? `<path d="M0 ${rr}a${rr} ${rr} 0 0 1 ${rr} -${rr}H${W - rr}a${rr} ${rr} 0 0 1 ${rr} ${rr}V${4.2 * z}H0Z" fill="${c}"/>` : `<path d="M${rr} 0H${4.2 * z}V${H}H${rr}a${rr} ${rr} 0 0 1 -${rr} -${rr}V${rr}a${rr} ${rr} 0 0 1 ${rr} -${rr}Z" fill="${c}"/>`);
  const gx0 = (port ? 0 : 4.2 * z) + pad, gw = G.x1 - pad - gx0;
  let y = (port ? 4.2 * z : 0) + pad;
  // the number in its pill (top right)
  const pillW = Math.min(port ? gw : 34 * z, Math.max(20 * z, tkW(no, 5 * z, { ff: TK_NUM, w: 700 }) + 8 * z)), pillH = 10.4 * z, px = G.x1 - pad - pillW;
  const numIn = on('number') ? `<rect x="${px.toFixed(2)}" y="${y.toFixed(2)}" width="${pillW.toFixed(2)}" height="${pillH.toFixed(2)}" rx="${pillH / 2}" fill="${c}"/>`
    + tkText(px + pillW / 2, y + 3.4 * z, t('ticket_no'), 2.2 * z, pillW - 6 * z, tkCap(tkInk(c), z, { a: 'middle', op: 0.85 }), 1.6 * z) + tkText(px + pillW / 2, y + 8.3 * z, no, 4.9 * z, pillW - 6 * z, tkF(TK_NUM, tkInk(c), { w: 700, a: 'middle' }), 3.4 * z) : '';
  out.push(numIn);
  const topW = on('number') && !port ? gw - pillW - 4 * z : gw;
  if (port && on('number')) y += pillH + 2.4 * z;
  const hd = tkHotel(X, gx0, y, topW, c); out.push(hd.svg); y = hd.y + (hd.svg ? 0.8 * z : 0);
  const tt = tkTitle(X, gx0, y, topW, (port ? 7.4 : 8.4) * z * X.ts, Object.assign({}, X.tf, { w: X.font === 'sans' ? 700 : 400 })); out.push(tt.svg); y = Math.max(tt.y, port ? 0 : pad + pillH) + 2.2 * z;
  // the grid: label above value, two columns (one when upright), then included and the own text across
  const rows = tkRows(X), grid = rows.filter(r => r.kind !== 'wrap' && r.kind !== 'note'), rest = rows.filter(r => r.kind === 'wrap' || r.kind === 'note');
  const lineRow = on('guest') || on('room'), priceOn = on('price') && o.price, yb = G.y1 - pad - 0.4 * z, yMax = (lineRow ? yb - (port && on('guest') && on('room') ? 13.6 : 7) * z : yb) - (priceOn && port ? 6 * z : 0);
  const per = port ? 1 : 2, cw = gw / per, rh = 8.4 * z;
  const block = y0 => { const q2 = [];
    grid.forEach((r, i) => { const q = i % per, yy = y0 + Math.floor(i / per) * rh, x0 = gx0 + q * cw;
      if (yy + rh > yMax + 0.5 * z) { X.drop.push(r.k); return; }
      q2.push(tkText(x0, yy + 2.4 * z, r.kind === 'when' ? t('date') : r.l, 2.4 * z, cw - 3 * z, tkCap(mu, z), 1.7 * z));
      q2.push(tkText(x0, yy + 6.5 * z, r.v, 3.5 * z, cw - 3 * z, tkF(st.ff, ink, { w: 600 }), 2.5 * z)); });
    const fl = tkFlow(X, rest, gx0, gw, y0 + Math.ceil(grid.length / per) * rh, yMax, st); return { svg: q2.join('') + fl.svg, y: fl.y }; };
  // upright: the information in the middle of the free room
  let bl = block(y); if (port && yMax - bl.y > 4 * z) bl = block(y + (yMax - bl.y) * 0.4); out.push(bl.svg);
  if (priceOn) out.push(tkText(G.x1 - pad, port ? yMax + 4.6 * z : yb - 0.6 * z, o.price, 4.4 * z, 26 * z, tkF(TK_NUM, c, { w: 700, a: 'end' }), 3 * z));
  const lw = gw - (priceOn && !port ? 26 * z : 0);
  if (port) { if (on('guest')) out.push(tkLine(gx0, on('room') ? yb - 6.6 * z : yb, gw, o.guest, t('name'), st)); if (on('room')) out.push(tkLine(gx0, yb, gw * 0.6, o.room, t('room'), st)); }
  else { const nwL = on('room') && on('guest') ? lw * 0.62 : lw;
    if (on('guest')) out.push(tkLine(gx0, yb, nwL, o.guest, t('name'), st));
    if (on('room')) out.push(tkLine(on('guest') ? gx0 + nwL + 3 * z : gx0, yb, on('guest') ? lw - nwL - 3 * z : lw * 0.5, o.room, t('room'), st)); }
  if (stub) { out.push(tkPerf(X, !port, port ? H - sh : W - sw, mu, false));
    out.push(tkStub(X, R, Object.assign({}, st, { pad: 4 * z, cap: t('tk_copy_team'), num: ink, numZ: 8.5, title: !port }))); }
  return out.join('');
}

/* BINGO – the card: the header (hotel, title, the number), the 3 × 9 grid exactly as stored, then date / place and the guest */
function bingoSvg(X, card) {
  const { P, o, W, H, on, c, no, uid, z } = X, fun = !!P.fun, ink = P.tx, mu = P.mu, fg = tkInk(c), out = [];
  const cw = (W - 10 * z) / 9, ch = H * 0.156, x0 = 5 * z, hh = H * 0.19, y0 = hh + 3.2 * z, cells = card?.g || Array(27).fill(0), rr = 3.2 * z;
  out.push(`<rect x="0.5" y="0.5" width="${W - 1}" height="${H - 1}" rx="${rr}" fill="${P.bg[0]}" stroke="${c}" stroke-width="${0.9 * z}"/>`);
  if (fun) out.push(`<defs><linearGradient id="bh${uid}" x1="0" y1="0" x2="${W}" y2="0" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="${c}"/><stop offset="1" stop-color="#E07A5F"/></linearGradient></defs>`);
  out.push(`<path d="M0.5 ${rr + 0.5}a${rr} ${rr} 0 0 1 ${rr} -${rr}H${(W - rr - 0.5).toFixed(2)}a${rr} ${rr} 0 0 1 ${rr} ${rr}V${hh.toFixed(2)}H0.5z" fill="${fun ? `url(#bh${uid})` : c}"/>`);
  // the header: (logo) hotel + title on the left, the ticket number large on the right
  const logo = on('logo') && o.logo, lz = hh - 4 * z, tx0 = 6 * z + (logo ? lz + 2 * z : 0), nW = W * 0.3;
  if (logo) out.push(`<image href="${o.logo}" x="${6 * z}" y="${2 * z}" width="${lz.toFixed(2)}" height="${lz.toFixed(2)}" preserveAspectRatio="xMidYMid meet"/>`);
  if (on('hotel') && o.hotel) out.push(tkText(tx0, hh * 0.36, o.hotel, 2.4 * z, W - nW - tx0 - 4 * z, tkCap(fg, z, { op: 0.85, ls: 0.6 * z }), 1.9 * z));
  out.push(tkText(tx0, hh * 0.8, o.title, 5.6 * z * X.ts, W - nW - tx0 - 4 * z, tkF(X.tf.ff, fg, { w: 700, it: X.tf.it }), 3.8 * z));
  out.push(tkText(W - 6 * z, hh * 0.34, t('ticket_no'), 2.4 * z, nW, tkCap(fg, z, { a: 'end', op: 0.85 }), 1.8 * z) + tkText(W - 6 * z, hh * 0.86, no, 7 * z, nW, tkF(TK_NUM, fg, { w: 700, a: 'end' }), 4.6 * z));
  // the grid – exactly the stored card
  cells.forEach((v, i) => { const r = Math.floor(i / 9), q = i % 9, x = x0 + q * cw, y = y0 + r * ch;
    out.push(`<rect x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${cw.toFixed(2)}" height="${ch.toFixed(2)}"${fun ? ` rx="${1.2 * z}"` : ''} fill="${v ? '#FFFFFF' : c}" fill-opacity="${v ? 1 : 0.12}" stroke="${c}" stroke-width="${0.35 * z}"/>`
      + (v ? `<text x="${(x + cw / 2).toFixed(2)}" y="${(y + ch * 0.7).toFixed(2)}" font-size="${(6.8 * z).toFixed(2)}" text-anchor="middle" font-weight="700" fill="${ink}" font-family="${TK_NUM}">${v}</text>` : ''));
  });
  const gy1 = y0 + 3 * ch, when = ['day', 'date', 'start_time'].filter(on).map(f => o[f]).filter(Boolean).join(' · '), place = [on('location') && o.location, on('meeting_point') && o.meeting_point].filter(Boolean).join(' · ');
  out.push(tkText(5 * z, gy1 + 4.6 * z, [when, place].filter(Boolean).join(' · '), 3.2 * z, W - 10 * z, tkF(TK_FF.sans, ink, { w: 600 }), 2.4 * z));
  if (on('text') && o.text) out.push(tkText(5 * z, gy1 + 8.6 * z, o.text, 2.9 * z, W - 10 * z, tkF(X.tf.ff, c, { it: true }), 2.2 * z));
  const yb = H - 6.4 * z, st = { z, ff: TK_FF.sans, ink, mu, line: mu };
  if (on('guest')) out.push(tkLine(5 * z, yb, W * 0.46, o.guest, t('name'), st));
  if (on('room')) out.push(tkLine(W * 0.5 + 2 * z, yb, W * 0.2, o.room, t('room'), st));
  if (on('price') && o.price) out.push(tkText(W - 5 * z, yb - 0.6 * z, o.price, 3.8 * z, W * 0.2, tkF(TK_NUM, c, { w: 700, a: 'end' }), 2.8 * z));
  out.push(tkText(W - 5 * z, H - 2.4 * z, [card ? t('card_code') + ' ' + cardCode(card.s) : '', no].filter(Boolean).join(' · '), 2.3 * z, W * 0.4, tkF(TK_NUM, mu, { a: 'end' }), 1.8 * z));
  return out.join('');
}

/* ---------- PRINTING: THE way tickets go on paper (Tickets → print, Sell tickets → print one ticket). Each ticket with its own batch
   (event, letter), type and template, exactly as stored – its code, its bingo card, its guest and room, its seller. A ticket is never
   printed smaller than 80 % of its size (fewer per page instead), and the PDF is sharp enough for its small print. ---------- */
const TK_MIN_SCALE = 0.78;                                         // the small print of a standard ticket never below 78 % on paper
const tkDpi = pages => pages <= 12 ? 300 : pages <= 40 ? 240 : 200;
async function ticketPages(rows, batchOf, lay, keyFor) {
  const groups = [];
  for (const b of uniq(rows.map(x => x.batch_id)).map(batchOf)) {
    const type = tkType(b), key = keyFor(type), T = tkTemplate(type, key);
    groups.push({ b, type, key, dw: T.w, dh: T.h, minK: TK_MIN_SCALE / tkUnit(T), base: await tkInfo(type, b.item, { batch: b.label }, key), rows: rows.filter(x => x.batch_id === b.id) });
  }
  const lays = groups.map(g => sheetLayout(lay.paper, lay.orient, lay.per_page, g.dw, g.dh, lay.fit === 'actual', g.minK));
  const pages = groups.flatMap((g, i) => sheetPages(g.rows, lays[i], g.dw, g.dh, x => ticketSvg(g.type, Object.assign({}, g.base, { guest: x.guest_name || '', room: x.room || '', seller: x.seller || '', code: x.code }),
    x.number, x.card ? { g: x.card, s: x.card_sig } : null, g.key)));
  return { pages, L0: lays[0] };
}

/* ---------- THE TEMPLATE EDITOR of a ticket type: one of its game's designs (or one of the hotel's own), exactly the information
   switched on, in its order, the texts, the picture, the fonts, the size and the direction – a live preview, saved with the type ---------- */
const tplName = (type, key) => { const sv = (type.design?.saved || []).find(x => 'saved:' + x.id === key); return sv ? sv.name : t('tpl_' + (TK_TPL[key] ? key : tkTemplate(type, key).base)); };
const tplOptions = type => tplsFor(TK_TPL[TK_GAME_TPL[type.game]] ? type.game : 'other').map(k => [k, t('tpl_' + k)]).concat((type.design?.saved || []).map(x => ['saved:' + x.id, '★ ' + x.name]));

'use strict';
/* AUREA · systems/ticket-system.js — tickets: statuses, batch names, prices and offers, the templates (designs) of each ticket type, drawing a ticket and a
   bingo card, and a guest's tickets.
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

/* ---------- ONE ticket system: one list of ticket types, one inventory – and TEMPLATES: each type chooses one of the designs of its
   game (or one of the hotel's own), and exactly which information appears, in which order. One drawing engine for all of them. ---------- */
// every piece of information a ticket can carry (the manager switches each on or off; the order of the list is the order on paper)
const TK_FIELDS = ['hotel', 'logo', 'event', 'day', 'date', 'start_time', 'meeting_time', 'meeting_point', 'location', 'included', 'text', 'price', 'seller', 'number', 'guest', 'room'];
const TK_STUB = ['number', 'guest', 'room', 'seller'];            // on the tear-off part (right, or bottom when upright)
// the designs: per game a few, and the plain ones for any ticket; each is only a style – the information comes from the template settings
const TK_TPL = {
  disco_lux: { game: 'disco', bg: ['#0B0B12', '#1A1026', '#2B0F2E'], tx: '#FFFFFF', mu: '#CFC6D8', font: 'display', deco: 'dots', glow: true, def: ['hotel', 'event', 'day', 'date', 'meeting_time', 'meeting_point', 'included', 'price', 'number', 'guest', 'room'] },
  disco_min: { game: 'disco', bg: ['#0E0E0E'], tx: '#FFFFFF', mu: '#9A9A9A', font: 'sans', upper: true, deco: 'line', def: ['event', 'date', 'meeting_time', 'meeting_point', 'number', 'guest', 'room'] },
  disco_vip: { game: 'disco', bg: ['#111111', '#1C1A16'], tx: '#F5EBD7', mu: '#BFAE8A', accent: '#C9A24A', font: 'serif', deco: 'vip', border: 2, def: ['hotel', 'event', 'date', 'meeting_time', 'meeting_point', 'included', 'number', 'guest', 'room'] },
  disco_elegant: { game: 'disco', bg: ['#FBF7EF'], tx: '#2A1D14', mu: '#7A6A5C', accent: '#B8862B', font: 'serif', border: 2, def: ['hotel', 'logo', 'event', 'day', 'date', 'meeting_time', 'meeting_point', 'location', 'price', 'number', 'guest', 'room'] },
  tombola_classic: { game: 'tombola', bg: ['#FFFDF7'], tx: '#2A1D14', mu: '#6B5A4C', font: 'serif', stub: 'left', perf: true, deco: 'seal', def: ['hotel', 'logo', 'event', 'date', 'start_time', 'location', 'price', 'number', 'guest', 'room'] },
  tombola_elegant: { game: 'tombola', bg: ['#FFFFFF'], tx: '#2A1D14', mu: '#7A6A5C', font: 'serif', border: 2, def: ['hotel', 'event', 'day', 'date', 'start_time', 'price', 'number', 'guest', 'room'] },
  tombola_fun: { game: 'tombola', bg: ['#FFF6E0'], tx: '#2A1D14', mu: '#6B5A4C', font: 'display', deco: 'confetti', round: 6, def: ['event', 'date', 'start_time', 'price', 'number', 'guest', 'room'] },
  bingo_classic: { game: 'bingo', grid: true, bg: ['#FFFFFF'], tx: '#2A1D14', mu: '#6B5A4C', font: 'serif', def: ['hotel', 'event', 'date', 'start_time', 'location', 'number', 'guest', 'room'] },
  bingo_fun: { game: 'bingo', grid: true, bg: ['#FFFDF5'], tx: '#2A1D14', mu: '#6B5A4C', font: 'display', round: 2.5, fun: true, def: ['event', 'date', 'start_time', 'number', 'guest', 'room'] },
  custom_light: { game: 'other', bg: ['#FFFFFF'], tx: '#1F2A2A', mu: '#7B7B75', font: 'sans', def: ['hotel', 'logo', 'event', 'date', 'start_time', 'location', 'price', 'number', 'guest', 'room'] },
  custom_dark: { game: 'other', bg: ['#15171C'], tx: '#F5F5F3', mu: '#A9AEB6', font: 'sans', def: ['hotel', 'logo', 'event', 'date', 'start_time', 'location', 'price', 'number', 'guest', 'room'] },
  custom_elegant: { game: 'other', bg: ['#FBF7EF'], tx: '#2A1D14', mu: '#7A6A5C', font: 'serif', border: 2, def: ['hotel', 'logo', 'event', 'date', 'start_time', 'location', 'price', 'number', 'guest', 'room'] }
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
  const P = TK_TPL[base], s = Object.assign({}, d, saved || {});
  // fields: saved order / on-off, else the old "shows" (before 9.9), else the design's own choice
  let fields = Array.isArray(s.fields) ? s.fields.filter(f => TK_FIELDS.includes(f)) : null;
  if (!fields && Array.isArray(d.show) && game === 'other') fields = uniq(['hotel', 'event'].concat(d.show.flatMap(x => TK_OLD[x] || [])));
  if (!fields) fields = P.def.concat(d.meeting_point && !P.def.includes('meeting_point') ? ['meeting_point'] : [], d.text && !P.def.includes('text') ? ['text'] : []);
  const order = (Array.isArray(s.order) ? s.order.filter(f => TK_FIELDS.includes(f)) : []).concat(TK_FIELDS).filter((f, i, a) => a.indexOf(f) === i);
  const portrait = s.orientation === 'portrait' && !P.grid, [w0, h0] = TK_SIZE[s.size] || TK_SIZE.standard, h1 = P.grid ? Math.round(w0 * 0.573) : h0;
  return { key: saved ? 'saved:' + saved.id : base, base, P, s, fields: order.filter(f => fields.includes(f)), order, portrait, w: portrait ? h0 : w0, h: portrait ? w0 : h1, image: s.image_url || (game === 'other' ? d.image_url : '') };
}
const tkDim = (type, key) => { const T = tkTemplate(type, key); return [T.w, T.h]; };
const tkPerm = k => can('m_tickets') || can(k);
const rndN = n => crypto.getRandomValues(new Uint32Array(1))[0] % n;
const shuffleR = a => { for (let i = a.length - 1; i > 0; i--) { const j = rndN(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; };
/* a valid 90-ball card: 3 rows × 9 columns, 5 numbers in each row, 15 numbers, columns 1–9, 10–19 … 80–90 */
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
const cardCode = s => { let h = 2166136261; for (const ch of s) h = Math.imul(h ^ ch.charCodeAt(0), 16777619); return (h >>> 0).toString(36).toUpperCase().padStart(6, '0').slice(-6); };
const tkNo = (type, batch, n) => (batch ? batch + ' ' : '') + String(n).padStart(type.digits || 1, '0');
/* what a ticket shows: the template's own texts + the event + the hotel (never written into the code) */
async function tkInfo(type, it, f = {}, key) {
  const T = tkTemplate(type, key), s = T.s;
  return { batch: f.batch || '', title: s.title || (it ? itemName(it) : '') || type.name, event: it ? itemName(it) : '', subtitle: s.subtitle || '', hotel: S.hotel?.name || '',
    logo: await imgData(S.hotel?.logo_url), photo: await imgData(T.image), day: it ? D.fmt(it.date, { weekday: 'long' }) : '', date: it ? D.fmt(it.date, { day: 'numeric', month: 'long', year: 'numeric' }) : (s.date ? D.long(s.date) : ''),
    start_time: it ? hm(it.start_time) : '', meeting_time: s.meeting_time ? hm(s.meeting_time) : '', meeting_point: s.meeting_point || '', location: it?.location || '',
    included: s.included || '', text: s.text || '', guest: f.guest_name || '', room: f.room || '', seller: f.seller || '', price: +type.price ? money(type.price) : '' };
}
const lineOr = (x, y, w, val, label, col, lab, ff = 'Arial') => `${svgT(x, y - 4.2, label, 2.4, `fill="${lab}" font-family="${ff}"`)}${val ? svgFit(x, y - 0.6, val, 3.6, w, `fill="${col}" font-family="${ff}" font-weight="700"`) : `<line x1="${x}" y1="${y}" x2="${x + w}" y2="${y}" stroke="${lab}" stroke-width="0.3"/>`}`;
const TK_FONT = { serif: 'Georgia,serif', sans: 'Arial,Helvetica,sans-serif', display: 'Georgia,serif' };
/* ONE drawing engine: the template's style + exactly the fields switched on, in their order; nothing is drawn outside the ticket */
function ticketSvg(type, o, n, card, key) {
  const T = tkTemplate(type, key), P = T.P, s = T.s, on = f => T.fields.includes(f), W = T.w, H = T.h;
  const c = P.accent || safeColor(type.color), no = tkNo(type, o.batch, n), uid = String(type.id || 0) + '_' + n + '_' + T.base;
  const font = TK_FONT[s.font] || TK_FONT[P.font] || TK_FONT.sans, ital = (s.font || P.font) === 'display' ? ' font-style="italic"' : '';
  const fam = { disco: 'disco', tombola: 'tombola', bingo: 'bingo' }[P.game] || 'custom', ts = { s: 0.82, m: 1, l: 1.18 }[s.title_size] || 1;
  const rr = P.round ?? 4, dark = /^#[0-3]/.test(P.bg[0]);
  const bg = P.bg.length > 1 ? `<defs><linearGradient id="bg${uid}" x1="0" y1="0" x2="1" y2="1">${P.bg.map((x, i) => `<stop offset="${i / (P.bg.length - 1)}" stop-color="${x}"/>`).join('')}</linearGradient></defs>` : '';
  const fill = P.bg.length > 1 ? `url(#bg${uid})` : P.bg[0];
  // the background picture (the template's own), dimmed so the text stays readable
  const pic = o.photo ? `<defs><clipPath id="cp${uid}"><rect x="0" y="0" width="${W}" height="${H}" rx="${rr}"/></clipPath></defs><image href="${o.photo}" x="0" y="0" width="${W}" height="${H}" preserveAspectRatio="xMidYMid slice" clip-path="url(#cp${uid})"/>
    <rect x="0" y="0" width="${W}" height="${H}" rx="${rr}" fill="${dark ? '#000' : '#fff'}" fill-opacity="${dark ? 0.55 : 0.72}"/>` : '';
  const frame = `${bg}<rect x="0.5" y="0.5" width="${W - 1}" height="${H - 1}" rx="${rr}" fill="${fill}" stroke="${c}" stroke-width="${P.border ? 1 : 0.8}"/>${pic}
    ${P.border ? `<rect x="2.6" y="2.6" width="${W - 5.2}" height="${H - 5.2}" rx="${Math.max(0, rr - 1.5)}" fill="none" stroke="${c}" stroke-width="0.35"/>` : ''}`;
  const deco = (() => {
    if (P.glow && !o.photo) return `<defs><radialGradient id="gl${uid}" cx="0.8" cy="0.12" r="0.6"><stop offset="0" stop-color="${c}" stop-opacity="0.55"/><stop offset="1" stop-color="${c}" stop-opacity="0"/></radialGradient></defs><rect x="0" y="0" width="${W}" height="${H}" rx="${rr}" fill="url(#gl${uid})"/>`
      // the sparkles stay off the tear-off part (its number, guest and room are never covered)
      + (P.deco === 'dots' ? (TK_STUB.some(on) && !T.portrait ? [[0.62, 0.07, 1], [0.7, 0.17, 0.7], [0.66, 0.84, 1.1], [0.56, 0.91, 0.7], [0.47, 0.86, 0.9], [0.71, 0.93, 0.6]]
          : [[0.79, 0.14, 1.2], [0.85, 0.23, 0.8], [0.94, 0.11, 1.5], [0.71, 0.81, 0.9], [0.64, 0.12, 0.7], [0.92, 0.84, 1.1], [0.57, 0.9, 0.6], [0.41, 0.09, 0.8]])
        .map(([x, y, r], i) => `<circle cx="${(x * W).toFixed(1)}" cy="${(y * H).toFixed(1)}" r="${r}" fill="${i % 2 ? '#fff' : c}" fill-opacity="${i % 2 ? 0.55 : 0.85}"/>`).join('') : '');
    if (P.deco === 'line') return `<rect x="0.5" y="${H * 0.18}" width="1.6" height="${H * 0.64}" fill="${c}"/>`;
    if (P.deco === 'confetti') return [[0.08, 0.15, 1.6, c], [0.2, 0.86, 1.2, '#E07A5F'], [0.5, 0.1, 1, '#3D9970'], [0.6, 0.88, 1.4, c], [0.36, 0.92, 0.9, '#5B8DEF'], [0.04, 0.6, 1.1, '#E9B949'], [0.68, 0.18, 0.8, '#E07A5F']]
      .map(([x, y, r, col]) => `<circle cx="${(x * W).toFixed(1)}" cy="${(y * H).toFixed(1)}" r="${r}" fill="${col}" fill-opacity="0.8"/>`).join('');
    return '';
  })();
  if (P.grid) return bingoSvg(type, o, n, card, T, { c, no, uid, font, ital, fam, frame, ts });
  /* the tear-off part: number, guest, room, seller – right (or left), or at the bottom when the ticket stands upright */
  const stubOn = TK_STUB.some(on), port = T.portrait;
  const sw = stubOn && !port ? Math.round(W * 0.26) : 0, sh = stubOn && port ? Math.round(H * 0.3) : 0, left = P.stub === 'left' && !port;
  const x0 = (left ? sw : 0) + (P.deco === 'line' ? 8 : 7), x1 = (left ? W : W - sw) - 6, yMax = H - sh - (on('price') && o.price ? 9 : 5.5);
  const logoS = Math.min(H * 0.17, 12), logo = on('logo') && o.logo ? `<image href="${o.logo}" x="${(x1 - logoS).toFixed(1)}" y="5" width="${logoS.toFixed(1)}" height="${logoS.toFixed(1)}" preserveAspectRatio="xMidYMid meet"/>` : '';
  const rows = []; let y = 5.5;
  const width = () => x1 - x0 - (logo && y < 5 + logoS + 1 ? logoS + 2 : 0);
  const add = (txt, size, a, gap = 1.4) => { if (!txt || y + size > yMax) return; y += size * 0.82; rows.push(svgFit(x0, y, txt, size, width(), a)); y += size * 0.18 + gap; };
  const wrap = (txt, size, a) => { if (!txt || y + size > yMax) return; const nl = Math.max(1, Math.min(2, Math.floor((yMax - y) / (size * 1.25)))); y += size * 0.82; rows.push(svgWrap(x0, y, txt, size, width(), nl, a)); y += size * 1.25 * nl - size * 0.82 + 1.4; };
  const tx = `fill="${P.tx}" font-family="${font}"`, mu = `fill="${P.mu}" font-family="${font}"`, ac = `fill="${c}" font-family="${font}"`;
  const titleSz = (port ? 7.5 : H > 70 ? 11 : 9.5) * ts, title = () => { add(P.upper ? String(o.title).toUpperCase() : o.title, titleSz, `${tx}${ital} font-weight="${P.upper ? 700 : 400}"`, 1); if (o.subtitle) add(o.subtitle, 3.3, mu, 2.2); };
  let titled = false, when = false;
  const main = T.fields.filter(f => !TK_STUB.includes(f) && f !== 'logo' && f !== 'price');
  if (!main.includes('event')) { title(); titled = true; }
  main.forEach(f => {
    if (f === 'hotel') add(o.hotel.toUpperCase(), 2.5, `${ac} letter-spacing="0.7"`, 2.2);
    else if (f === 'event') { if (!titled) { title(); titled = true; } else if (o.event && o.event !== o.title) add(o.event, 3.6, `${tx} font-weight="700"`); }
    else if (['day', 'date', 'start_time'].includes(f)) { if (when) return; when = true; add(['day', 'date', 'start_time'].filter(on).map(k => o[k]).filter(Boolean).join(' · '), 3.3, `${tx} font-weight="700"`, 1.8); }
    else if (f === 'meeting_time') add(o.meeting_time && t('meeting_time') + ' ' + o.meeting_time, 3.1, tx);
    else if (f === 'meeting_point') add(o.meeting_point && t('meeting_point') + ': ' + o.meeting_point, 3.1, tx);
    else if (f === 'location') add(o.location && t('location') + ': ' + o.location, 3, mu);
    else if (f === 'included') wrap(o.included && t('included') + ': ' + o.included, 2.8, mu);
    else if (f === 'text') wrap(o.text, 2.8, `${ac} font-style="italic"`);
  });
  const price = on('price') && o.price ? svgT(x0, H - sh - 4.5, o.price, 4.2, `${ac} font-weight="700"`) : '';
  const stub = !stubOn ? '' : port ? (() => {
    const y0 = H - sh; let yy = y0 + 4.5; const out = [`<line x1="5" y1="${y0}" x2="${W - 5}" y2="${y0}" stroke="${c}" stroke-width="0.5" stroke-dasharray="1.4 1.2"/>`];
    if (on('number')) { out.push(svgT(W / 2, yy + 2.4, t('ticket_no').toUpperCase(), 2.3, `text-anchor="middle" ${ac}`) + svgT(W / 2, yy + 11, no, no.length > 6 ? 6 : 7.5, `text-anchor="middle" ${tx} font-weight="700"`)); yy += 15; }
    if (on('guest')) { yy += 6; out.push(lineOr(6, yy, W - 12, o.guest, t('name'), P.tx, P.mu, font)); }
    if (on('room')) { yy += 8; out.push(lineOr(6, yy, W - 12, o.room, t('room'), P.tx, P.mu, font)); }
    if (on('seller') && o.seller) out.push(svgT(W / 2, H - 3.5, t('seller') + ': ' + o.seller, 2.2, `text-anchor="middle" ${mu}`));
    return out.join('');
  })() : (() => {
    const sx = left ? 0 : W - sw, cx = sx + sw / 2, out = [`<line x1="${left ? sw : sx}" y1="4.5" x2="${left ? sw : sx}" y2="${H - 4.5}" stroke="${c}" stroke-width="0.5" stroke-dasharray="1.4 1.2"/>`];
    if (P.perf) out.push(`<circle cx="${left ? sw : sx}" cy="0.5" r="2.4" fill="#fff" stroke="${c}" stroke-width="0.5"/><circle cx="${left ? sw : sx}" cy="${H - 0.5}" r="2.4" fill="#fff" stroke="${c}" stroke-width="0.5"/>`);
    let yy = 6;
    if (P.deco === 'vip') { out.push(svgT(cx, yy + 4, 'VIP', 4.6, `text-anchor="middle" ${ac} font-weight="700" letter-spacing="1.2"`)); yy += 6; }
    if (on('number')) { out.push(svgT(cx, yy + 4, t('ticket_no').toUpperCase(), 2.3, `text-anchor="middle" ${ac}`) + svgT(cx, yy + 12.5, no, no.length > 6 ? 5.6 : 7, `text-anchor="middle" ${tx} font-weight="700"`)); yy += 16; }
    const lw = sw - 8, lx = sx + 4, slots = (on('guest') ? 1 : 0) + (on('room') ? 1 : 0), room = H - yy - (on('seller') && o.seller ? 6 : 3), step = slots ? Math.min(13, room / slots) : 0;
    if (on('guest')) { yy += step; out.push(lineOr(lx, yy, lw, o.guest, t('name'), P.tx, P.mu, font)); }
    if (on('room')) { yy += step; out.push(lineOr(lx, yy, lw, o.room, t('room'), P.tx, P.mu, font)); }
    if (on('seller') && o.seller) out.push(svgFit(cx, H - 3.2, t('seller') + ': ' + o.seller, 2.1, lw, `text-anchor="middle" ${mu}`));
    return out.join('');
  })();
  const seal = P.deco === 'seal' && !on('price') ? `<circle cx="${x1 - 9}" cy="${H - sh - 11}" r="7" fill="${c}" fill-opacity="0.08" stroke="${c}" stroke-width="0.4"/>` : '';
  return `<g data-design="${fam}" data-template="${T.base}" data-fields="${T.fields.join(' ')}">${frame}${deco}${seal}${logo}${rows.join('')}${price}${stub}</g>`;
}
/* a bingo card: the header (hotel, title, number), the 3 × 9 grid, then date / place and the guest – each only when switched on */
function bingoSvg(type, o, n, card, T, k) {
  const P = T.P, on = f => T.fields.includes(f), W = T.w, H = T.h, sx = W / 150, c = k.c, fun = !!P.fun;
  const cw = (W - 10) / 9, ch = H * 0.156, x0 = 5, y0 = H * 0.22, cells = (card?.g || Array(27).fill(0)), hh = H * 0.18;
  const when = ['day', 'date', 'start_time'].filter(on).map(f => o[f]).filter(Boolean).join(' · '), place = [on('location') && o.location, on('meeting_point') && o.meeting_point].filter(Boolean).join(' · ');
  const fy = y0 + 3 * ch + 4.5;
  return `<g data-design="bingo" data-template="${T.base}" data-fields="${T.fields.join(' ')}"><rect x="0.6" y="0.6" width="${W - 1.2}" height="${H - 1.2}" rx="4" fill="${P.bg[0]}" stroke="${c}" stroke-width="1"/>
    ${fun ? `<defs><linearGradient id="bh${k.uid}" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${c}"/><stop offset="1" stop-color="#E07A5F"/></linearGradient></defs>` : ''}
    <path d="M0.6 4.6a4 4 0 0 1 4-4h${(W - 9.2).toFixed(2)}a4 4 0 0 1 4 4V${hh.toFixed(2)}H0.6z" fill="${fun ? `url(#bh${k.uid})` : c}"/>
    ${on('hotel') ? svgT(6, hh * 0.38, o.hotel.toUpperCase(), 2.6 * sx, 'fill="#fff" fill-opacity="0.85" letter-spacing="0.6" font-family="Arial"') : ''}${svgFit(6, hh * 0.82, o.title, 5.4 * sx * k.ts, W * 0.66, `fill="#fff" font-weight="700" font-family="${k.font}"${k.ital}`)}
    ${on('number') ? svgT(W - 6, hh * 0.36, t('ticket_no').toUpperCase(), 2.3 * sx, 'fill="#fff" fill-opacity="0.85" text-anchor="end" font-family="Arial"') + svgT(W - 6, hh * 0.84, k.no, 6 * sx, 'fill="#fff" font-weight="700" text-anchor="end" font-family="Arial"') : ''}
    ${on('logo') && o.logo ? `<image href="${o.logo}" x="${(W * 0.7).toFixed(1)}" y="2" width="${(hh - 4).toFixed(1)}" height="${(hh - 4).toFixed(1)}" preserveAspectRatio="xMidYMid meet"/>` : ''}
    ${cells.map((v, i) => { const r = Math.floor(i / 9), q = i % 9, x = x0 + q * cw, y = y0 + r * ch;
      return `<rect x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${cw.toFixed(2)}" height="${ch.toFixed(2)}" ${fun ? 'rx="1.2"' : ''} fill="${v ? '#fff' : c}" fill-opacity="${v ? 1 : 0.1}" stroke="${c}" stroke-width="0.35"/>${v ? svgT((x + cw / 2).toFixed(2), (y + ch * 0.68).toFixed(2), v, 6.6 * sx, 'text-anchor="middle" font-weight="700" fill="#2a1d14" font-family="Arial"') : ''}`; }).join('')}
    ${svgFit(5, fy, [when, place].filter(Boolean).join(' · '), 3 * sx, W - 10, 'fill="#6b5a4c" font-family="Arial"')}
    ${on('guest') ? lineOr(5, H - 9, W * 0.46, o.guest, t('name'), '#2a1d14', '#9a8a7c') : ''}${on('room') ? lineOr(W * 0.56, H - 9, W * 0.22, o.room, t('room'), '#2a1d14', '#9a8a7c') : ''}
    ${on('price') && o.price ? svgT(W - 5, H - 9, o.price, 3.6 * sx, `text-anchor="end" fill="${c}" font-weight="700" font-family="Arial"`) : ''}
    ${card ? svgT(W - 5, H - 3.5, t('card_code') + ' ' + cardCode(card.s), 2.3 * sx, 'text-anchor="end" fill="#9a8a7c" font-family="Arial"') : ''}</g>`;
}

/* ---------- THE TEMPLATE EDITOR of a ticket type: one of its game's designs (or one of the hotel's own), exactly the information
   switched on, in its order, the texts, the picture, the fonts, the size and the direction – a live preview, saved with the type ---------- */
const tplName = (type, key) => { const sv = (type.design?.saved || []).find(x => 'saved:' + x.id === key); return sv ? sv.name : t('tpl_' + (TK_TPL[key] ? key : tkTemplate(type, key).base)); };
const tplOptions = type => tplsFor(TK_TPL[TK_GAME_TPL[type.game]] ? type.game : 'other').map(k => [k, t('tpl_' + k)]).concat((type.design?.saved || []).map(x => ['saved:' + x.id, '★ ' + x.name]));

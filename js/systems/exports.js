'use strict';
/* AUREA · systems/exports.js — every file the app makes or reads: the ONE PDF engine (exact pages in mm, the ONE document head and foot from
   Settings → Documents), the report PDF of any list, Excel, CSV, and reading CSV / Excel / PDF files for imports.
   Uses: core/state · translations/languages · supabase · core/utils · icons/icons · components/modals · core/actions */
const XLSX_URL = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
async function exportXlsx(name, sheets) {
  await loadScript(XLSX_URL);
  const wb = window.XLSX.utils.book_new();
  for (const [sn, rows] of Object.entries(sheets)) {
    const ws = window.XLSX.utils.json_to_sheet(rows.length ? rows : [{}]);
    window.XLSX.utils.book_append_sheet(wb, ws, sn.replace(/[\\/?*[\]:]/g, ' ').slice(0, 31) || 'Sheet');
  }
  window.XLSX.writeFile(wb, name.replace(/[^\w.-]+/g, '_') + '.xlsx');
}
/* reading Excel (.xlsx) or CSV files into rows keyed by lower-case column names */
function parseCsv(text) {
  text = text.replace(/^\uFEFF/, '');
  const first = text.split(/\r?\n/)[0] || '';
  const sep = first.includes('\t') ? '\t' : (first.split(';').length > first.split(',').length ? ';' : ',');
  const rows = []; let row = [], cur = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) { if (ch === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch; }
    else if (ch === '"') q = true;
    else if (ch === sep) { row.push(cur); cur = ''; }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; row.push(cur); rows.push(row); row = []; cur = ''; }
    else cur += ch;
  }
  if (cur !== '' || row.length) { row.push(cur); rows.push(row); }
  const head = (rows.shift() || []).map(h => h.trim().toLowerCase());
  return rows.filter(r => r.some(c => String(c).trim() !== '')).map(r => Object.fromEntries(head.map((h, i) => [h, String(r[i] ?? '').trim()])));
}
async function readSheet(file) {
  if (/\.(csv|txt)$/i.test(file.name)) return parseCsv(await file.text());
  await loadScript(XLSX_URL);
  const wb = window.XLSX.read(await file.arrayBuffer(), { type: 'array' });
  return window.XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '', raw: false })
    .map(r => Object.fromEntries(Object.entries(r).map(([k, v]) => [String(k).trim().toLowerCase(), String(v).trim()])));
}
/* reading the text lines of a PDF (e.g. the hotel's room list) with pdf.js, loaded only when needed; table cells stay apart (tab) */
const PDFJS_URL = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
async function readPdfLines(file) {
  await loadScript(PDFJS_URL);
  const lib = window.pdfjsLib; lib.GlobalWorkerOptions.workerSrc = PDFJS_URL.replace('pdf.min.js', 'pdf.worker.min.js');
  let doc; try { doc = await lib.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise; } catch { throw new ApiError('pdf_file'); }
  const lines = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const items = (await (await doc.getPage(p)).getTextContent()).items.filter(i => i.str && i.str.trim()), rows = [];
    items.forEach(i => { const y = i.transform[5], h = Math.abs(i.transform[3]) || i.height || 10;
      let r = rows.find(z => Math.abs(z.y - y) < h * 0.5); if (!r) rows.push(r = { y, h, parts: [] }); r.parts.push({ x: i.transform[4], w: i.width || 0, s: i.str }); });
    rows.sort((a, b) => b.y - a.y).forEach(r => { r.parts.sort((a, b) => a.x - b.x); let out = '', end = null;
      r.parts.forEach(q => { if (end != null) out += q.x - end > r.h * 1.2 ? '\t' : q.x - end > r.h * 0.15 ? ' ' : ''; out += q.s; end = q.x + q.w; });
      lines.push(out.trim()); });
  }
  return lines.filter(Boolean);
}
const toCsv = rows => {
  const h = Object.keys(rows[0] || {}); const q = v => (/[",;\n]/.test(String(v ?? '')) ? '"' + String(v).replace(/"/g, '""') + '"' : String(v ?? ''));
  return '\uFEFF' + [h.join(',')].concat(rows.map(r => h.map(k => q(r[k])).join(','))).join('\r\n');
};
function download(name, text, type = 'application/json') {
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name;
  document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}

/* ---------- ONE print engine: every page is drawn exactly (SVG, in mm) and saved as a real PDF file.
   No browser page: no web address, no date, no header/footer, nothing outside the paper. ---------- */
const PAPERS = { a4: [210, 297], a5: [148, 210], letter: [216, 279] };
/* paper + how many per page + the shape of the item → exact places on the page (never overlapping, never cut).
   minK: the smallest share of its real size an item may print at (tickets: readable) – fewer per page then (asked = what was chosen) */
function sheetLayout(paper, orient, perPage, dw, dh, actual, minK) {
  if (paper === 'item') return { W: dw, H: dh, w: dw, h: dh, cells: [{ x: 0, y: 0 }], asked: 1 };     // one per page, page = the item itself
  let [W, H] = PAPERS[paper] || PAPERS.a4; if (orient === 'landscape') [W, H] = [H, W];
  const m = 8, g = 4, ratio = dw / dh, asked = Math.max(1, perPage | 0); let best = null, n = asked;
  // at its real size (dw × dh mm): as many as fit (at most the chosen number), never larger than the page allows
  if (actual) {
    const k = Math.min(1, (W - 2 * m) / dw, (H - 2 * m) / dh), w = dw * k, h = dh * k;
    const cols = Math.max(1, Math.floor((W - 2 * m + g) / (w + g))), rows = Math.max(1, Math.floor((H - 2 * m + g) / (h + g)));
    n = Math.min(n, cols * rows); const c2 = Math.min(cols, n), r2 = Math.ceil(n / c2);
    const ox = (W - c2 * w - (c2 - 1) * g) / 2, oy = (H - r2 * h - (r2 - 1) * g) / 2;
    return { W, H, w, h, asked, cells: Array.from({ length: n }, (_, i) => ({ x: ox + (i % c2) * (w + g), y: oy + Math.floor(i / c2) * (h + g) })) };
  }
  for (; n >= 1; n--) {
    best = null;
    for (let cols = 1; cols <= n; cols++) {
      const rows = Math.ceil(n / cols), cw = (W - 2 * m - (cols - 1) * g) / cols, ch = (H - 2 * m - (rows - 1) * g) / rows;
      if (cw <= 0 || ch <= 0) continue;
      let w = cw, h = w / ratio; if (h > ch) { h = ch; w = h * ratio; }
      if (!best || w * h > best.w * best.h + 0.01) best = { cols, rows, w, h };
    }
    if (best && (!minK || best.w / dw >= minK || n === 1)) break;
  }
  const { cols, rows, w, h } = best, ox = (W - cols * w - (cols - 1) * g) / 2, oy = (H - rows * h - (rows - 1) * g) / 2;
  return { W, H, w, h, asked, cells: Array.from({ length: n }, (_, i) => ({ x: ox + (i % cols) * (w + g), y: oy + Math.floor(i / cols) * (h + g) })) };
}
/* items → pages; each item drawn in its own box (design units dw × dh) scaled exactly into its cell */
function sheetPages(items, L, dw, dh, draw) {
  const pages = [];
  for (let i = 0; i < items.length; i += L.cells.length) {
    const part = items.slice(i, i + L.cells.length);
    pages.push(`<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 ${L.W} ${L.H}" width="${L.W}mm" height="${L.H}mm"><rect width="${L.W}" height="${L.H}" fill="#fff"/>`
      + part.map((it, k) => `<svg x="${L.cells[k].x.toFixed(2)}" y="${L.cells[k].y.toFixed(2)}" width="${L.w.toFixed(2)}" height="${L.h.toFixed(2)}" viewBox="0 0 ${dw} ${dh}" preserveAspectRatio="xMidYMid meet">${draw(it, i + k)}</svg>`).join('') + '</svg>');
  }
  return pages;
}
/* text helpers for the drawings (SVG has no automatic line breaks) */
const svgT = (x, y, txt, size, a = '') => `<text x="${x}" y="${y}" font-size="${size}" ${a}>${esc(txt == null ? '' : String(txt))}</text>`;
function svgWrap(x, y, txt, size, maxW, maxLines, a = '') {
  const words = String(txt || '').split(/\s+/).filter(Boolean), per = Math.max(4, Math.floor(maxW / (size * 0.52))), lines = [];
  let cur = ''; for (const w of words) { if ((cur + ' ' + w).trim().length > per) { if (cur) lines.push(cur); cur = w; } else cur = (cur + ' ' + w).trim(); }
  if (cur) lines.push(cur);
  const out = lines.slice(0, maxLines); if (lines.length > maxLines) out[maxLines - 1] = out[maxLines - 1].replace(/.{0,2}$/, '…');
  return out.map((l, i) => svgT(x, y + i * size * 1.25, l, size, a)).join('');
}
/* pictures inside the drawing must travel with it */
async function imgData(url) {
  if (!url) return null; if (String(url).startsWith('data:')) return url;
  try { const b = await (await fetch(url, { mode: 'cors' })).blob(); return await new Promise(ok => { const fr = new FileReader(); fr.onload = () => ok(fr.result); fr.onerror = () => ok(null); fr.readAsDataURL(b); }); } catch { return null; }
}
async function svgJpeg(svg, w, h) {
  const img = new Image();
  await new Promise((ok, no) => { img.onload = ok; img.onerror = () => no(new Error('draw')); img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg); });
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h; const cx = cv.getContext('2d');
  cx.fillStyle = '#fff'; cx.fillRect(0, 0, w, h); cx.drawImage(img, 0, 0, w, h);
  const b = atob(cv.toDataURL('image/jpeg', 0.92).split(',')[1]); const u = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return u;
}
/* a small, standard PDF file: one picture per page at the exact paper size */
function pdfFile(pages, wmm, hmm) {
  const pt = v => (v * 72 / 25.4).toFixed(2), W = pt(wmm), H = pt(hmm), enc = new TextEncoder(), parts = [], offs = [];
  let len = 0; const put = x => { const b = typeof x === 'string' ? enc.encode(x) : x; parts.push(b); len += b.length; };
  const obj = (n, fn) => { offs[n] = len; put(n + ' 0 obj\n'); fn(); put('\nendobj\n'); };
  const ids = pages.map((_, i) => ({ page: 3 + i * 3, content: 4 + i * 3, img: 5 + i * 3 })), total = 3 + pages.length * 3;
  put('%PDF-1.4\n');
  obj(1, () => put('<< /Type /Catalog /Pages 2 0 R >>'));
  obj(2, () => put(`<< /Type /Pages /Kids [${ids.map(o => o.page + ' 0 R').join(' ')}] /Count ${pages.length} >>`));
  pages.forEach((p, i) => {
    const o = ids[i], cs = `q ${W} 0 0 ${H} 0 0 cm /Im0 Do Q`;
    obj(o.page, () => put(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W} ${H}] /Resources << /XObject << /Im0 ${o.img} 0 R >> >> /Contents ${o.content} 0 R >>`));
    obj(o.content, () => put(`<< /Length ${cs.length} >>\nstream\n${cs}\nendstream`));
    obj(o.img, () => { put(`<< /Type /XObject /Subtype /Image /Width ${p.w} /Height ${p.h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${p.jpg.length} >>\nstream\n`); put(p.jpg); put('\nendstream'); });
  });
  const x = len; put(`xref\n0 ${total}\n0000000000 65535 f \n`); for (let k = 1; k < total; k++) put(String(offs[k]).padStart(10, '0') + ' 00000 n \n');
  put(`trailer\n<< /Size ${total} /Root 1 0 R >>\nstartxref\n${x}\n%%EOF`);
  return new Blob(parts, { type: 'application/pdf' });
}
/* ---------- ONE document identity for every PDF the app makes (Settings → Documents): the hotel's name and logo, the
   department, the title, the hotel / team, the generated date, page numbers and the author ("Made by … / The …"). Every
   generator draws its content; the head and the foot come only from here. ---------- */
function docMeta() {
  const s = S.settings || {};
  return { hotel: S.hotel?.name || '', logo: s.doc_show_logo !== false ? S.hotel?.logo_url || null : null, dept: s.doc_department ?? t('doc_department_def'),
    by: s.doc_prepared_by || '', pos: s.doc_position || '', date: s.doc_show_date !== false, pages: s.doc_show_pages !== false,
    paper: PAPERS[s.doc_paper] ? s.doc_paper : 'a4', orient: s.doc_orientation || 'auto', accent: /^#[0-9a-f]{6}$/i.test(s.doc_accent || '') ? s.doc_accent : '#B8862B' };
}
// paper of a report: the setting (or what its content needs when "automatic"); force = the generator's own (the week: lying)
function docPaper(wide, force) {
  const m = docMeta(), [pw, ph] = PAPERS[m.paper] || PAPERS.a4, land = force ? force === 'landscape' : m.orient === 'auto' ? !!wide : m.orient === 'landscape';
  return land ? [ph, pw] : [pw, ph];
}
/* ONE text of every PDF: right-to-left languages write right-to-left (direction), so mixed text ("إعداد: Mr Hassan Amer") reads in
   the right order; x is mirrored (the page is) unless mirror = false (a generator that places its own columns); o.end: the line
   ends at x (left-to-right: right-aligned; right-to-left: left-aligned); o.anchor: an explicit anchor ('middle') */
const docT = (rtl, W, mirror = true) => (x, y, s, size, o = {}) => `<text x="${(rtl && mirror ? W - x : x).toFixed(2)}" y="${y.toFixed(2)}" font-size="${+(+size).toFixed(2)}" font-family="${o.serif ? 'Georgia,serif' : 'Arial,sans-serif'}"${o.bold ? ' font-weight="700"' : ''}${o.italic ? ' font-style="italic"' : ''}${o.ls ? ` letter-spacing="${o.ls}"` : ''} fill="${o.fill || '#222'}"${rtl ? ' direction="rtl"' : ''}${o.anchor ? ` text-anchor="${o.anchor}"` : o.end ? ' text-anchor="end"' : ''}>${esc(s)}</text>`;
/* the head: (logo) hotel · department, the title, what it is about (subtitle), hotel / team · generated; answers the svg and its height */
async function docHead(W, M, title, sub, o = {}) {
  const m = docMeta(), rtl = isRtl(), T = docT(rtl, W), logo = await imgData(m.logo), out = [];
  let y = M, x0 = M;
  if (logo) { out.push(`<image href="${logo}" x="${(rtl ? W - M - 14 : M).toFixed(2)}" y="${y.toFixed(2)}" width="14" height="14" preserveAspectRatio="xMidYMid meet"/>`); x0 = M + 17; }
  out.push(T(x0, y + 4.6, m.hotel, 4, { serif: true, bold: true }));
  if (m.dept) out.push(T(x0, y + 9.4, String(m.dept).toUpperCase(), 2.5, { bold: true, fill: m.accent, ls: 0.45 }));
  y += logo ? 17 : m.dept ? 12.5 : 8;
  out.push(`<rect x="${M}" y="${y.toFixed(2)}" width="${(W - 2 * M).toFixed(2)}" height="0.5" fill="${m.accent}"/>`); y += 2.5;
  const big = o.compact ? 5.4 : 6.4;
  wrapText(title, big, W - 2 * M, false, true).forEach(l => { y += big * 1.12; out.push(T(M, y, l, big, { serif: true })); });
  if (sub) { y += 4.6; out.push(T(M, y, sub, 3.3, { bold: true })); }
  y += 4.4; out.push(T(M, y, [m.hotel, o.team === false ? '' : S.team?.name].filter(Boolean).join(' · ') + (m.date ? ' · ' + t('doc_generated', { date: D.stamp(new Date().toISOString()) }) : ''), 2.6, { fill: '#666' }));
  return { svg: out.join(''), h: y + 4 - M };
}
// the running head of every following page (small: the hotel and the title)
function docRun(W, y, title) { const T = docT(isRtl(), W); return T(14, y, [docMeta().hotel, title].filter(Boolean).join(' · '), 2.4, { fill: '#888' }); }
/* the foot of every page: who made it (always), page n / N and the generated date (Settings); compact = one line in a sheet's margin */
function docFoot(W, H, M, i, n, o = {}) {
  const m = docMeta(), rtl = isRtl(), T = docT(rtl, W);
  const by = m.by ? t('doc_made_by', { name: m.by }) : '', pos = m.pos ? t('doc_position', { position: m.pos }) : '', pg = m.pages ? t('doc_page', { n: i + 1, total: n }) : '';
  if (o.compact) return T(M, H - 3, [by, pos].filter(Boolean).join(' · '), 2.2, { fill: '#777' }) + (pg ? T(W - M, H - 3, pg, 2.2, { fill: '#777', end: true }) : '');
  return `<rect x="${M}" y="${(H - 14).toFixed(2)}" width="${(W - 2 * M).toFixed(2)}" height="0.25" fill="#CFC6B6"/>`
    + (by ? T(M, H - 9.6, by, 2.8, { bold: true, fill: '#333' }) : '') + (pos ? T(M, H - 6, pos, 2.6, { fill: '#666' }) : '')
    + (pg ? T(W - M, H - 9.6, pg, 2.6, { fill: '#777', end: true }) : '') + (m.date ? T(W - M, H - 6, D.stamp(new Date().toISOString()), 2.4, { fill: '#999', end: true }) : '');
}
const DOC_FOOT = 15;                                       // the room the foot takes at the bottom of a page (mm)
let lastPdf = null;
/* o.foot: 'compact' adds the one-line foot to every page of a sheet of cards (tickets, prizes) – a page that is one card has none;
   o.dpi: the sharpness of the pages (tickets ask for more: their numbers and small print must stay crisp on paper) */
async function makePdf(svgPages, wmm, hmm, name, o = {}) {
  if (o.foot === 'compact') svgPages = svgPages.map((p, i, a) => p.replace(/<\/svg>\s*$/, docFoot(wmm, hmm, 8, i, a.length, { compact: true }) + '</svg>'));
  const dpi = o.dpi || (svgPages.length > 12 ? 150 : 200), w = Math.round(wmm / 25.4 * dpi), h = Math.round(hmm / 25.4 * dpi), out = [];
  toast(t('pdf_making'));
  for (const s of svgPages) out.push({ jpg: await svgJpeg(s, w, h), w, h });
  lastPdf = { blob: pdfFile(out, wmm, hmm), name: String(name || 'print').replace(/[^\w\- ]+/g, '').trim() || 'print', pages: out.length, wmm, hmm, svg: svgPages };   // (the drawn pages, for a check of what is on them)
  const url = URL.createObjectURL(lastPdf.blob);
  modal(t('pdf_ready'), `<p>${esc(t('pdf_pages', { n: out.length, size: Math.round(wmm) + ' × ' + Math.round(hmm) + ' mm' }))}</p>
    <div class="sheet-actions"><a class="btn wide" href="${url}" target="_blank" rel="noopener" download="${esc(lastPdf.name)}.pdf">${ico('download')} ${esc(t('open_pdf'))}</a>
    ${navigator.canShare ? `<button class="btn ghost wide" data-act="pdf_share">${ico('send')} ${esc(t('share_pdf'))}</button>` : ''}</div><p class="muted small">${esc(t('pdf_hint'))}</p>`, {});
  return lastPdf;
}
ACT.pdf_share = async () => { try { await navigator.share({ files: [new File([lastPdf.blob], lastPdf.name + '.pdf', { type: 'application/pdf' })], title: lastPdf.name }); } catch { /* closed */ } };
/* ---------- the ONE report export: every list / sheet / payslip becomes a real PDF (exact A4 pages, own page numbers,
   no web address, date or browser header). The screen's report HTML is read as headings, text, tables and images
   and laid out here; the pages go through the same PDF engine as tickets and prize cards. ---------- */
const MCTX = document.createElement('canvas').getContext('2d');
const tw = (txt, size, bold, serif) => { MCTX.font = `${bold ? '700 ' : ''}${size * 10}px ${serif ? 'Georgia,serif' : 'Arial,sans-serif'}`; return MCTX.measureText(String(txt)).width / 10; };
function wrapText(txt, size, width, bold, serif) {
  const out = [];
  for (const para of String(txt ?? '').split('\n')) {
    let cur = '';
    for (const word of para.split(/\s+/).filter(Boolean)) {
      const tryLine = cur ? cur + ' ' + word : word;
      if (tw(tryLine, size, bold, serif) <= width) { cur = tryLine; continue; }
      if (cur) out.push(cur);
      cur = word;
      while (tw(cur, size, bold, serif) > width && cur.length > 1) {          // one very long word (or text without spaces)
        let k = cur.length - 1; while (k > 1 && tw(cur.slice(0, k), size, bold, serif) > width) k--;
        out.push(cur.slice(0, k)); cur = cur.slice(k);
      }
    }
    out.push(cur);
  }
  return out.length ? out : [''];
}
/* the report HTML → blocks: headings, paragraphs, tables, images (styles of the screen are not needed on paper) */
function reportBlocks(html) {
  const doc = new DOMParser().parseFromString(`<div>${html}</div>`, 'text/html'), out = [];
  const txt = el => el.textContent.replace(/\s+/g, ' ').trim();
  const walk = el => {
    for (const n of el.childNodes) {
      if (n.nodeType === 3) { const s = n.textContent.replace(/\s+/g, ' ').trim(); if (s) out.push({ t: 'p', text: s }); continue; }
      if (n.nodeType !== 1 || /^(STYLE|SCRIPT)$/.test(n.tagName)) continue;
      const tag = n.tagName;
      if (/^H[1-6]$/.test(tag)) out.push({ t: 'h', text: txt(n), level: +tag[1] });
      else if (tag === 'TABLE') {
        const rows = [...n.querySelectorAll('tr')].map(tr => [...tr.children].map(td => ({ text: txt(td), bold: td.tagName === 'TH' || !!td.querySelector('b,strong') })));
        const headRows = n.querySelector('thead') ? n.querySelectorAll('thead tr').length : (rows[0] && rows[0].every(c => c.bold) ? 1 : 0);
        out.push({ t: 'table', head: rows.slice(0, headRows), rows: rows.slice(headRows) });
      } else if (tag === 'IMG' && n.getAttribute('src')) out.push({ t: 'img', src: n.getAttribute('src'), w: parseFloat(n.getAttribute('width') || n.style.width) || 0 });
      else if (tag === 'DL') out.push({ t: 'dl', rows: [...n.querySelectorAll('dt')].map(dt => [txt(dt), dt.nextElementSibling && dt.nextElementSibling.tagName === 'DD' ? txt(dt.nextElementSibling) : '']) });
      else if (n.querySelector('table,h1,h2,h3,h4,img,p,div,li')) {
        const mark = n.classList.contains('low') || n.classList.contains('bad') ? 'bad' : null;
        if (mark) out.push({ t: 'mark', kind: mark });
        walk(n);
        if (mark) out.push({ t: 'endmark' });
      } else { const s = txt(n); if (s) out.push({ t: 'p', text: s, small: /^(SMALL)$/.test(tag) || n.classList.contains('muted') || n.classList.contains('sub'), bold: /^(B|STRONG)$/.test(tag) }); }
    }
  };
  walk(doc.body.firstChild);
  return out;
}
async function printSheet(title, html, o = {}) {
  try { return await reportPdf(title, html, o); } catch (e) { fail(e); }          // never silent: a failed export says so
}
async function reportPdf(title, html, o = {}) {
  const blocks = reportBlocks(html), rtl = isRtl();
  const wide = blocks.some(b => b.t === 'table' && Math.max(...[...b.head, ...b.rows].map(r => r.length), 0) >= 9);
  const [W, H] = docPaper(wide, o.orient), M = 14, AW = W - 2 * M, BOTTOM = H - DOC_FOOT - 3;
  const pages = []; let cur = null, y = 0;
  const X = (x, w = 0) => (rtl ? W - x - w : x);                                 // right-to-left languages mirror the page
  const T = docT(rtl, W);                                                        // ONE text (mirrored right-to-left)
  const newPage = () => { cur = []; pages.push(cur); y = M; if (pages.length > 1) { cur.push(docRun(W, M - 3, title)); y = M + 1; } };
  const need = h => { if (!cur || y + h > BOTTOM) newPage(); };
  newPage();
  // the head of the document: the ONE document identity (hotel, department, title, hotel / team, generated)
  const head = await docHead(W, M, title, o.sub || ''); cur.push(head.svg); y = M + head.h + 3;
  let mark = null;
  for (const b of blocks) {
    if (b.t === 'mark') { mark = { page: cur, y0: y }; continue; }
    if (b.t === 'endmark') { if (mark && mark.page === cur) cur.push(`<rect x="${X(M - 3, 1.2).toFixed(2)}" y="${mark.y0.toFixed(2)}" width="1.2" height="${(y - mark.y0).toFixed(2)}" fill="#A85454"/>`); mark = null; continue; }
    if (b.t === 'h') {
      const size = b.level <= 2 ? 4.6 : 3.8, lines = wrapText(b.text, size, AW, true, true);
      need(lines.length * size * 1.3 + 6); y += 2.5;
      lines.forEach(l => { y += size * 1.3; cur.push(T(M, y, l, size, { serif: true, bold: true })); }); y += 1.5; continue;
    }
    if (b.t === 'p') {
      const size = b.small ? 2.7 : 3.2, lines = wrapText(b.text, size, AW, b.bold);
      for (const l of lines) { need(size * 1.4); y += size * 1.4; cur.push(T(M, y, l, size, { bold: b.bold, fill: b.small ? '#666' : '#222' })); }
      y += 1.2; continue;
    }
    // a document's facts (Event, Date, Time, Location …): label and value in two columns
    if (b.t === 'dl') {
      const lw = Math.min(AW * 0.3, Math.max(...b.rows.map(r => tw(r[0], 3, true))) + 4);
      for (const [k, v] of b.rows) {
        const lines = wrapText(v, 3.2, AW - lw); need(lines.length * 4.4 + 1);
        y += 4.4; cur.push(T(M, y, k, 3, { bold: true, fill: '#555' }));
        lines.forEach((l, i) => cur.push(T(M + lw, y + i * 4.4, l, 3.2))); y += (lines.length - 1) * 4.4;
      }
      y += 2; continue;
    }
    if (b.t === 'img') {
      const img = await imgData(b.src); if (!img) continue;
      const w = Math.min(b.w ? b.w * 0.2646 : 70, AW), h = w; need(h + 4); y += 2;
      cur.push(`<image href="${img}" x="${((W - w) / 2).toFixed(2)}" y="${y.toFixed(2)}" width="${w.toFixed(2)}" height="${h.toFixed(2)}" preserveAspectRatio="xMidYMid meet"/>`); y += h + 2; continue;
    }
    if (b.t === 'table') {
      const all = [...b.head, ...b.rows]; if (!all.length) continue;
      const nCol = Math.max(...all.map(r => r.length)), pad = 1.3;
      let size = wide ? 2.6 : 3, widths;
      for (const s of [size, 2.3, 2, 1.8]) {                                     // the largest text size whose columns fit the page
        size = s;
        const nat = [...Array(nCol)].map((_, i) => Math.min(70, Math.max(...all.map(r => r[i] ? tw(r[i].text, s, r[i].bold) : 0)) + 2 * pad));
        const min = [...Array(nCol)].map((_, i) => Math.min(nat[i], Math.max(6, Math.max(...all.map(r => r[i] ? Math.max(...r[i].text.split(/\s+/).map(w => tw(w, s, r[i].bold))) : 0)) + 2 * pad)));
        const sn = nat.reduce((a, v) => a + v, 0), sm = min.reduce((a, v) => a + v, 0);
        if (sn <= AW) { widths = nat.map(v => v * AW / sn); break; }
        if (sm <= AW || s === 1.8) { const extra = Math.max(0, AW - sm), room = sn - sm || 1; widths = min.map((v, i) => v + extra * (nat[i] - v) / room); if (sm > AW) widths = widths.map(v => v * AW / sm); break; }
      }
      const lh = size * 1.25;
      const rowOf = r => { const cells = [...Array(nCol)].map((_, i) => r[i] ? wrapText(r[i].text, size, widths[i] - 2 * pad, r[i].bold) : ['']); return { r, cells, h: Math.max(...cells.map(c => c.length)) * lh + 2 * pad - 0.3 }; };
      const drawRow = (row, head) => {
        let x = M;
        row.cells.forEach((lines, i) => {
          const w = widths[i];
          cur.push(`<rect x="${X(x, w).toFixed(2)}" y="${y.toFixed(2)}" width="${w.toFixed(2)}" height="${row.h.toFixed(2)}" fill="${head ? '#F1ECE4' : '#fff'}" stroke="#BBB" stroke-width="0.2"/>`);
          lines.forEach((l, k) => cur.push(T(x + pad, y + pad + (k + 1) * lh - lh * 0.22, l, size, { bold: row.r[i]?.bold })));
          x += w;
        });
        y += row.h;
      };
      const head = b.head.map(rowOf), body = b.rows.map(rowOf), headH = head.reduce((a, r) => a + r.h, 0);
      need(headH + (body[0]?.h || 0) + 2); y += 1.5; head.forEach(r => drawRow(r, true));
      for (let r of body) {
        if (y + r.h > BOTTOM) {
          if (r.h <= BOTTOM - M - headH) { newPage(); head.forEach(h => drawRow(h, true)); }
          // a row taller than a whole page (a long text) goes on in parts: what fits here, the rest on the next page under the head
          else while (y + r.h > BOTTOM) {
            const can = Math.floor((BOTTOM - y - 2 * pad + 0.3) / lh);
            if (can >= 1) {
              drawRow({ r: r.r, cells: r.cells.map(c => c.slice(0, can)), h: can * lh + 2 * pad - 0.3 }, false);
              const rest = r.cells.map(c => c.slice(can)); r = { r: r.r, cells: rest, h: Math.max(1, ...rest.map(c => c.length)) * lh + 2 * pad - 0.3 };
            }
            newPage(); head.forEach(h => drawRow(h, true));
          }
        }
        drawRow(r, false);
      }
      y += 3;
    }
  }
  // the ONE foot on every page: who made it, page n / N, the generated date
  const n = pages.length;
  const svgs = pages.map((p, i) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}mm" height="${H}mm"><rect width="${W}" height="${H}" fill="#fff"/>${p.join('')}${docFoot(W, H, M, i, n)}</svg>`);
  return makePdf(svgs, W, H, title);
}

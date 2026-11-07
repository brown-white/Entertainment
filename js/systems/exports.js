'use strict';
/* Mr Hassan · systems/exports.js — every file the app makes or reads: the ONE PDF engine (exact pages in mm, the ONE document head and foot from
   Settings → Documents), the report PDF of any list – with its PREVIEW (the very pages of the PDF) –, the same report as a real Word file
   (.docx), real Excel files (.xlsx, written here: no download needed), CSV, amounts in words, and reading CSV / Excel / PDF files for imports.
   Uses: core/state · translations/languages · supabase · core/utils · icons/icons · components/modals · core/actions */
const XLSX_URL = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';      // (only to READ a spreadsheet for an import)
/* ---------- ONE zip writer (stored, standard): the container of every Office file the app writes ---------- */
const CRC_T = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = u => { let c = 0xFFFFFFFF; for (let i = 0; i < u.length; i++) c = CRC_T[(c ^ u[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
function zipFiles(files, type) {
  const enc = new TextEncoder(), parts = [], dir = []; let off = 0;
  const d = new Date(), dt = ((d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1)) & 0xFFFF, dd = (((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()) & 0xFFFF;
  const head = (sig, n) => { const b = new DataView(new ArrayBuffer(n)); b.setUint32(0, sig, true); return b; };
  for (const f of files) {
    const name = enc.encode(f.name), data = typeof f.data === 'string' ? enc.encode(f.data) : f.data, crc = crc32(data);
    const lh = head(0x04034b50, 30); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true); lh.setUint16(8, 0, true); lh.setUint16(10, dt, true); lh.setUint16(12, dd, true);
    lh.setUint32(14, crc, true); lh.setUint32(18, data.length, true); lh.setUint32(22, data.length, true); lh.setUint16(26, name.length, true); lh.setUint16(28, 0, true);
    parts.push(new Uint8Array(lh.buffer), name, data);
    const ch = head(0x02014b50, 46); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0x0800, true); ch.setUint16(10, 0, true); ch.setUint16(12, dt, true);
    ch.setUint16(14, dd, true); ch.setUint32(16, crc, true); ch.setUint32(20, data.length, true); ch.setUint32(24, data.length, true); ch.setUint16(28, name.length, true);
    ch.setUint32(42, off, true); dir.push(new Uint8Array(ch.buffer), name);
    off += 30 + name.length + data.length;
  }
  const size = dir.reduce((a, x) => a + x.length, 0), end = head(0x06054b50, 22);
  end.setUint16(8, files.length, true); end.setUint16(10, files.length, true); end.setUint32(12, size, true); end.setUint32(16, off, true);
  return new Blob([...parts, ...dir, new Uint8Array(end.buffer)], { type });
}
// text in Office XML: escaped, without the characters XML does not allow
const xq = v => String(v ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
let lastFile = null;                                        // (the last file made: its name and content, for a check)
function saveFile(name, blob) { lastFile = { name, blob }; const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 800); return blob; }
/* ---------- EXCEL (.xlsx): every sheet with its columns – the keys of its rows in their order, or { cols, rows } (rows as lists: the
   columns exactly as given, e.g. the days 1 … 31) –, a bold head row that stays on top, numbers as numbers, columns as wide as their content ---------- */
function exportXlsx(name, sheets) {
  const colName = i => { let s = ''; for (i++; i; i = Math.floor((i - 1) / 26)) s = String.fromCharCode(65 + (i - 1) % 26) + s; return s; };
  const used = new Set(), list = Object.entries(sheets).map(([sn, data], k) => {
    let n = String(sn).replace(/[\\/?*[\]:]/g, ' ').trim().slice(0, 31) || 'Sheet' + (k + 1); while (used.has(n.toLowerCase())) n = n.slice(0, 28) + ' ' + (k + 1); used.add(n.toLowerCase());
    const cols = Array.isArray(data) ? [] : data.cols.map(String);
    if (Array.isArray(data)) data.forEach(r => Object.keys(r).forEach(c => { if (!cols.includes(c)) cols.push(c); }));
    const rows = Array.isArray(data) ? data.map(r => cols.map(c => r[c])) : data.rows;               // (every row as a list, in the columns' order)
    const cell = (v, ref, st) => (typeof v === 'number' && isFinite(v) ? `<c r="${ref}"${st}><v>${v}</v></c>` : typeof v === 'boolean' ? `<c r="${ref}" t="b"${st}><v>${v ? 1 : 0}</v></c>`
      : v == null || v === '' ? '' : `<c r="${ref}" t="inlineStr"${st}><is><t xml:space="preserve">${xq(v)}</t></is></c>`);
    const width = cols.map((c, i) => Math.min(60, Math.max(6, String(c).length + 2, ...rows.map(r => String(r[i] ?? '').length + 2))));
    const xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"${isRtl() ? ' rightToLeft="1"' : ''}><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>`
      + (cols.length ? `<cols>${width.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('')}</cols>` : '')
      + `<sheetData><row r="1">${cols.map((c, i) => cell(String(c), colName(i) + 1, ' s="1"')).join('')}</row>${rows.map((r, j) => `<row r="${j + 2}">${cols.map((c, i) => cell(r[i], colName(i) + (j + 2), '')).join('')}</row>`).join('')}</sheetData></worksheet>`;
    return { n, xml };
  });
  const ct = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${list.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>`;
  const files = [{ name: '[Content_Types].xml', data: ct },
    { name: '_rels/.rels', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>' },
    { name: 'xl/workbook.xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${list.map((x, i) => `<sheet name="${xq(x.n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets></workbook>` },
    { name: 'xl/_rels/workbook.xml.rels', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${list.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}<Relationship Id="rId${list.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>` },
    { name: 'xl/styles.xml', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFF1ECE4"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>' }]
    .concat(list.map((x, i) => ({ name: `xl/worksheets/sheet${i + 1}.xml`, data: x.xml })));
  return saveFile(name.replace(/[^\w.-]+/g, '_') + '.xlsx', zipFiles(files, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'));
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
    paper: PAPERS[s.doc_paper] ? s.doc_paper : 'a4', orient: s.doc_orientation || 'auto', accent: /^#[0-9a-f]{6}$/i.test(s.doc_accent || '') ? s.doc_accent : /^#[0-9a-f]{6}$/i.test(s.brand_primary || '') ? s.brand_primary : '#B8862B' };   // (11.0) else the hotel's brand colour
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
/* the foot of every page: who made it (always), page n / N and the generated date (Settings; never when the document hides dates);
   compact = one line in a sheet's margin */
function docFoot(W, H, M, i, n, o = {}) {
  const m = Object.assign(docMeta(), o.date === false ? { date: false } : {}), rtl = isRtl(), T = docT(rtl, W);      // o.date false: a document that shows no date
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
    ${navigator.canShare ? `<button class="btn secondary wide" data-act="pdf_share">${ico('send')} ${esc(t('share_pdf'))}</button>` : ''}</div><p class="muted small">${esc(t('pdf_hint'))}</p>`, {});
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
      // signatures: a .doc-sign block of spans (one per person who signs) → a line to sign above each name
      else if (n.classList.contains('doc-sign')) out.push({ t: 'sign', labels: [...n.children].map(txt) });
      else if (n.querySelector('table,h1,h2,h3,h4,img,p,div,li')) {
        const mark = n.classList.contains('low') || n.classList.contains('bad') ? 'bad' : null;
        if (mark) out.push({ t: 'mark', kind: mark });
        walk(n);
        if (mark) out.push({ t: 'endmark' });
      } else { const s = txt(n); if (s) out.push({ t: 'p', text: s, small: /^(SMALL)$/.test(tag) || n.classList.contains('muted') || n.classList.contains('sub'), bold: /^(B|STRONG)$/.test(tag) || n.classList.contains('total') || (!!n.firstElementChild && /^(B|STRONG)$/.test(n.firstElementChild.tagName) && txt(n.firstElementChild) === s) }); }
    }
  };
  walk(doc.body.firstChild);
  return out;
}
async function printSheet(title, html, o = {}) {
  try { return await reportPdf(title, html, o); } catch (e) { fail(e); }          // never silent: a failed export says so
}
async function reportPdf(title, html, o = {}) { const r = await reportPages(title, html, o); return makePdf(r.svgs, r.W, r.H, o.file || title); }
// the report's exact pages (SVG, in mm): what the PDF prints and what the preview shows
async function reportPages(title, html, o = {}) {
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
  const head = await docHead(W, M, title, o.sub || '', { team: o.team }); cur.push(head.svg); y = M + head.h + 3;
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
    // signatures: room to sign, a line, the name of who signs under it (all on one page)
    if (b.t === 'sign' && b.labels.length) {
      need(30); y += 18; const n = b.labels.length, g = 10, w = (AW - g * (n - 1)) / n;
      b.labels.forEach((l, i) => { const x = M + i * (w + g);
        cur.push(`<rect x="${X(x, w).toFixed(2)}" y="${y.toFixed(2)}" width="${w.toFixed(2)}" height="0.3" fill="#444"/>`);
        wrapText(l, 3, w).slice(0, 2).forEach((z, k) => cur.push(T(x, y + 4.6 + k * 4, z, 3, { fill: '#444' }))); });
      y += 12;
    }
  }
  // the ONE foot on every page: who made it, page n / N, the generated date
  const n = pages.length;
  const svgs = pages.map((p, i) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}mm" height="${H}mm"><rect width="${W}" height="${H}" fill="#fff"/>${p.join('')}${docFoot(W, H, M, i, n)}</svg>`);
  return { svgs, W, H };
}
/* ---------- the ONE preview of a document before it leaves the app: its very pages (the PDF prints exactly these), then the file
   asked for – PDF, Word (the same report) or Excel (o.sheets: its table data). o: { sub, orient, file, sheets, formats } ---------- */
let dpCur = null;
async function docPreview(title, html, o = {}) {
  try {
    const r = await reportPages(title, html, o), f = o.formats || ['pdf', 'docx'].concat(o.sheets ? ['xlsx'] : []);
    dpCur = { title, html, o, r };
    const btn = (k, icon, label) => f.includes(k) ? `<button class="btn ${k === 'pdf' ? '' : 'secondary'}" data-act="dp_file" data-k="${k}">${ico(icon)} ${esc(label)}</button>` : '';
    modal(t('doc_preview'), `<div class="doc-preview">${r.svgs.map((p, i) => `<img class="doc-page" alt="${esc(t('doc_page', { n: i + 1, total: r.svgs.length }))}" src="data:image/svg+xml;charset=utf-8,${encodeURIComponent(p)}">`).join('')}</div>
      <p class="muted small">${esc(t('pdf_pages', { n: r.svgs.length, size: Math.round(r.W) + ' × ' + Math.round(r.H) + ' mm' }))}</p>`,
      { wide: true, noFocus: true, extra: btn('xlsx', 'download', t('file_xlsx')) + btn('docx', 'download', t('file_docx')) + btn('pdf', 'download', t('file_pdf')) });
  } catch (e) { fail(e); }
}
ACT.dp_file = async el => {
  const d = dpCur; if (!d) return; const name = d.o.file || d.title;
  try {
    if (el.dataset.k === 'pdf') await makePdf(d.r.svgs, d.r.W, d.r.H, name);
    else if (el.dataset.k === 'docx') { await exportDocx(d.title, d.html, d.o); toast(t('file_ready')); }
    else { exportXlsx(name, d.o.sheets); toast(t('file_ready')); }
  } catch (e) { fail(e); }
};
/* ---------- WORD (.docx): the same report – the document head (logo, hotel, department, title, subtitle, hotel / team, generated),
   headings, text, tables (their head repeats on every page), facts, signatures, pictures – and the foot (made by, page n / N) ---------- */
async function exportDocx(title, html, o = {}) {
  const blocks = reportBlocks(html), rtl = isRtl(), m = docMeta(), media = [];
  const wide = blocks.some(b => b.t === 'table' && Math.max(...[...b.head, ...b.rows].map(r => r.length), 0) >= 9);
  const [W, H] = docPaper(wide, o.orient), dx = mm => Math.round(mm * 56.6929), AW = dx(W - 28), acc = m.accent.slice(1).toUpperCase();
  const bidi = rtl ? '<w:bidi/>' : '';
  const run = (s, f = {}) => `<w:r><w:rPr>${f.serif ? '<w:rFonts w:ascii="Georgia" w:hAnsi="Georgia" w:cs="Georgia"/>' : ''}${f.bold ? '<w:b/><w:bCs/>' : ''}${f.caps ? '<w:caps/>' : ''}${f.color ? `<w:color w:val="${f.color}"/>` : ''}${f.size ? `<w:sz w:val="${f.size}"/><w:szCs w:val="${f.size}"/>` : ''}${rtl ? '<w:rtl/>' : ''}</w:rPr><w:t xml:space="preserve">${xq(s)}</w:t></w:r>`;
  const para = (inner, p = {}) => `<w:p><w:pPr>${p.style ? `<w:pStyle w:val="${p.style}"/>` : ''}${p.keep ? '<w:keepNext/>' : ''}${p.line ? `<w:pBdr><w:${p.line} w:val="single" w:sz="${p.lsz || 6}" w:space="1" w:color="${p.lc || acc}"/></w:pBdr>` : ''}<w:spacing w:before="${p.before || 0}" w:after="${p.after ?? 80}"/>${p.jc ? `<w:jc w:val="${p.jc}"/>` : ''}${bidi}</w:pPr>${inner}</w:p>`;
  // a picture: drawn into PNG (any picture the page can show), in the file itself
  const picture = async (src, wmm) => {
    try {
      const url = await imgData(src); if (!url) return '';
      const img = new Image(); await new Promise((ok, no) => { img.onload = ok; img.onerror = no; img.src = url; });
      const k = Math.min(1, 1600 / Math.max(img.naturalWidth, img.naturalHeight)), cv = document.createElement('canvas');
      cv.width = Math.max(1, Math.round(img.naturalWidth * k)); cv.height = Math.max(1, Math.round(img.naturalHeight * k)); cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
      const b = atob(cv.toDataURL('image/png').split(',')[1]), u = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i);
      const n = media.length + 1, cx = Math.round(wmm * 36000), cy = Math.round(cx * cv.height / cv.width); media.push({ name: `word/media/image${n}.png`, data: u });
      return `<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/><wp:docPr id="${n}" name="Picture ${n}"/><a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="${n}" name="image${n}.png"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="rIdImg${n}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>`;
    } catch { return ''; }
  };
  const edges = (v, c) => ['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].map(e => `<w:${e} w:val="${v}" w:sz="4" w:space="0" w:color="${c}"/>`).join('');
  // a table: columns as wide as their text needs (on the page's width), head rows shaded and repeated on every page
  const table = (rows, f = {}) => {
    const nCol = Math.max(...rows.map(r => r.cells.length)), nat = [...Array(nCol)].map((_, i) => Math.min(40, Math.max(f.even ? 1 : 3, ...rows.map(r => String(r.cells[i]?.text || '').length))));
    const sum = nat.reduce((a, v) => a + v, 0) || 1, widths = f.even ? nat.map(() => Math.floor(AW / nCol)) : nat.map(v => Math.floor(AW * v / sum)), sz = f.size || (nCol >= 9 ? 14 : 18);
    return `<w:tbl><w:tblPr><w:tblW w:w="${AW}" w:type="dxa"/>${rtl ? '<w:bidiVisual/>' : ''}<w:tblBorders>${f.plain ? edges('nil', 'auto') : edges('single', 'BBBBBB')}</w:tblBorders><w:tblLayout w:type="fixed"/><w:tblCellMar><w:top w:w="30" w:type="dxa"/><w:left w:w="60" w:type="dxa"/><w:bottom w:w="30" w:type="dxa"/><w:right w:w="60" w:type="dxa"/></w:tblCellMar></w:tblPr><w:tblGrid>${widths.map(w => `<w:gridCol w:w="${w}"/>`).join('')}</w:tblGrid>`
      + rows.map(r => `<w:tr><w:trPr><w:cantSplit/>${r.head ? '<w:tblHeader/>' : ''}</w:trPr>${[...Array(nCol)].map((_, i) => { const c = r.cells[i] || { text: '' };
        return `<w:tc><w:tcPr><w:tcW w:w="${widths[i]}" w:type="dxa"/>${r.head ? '<w:shd w:val="clear" w:color="auto" w:fill="F1ECE4"/>' : ''}</w:tcPr>${c.xml || para(run(c.text, { bold: c.bold || r.head, size: sz, color: c.color }), { after: 0 })}</w:tc>`; }).join('')}</w:tr>`).join('')
      + '</w:tbl>' + para('', { after: 60 });
  };
  const body = [];
  // the ONE document head (as on the PDF)
  if (m.logo) { const p = await picture(m.logo, 14); if (p) body.push(para(p, { after: 40 })); }
  body.push(para(run(m.hotel, { serif: true, bold: true, size: 30 }), { after: 0 }));
  if (m.dept) body.push(para(run(m.dept, { bold: true, caps: true, size: 16, color: acc }), { after: 0 }));
  body.push(para('', { line: 'bottom', lsz: 8, after: 120 }));
  body.push(para(run(title, { serif: true, size: 40 }), { style: 'Title', after: 60 }));
  if (o.sub) body.push(para(run(o.sub, { bold: true, size: 22 }), { after: 40 }));
  body.push(para(run([m.hotel, o.team === false ? '' : S.team?.name].filter(Boolean).join(' · ') + (m.date ? ' · ' + t('doc_generated', { date: D.stamp(new Date().toISOString()) }) : ''), { size: 17, color: '666666' }), { after: 200 }));
  for (const b of blocks) {
    if (b.t === 'h') body.push(para(run(b.text), { style: b.level <= 2 ? 'Heading1' : 'Heading2', keep: true }));
    else if (b.t === 'p') body.push(para(run(b.text, { bold: b.bold, size: b.small ? 17 : 20, color: b.small ? '666666' : null })));
    else if (b.t === 'dl') body.push(table(b.rows.map(([k, v]) => ({ cells: [{ text: k, bold: true, color: '555555' }, { text: v }] })), { plain: true, size: 20 }));
    else if (b.t === 'img') { const p = await picture(b.src, Math.min(b.w ? b.w * 0.2646 : 70, W - 28)); if (p) body.push(para(p, { jc: 'center' })); }
    else if (b.t === 'table' && (b.head.length || b.rows.length)) body.push(table([...b.head.map(c => ({ cells: c, head: true })), ...b.rows.map(c => ({ cells: c }))]));
    else if (b.t === 'sign' && b.labels.length) body.push(table([{ cells: b.labels.map(l => ({ text: l, xml: para('', { after: 0, before: 900 }) + para(run(l, { size: 18, color: '444444' }), { line: 'top', lc: '444444', after: 0 }) })) }], { plain: true, even: true }));
  }
  // the ONE foot: who made it · position, page n / N (Word counts the pages)
  const by = [m.by ? t('doc_made_by', { name: m.by }) : '', m.pos ? t('doc_position', { position: m.pos }) : ''].filter(Boolean).join(' · ');
  const pg = m.pages ? t('doc_page', { n: '\u0001', total: '\u0002' }).split(/(\u0001|\u0002)/).filter(Boolean).map(x => x === '\u0001' || x === '\u0002' ? `<w:fldSimple w:instr=" ${x === '\u0001' ? 'PAGE' : 'NUMPAGES'} ">${run('1', { size: 16, color: '777777' })}</w:fldSimple>` : run(x, { size: 16, color: '777777' })).join('') : '';
  const NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
  const footer = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:ftr ${NS}><w:p><w:pPr><w:pBdr><w:top w:val="single" w:sz="4" w:space="4" w:color="CFC6B6"/></w:pBdr><w:tabs><w:tab w:val="right" w:pos="${AW}"/></w:tabs>${bidi}</w:pPr>${run(by, { size: 16, color: '555555' })}<w:r><w:tab/></w:r>${pg}</w:p></w:ftr>`;
  const docXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document ${NS} xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"><w:body>${body.join('')}<w:sectPr><w:footerReference w:type="default" r:id="rIdFtr"/><w:pgSz w:w="${dx(W)}" w:h="${dx(H)}"${W > H ? ' w:orient="landscape"' : ''}/><w:pgMar w:top="${dx(14)}" w:right="${dx(14)}" w:bottom="${dx(20)}" w:left="${dx(14)}" w:header="${dx(8)}" w:footer="${dx(8)}" w:gutter="0"/></w:sectPr></w:body></w:document>`;
  const hs = (id, name, sz, lvl) => `<w:style w:type="paragraph" w:styleId="${id}"><w:name w:val="${name}"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:spacing w:before="${lvl == null ? 0 : 200}" w:after="80"/>${lvl == null ? '' : `<w:outlineLvl w:val="${lvl}"/>`}</w:pPr><w:rPr><w:rFonts w:ascii="Georgia" w:hAnsi="Georgia" w:cs="Georgia"/>${lvl == null ? '' : '<w:b/><w:bCs/>'}<w:sz w:val="${sz}"/><w:szCs w:val="${sz}"/></w:rPr></w:style>`;
  const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles ${NS}><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:cs="Arial" w:eastAsia="Arial"/><w:color w:val="222222"/><w:sz w:val="20"/><w:szCs w:val="20"/><w:lang w:val="${xq(S.lang || 'en')}"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="80" w:line="264" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>${hs('Title', 'Title', 40)}${hs('Heading1', 'heading 1', 28, 0)}${hs('Heading2', 'heading 2', 24, 1)}<w:style w:type="table" w:default="1" w:styleId="TableNormal"><w:name w:val="Normal Table"/><w:tblPr><w:tblInd w:w="0" w:type="dxa"/><w:tblCellMar><w:top w:w="0" w:type="dxa"/><w:left w:w="108" w:type="dxa"/><w:bottom w:w="0" w:type="dxa"/><w:right w:w="108" w:type="dxa"/></w:tblCellMar></w:tblPr></w:style></w:styles>`;
  const now = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
  const files = [
    { name: '[Content_Types].xml', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>' },
    { name: '_rels/.rels', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>' },
    { name: 'docProps/core.xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${xq(title)}</dc:title><dc:creator>${xq(m.by || m.hotel)}</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">${now}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${now}</dcterms:modified></cp:coreProperties>` },
    { name: 'word/_rels/document.xml.rels', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdSt" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="rIdFtr" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/>${media.map((_, i) => `<Relationship Id="rIdImg${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/image${i + 1}.png"/>`).join('')}</Relationships>` },
    { name: 'word/document.xml', data: docXml }, { name: 'word/styles.xml', data: styles }, { name: 'word/footer1.xml', data: footer }, ...media];
  return saveFile(String(o.file || title).replace(/[^\w.-]+/g, '_') + '.docx', zipFiles(files, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'));
}
/* ---------- amounts in words, for documents of money ("Six hundred US dollars only."): written in English, the language of the
   finance documents; every currency on its own (never added to another); a currency the list does not know keeps its code ---------- */
const CUR_WORDS = { USD: ['US dollar', 'US dollars', 'cent', 'cents'], EUR: ['euro', 'euros', 'cent', 'cents'], GBP: ['pound sterling', 'pounds sterling', 'penny', 'pence'],
  EGP: ['Egyptian pound', 'Egyptian pounds', 'piastre', 'piastres'], TRY: ['Turkish lira', 'Turkish lira', 'kuruş', 'kuruş'], SAR: ['Saudi riyal', 'Saudi riyals', 'halala', 'halalas'],
  AED: ['UAE dirham', 'UAE dirhams', 'fils', 'fils'], QAR: ['Qatari riyal', 'Qatari riyals', 'dirham', 'dirhams'], CHF: ['Swiss franc', 'Swiss francs', 'centime', 'centimes'],
  RUB: ['Russian rouble', 'Russian roubles', 'kopeck', 'kopecks'], UAH: ['Ukrainian hryvnia', 'Ukrainian hryvnias', 'kopiyka', 'kopiykas'], PLN: ['Polish złoty', 'Polish złoty', 'grosz', 'groszy'],
  CZK: ['Czech koruna', 'Czech korunas', 'haléř', 'haléřů'], RON: ['Romanian leu', 'Romanian lei', 'ban', 'bani'], RSD: ['Serbian dinar', 'Serbian dinars', 'para', 'para'],
  CNY: ['Chinese yuan', 'Chinese yuan', 'fen', 'fen'], INR: ['Indian rupee', 'Indian rupees', 'paisa', 'paise'], SEK: ['Swedish krona', 'Swedish kronor', 'öre', 'öre'],
  NOK: ['Norwegian krone', 'Norwegian kroner', 'øre', 'øre'], DKK: ['Danish krone', 'Danish kroner', 'øre', 'øre'], MAD: ['Moroccan dirham', 'Moroccan dirhams', 'centime', 'centimes'] };
function amountWords(n, cur) {
  const ones = ['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
  const tens = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
  const w999 = x => [Math.floor(x / 100) ? ones[Math.floor(x / 100)] + ' hundred' : '', x % 100 < 20 ? ones[x % 100] : tens[Math.floor(x % 100 / 10)] + (x % 10 ? '-' + ones[x % 10] : '')].filter(Boolean).join(' ');
  const words = x => { if (!x) return 'zero'; const sc = ['', ' thousand', ' million', ' billion', ' trillion'], p = []; for (let i = 0; x > 0; i++, x = Math.floor(x / 1000)) if (x % 1000) p.unshift(w999(x % 1000) + sc[i]); return p.join(' '); };
  const v = Math.round(Math.abs(Number(n) || 0) * 100), whole = Math.floor(v / 100), sub = v % 100, c = String(cur || '').toUpperCase(), nm = CUR_WORDS[c];
  let s = words(whole) + (nm ? ' ' + nm[whole === 1 ? 0 : 1] : c ? ' ' + c : '');
  if (sub) s += nm ? ' and ' + words(sub) + ' ' + nm[sub === 1 ? 2 : 3] : ' and ' + String(sub).padStart(2, '0') + '/100';
  s = (Number(n) < 0 ? 'minus ' : '') + s;
  return s.charAt(0).toUpperCase() + s.slice(1) + ' only.';
}

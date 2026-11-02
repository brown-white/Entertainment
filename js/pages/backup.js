'use strict';
/* AUREA · pages/backup.js — Data transfer: backup and restore, export, import (staff, programme, guests, rooms from a file).
   Uses: core/state · translations/languages · supabase · core/utils · core/permissions · components/modals · core/actions ·
         components/cards · core/auth · core/router · components/forms · components/tables · components/navigation · systems/exports ·
         systems/assignment-system */
page('backup', {
  perm: 'm_backup,m_staff,m_program,m_guests', icon: 'download', group: 'admin', title: 'data_transfer',
  render: async arg => {
    const T = [can('m_backup') && ['export', t('tab_export')], (can('m_staff') || can('m_program') || can('m_guests')) && ['import', t('tab_import')], can('m_backup') && ['restore', t('tab_restore')]].filter(Boolean);
    const tab = T.some(x => x[0] === arg) ? arg : T[0][0];
    const head = tabs('backup', T, tab);
    if (tab === 'export') return head + `<div class="card"><p>${esc(t('backup_intro'))}</p><p class="row"><button class="btn" data-act="bk_json">${esc(t('download_backup'))}</button><button class="btn ghost" data-act="bk_xlsx">${esc(t('download_excel'))}</button></p><p class="muted small">${esc(t('backup_note'))}</p></div>`;
    if (tab === 'import') {
      const kinds = Object.keys(IMPORTS).filter(k => can(IMPORTS[k].perm));
      if (!kinds.includes(imp.kind)) imp = { kind: kinds[0], rows: null, result: null };
      const st = imp.rows ? { ok: imp.rows.filter(r => !r.err).length, bad: imp.rows.filter(r => r.err).length } : null;
      return head + `<div class="card"><p>${esc(t('imp_intro'))}</p><div class="chips">${kinds.map(k => `<button class="chip-btn ${imp.kind === k ? 'on' : ''}" data-act="imp_kind" data-k="${k}">${esc(t('imp_kind_' + k))}</button>`).join('')}</div>
        <p class="muted small"><code>${esc(IMPORTS[imp.kind].head.join(', '))}</code></p>
        ${imp.kind === 'rooms' ? `<p class="muted small">${esc(t('rooms_file_hint'))}</p>` : ''}
        <p class="row"><button class="btn ghost small" data-act="imp_template">${esc(t('imp_template'))}</button><label class="btn small">${esc(t(imp.kind === 'rooms' ? 'rooms_choose_file' : 'imp_choose_file'))}<input type="file" id="imp-file" accept=".xlsx,.xls,.csv,.txt${imp.kind === 'rooms' ? ',.pdf,application/pdf' : ''}" hidden></label></p></div>
        ${imp.kind === 'rooms' && imp.result?.rooms ? `<div class="card"><p>${esc(t('rooms_imported', imp.result.rooms))}</p><p><a class="btn ghost small" href="#/guests/rooms">${esc(t('rooms'))}</a></p></div>` : ''}
        ${imp.kind === 'rooms' && imp.rows && !imp.result ? roomsPreview() : ''}
        ${imp.rows && imp.kind !== 'rooms' ? `<section><h2>${esc(t('imp_rows', { n: imp.rows.length, bad: st.bad }))}</h2><div class="tablewrap">${tableHtml(['#'].concat(IMPORTS[imp.kind].head, ['']), imp.rows.slice(0, 200).map(r => [r.n].concat(IMPORTS[imp.kind].head.map(h => r.data[h] || ''), [{ html: r.done ? chip('✓', 'ok') : r.err ? chip(r.err, 'bad') : chip('OK', 'ok') }])))}</div>
          ${st.ok && !imp.result ? `<p><button class="btn" data-act="imp_go">${esc(t('imp_go', { n: st.ok }))}</button></p>` : ''}</section>` : ''}
        ${imp.result && imp.kind !== 'rooms' ? `<div class="card"><p>${esc(t('imp_done', { ok: imp.result.ok, bad: imp.result.bad }))}</p>${imp.result.passwords.length ? `<p><button class="btn" data-act="imp_pw">${esc(t('imp_passwords'))}</button></p>` : ''}</div>` : ''}`;
    }
    return head + `<div class="card"><p>${esc(t('rst_intro'))}</p><p class="muted small">${esc(t('rst_safety'))}</p><label class="btn small">${esc(t('rst_choose'))}<input type="file" id="rst-file" accept=".json,application/json" hidden></label>
      ${rst ? `<p>${esc(t('rst_summary', { hotel: rst.backup.hotel?.name || '?', date: D.stamp(rst.backup.exported_at), n: rst.count }))}</p>
        ${String(rst.backup.hotel?.id) !== String(S.hotel.id) ? `<p>${chip(t('err_other_hotel_backup'), 'bad')}</p>` : `${fieldHtml({ k: 'rst_confirm', label: t('rst_confirm_label'), ph: S.hotel.name })}<p><button class="btn danger" data-act="rst_go">${esc(t('rst_go'))}</button></p>`}` : ''}</div>`;
  },
  mount: () => {
    const f = $('#imp-file'); if (f) f.onchange = async () => { try { const file = f.files[0]; imp.rows = imp.kind === 'rooms' ? await roomsFile(file) : impCheck(imp.kind, await readSheet(file)); imp.result = null; } catch (e) { fail(e); } route(); };
    const r = $('#rst-file'); if (r) r.onchange = async () => { try { const b = JSON.parse(await r.files[0].text()); if (!b.hotel) throw new ApiError('backup_file'); rst = { backup: b, count: Object.values(b).filter(Array.isArray).reduce((a, x) => a + x.length, 0) }; } catch (e) { rst = null; fail(e instanceof ApiError ? e : new ApiError('backup_file')); } route(); };
  }
});
/* ---- import: every row goes through the same save function the forms use ---- */
let imp = { kind: null, rows: null, result: null }, rst = null;
const IMPORTS = {
  staff: { perm: 'm_staff', head: ['name', 'username', 'password', 'number', 'team', 'role', 'gender', 'nationality', 'phone', 'email'],
    example: () => ({ name: 'Sara Example', username: 'sara', password: '', number: '', team: S.team?.name || '', role: (S.roles.find(r => !r.is_manager) || {}).name || '', gender: 'female', nationality: '', phone: '', email: '' }) },
  programme: { perm: 'm_program', head: ['type', 'name', 'weekdays', 'start', 'end', 'location', 'description', 'capacity', 'booking', 'staff_needed', 'roles', 'team'],
    example: () => ({ type: 'activity', name: 'Aqua gym', weekdays: 'Mon,Wed,Fri', start: '10:00', end: '10:45', location: 'Main pool', description: '', capacity: '0', booking: 'no', staff_needed: '1', roles: (S.roles || []).find(r => r.key === 'sport')?.name || '', team: S.team?.name || '' }) },
  rooms: { perm: 'm_guests', head: ['room', 'info'], example: () => ({ room: 'H1234', info: 'Double · sea view' }) },
  stays: { perm: 'm_guests', head: ['room', 'name', 'arrival', 'departure', 'nationality', 'phone'], example: () => ({ room: '101', name: 'Anna Müller', arrival: D.today(), departure: D.add(D.today(), 7), nationality: '', phone: '' }) }
};
const yes = v => /^(1|y|yes|true|x|ja|oui|si|sí|da|evet|tak|ano|áno)$/i.test(String(v || '').trim());
function impCheck(kind, rows) {
  const low = v => String(v || '').trim().toLowerCase();
  const team = v => { if (!String(v || '').trim()) return { id: S.team?.id }; const x = S.teams.find(z => low(z.name) === low(v)); return x ? { id: x.id } : { err: t('err_team') }; };
  return rows.map((d, i) => {
    const out = { n: i + 2, data: d };
    try {
      if (kind === 'staff') {
        const role = S.roles.find(r => low(r.key) === low(d.role) || low(r.name) === low(d.role));
        const tm = team(d.team); const num = String(d.number || '').trim();
        if ((d.name || '').trim().length < 2) throw t('err_name');
        if (!/^[a-z0-9._-]{3,30}$/.test(low(d.username))) throw t('err_username');
        if (!role || (role.is_manager && !S.me.is_manager)) throw t('err_role');
        if (tm.err) throw tm.err;
        if (num && !(/^\d+$/.test(num) && +num >= 1 && +num <= 50)) throw t('err_number_range');
        if (d.password && d.password.length < 6) throw t('err_password_short');
        const g = low(d.gender); const gender = g.startsWith('m') ? 'male' : g.startsWith('f') || g.startsWith('w') ? 'female' : null;
        out.args = { p_row: { display_name: d.name.trim(), username: low(d.username), staff_number: num ? +num : null, team_id: tm.id, role_id: role.id, gender, nationality: d.nationality || null, phone: d.phone || null, email: d.email || null, status: 'active' }, p_password: d.password || Math.random().toString(36).slice(2, 10), p_skills: [], p_overrides: {} };
      } else if (kind === 'programme') {
        const ty = TYPES.find(x => low(x) === low(d.type) || low(typeLabel(x)) === low(d.type) || low(x.replace('_', ' ')) === low(d.type));
        if (!ty) throw t('err_type');
        const one = w => /^[1-7]$/.test(w) ? +w - 1 : [0, 1, 2, 3, 4, 5, 6].find(i => [D.wdName(i, 'long'), D.wdName(i, 'short'), ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'][i], ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'][i]].map(low).includes(w));
        const wl = low(d.weekdays || d.weekday);
        const wd = ['daily', 'every day', 'all', '*', low(t('every_day'))].includes(wl) ? [0, 1, 2, 3, 4, 5, 6] : uniq(wl.split(/[\s,;/+]+/).filter(Boolean).map(one));
        if (!wd.length || wd.some(x => x == null)) throw t('err_weekday');
        const tmv = s2 => { const m = String(s2 || '').trim().match(/^(\d{1,2})[:.](\d{2})/); return m && +m[1] < 24 && +m[2] < 60 ? String(m[1]).padStart(2, '0') + ':' + m[2] : null; };
        if (!tmv(d.start) || (d.end && !tmv(d.end))) throw t('err_time');
        if ((d.name || '').trim().length < 2) throw t('err_name');
        const tm = team(d.team); if (tm.err) throw tm.err;
        // the assignment rule: staff needed (0 = no assignment required) and the allowed roles by name or key ("DJ, Social Media")
        const roles = String(d.roles || '').split(/[,;/+]/).map(x => x.trim()).filter(Boolean).map(x => { const r = planRoles().find(z => z.key === x.toLowerCase() || z.name.toLowerCase() === x.toLowerCase()); if (!r) throw t('err_role_unknown', { role: x }); return r.id; });
        out.args = { p_row: { type: ty, name: d.name.trim(), weekdays: wd, start_time: tmv(d.start), end_time: d.end ? tmv(d.end) : null, location: d.location || null, description: d.description || null,
          capacity: +d.capacity || 0, booking_required: yes(d.booking), staff_needed: d.staff_needed === '' || d.staff_needed == null ? 1 : +d.staff_needed || 0, assign_roles: roles.length ? roles : null, team_id: tm.id, active: true } };
      } else if (kind === 'stays') {
        const dt = v => { const x = String(v || '').trim(); const m = x.match(/^(\d{4})-(\d{2})-(\d{2})$/) || x.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})$/); if (!m) return null; return m[1].length === 4 ? `${m[1]}-${m[2]}-${m[3]}` : `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`; };
        if (!String(d.room || '').trim()) throw t('err_room');
        if ((d.name || '').trim().length < 2) throw t('err_name');
        const a1 = dt(d.arrival), a2 = dt(d.departure); if (!a1 || !a2 || a2 < a1) throw t('err_dates');
        out.args = { p_entity: 'guest_stays', p_row: { room: String(d.room).trim(), name: d.name.trim(), arrival: a1, departure: a2, nationality: countryCode(d.nationality) || null, phone: d.phone || null } };
      } else {
        if (!String(d.room || '').trim()) throw t('err_room');
        out.args = { p_text: String(d.room).trim() };
      }
    } catch (e) { out.err = typeof e === 'string' ? e : errText(e); }
    return out;
  });
}
ACT.imp_kind = el => { imp = { kind: el.dataset.k, rows: null, result: null }; route(); };
/* ---- the hotel's room list from a file (PDF, Excel or CSV) → a preview to check before anything is saved ---- */
const ROOM_TOKEN = /^[A-Za-z]{0,3}[-.]?\d{1,5}[A-Za-z]?$/;            // H1234, 305A, B-12, 101 (rooms are not numbers only)
const roomNorm = r => String(r || '').trim().toUpperCase().replace(/\s+/g, '');
const roomKey = r => roomNorm(r).replace(/[^A-Z0-9]/g, '');
// PDF text lines → rooms: a line starting with (or holding one) room number is that room, the rest of the line is its information
function roomsFromLines(lines) {
  const out = [];
  for (const raw of lines) {
    const line = raw.replace(/\s+/g, ' ').trim(), toks = line.split(' ');
    if (/^(page|seite|pag\.?|página|страница|стр\.?)?\s*\d+\s*(of|von|\/|de|из)\s*\d+$/i.test(line)) continue;     // page numbers
    const rooms = toks.filter(x => ROOM_TOKEN.test(x)); if (!rooms.length) continue;                                  // headings, notes
    if (rooms.length === toks.length && toks.length > 1) { rooms.forEach(r => out.push({ room: r, info: '' })); continue; }   // a plain list of rooms
    const idx = ROOM_TOKEN.test(toks[0]) ? 0 : toks.findIndex(x => ROOM_TOKEN.test(x)), room = toks[idx], cells = raw.split('\t').map(c => c.trim()).filter(Boolean);
    out.push({ room, info: (cells.length > 1 && cells.includes(room) ? cells.filter(c => c !== room).join(' · ') : toks.filter((x, i) => i !== idx).join(' ')).slice(0, 120) });
  }
  return out;
}
async function roomsFile(file) {
  const pdf = /\.pdf$/i.test(file.name) || file.type === 'application/pdf';
  const raw = pdf ? roomsFromLines(await readPdfLines(file)) : (await readSheet(file)).flatMap(d => {
    const v = String(d.room ?? Object.values(d)[0] ?? '').trim(), info = String(d.info || d.type || d.description || '').trim(), m = v.match(/^(\d+)\s*-\s*(\d+)$/);
    return m && +m[2] >= +m[1] && +m[2] - +m[1] <= 500 ? Array.from({ length: +m[2] - +m[1] + 1 }, (_, k) => ({ room: String(+m[1] + k), info })) : [{ room: v, info }]; });
  if (!raw.length) throw new ApiError(pdf ? 'pdf_no_rooms' : 'imp_empty');
  imp.existing = new Map((await list('rooms', { _limit: 5000 })).map(r => [r.room_key, r]));
  return roomRows(raw.slice(0, 3000));
}
// every row: new / already there / conflict (other information) / invalid / twice in the file / left out
function roomRows(rows) {
  const seen = new Set();
  return rows.map(r => { const room = roomNorm(r.room), key = roomKey(room), info = String(r.info || '').trim().slice(0, 120), ex = imp.existing.get(key);
    const st = r.on === false ? 'off' : !key || !/\d/.test(room) || room.length > 12 || !/^[A-Z0-9][A-Z0-9./-]*$/.test(room) ? 'invalid' : seen.has(key) ? 'duplicate'
      : !ex ? 'new' : info && info !== (ex.info || '') ? 'conflict' : 'existing';
    if (['new', 'existing', 'conflict'].includes(st)) seen.add(key);
    if (st === 'conflict' && r.upd === undefined) r.upd = !ex.info;          // a room without information simply gets it; other information is only replaced when chosen
    return Object.assign(r, { room, info, st, ex }); });
}
function roomsPreview() {
  const rs = imp.rows, c = k => rs.filter(r => r.st === k).length, go = c('new') + rs.filter(r => r.st === 'conflict' && r.upd).length;
  const cls = { new: 'ok', existing: '', conflict: 'warn', invalid: 'bad', duplicate: 'bad', off: '' };
  return `<section class="card" id="rooms-prev"><h2>${esc(t('rooms_preview'))}</h2>
    <div class="stats"><span><b>${c('new')}</b>${esc(t('rms_new'))}</span><span><b>${c('existing')}</b>${esc(t('rms_existing'))}</span><span><b>${c('conflict')}</b>${esc(t('rms_conflict'))}</span><span><b>${c('invalid') + c('duplicate')}</b>${esc(t('rms_invalid'))}</span></div>
    <p class="muted small">${esc(t('rooms_preview_hint'))}</p>
    <div class="tablewrap"><table class="room-prev"><thead><tr><th></th><th>${esc(t('room'))}</th><th>${esc(t('room_info'))}</th><th>${esc(t('status'))}</th></tr></thead><tbody>
    ${rs.map((r, i) => `<tr class="rs-${r.st}"><td><input type="checkbox" data-rp="on" data-i="${i}" ${r.on === false ? '' : 'checked'} aria-label="${esc(t('import_row') + ' ' + r.room)}"></td>
      <td><input data-rp="room" data-i="${i}" value="${esc(r.room)}" aria-label="${esc(t('room'))}"></td><td><input data-rp="info" data-i="${i}" value="${esc(r.info)}" aria-label="${esc(t('room_info'))}"></td>
      <td>${chip(t('rms_' + r.st), cls[r.st])}${r.st === 'conflict' ? `<br><small class="muted">${esc(t('room_info_now', { info: r.ex.info || '—' }))}</small><br><label class="small"><input type="checkbox" data-rp="upd" data-i="${i}" ${r.upd ? 'checked' : ''}> ${esc(t('use_new_info'))}</label>` : ''}</td></tr>`).join('')}
    </tbody></table></div>
    <p class="row"><button class="btn" data-act="imp_go" ${go ? '' : 'disabled'}>${esc(t('rooms_import_go', { n: go }))}</button><span class="muted small">${esc(t('rooms_import_note'))}</span></p></section>`;
}
// corrections in the preview are checked again at once (and once more by the database when saving)
let rpRedraw = 0;
document.addEventListener('change', ev => { const el = ev.target.closest('[data-rp]'); if (!el || !imp.rows || !el.isConnected) return; const r = imp.rows[+el.dataset.i];
  if (el.dataset.rp === 'on') r.on = el.checked; else if (el.dataset.rp === 'upd') r.upd = el.checked; else r[el.dataset.rp] = el.value;
  roomRows(imp.rows);
  // redrawn once, after the event (a field that loses focus while being replaced fires its own change)
  clearTimeout(rpRedraw); rpRedraw = setTimeout(() => { const box = $('#rooms-prev'); if (box && box.isConnected) box.outerHTML = roomsPreview(); }, 0); });
ACT.imp_rooms = () => { imp = { kind: 'rooms', rows: null, result: null }; location.hash = '#/backup/import'; };
ACT.imp_template = () => download('aurea-' + imp.kind + '.csv', toCsv([IMPORTS[imp.kind].example()]), 'text/csv');
ACT.imp_go = async el => {
  el.disabled = true; const res = { ok: 0, bad: 0, passwords: [] };
  if (imp.kind === 'rooms') {               // the checked room list in one step: new rooms added, existing ones changed only where chosen
    const send = imp.rows.filter(r => ['new', 'existing', 'conflict'].includes(r.st)).map(r => ({ room: r.room, info: r.info, update: r.st === 'conflict' && !!r.upd }));
    try { imp.result = { rooms: await api('mgr_rooms_import', { p_rows: send }) }; toast(t('rooms_imported', imp.result.rooms)); } finally { el.disabled = false; }
    return route();
  }
  const fn = { staff: 'mgr_staff_save', programme: 'program_template_save', rooms: 'mgr_rooms_add', stays: 'data_save' }[imp.kind];
  for (const r of imp.rows.filter(x => !x.err && !x.done)) {
    el.textContent = `${res.ok + res.bad + 1} / ${imp.rows.length}`;
    try { await api(fn, r.args); r.done = true; res.ok++; if (imp.kind === 'staff' && !r.data.password) res.passwords.push({ username: r.args.p_row.username, password: r.args.p_password }); }
    catch (e) { r.err = errText(e); res.bad++; }
  }
  imp.result = res; toast(t('imp_done', res), res.bad ? 'warn' : 'ok'); route();
};
ACT.imp_pw = () => download('aurea-new-passwords.csv', toCsv(imp.result.passwords), 'text/csv');
ACT.rst_go = async () => {
  const c = ($('[name=rst_confirm]')?.value || '').trim();
  if (c !== S.hotel.name) return toast(t('err_confirm'), 'bad');
  if (!await confirmBox(t('rst_intro'), t('rst_go'))) return;
  await ACT.bk_json();                                   // safety copy of the current state first
  const j = await api('backup_restore', { p_backup: rst.backup, p_confirm: c });
  toast(t('rst_done', { n: j.records })); rst = null;
  await api('staff_context', { p_hotel_id: S.hotel.id, p_team_id: null }); await loadMe(); renderShell(); route();
};
ACT.bk_json = async () => { const j = await api('backup_export'); download(`aurea-backup-${(S.hotel.name || 'hotel').replace(/\W+/g, '-')}-${D.today()}.json`, JSON.stringify(j.backup, null, 1)); };
ACT.bk_xlsx = async () => {
  const j = await api('backup_export'); const sheets = {};
  for (const [k, v] of Object.entries(j.backup)) if (Array.isArray(v)) sheets[k] = v.map(r => { const o = {}; for (const [a, b] of Object.entries(r)) o[a] = b && typeof b === 'object' ? JSON.stringify(b) : b; return o; });
  await exportXlsx(`aurea-${(S.hotel.name || 'hotel')}-${D.today()}`, sheets);
};

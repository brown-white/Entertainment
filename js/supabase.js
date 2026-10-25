'use strict';
/* AUREA · supabase.js — the ONE database connection: every call is a checked database function (rpc); reads and saves of records,
   the error of a refusal in words, photos uploaded to storage. A staff session the database no longer knows is announced
   (aurea:session-ended) – app.js signs out.
   Uses: config · core/state · translations/languages */
/* ---------- API: every call is a checked database function ---------- */
class ApiError extends Error { constructor(code, info) { super(code); this.code = code; this.info = info || {}; } }
async function rpc(fn, args = {}) {
  let r;
  try {
    r = await fetch(`${CFG.url}/rest/v1/rpc/${fn}`, {
      method: 'POST',
      headers: { apikey: CFG.key, Authorization: 'Bearer ' + CFG.key, 'Content-Type': 'application/json' },
      body: JSON.stringify(args)
    });
  } catch { throw new ApiError('offline'); }
  if (!r.ok) {
    let msg = ''; try { msg = (await r.json()).message || ''; } catch { /* empty */ }
    throw new ApiError(r.status === 404 ? 'not_installed' : 'server', { msg });
  }
  const j = await r.json();
  if (j && j.ok === false) {
    if (j.error === 'signin' && S.token && fn !== 'staff_login' && S.mode === 'staff') document.dispatchEvent(new Event('aurea:session-ended'));
    throw new ApiError(j.error, j);
  }
  return j;
}
// Preview Staff App is read-only: while previewing, only these reading functions are called (anything else is refused here,
// before it is sent – a new function is a write until it is listed)
const READS = new Set(['data_list', 'day_board', 'team_members', 'chat_threads', 'chat_list', 'staff_inbox', 'staff_guests', 'search_all', 'stats',
  'planner_check', 'ticket_list', 'ticket_lookup', 'ticket_room_guests', 'ticket_sellers', 'roles_list', 'mgr_staff_list', 'mgr_used_numbers', 'mgr_hotels',
  'mgr_preview', 'staff_me']);
const api = (fn, args = {}) => {
  if (S.preview && !READS.has(fn)) return Promise.reject(new ApiError('preview'));
  return rpc(fn, Object.assign({ p_token: S.token }, args));
};
const list = async (entity, filter = {}) => (await api('data_list', { p_entity: entity, p_filter: filter })).rows;
const save = async (entity, row) => (await api('data_save', { p_entity: entity, p_row: row })).row;
const del = (entity, id, more = {}) => api('data_delete', Object.assign({ p_entity: entity, p_id: id }, more));
// several records at once (p_ids), every record a filter shows (p_filter), permanently (p_force); p_preview only counts
const delMany = (entity, more) => api('data_delete', Object.assign({ p_entity: entity }, more));

function errText(e) {
  const code = e?.code || e?.message || String(e);
  if (code === 'number_taken') return e.info.by ? t('err_number_taken', { name: e.info.by, hotel: e.info.hotel || '' }) : t('err_number_taken_other', { hotel: e.info.hotel || '' });
  if (code === 'forbidden' && (e.info?.need || []).length) return t('err_forbidden_perms', { list: e.info.need.map(k => t('perm_' + k)).join(', ') });
  if (code === 'full') return t('err_full', { n: e.info.left ?? 0 });
  if (code === 'prize_linked') return t('err_prize_linked', { codes: (e.info.prizes || []).map(p => p.code + ' → ' + p.prize).join(', ') });
  const raw = code + ' ' + (e?.info?.msg || '');   // a refusal raised by the database arrives as a server message: read its reason too
  if (/staff_other_hotel/.test(raw)) return t('err_staff_other_hotel');
  if (/staff_other_team/.test(raw)) return t('err_staff_other_team');
  if (/entrance_times/.test(raw)) return t('err_entrance_times');
  const key = 'err_' + code;
  // ticket refusals name the tickets concerned ("A 0005, A 0006")
  if (TR[key]) return t(key, Object.assign({}, e?.info || {}, { codes: (e?.info?.codes || e?.info?.numbers || []).join(', ') }));
  if (/other_hotel/.test(code)) return t('err_other_hotel');
  if (/duplicate key|unique/.test(raw)) return t('err_exists');
  return t('err_generic') + (code && code.length < 120 ? ' (' + code + ')' : '');
}

/* ---------- images: resized on the phone, uploaded with a short-lived ticket ---------- */
async function shrink(file, max = 1600) {
  const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = URL.createObjectURL(file); });
  const k = Math.min(1, max / Math.max(img.width, img.height));
  const c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  return new Promise(res => c.toBlob(res, 'image/jpeg', 0.82));
}
async function uploadImage(file) {
  if (!/^image\//.test(file.type)) throw new ApiError('image');
  const blob = await shrink(file);
  const { prefix } = await api('upload_ticket');
  const path = `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}.jpg`;
  const r = await fetch(`${CFG.url}/storage/v1/object/${CFG.bucket}/${path}`, {
    method: 'POST', body: blob,
    headers: { apikey: CFG.key, Authorization: 'Bearer ' + CFG.key, 'Content-Type': 'image/jpeg', 'x-upsert': 'false' }
  });
  if (!r.ok) throw new ApiError('upload');
  return `${CFG.url}/storage/v1/object/public/${CFG.bucket}/${path}`;
}

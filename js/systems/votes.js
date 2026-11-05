'use strict';
/* Mr Hassan · systems/votes.js — THE Voting system on the screen: a vote's question and choices in the reader's language, its state, its results
   (each choice with its count and %, the sources), and the ONE way to collect a vote that the entertainer and the reception
   touch screen share: room (the hotel's rooms as you type) → nationality (the entertainer confirms the guest stay's; the
   reception screen asks) → the answer → Submit. The guest app only asks for the answer: the guest is signed in, their stay
   says the rest. The database matches the room's current guest stay, so nobody votes twice. And the vote's DISPLAY SCREEN (its own
   window): the question, the choices, where it stands and the results – only when everyone may see them.
   Uses: core/state · translations/languages · supabase · core/utils · icons/icons · core/permissions · components/modals ·
         core/actions · components/cards · components/display */
const VOTE_SOURCES = ['guest_app', 'entertainer', 'reception'];
const voteQ = v => (v.question_i18n || {})[S.lang] || v.question;
const choiceLabel = c => (c.i18n || {})[S.lang] || c.label;
const voteState = v => chip(t('vst_' + v.state), { open: 'ok', scheduled: 'warn', draft: 'warn' }[v.state] || '');
const flagOf = c => (/^[A-Z]{2}$/.test(c || '') ? String.fromCodePoint(...[...c].map(x => 0x1f1e6 + x.charCodeAt(0) - 65)) : '');
const natName = c => (c && c !== '-' ? `${flagOf(c)} ${countryName(c)}`.trim() : t('vt_no_nationality'));
const pctTxt = p => (Math.round((+p || 0) * 10) / 10).toLocaleString(locale());
// the results: each choice – its votes and % (a bar), the total
function voteBars(v, counts, big) {
  const x = id => (counts?.choices || []).find(y => y.id === id) || { n: 0, pct: 0 };
  return `<ol class="vt-bars ${big ? 'big' : ''}">${v.choices.map(c => `<li><span class="vt-l"><b>${esc(choiceLabel(c))}</b><small>${esc(t(+x(c.id).n === 1 ? 'vt_vote1_pct' : 'vt_votes_pct', { n: x(c.id).n, pct: pctTxt(x(c.id).pct) }))}</small></span>
    <span class="vt-bar" aria-hidden="true"><i style="width:${Math.max(0, Math.min(100, +x(c.id).pct || 0))}%"></i></span></li>`).join('')}</ol>
    <p class="vt-total">${esc(t('vt_total', { n: counts?.total || 0 }))}</p>`;
}
const voteSources = counts => `<div class="vt-src">${VOTE_SOURCES.map(s => `<span><small>${esc(t('vsrc_' + s))}</small><b>${counts?.sources?.[s] || 0}</b></span>`).join('')}</div>`;
// everyone may see the results now (the guest app, the display screens) – by the vote's Results setting, whoever looks
const votePublic = v => v.visibility === 'live' || (v.visibility === 'closed' && ['ended', 'closed', 'archived'].includes(v.state));
// when a vote is open: from … to …
const voteWhen = v => [v.starts_at ? t('vt_from', { t: D.stamp(v.starts_at) }) : '', v.ends_at ? t('vt_until', { t: D.stamp(v.ends_at) }) : ''].filter(Boolean).join(' · ');

/* ---------- COLLECTING a vote (the entertainer, the reception touch screen): room → nationality → answer → Submit ---------- */
let VC = null;   // { v, source, step: room · nat · choice · done, room, rooms, stays, stay, nat, choice, msg }
// the nationalities of the app's languages first (one tap on the touch screen), every other one in the list
const VC_NATS = ['GB', 'DE', 'RU', 'PL', 'CZ', 'NL', 'FR', 'IT', 'RO', 'TR', 'SK', 'RS', 'UA', 'CN', 'IN', 'EG'];
function vcStart(v, source) { VC = { v, source, step: 'room', room: '', rooms: [], stays: [], stay: null, nat: '', choice: null, msg: '' }; return VC; }
const vcBig = () => VC?.source === 'reception';
function vcHtml() {
  const c = VC, v = c.v, steps = ['room', 'nat', 'choice'], at = steps.indexOf(c.step);
  const head = `<ol class="vc-steps">${steps.map((s, i) => `<li class="${i < at || c.step === 'done' ? 'done' : i === at ? 'on' : ''}">${i + 1}. ${esc(t('vc_' + s))}</li>`).join('')}</ol>`;
  let body = '';
  if (c.step === 'room') {
    const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'del', '0', 'ok'];
    body = `<label class="vc-room"><span>${esc(t('vc_room_q'))}</span><input id="vc-room" value="${esc(c.room)}" inputmode="${vcBig() ? 'none' : 'text'}" autocomplete="off" aria-label="${esc(t('room'))}" maxlength="10"></label>
      <div class="vc-rooms" aria-live="polite">${c.rooms.map(r => `<button class="pickchip ${r.room === c.room ? 'on' : ''}" data-act="vc_pick" data-r="${esc(r.room)}">${esc(r.room)}${r.stays.some(s => s.voted) && v.once ? ' ✓' : ''}</button>`).join('')}</div>
      ${c.msg ? `<p class="hint-box warn" role="alert">${ico('info')}<span>${esc(c.msg)}</span></p>` : ''}
      <div class="vc-keys">${keys.map(k => `<button class="btn ${k === 'ok' ? '' : 'ghost'}" data-act="vc_key" data-k="${k}" ${k === 'ok' && !c.room ? 'disabled' : ''} aria-label="${esc(k === 'del' ? t('vc_delete_digit') : k === 'ok' ? t('next') : k)}">${k === 'del' ? ico('undo') : k === 'ok' ? esc(t('next')) : k}</button>`).join('')}</div>`;
  } else if (c.step === 'nat') {
    const st = c.stays.length > 1 && !vcBig() ? `<div class="vc-stays"><p class="muted">${esc(t('vc_which_stay'))}</p>${c.stays.map(s => `<button class="pickchip ${c.stay === s.id ? 'on' : ''}" data-act="vc_stay" data-id="${s.id}">${esc(t('vc_stay_dates', { a: D.short(s.arrival), b: D.short(s.departure) }))}${s.nationality ? ' · ' + esc(flagOf(s.nationality)) : ''}${s.voted ? ' ✓' : ''}</button>`).join('')}</div>` : '';
    const known = !vcBig() && c.stays.find(s => s.id === c.stay)?.nationality;
    body = `<p class="vc-for">${esc(t('room'))} <b>${esc(c.room)}</b></p>${st}
      ${known ? `<p class="vc-known">${esc(t('vc_nat_from_stay'))}: <b>${esc(natName(known))}</b></p>` : ''}
      <div class="vc-nats">${uniq((known ? [known] : []).concat(VC_NATS)).map(n => `<button class="pickchip ${c.nat === n ? 'on' : ''}" data-act="vc_nat" data-n="${n}">${esc(natName(n))}</button>`).join('')}</div>
      <label class="field"><span>${esc(t('vc_other_nat'))}</span><select data-act-change="vc_nat_sel"><option value="">${esc(t('choose_country'))}</option>${countryOpts().map(([k, l]) => `<option value="${k}" ${c.nat === k ? 'selected' : ''}>${esc(flagOf(k) + ' ' + l)}</option>`).join('')}</select></label>
      <div class="vc-go"><button class="btn ghost" data-act="vc_back">${esc(t('back'))}</button><button class="btn ghost" data-act="vc_nat" data-n="-">${esc(t('vc_skip_nat'))}</button>
        <button class="btn big" data-act="vc_next" ${c.nat ? '' : 'disabled'}>${esc(t('next'))}</button></div>`;
  } else if (c.step === 'choice') {
    body = `<p class="vc-for">${esc(t('room'))} <b>${esc(c.room)}</b>${c.nat && c.nat !== '-' ? ' · ' + esc(natName(c.nat)) : ''}</p><h2 class="vc-q">${esc(voteQ(v))}</h2>
      <div class="vc-choices">${v.choices.map(x => `<button class="vc-choice ${c.choice === x.id ? 'on' : ''}" data-act="vc_choice" data-c="${esc(x.id)}" aria-pressed="${c.choice === x.id}">${esc(choiceLabel(x))}</button>`).join('')}</div>
      <div class="vc-go"><button class="btn ghost" data-act="vc_back">${esc(t('back'))}</button><button class="btn big" data-act="vc_submit" ${c.choice ? '' : 'disabled'}>${ico('check')} ${esc(t('vc_submit'))}</button></div>`;
  } else {
    body = `<div class="vc-done" role="status">${ico('check')}<h2>${esc(t('vc_thanks'))}</h2><p>${esc(t('vc_counted'))}</p></div>
      ${c.counts ? voteBars(v, c.counts, vcBig()) : ''}<button class="btn big wide" data-act="vc_again">${esc(t(vcBig() ? 'vc_next_guest' : 'vc_collect_next'))}</button>`;
  }
  return `<div class="vc ${vcBig() ? 'vc-big' : ''}">${head}${body}</div>`;
}
const vcDraw = () => { const box = $('#vc'); if (!box || !VC) return; box.innerHTML = vcBig() ? displayFrame(vcHtml(), themeOf(VC.v.theme, 'votes'), voteQ(VC.v)) : vcHtml(); vcWire(); };
// typing a room shows the hotel's rooms that start with it (and whether its guest has voted)
let vcSeq = 0;
async function vcRooms() {
  const c = VC, q = c.room, seq = ++vcSeq;
  if (!q) { c.rooms = []; return; }
  try { const j = await api('vote_room', { p_id: c.v.id, p_q: q, p_source: c.source }); if (seq === vcSeq && VC === c) c.rooms = j.rooms; } catch (e) { if (seq === vcSeq) fail(e); }
}
function vcWire() {
  const inp = $('#vc-room'); if (!inp) return;
  inp.oninput = async () => { VC.room = inp.value.trim().toUpperCase(); VC.msg = ''; await vcRooms(); const pos = inp.selectionStart; vcDraw(); const i2 = $('#vc-room'); if (i2) { i2.focus(); i2.setSelectionRange(pos, pos); } };
  inp.onkeydown = ev => { if (ev.key === 'Enter') { ev.preventDefault(); ACT.vc_key({ dataset: { k: 'ok' } }); } };
  if (!vcBig()) inp.focus();
}
// a room chosen: its current guest stay (several: the newest; the entertainer may pick), refused at once when it has voted already
async function vcRoom(room) {
  const c = VC; c.room = room; await vcRooms();
  const r = c.rooms.find(x => x.room === room);
  if (!r && !can('room_manual')) { c.msg = t('err_room'); return vcDraw(); }
  c.stays = r ? r.stays : []; const s0 = c.stays[0];
  if (c.v.once && s0 && s0.voted && c.stays.length === 1) { c.msg = t('err_vote_already'); return vcDraw(); }
  c.stay = s0?.id || null; c.nat = vcBig() ? '' : s0?.nationality || ''; c.step = 'nat'; c.msg = ''; vcDraw();
}
ACT.vc_key = el => { const c = VC, k = el.dataset.k; if (!c) return;
  if (k === 'ok') { if (c.room) vcRoom(c.room); return; }
  c.room = k === 'del' ? c.room.slice(0, -1) : (c.room + k).slice(0, 10); c.msg = ''; vcRooms().then(vcDraw); vcDraw(); };
ACT.vc_pick = el => vcRoom(el.dataset.r);
ACT.vc_stay = el => { const s = VC.stays.find(x => x.id === +el.dataset.id); VC.stay = s.id; VC.nat = s.nationality || VC.nat; vcDraw(); };
ACT.vc_nat = el => { VC.nat = el.dataset.n; if (el.dataset.n === '-') VC.step = 'choice'; vcDraw(); };
ACT.vc_nat_sel = el => { VC.nat = el.value; vcDraw(); };
ACT.vc_next = () => { if (VC.nat) { VC.step = 'choice'; vcDraw(); } };
ACT.vc_back = () => { VC.step = VC.step === 'choice' ? 'nat' : 'room'; vcDraw(); };
ACT.vc_choice = el => { VC.choice = el.dataset.c; vcDraw(); };
ACT.vc_submit = async () => {
  const c = VC; if (!c.choice) return;
  try {
    const j = await api('vote_collect', { p_id: c.v.id, p_row: { source: c.source, room: c.room, stay_id: c.stay, nationality: c.nat === '-' ? null : c.nat, choice: c.choice } });
    displayPing('vote:' + c.v.id);
    // the guest at the reception screen sees the results only when everyone may (the person signed in may be the manager)
    c.counts = j.vote?.results_ok && (!vcBig() || votePublic(j.vote)) ? j.vote.counts : null; c.step = 'done'; vcDraw();
    if (vcBig()) setTimeout(() => { if (VC === c && c.step === 'done') ACT.vc_again(); }, 6000);
  } catch (e) {
    if (['vote_already', 'vote_closed'].includes(e.code)) { c.step = 'room'; c.msg = errText(e); c.choice = null; vcDraw(); } else throw e;
  }
};
ACT.vc_again = () => { if (VC) { vcStart(VC.v, VC.source); vcDraw(); } };

/* ---------- the DISPLAY SCREEN of a vote (its own window, components/display): the question, the choices, where the vote stands and –
   only when everyone may see them (its Results setting, never because a manager opened the screen) – the results as they come in.
   It reads the vote again every 3 seconds, at once when this computer's control screen changes it ---------- */
let VD = null;   // what the display shows: { id, sig }
async function votePull(id) {
  const [j] = await Promise.all([api('vote_results', { p_id: id, p_filter: { display: true } }), displayThemesLoad().catch(() => [])]);
  const sig = JSON.stringify([j.vote.updated_at, j.vote.state, j.vote.visibility, j.vote.theme, j.counts]);
  if (VD && VD.id === id && VD.sig === sig && $('#ds .dm')) return;
  VD = { id, sig };
  $('#ds').innerHTML = displayFrame(voteScreen(j.vote, j.counts), themeOf(j.vote.theme, 'votes'), '');
}
function voteScreen(v, counts) {
  return `<div class="dm-vote"><h2 class="dm-q">${esc(voteQ(v))}</h2><p class="dm-stage" role="status">${esc(t('vst_' + v.state))}</p>
    ${counts ? voteBars(v, counts, true) : `<ul class="dm-choices">${v.choices.map(c => `<li>${esc(choiceLabel(c))}</li>`).join('')}</ul>
      ${v.visibility === 'closed' && !['ended', 'closed', 'archived'].includes(v.state) ? `<p class="dm-count">${esc(t('vote_results_later_closed'))}</p>` : ''}`}</div>`;
}

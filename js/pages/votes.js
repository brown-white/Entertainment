'use strict';
/* Mr Hassan · pages/votes.js — staff pages of THE Voting system: Votes (the open votes – collect a guest's vote, start the reception screen;
   for the manager also the drafts, create, edit, open, close), the Vote history (closed and archived votes: results, delete),
   and one vote (#/vote/<id>: its results, the sources, the analytics with filters, export, its display screen, Show / Hide results;
   #/vote/<id>/collect: the entertainer's room → nationality → answer; in their own windows: #/vote/<id>/display the results
   screen for a TV, #/vote/<id>/reception the reception touch screen).
   Uses: core/state · translations/languages · supabase · core/utils · icons/icons · core/permissions · components/modals ·
         core/actions · components/cards · core/router · components/forms · components/tables · components/display ·
         systems/exports · systems/votes */
const VOTES_PERM = 'votes_collect,votes_reception,votes_results,votes_manage,votes_delete';
page('votes', {
  perm: VOTES_PERM, icon: 'vote', group: 'guests',
  render: async arg => {
    const hist = arg === 'history' && can('votes_results,votes_manage,votes_delete');
    const tb = can('votes_results,votes_manage,votes_delete') ? tabs('votes', [['open', t('votes_open')], ['history', t('vote_history')]], hist ? 'history' : 'open') : '';
    const rows = (await api('vote_list', { p_filter: { history: hist } })).rows;
    if (hist) return tb + votesHistory(rows);
    return tb + `<p class="muted">${esc(t(can('votes_manage') ? 'votes_intro_manager' : 'votes_intro'))}</p>${pgActions(can('votes_manage') ? `<button class="btn" data-act="vt_new">${ico('plus')} ${esc(t('vote_new'))}</button>` : '')}
      ${rows.length ? rows.map(voteCard).join('') : empty(t('no_votes_open'))}`;
  }
});
// one vote in the list: its question, state, when, where it may be answered, the results it may show, the buttons this person needs
function voteCard(v) {
  const open = v.state === 'open', res = v.results_ok && v.counts?.choices;
  const b = [];
  if (open && can('votes_collect') && v.sources.includes('entertainer')) b.push(`<a class="btn" href="#/vote/${v.id}/collect">${ico('edit')} ${esc(t('vote_collect'))}</a>`);
  if (open && can('votes_reception') && v.sources.includes('reception')) b.push(`<button class="btn secondary" data-act="ds_open" data-path="vote/${v.id}/reception">${ico('screen')} ${esc(t('vote_reception'))}</button>`);
  if (can('votes_results,votes_manage') || res) b.push(`<a class="btn secondary" href="#/vote/${v.id}">${ico('gauge')} ${esc(t('vote_results'))}</a>`);
  if (can('votes_results,votes_manage')) b.push(displayLink('vote:' + v.id, 'vote/' + v.id + '/display'));
  if (can('votes_manage')) {
    b.push(`<button class="btn secondary" data-act="vt_edit" data-id="${v.id}">${ico('edit')} ${esc(t('edit'))}</button>`);
    if (['draft', 'closed', 'archived'].includes(v.status)) b.push(`<button class="btn secondary" data-act="vt_open" data-id="${v.id}">${ico('play')} ${esc(t('vote_open_now'))}</button>`);
    if (v.status === 'open') b.push(`<button class="btn secondary" data-act="vt_close" data-id="${v.id}">${ico('flag')} ${esc(t('vote_close'))}</button>`);
  }
  return `<article class="card vt-card"><header><div class="grow"><h3>${esc(voteQ(v))}</h3><small class="muted">${esc([voteWhen(v), v.sources.map(s => t('vsrc_' + s)).join(' · '), t(v.once ? 'vote_once' : 'vote_many')].filter(Boolean).join(' · '))}</small></div>${voteState(v)}</header>
    ${res ? voteBars(v, v.counts) : `<p class="muted small">${esc(t('vt_total', { n: v.counts?.total || 0 }))}${v.results_ok ? '' : ' · ' + esc(t('vote_results_later_' + v.visibility))}</p>`}
    ${b.length ? `<div class="gm-btns">${b.join('')}</div>` : ''}</article>`;
}
// the Vote history: the closed and archived votes – open their results, select, delete (it is the votes themselves: no second history)
function votesHistory(rows) {
  const dl = can('votes_delete');
  return `${dl && rows.length ? selHead('vh', rows.map(v => v.id), `<button class="btn secondary small danger" data-act="vh_del" data-sel-need ${sel('vh').size ? '' : 'disabled'}>${ico('trash')} ${esc(t('delete_selected'))}</button>`) : ''}
    ${rows.length ? `<div class="list">${rows.map(v => `<div class="li ${dl ? 'sel-li' : ''}">${dl ? selBox('vh', v.id, voteQ(v)) : ''}<a class="grow" href="#/vote/${v.id}"><span class="gr-top"><b>${esc(voteQ(v))}</b>${voteState(v)}</span>
      <small class="muted">${esc([D.stamp(v.closed_at || v.updated_at), t('vt_total', { n: v.counts?.total || 0 })].join(' · '))}</small></a></div>`).join('')}</div>` : empty(t('no_votes_history'))}`;
}
ACT.vh_del = async () => { const ids = selIds('vh'); if (ids.length && await voteDelete(ids)) { sel('vh').clear(); route(); } };
// delete votes: an open one only on purpose ("Vote is open. Delete permanently?"), with its responses; it stays deleted
async function voteDelete(ids) {
  const more = ids.length === 1 ? { p_id: ids[0] } : { p_ids: ids };
  const pv = await delMany('votes', Object.assign({ p_preview: true }, more));
  if (!pv.n) { toast(t('nothing_found'), 'bad'); return false; }
  if (pv.n > 1 && !can('bulk_delete')) { toast(t('err_bulk_needed'), 'bad'); return false; }
  const ok = pv.n === 1 && pv.used ? await choiceBox(t('please_confirm'), `<p>${esc(t('vote_open_delete_q'))}</p>`, [{ k: 'del', label: t('delete'), cls: 'danger' }]) === 'del'
    : !!await delAsk({ title: t('vote_delete_q', { n: pv.n }), n: pv.n, text: t('vote_delete_text') });
  if (!ok) return false;
  const j = await delMany('votes', Object.assign({ p_force: pv.used > 0 }, more));
  toast(t('deleted_n', { n: j.deleted })); return true;
}

/* ---------- create / edit a vote ("Manage votes"): question (and translations), choices, start and end, where it may be answered,
   one vote per guest stay or several, who sees the results, its display theme ---------- */
const voteFields = () => [{ k: 'question', label: t('vote_question'), req: true, ph: t('vote_question_ph') }, { k: 'question_i18n', type: 'i18n', label: t('translations') },
  { k: 'choices', type: 'rows', label: t('vote_choices'), hint: t('vote_choices_hint'), min: 2, req: true, addLabel: t('vote_add_choice'), cols: [{ k: 'label', label: t('vote_choice'), max_len: 80 }, { k: 'i18n', type: 'i18n' }] },
  { type: 'section', label: t('vote_when'), hint: t('vote_when_hint') },
  { k: 'start_d', type: 'date', label: t('vote_start_date') }, { k: 'start_t', type: 'time', label: t('vote_start_time') },
  { k: 'end_d', type: 'date', label: t('vote_end_date') }, { k: 'end_t', type: 'time', label: t('vote_end_time') },
  { type: 'section', label: t('vote_rules') },
  { k: 'sources', type: 'multi', label: t('vote_sources'), options: VOTE_SOURCES.map(s => [s, t('vsrc_' + s)]) },
  { k: 'once', type: 'choice', label: t('vote_duplicates'), options: [['1', t('vote_once')], ['0', t('vote_many')]] },
  { k: 'visibility', type: 'choice', label: t('vote_visibility'), options: [['live', t('vote_vis_live')], ['closed', t('vote_vis_closed')], ['manager', t('vote_vis_manager')]] },
  { k: 'theme', type: 'select', label: t('display_theme'), options: [['', t('theme_default_for', { name: themeOf(null, 'votes').name })]].concat(themeChoices()) }];
async function voteEditor(v) {
  await displayThemesLoad().catch(() => []);
  const sp = x => (x ? x.split('T') : ['', '']), [sd, st] = sp(v?.starts_local), [ed, et] = sp(v?.ends_local);
  const row = { question: v?.question || '', question_i18n: v?.question_i18n || {}, choices: v?.choices || [{}, {}, {}], start_d: sd, start_t: st, end_d: ed, end_t: et,
    sources: v?.sources || VOTE_SOURCES, once: v ? (v.once ? '1' : '0') : '1', visibility: v?.visibility || 'closed', theme: v?.theme || '' };
  const fields = voteFields().concat(v ? [] : [{ k: 'open_now', type: 'bool', label: t('vote_open_at_once') }]);
  editForm(v ? t('vote_edit') : t('vote_new'), fields, row, async r => {
    if (!(r.sources || []).length) throw new ApiError('vote_sources');
    const at = (d, tm) => (d ? d + 'T' + (tm || '00:00') : null);
    const p = { question: r.question, question_i18n: r.question_i18n, choices: r.choices.map(c => ({ id: c.id, label: c.label, i18n: c.i18n })), starts_at: at(r.start_d, r.start_t),
      ends_at: at(r.end_d, r.end_t || '23:59'), sources: r.sources, once: r.once !== '0', visibility: r.visibility || 'closed', theme: r.theme || null };
    if (r.open_now) p.status = 'open';
    const j = await api('vote_save', { p_id: v?.id || null, p_row: p }); displayPing('vote:' + j.row.id); route();
  }, Object.assign({ wide: true }, v && can('votes_delete') ? { danger: () => voteDelete([v.id]).then(okd => { if (okd) { closeModals(); location.hash = '#/votes'; } return false; }), dangerNoAsk: true } : {}));
}
ACT.vt_new = () => voteEditor(null);
ACT.vt_edit = async el => { const v = await voteGet(+el.dataset.id); if (v) voteEditor(v); };
// a vote as it is now (the manager reads it with its results)
const voteGet = async id => (await api('vote_results', { p_id: id, p_filter: {} }).catch(() => null))?.vote || (await api('vote_list', { p_filter: {} })).rows.find(x => x.id === id);
// (every change of a vote: its display windows on this computer read it again at once)
const vtStatus = async (id, st, msg) => { await api('vote_status', { p_id: id, p_status: st }); displayPing('vote:' + id); toast(msg); route(); };
ACT.vt_open = el => vtStatus(+el.dataset.id, 'open', t('vote_opened'));
ACT.vt_close = async el => { if (await confirmBox(t('vote_close_q'), t('vote_close'))) await vtStatus(+el.dataset.id, 'closed', t('vote_closed_msg')); };
ACT.vt_archive = el => vtStatus(+el.dataset.id, 'archived', t('saved'));
ACT.vt_reset = async el => {
  if (!await delAsk({ title: t('vote_reset_q'), n: +el.dataset.n || 1, text: t('vote_reset_text') })) return;
  const j = await api('vote_reset', { p_id: +el.dataset.id }); displayPing('vote:' + el.dataset.id); toast(t('deleted_n', { n: j.deleted })); route();
};
/* Show results / Hide results – on the display screens and in the guest app: the vote's Results setting. Shown: live; hidden: after the
   vote closes (while it runs), the management only (once it has closed) */
ACT.vt_vis = async el => {
  const id = +el.dataset.id, show = el.dataset.show === '1', vis = show ? 'live' : ['ended', 'closed', 'archived'].includes(el.dataset.state) ? 'manager' : 'closed';
  await api('vote_save', { p_id: id, p_row: { visibility: vis } }); displayPing('vote:' + id); toast(t(show ? 'vote_results_shown' : 'vote_results_hidden_now')); route();
};

/* ---------- one vote: #/vote/<id> the results and analytics · /collect the entertainer · /reception the touch screen ---------- */
let vrF = {};   // the analytics filter of the vote shown
page('vote', {
  perm: VOTES_PERM, hidden: true, title: 'pg_votes', parent: 'votes',
  render: async arg => {
    const [a, b] = String(arg || '').split('/'), id = +a;
    if (b === 'display') return displayShell('', t('display_reconnecting'));      // it reads the vote itself (systems/votes: votePull)
    if (b === 'collect' || b === 'reception') {
      const v = (await api('vote_list', { p_filter: {} })).rows.find(x => x.id === id);
      // (the reception screen says it in its own frame – it is a window of its own, with its Close button)
      const no = k => (b === 'reception' ? displayShell(displayFrame(`<p class="dm-gone">${esc(t(k))}</p>`, themeOf(v?.theme, 'votes'), '')) : empty(t(k), `<a class="btn" href="#/votes">${esc(t('back'))}</a>`));
      if (!v || v.state !== 'open') return no('err_vote_closed');
      if (!v.sources.includes(b === 'collect' ? 'entertainer' : 'reception') || !can(b === 'collect' ? 'votes_collect' : 'votes_reception')) return no('err_vote_source');
      await displayThemesLoad().catch(() => []);
      vcStart(v, b === 'collect' ? 'entertainer' : 'reception');
      return b === 'reception' ? displayShell(`<div id="vc" class="vc-host">${displayFrame(vcHtml(), themeOf(v.theme, 'votes'), voteQ(v))}</div>`) : `<div id="vc" class="vc-host"><h2>${esc(voteQ(v))}</h2>${vcHtml()}</div>`;
    }
    if (vrF.id !== id) vrF = { id };
    const j = await api('vote_results', { p_id: id, p_filter: vrF });
    return voteResultsHtml(j);
  },
  mount: (root, arg) => {
    const [a, b] = String(arg || '').split('/');
    if (b === 'display') return displayStart({ key: 'vote:' + a, back: 'vote/' + a, every: 3000, pull: () => votePull(+a) });
    if (b === 'reception') displayStart({ key: 'reception:' + a, back: 'votes', ask: $('#vc') ? t('vote_reception_leave_q') : '', touch: true });
    if ((b === 'collect' || b === 'reception') && VC && $('#vc')) vcWire();
    if (!b) displayAsk('vote:' + a);
  }
});
function voteResultsHtml(j) {
  const v = j.vote, c = j.counts, full = !!j.rows, f = vrF;
  const sel1 = (k, label, options) => `<label class="field"><span>${esc(label)}</span><select name="${k}" data-act-change="vr_f"><option value="">${esc(t('all'))}</option>${options.map(([x, l]) => `<option value="${esc(x)}" ${String(f[k] ?? '') === String(x) ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></label>`;
  const filters = full ? `<details class="card vr-filter" ${Object.keys(f).some(k => k !== 'id' && f[k]) ? 'open' : ''}><summary>${ico('sliders')} ${esc(t('vote_analytics'))}</summary><div class="gh-filter">
      ${sel1('choice', t('vote_choice'), v.choices.map(x => [x.id, choiceLabel(x)]))}
      ${sel1('nationality', t('nationality'), (j.nationalities || []).map(n => [n.nationality, natName(n.nationality)]))}
      ${sel1('source', t('vote_source'), VOTE_SOURCES.map(s => [s, t('vsrc_' + s)]))}
      ${sel1('staff_id', t('vote_collected_by'), (j.staff || []).map(s => [s.staff_id, s.name]))}
      <label class="field"><span>${esc(t('room'))}</span><input name="room" value="${esc(f.room || '')}" data-act-change="vr_f"></label>
      <label class="field"><span>${esc(t('date_from'))}</span><input type="date" name="date_from" value="${esc(f.date_from || '')}" data-act-change="vr_f"></label>
      <label class="field"><span>${esc(t('date_to'))}</span><input type="date" name="date_to" value="${esc(f.date_to || '')}" data-act-change="vr_f"></label>
      <label class="field"><span>${esc(t('time_from'))}</span><input type="time" name="time_from" value="${esc(f.time_from || '')}" data-act-change="vr_f"></label>
      <label class="field"><span>${esc(t('time_to'))}</span><input type="time" name="time_to" value="${esc(f.time_to || '')}" data-act-change="vr_f"></label></div>
      <p class="row"><span class="muted grow small">${esc(S.hotel?.name || '')}</span><button class="btn secondary small" data-act="vr_clear">${esc(t('clear'))}</button></p></details>` : '';
  const natTable = full && (j.nationalities || []).length ? `<section class="card"><h3>${esc(t('vote_by_nationality'))}</h3><div class="tablewrap"><table class="vr-nat"><thead><tr><th>${esc(t('nationality'))}</th><th>${esc(t('vt_votes'))}</th>${v.choices.map(x => `<th>${esc(choiceLabel(x))}</th>`).join('')}</tr></thead>
    <tbody>${j.nationalities.map(n => `<tr><th>${esc(natName(n.nationality))}</th><td>${n.n}</td>${v.choices.map(x => `<td>${(n.choices || {})[x.id] || 0}</td>`).join('')}</tr>`).join('')}</tbody></table></div></section>` : '';
  const staff = full && (j.staff || []).length ? `<section class="card"><h3>${esc(t('vote_by_staff'))}</h3><ul class="vr-staff">${j.staff.map(s => `<li><b>${esc(s.name || '–')}</b><span>${s.n}</span></li>`).join('')}</ul></section>` : '';
  const hours = full && (j.hours || []).length ? `<section class="card"><h3>${esc(t('vote_by_time'))}</h3><ul class="vr-staff">${j.days.map(d => `<li><b>${esc(D.short(d.date))}</b><span>${d.n}</span></li>`).join('')}${j.hours.map(h => `<li><b>${String(h.hour).padStart(2, '0')}:00</b><span>${h.n}</span></li>`).join('')}</ul></section>` : '';
  const rows = full && j.rows.length ? `<section class="card"><h3>${esc(t('vote_responses'))}</h3><div class="tablewrap"><table class="vr-rows"><thead><tr><th>${esc(t('date'))}</th><th>${esc(t('vote_choice'))}</th><th>${esc(t('vote_source'))}</th><th>${esc(t('room'))}</th><th>${esc(t('nationality'))}</th><th>${esc(t('vote_collected_by'))}</th></tr></thead>
    <tbody>${j.rows.slice().reverse().slice(0, 300).map(r => `<tr><td>${esc(D.short(r.date) + ' ' + r.time)}</td><td>${esc(choiceLabel(v.choices.find(x => x.id === r.choice) || { label: r.choice }))}</td><td>${esc(t('vsrc_' + r.source))}</td><td>${esc(r.room || '–')}</td><td>${esc(natName(r.nationality))}</td><td>${esc(r.staff_name || '–')}</td></tr>`).join('')}</tbody></table></div></section>` : '';
  const m = can('votes_manage'), b = [];
  if (m) b.push(`<button class="btn secondary" data-act="vt_edit" data-id="${v.id}">${ico('edit')} ${esc(t('edit'))}</button>`);
  if (m && v.status !== 'open') b.push(`<button class="btn secondary" data-act="vt_open" data-id="${v.id}">${ico('play')} ${esc(t('vote_open_now'))}</button>`);
  if (m && v.status === 'open') b.push(`<button class="btn secondary" data-act="vt_close" data-id="${v.id}">${ico('flag')} ${esc(t('vote_close'))}</button>`);
  if (m && v.status === 'closed') b.push(`<button class="btn secondary" data-act="vt_archive" data-id="${v.id}">${ico('download')} ${esc(t('vote_archive'))}</button>`);
  if (m) b.push(`<button class="btn secondary" data-act="vt_vis" data-id="${v.id}" data-state="${esc(v.state)}" data-show="${votePublic(v) ? '0' : '1'}">${ico(votePublic(v) ? 'x' : 'gauge')} ${esc(t(votePublic(v) ? 'vote_results_hide' : 'vote_results_show'))}</button>`);
  if (can('votes_results,votes_manage')) b.push(displayLink('vote:' + v.id, 'vote/' + v.id + '/display'));
  if (full) b.push(`<button class="btn secondary" data-act="vr_xlsx">${ico('download')} ${esc(t('excel'))}</button>`);
  if (m) b.push(`<button class="btn secondary danger" data-act="vt_reset" data-id="${v.id}" data-n="${c.total}" ${c.total ? '' : 'disabled'}>${ico('repeat')} ${esc(t('vote_reset'))}</button>`);
  if (can('votes_delete')) b.push(`<button class="btn secondary danger" data-act="vt_del" data-id="${v.id}">${ico('trash')} ${esc(t('delete'))}</button>`);
  return `<p><a href="#/votes">← ${esc(t('pg_votes'))}</a></p><header class="gm-head"><div class="grow"><h2>${esc(voteQ(v))}</h2><small class="muted">${esc([voteWhen(v), t(v.once ? 'vote_once' : 'vote_many'), t('vote_vis_' + v.visibility)].filter(Boolean).join(' · '))}</small></div>${voteState(v)}</header>
    ${filters}<section class="card">${voteBars(v, c, true)}${voteSources(c)}</section>${natTable}${staff}${hours}${rows}
    ${b.length ? `<div class="gm-btns">${b.join('')}</div>` : ''}`;
}
ACT.vr_f = el => { vrF[el.name] = el.value || null; route(); };
ACT.vr_clear = () => { vrF = { id: vrF.id }; route(); };
ACT.vt_del = async el => { if (await voteDelete([+el.dataset.id])) location.hash = '#/votes/history'; };
// export: the results, the sources, the nationalities and every response – as the filter shows them
ACT.vr_xlsx = async () => {
  const j = await api('vote_results', { p_id: vrF.id, p_filter: vrF }), v = j.vote, lab = id => choiceLabel(v.choices.find(x => x.id === id) || { label: id });
  await exportXlsx('vote-' + v.id + '-' + D.today(), {
    [t('vote_results')]: j.counts.choices.map(x => ({ [t('vote_choice')]: lab(x.id), [t('vt_votes')]: x.n, '%': x.pct })).concat([{ [t('vote_choice')]: t('vt_total', { n: j.counts.total }) }])
      .concat(VOTE_SOURCES.map(s => ({ [t('vote_choice')]: t('vsrc_' + s), [t('vt_votes')]: j.counts.sources[s] || 0 }))),
    [t('vote_by_nationality')]: j.nationalities.map(n => Object.assign({ [t('nationality')]: natName(n.nationality), [t('vt_votes')]: n.n }, ...v.choices.map(x => ({ [choiceLabel(x)]: (n.choices || {})[x.id] || 0 })))),
    [t('vote_responses')]: j.rows.map(r => ({ [t('date')]: r.date, [t('time')]: r.time, [t('vote_choice')]: lab(r.choice), [t('vote_source')]: t('vsrc_' + r.source), [t('room')]: r.room || '', [t('nationality')]: r.nationality ? countryName(r.nationality) : '', [t('vote_collected_by')]: r.staff_name || '' }))
  });
};

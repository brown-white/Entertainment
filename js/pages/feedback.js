'use strict';
/* AUREA · pages/feedback.js — Guest feedback: the ratings from the guest app and the team, filters, Fast Action, reply, export.
   Uses: core/state · translations/languages · supabase · core/utils · icons/icons · core/permissions · components/modals · core/actions ·
         components/cards · core/router · components/forms · components/tables · systems/exports · systems/feedback */
/* ---------- Guest feedback (from the guest app) ---------- */
let fbStatus = 'new', fbDept = 'all', fbQ = '', fbFrom = null, fbTo = null, fbLow = false, fbSrc = 'all', fbRows = [], fbDeps = [];
const fbSel = sel('fb');      // the one selection (export, delete)
page('feedback', {
  perm: 'feedback_view,m_support', icon: 'star', group: 'guests', title: 'guest_feedback',
  render: async () => {
    const f0 = takeIntent('feedback'); if (f0) { fbQ = f0.q; fbStatus = f0.status; if (f0.from) fbFrom = f0.from; if (f0.to) fbTo = f0.to; }
    const today = D.today(); fbFrom = fbFrom || D.add(today, -30); fbTo = fbTo || today;
    const [rows, deps] = await Promise.all([list('guest_feedback', { _from: fbFrom, _to: fbTo, _limit: 3000 }), list('departments')]);
    const lines = rows.length ? await ratingsOf(rows.map(x => x.id)) : [];
    rows.forEach(x => { x.ratings = lines.filter(r => r.feedback_id === x.id); x.low = x.ratings.some(r => r.rating <= 2); });
    const by = {}; lines.forEach(r => { const k = r.department_id ?? 0; (by[k] = by[k] || []).push(r.rating); });
    const cards = Object.entries(by).map(([k, a]) => ({ k, name: deptName(deps.find(d => d.id === +k)), a: +(sum(a, x => x) / a.length).toFixed(1), n: a.length, low: a.filter(x => x <= 2).length })).sort((x, y) => x.a - y.a);
    const q = fbQ.trim().toLowerCase(), co = /^[A-Z]{2}$/.test(countryCode(fbQ)) ? countryCode(fbQ) : null;
    const r = rows.filter(x => (fbStatus === 'all' || x.status === fbStatus) && (fbDept === 'all' || x.ratings.some(l => String(l.department_id ?? 0) === fbDept)) && (!fbLow || x.low) && (fbSrc === 'all' || x.source === fbSrc)
      && (!q || [x.guest_name, x.room, x.comment, x.reply, countryName(x.nationality)].some(v => String(v || '').toLowerCase().includes(q)) || (co && x.nationality === co)));
    fbRows = r; fbDeps = deps;
    return `<div class="stats fb-cards">${cards.map(c => `<button class="${c.a < 3 ? 'low' : c.a < 4 ? 'mid' : ''} ${fbDept === c.k ? 'on' : ''}" data-act="fb_d" data-d="${c.k}"><b>${c.a}</b>${esc(c.name)} · ${c.n}${c.low ? `<small>${ico('flag')} ${c.low}</small>` : ''}</button>`).join('') || `<span><b>–</b>${esc(t('average'))}</span>`}</div>
      <div class="filters fb-filters"><input type="search" data-fbf="q" value="${esc(fbQ)}" placeholder="${esc(t('fb_search_ph'))}" aria-label="${esc(t('search'))}">
        <input type="date" data-fbf="from" value="${fbFrom}" aria-label="${esc(t('date_from'))}"><input type="date" data-fbf="to" value="${fbTo}" aria-label="${esc(t('date_to'))}">
        <select data-fbf="src" aria-label="${esc(t('source'))}"><option value="all">${esc(t('all_sources'))}</option><option value="guest" ${fbSrc === 'guest' ? 'selected' : ''}>${esc(t('from_guest_app'))}</option><option value="staff" ${fbSrc === 'staff' ? 'selected' : ''}>${esc(t('collected_by_staff'))}</option></select>
        <label class="switch"><input type="checkbox" data-fbf="low" ${fbLow ? 'checked' : ''}> ${esc(t('only_low'))}</label></div>
      <div class="chips">${['new', 'seen', 'closed', 'all'].map(x => `<button class="chip-btn ${fbStatus === x ? 'on' : ''}" data-act="fb_f" data-s="${x}">${esc(x === 'all' ? t('all') : t('fs_' + x))} (${x === 'all' ? rows.length : rows.filter(y => y.status === x).length})</button>`).join('')}</div>
      <div class="chips"><button class="chip-btn ${fbDept === 'all' ? 'on' : ''}" data-act="fb_d" data-d="all">${esc(t('all_departments'))}</button>${cards.map(c => `<button class="chip-btn ${fbDept === c.k ? 'on' : ''}" data-act="fb_d" data-d="${c.k}">${esc(c.name)}</button>`).join('')}</div>
      ${r.length ? selHead('fb', r.map(x => x.id), `<button class="btn ghost small" data-act="fb_pdf" id="fb-pdf">${ico('download')} ${esc(fbSel.size ? t('export_selected', { n: fbSel.size }) : t('export_all', { n: r.length }))}</button><button class="btn ghost small" data-act="fb_xlsx">${esc(t('excel'))}</button>`
          + (can('m_support') ? `<button class="btn ghost small danger" data-act="fb_del_sel" data-sel-need ${fbSel.size ? '' : 'disabled'}>${ico('trash')} ${esc(t('delete_selected'))}</button>` : '')) : ''}
      ${r.length ? fbList(r, deps, (x, part) => part === 'head'
        ? `<label class="fb-head">${selBox('fb', x.id)}<span><b>${esc(x.guest_name || t('guest'))}</b> <small class="muted">${x.room ? esc(t('room')) + ' ' + esc(x.room) + ' · ' : ''}${x.nationality ? esc(countryName(x.nationality)) + ' · ' : ''}${esc(D.stamp(x.created_at))} · ${esc(x.source === 'staff' ? t('collected_by_staff') : t('from_guest_app'))}${x.edited_at ? ' · ' + esc(t('edited')) : ''}</small></span></label>`
        : `<div class="actions">${x.low ? `<button class="btn small danger-soft" data-act="fb_fast" data-id="${x.id}">${ico('phone')} ${esc(t('fast_action'))}</button>` : ''}<button class="btn ghost small" data-act="fb_reply" data-id="${x.id}">${esc(t('reply'))}</button>
            ${x.status !== 'closed' ? `<button class="btn ghost small" data-act="fb_set" data-id="${x.id}" data-s="closed">${esc(t('close_record'))}</button>` : `<button class="btn ghost small" data-act="fb_set" data-id="${x.id}" data-s="seen">${esc(t('reopen'))}</button>`}
            <span class="grow"></span><button class="icon-btn" data-act="fb_edit" data-id="${x.id}" aria-label="${esc(t('edit'))}">${ico('edit')}</button>${can('m_support') ? `<button class="icon-btn" data-act="fb_del" data-id="${x.id}" aria-label="${esc(t('delete'))}">${ico('trash')}</button>` : ''}</div>`) : empty(t('no_feedback'))}`;
  },
  mount: () => $$('[data-fbf]').forEach(el => { el.onchange = () => { const k = el.dataset.fbf, v = el.type === 'checkbox' ? el.checked : el.value;
    if (k === 'q') fbQ = v; else if (k === 'from') fbFrom = v; else if (k === 'to') fbTo = v; else if (k === 'src') fbSrc = v; else if (k === 'low') fbLow = v; route(); }; })
});
ACT.fb_d = el => { fbDept = el.dataset.d; route(); };
ACT.fb_f = el => { fbStatus = el.dataset.s; route(); };
SEL_ON.fb = s0 => { const b = $('#fb-pdf'); if (b) b.lastChild.textContent = ' ' + (s0.size ? t('export_selected', { n: s0.size }) : t('export_all', { n: fbRows.length })); };
ACT.fb_del_sel = async () => { const ids = selIds('fb'); if (!ids.length) return;
  if (ids.length > 1 && !can('bulk_delete')) return toast(t('err_bulk_needed'), 'bad');
  if (!await delAsk({ title: t('delete_feedback_n_q', { n: ids.length }), n: ids.length, text: t('delete_feedback_text') })) return;
  const j = await delMany('guest_feedback', ids.length === 1 ? { p_id: ids[0] } : { p_ids: ids }); fbSel.clear(); toast(t('deleted_n', { n: j.deleted })); route(); };
const fbChosen = () => (fbSel.size ? fbRows.filter(x => fbSel.has(x.id)) : fbRows);
const fbStarsTxt = n => '★'.repeat(n) + '☆'.repeat(5 - n);
ACT.fb_pdf = () => { const rows = fbChosen(); if (!rows.length) return;
  printSheet(t('guest_feedback'), `<style>.fbp{font-family:Georgia,serif;color:#222}.fbp .e{border:1px solid #ddd;border-radius:3mm;padding:3mm 4mm;margin-bottom:3mm;break-inside:avoid}.fbp .e.low{border-left:3mm solid #A85454}
      .fbp h3{margin:0 0 1mm;font-size:12pt}.fbp small{font-family:Arial;color:#777;font-size:8pt}.fbp .l{display:flex;flex-wrap:wrap;gap:1mm 6mm;font-family:Arial;font-size:9pt;margin:1.5mm 0}.fbp .l span.low{color:#A85454;font-weight:700}.fbp .st{color:#B89A64;letter-spacing:.5mm}.fbp p{margin:1mm 0;font-size:10pt}</style>
    <div class="fbp">${rows.map(x => `<div class="e ${x.low ? 'low' : ''}"><h3>${esc(x.guest_name || t('guest'))}</h3><small>${x.room ? esc(t('room')) + ' ' + esc(x.room) + ' · ' : ''}${x.nationality ? esc(countryName(x.nationality)) + ' · ' : ''}${esc(D.stamp(x.created_at))} · ${esc(x.source === 'staff' ? t('collected_by_staff') : t('from_guest_app'))}</small>
      <div class="l">${x.ratings.map(l => `<span class="${l.rating <= 2 ? 'low' : ''}">${esc(deptName(fbDeps.find(d => d.id === l.department_id)))} <span class="st">${fbStarsTxt(l.rating)}</span></span>`).join('')}</div>
      ${x.comment ? `<p>${esc(x.comment)}</p>` : ''}${x.reply ? `<p><i>${esc(t('reply'))}: ${esc(x.reply)}</i></p>` : ''}</div>`).join('')}</div>`, { sub: D.span(fbFrom, fbTo) }); };
ACT.fb_xlsx = () => exportXlsx('feedback-' + D.today(), { [t('guest_feedback')]: fbChosen().map(x => Object.assign({ [t('date')]: D.stamp(x.created_at), [t('guest')]: x.guest_name || '', [t('room')]: x.room || '', [t('nationality')]: countryName(x.nationality), [t('source')]: x.source === 'staff' ? t('collected_by_staff') : t('from_guest_app') },
  Object.fromEntries(x.ratings.map(l => [deptName(fbDeps.find(d => d.id === l.department_id)), l.rating])), { [t('comment')]: x.comment || '', [t('reply')]: x.reply || '', [t('status')]: t('fs_' + x.status) })) });
ACT.fb_fast = async el => { const x = fbRows.find(y => y.id === +el.dataset.id); const low = x.ratings.filter(r => r.rating <= 2).map(r => r.department_id).filter(Boolean);
  modal(t('fast_action'), `<p class="hint-box">${ico('flag')}<span>${esc(t('fast_action_low', { list: x.ratings.filter(r => r.rating <= 2).map(r => deptName(fbDeps.find(d => d.id === r.department_id))).join(', ') }))}</span></p>${await fastActionHtml(low)}`, {}); };
ACT.fb_edit = el => {
  const x = fbRows.find(y => y.id === +el.dataset.id); const used = new Set(x.ratings.map(r => r.department_id));
  const deps = fbDeps.filter(d => (d.active && d.rated) || used.has(d.id)); const item = x.ratings.find(r => r.department_id == null);
  const f = [{ k: 'guest_name', label: t('guest_name') }, { k: 'room', label: t('room') }, { k: 'nationality', type: 'country', label: t('nationality') }]
    .concat(item ? [{ k: 'dep_item', type: 'stars', label: t('activity_rating') }] : [], fbFields(deps));
  const vals = Object.assign({ guest_name: x.guest_name, room: x.room, nationality: x.nationality, comment: x.comment }, Object.fromEntries(x.ratings.filter(r => r.department_id).map(r => ['dep_' + r.department_id, r.rating])), item ? { dep_item: item.rating } : {});
  editForm(t('edit'), f, vals, async (r, root) => {
    const rd = fbRead(root, deps); const ratings = rd.ratings.concat(item && +r.dep_item ? [{ department_id: null, rating: +r.dep_item }] : []);
    if (!ratings.length) throw new ApiError('rating');
    await api('feedback_edit', { p_id: x.id, p_row: { guest_name: r.guest_name, room: r.room, nationality: r.nationality, comment: rd.comment, ratings } }); toast(t('saved')); route();
  });
};
ACT.fb_del = async el => { if (!await confirmBox(t('delete_feedback_q'), t('delete'))) return; await del('guest_feedback', +el.dataset.id); fbSel.delete(+el.dataset.id); toast(t('deleted')); route(); };
ACT.fb_set = async el => { await save('guest_feedback', { id: +el.dataset.id, status: el.dataset.s }); route(); };
ACT.fb_reply = async el => { const [x] = await list('guest_feedback', { id: +el.dataset.id }); editForm(t('reply'), [{ k: 'reply', type: 'textarea', label: t('reply'), rows: 4 }], x, async r => { await save('guest_feedback', { id: x.id, reply: r.reply, status: 'seen', replied_by: S.me.id }); route(); }); };

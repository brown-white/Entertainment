'use strict';
/* AUREA · systems/feedback.js — the ONE feedback form (guest app and staff collection): departments, ratings, the department ratings of many
   records, Fast Action.
   Uses: translations/languages · supabase · core/utils · icons/icons · components/cards · components/forms */
// the department ratings of many feedback records: asked in parts, so a long period never loses its newest ratings to a list limit
async function ratingsOf(ids) {
  const out = []; for (let i = 0; i < ids.length; i += 400) out.push(...await list('guest_feedback_ratings', { feedback_id: ids.slice(i, i + 400), _limit: 5000 }));
  return out;
}

/* ---------- departments + the ONE feedback form (guest app and staff collection) ---------- */
const DEPT_DEFAULT = { reception: 'Reception', housekeeping: 'Housekeeping', restaurant: 'Restaurant', bar: 'Bar', animation: 'Animation', maintenance: 'Maintenance', spa: 'Spa', room_service: 'Room Service', other: 'Other' };
const deptName = d => (d ? tx(d.name_i18n, d.key && DEPT_DEFAULT[d.key] === d.name ? t('dept_' + d.key) : d.name) : t('activity_rating'));
const fbFields = deps => deps.map(d => ({ k: 'dep_' + d.id, type: 'stars', label: deptName(d) })).concat([{ k: 'comment', type: 'textarea', label: t('comment'), rows: 3 }]);
function fbRead(root, deps) {
  const v = readForm(root, fbFields(deps));
  return { comment: v.comment, ratings: deps.filter(d => v['dep_' + d.id]).map(d => ({ department_id: d.id, rating: v['dep_' + d.id] })) };
}
const fbList = (entries, deps, extra) => `<div class="list">${entries.map(f => { const low = (f.ratings || []).some(r => r.rating <= 2);
  return `<div class="li fb ${low ? 'fb-low' : ''}">${extra ? extra(f, 'head') : ''}${low ? `<span class="chip bad attn">${ico('flag')} ${esc(t('needs_attention'))}</span>` : ''}
  <div class="fb-lines">${(f.ratings || []).map(r => `<span class="${r.rating <= 2 ? 'r-low' : r.rating === 3 ? 'r-mid' : ''}">${esc(deptName(deps.find(d => d.id === r.department_id)))} ${stars(r.rating)}</span>`).join('')}</div>
  ${f.comment ? `<p>${nl2br(f.comment)}</p>` : ''}${f.reply ? `<p class="reply">${esc(t('reply'))}: ${esc(f.reply)}</p>` : ''}${extra ? extra(f, 'foot') : ''}</div>`; }).join('')}</div>`;
/* the ONE Fast Action list (contacts); department ids show that department's contacts first */
async function fastActionHtml(depIds = []) {
  const [rows, deps] = await Promise.all([list('contacts', { active: true }), list('departments')]);
  const pick = depIds.length ? rows.filter(x => depIds.includes(x.department_id)) : rows, show = pick.length ? pick : rows;
  const row = x => `<div class="li row contact"><span class="grow"><b>${esc(x.name)}</b><small class="muted"> ${esc([x.position, x.department_id ? deptName(deps.find(d => d.id === x.department_id)) : ''].filter(Boolean).join(' · '))}</small></span>
    ${phoneBtns(x.phone)}</div>`;
  return (depIds.length && !pick.length && rows.length ? `<p class="muted small">${esc(t('no_dept_contacts'))}</p>` : '') + (show.length ? `<div class="list">${show.map(row).join('')}</div>` : empty(t('no_contacts')));
}

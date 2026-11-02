'use strict';
/* AUREA · pages/quiz.js — pages: the quiz of the day for staff and the Quiz centre (questions).
   Uses: translations/languages · supabase · core/utils · components/modals · core/actions · components/cards · core/router ·
         components/forms */
/* ---------- Quiz (staff) ---------- */
page('quiz', {
  perm: 'quiz', icon: 'help', group: 'team', title: 'quiz_of_day',
  render: async () => {
    const qs = await list('quizzes', { audience: 'staff', quiz_date: D.today(), active: true });
    if (!qs.length) return empty(t('no_quiz_today'));
    return qs.map(q => `<div class="card"><p class="q">${esc(q.question)}</p><div class="answers">${(q.options || []).map((o, i) => `<button class="btn ghost wide" data-act="sq_go" data-q="${q.id}" data-i="${i}">${esc(o)}</button>`).join('')}</div></div>`).join('');
  }
});
ACT.sq_go = async el => { try { const j = await api('staff_quiz_answer', { p_quiz_id: +el.dataset.q, p_answer: +el.dataset.i }); toast(j.correct ? t('quiz_right') : t('quiz_wrong'), j.correct ? 'ok' : 'bad'); } catch (e) { fail(e); } };

/* ---------- Quiz centre ---------- */
page('quizadmin', {
  perm: 'm_quiz', icon: 'help', group: 'manage', title: 'quiz_admin',
  render: async () => {
    const [qs, reps] = await Promise.all([list('quizzes', { _limit: 120 }), list('quiz_replies', { _limit: 5000 })]);
    quizCache = qs;
    return `<p class="row"><span class="grow"></span><button class="btn small" data-act="qz_new">${esc(t('new_question'))}</button></p>` + (qs.length ? `<div class="list">${qs.map(q => { const r = reps.filter(x => x.quiz_id === q.id); const ok = r.filter(x => x.correct); return `<div class="li"><b>${esc(D.short(q.quiz_date))}</b> ${chip(t('aud_' + q.audience))} ${q.active ? '' : chip(t('inactive'))}<p>${esc(q.question)}</p>
      <small class="muted">${esc(t('answers_n', { n: r.length, ok: ok.length }))}</small>${ok.length ? `<p class="small">${esc(t('winners'))}: ${esc(ok.map(x => x.name).join(', '))}</p>` : ''}<div class="actions"><button class="btn ghost small" data-act="qz_edit" data-id="${q.id}">${esc(t('edit'))}</button></div></div>`; }).join('')}</div>` : empty(t('nothing_yet')));
  }
});
let quizCache = [];
const quizFields = () => [{ k: 'audience', type: 'select', label: t('for_whom'), options: [['guests', t('aud_guests')], ['staff', t('aud_staff')]] }, { k: 'quiz_date', type: 'date', label: t('date'), req: true },
  { k: 'question', type: 'textarea', label: t('question'), req: true, rows: 2 }, { k: 'options_text', type: 'textarea', label: t('answers_lines'), req: true, rows: 4 },
  { k: 'correct', type: 'number', label: t('correct_answer_no'), min: 1, def: 1 }, { k: 'active', type: 'bool', label: t('active'), def: true }];
const quizBefore = r => { const o = r.options_text.split('\n').map(x => x.trim()).filter(Boolean); const c = Math.min(Math.max((r.correct || 1) - 1, 0), o.length - 1); return { id: r.id, audience: r.audience, quiz_date: r.quiz_date, question: r.question, options: o, correct_index: c, active: r.active }; };
ACT.qz_new = () => editForm(t('new_question'), quizFields(), { quiz_date: D.today(), audience: 'guests', active: true }, async r => { await save('quizzes', quizBefore(r)); route(); });
ACT.qz_edit = el => { const q = quizCache.find(x => x.id === +el.dataset.id); editForm(t('edit'), quizFields(), Object.assign({}, q, { options_text: (q.options || []).join('\n'), correct: (q.correct_index || 0) + 1 }), async r => { await save('quizzes', quizBefore(Object.assign(r, { id: q.id }))); route(); }, { danger: async () => { await del('quizzes', q.id); route(); } }); };

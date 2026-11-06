'use strict';
/* Mr Hassan · pages/guest/fun.js — guest app: quiz of the day, song requests, live scores, votes (the signed-in guest only chooses an answer:
   the room, the nationality and the stay come from their own stay – never typed).
   Uses: core/state · translations/languages · supabase · core/utils · icons/icons · components/modals · core/actions · components/cards ·
         core/router · components/forms · systems/guest-lifecycle · systems/games · systems/votes */
page('g_quiz', {
  mode: 'guest', title: 'quiz_of_day',
  render: async () => {
    const q = S.g.home.quiz; if (!q) return empty(t('no_quiz_today'));
    const done = (S.g.me?.quiz_done || []).find(x => x.quiz_id === q.id);
    if (!signedIn()) return `<div class="card"><p class="q">${esc(q.question)}</p></div>` + empty(t('sign_in_for_quiz'), `<a class="btn" href="#/g_stay">${esc(t('sign_in'))}</a>`);
    return `<div class="card"><p class="q">${esc(q.question)}</p>${done ? `<p>${chip(done.correct ? t('quiz_right') : t('quiz_wrong'), done.correct ? 'ok' : 'bad')}</p>` :
      `<div class="answers">${q.options.map((o, i) => `<button class="btn ghost wide" data-act="g_quiz_go" data-q="${q.id}" data-i="${i}">${esc(o)}</button>`).join('')}</div>`}</div>`;
  }
});
ACT.g_quiz_go = async el => { const j = await rpc('guest_quiz_answer', { p_key: S.g.key, p_quiz_id: +el.dataset.q, p_answer: +el.dataset.i }); toast(j.correct ? t('quiz_right') : t('quiz_wrong'), j.correct ? 'ok' : 'bad'); await gRefreshMe(); route(); };
page('g_songs', {
  mode: 'guest', title: 'song_requests',
  render: async () => {
    if (gSet().f_songs !== true) return empty(t('not_found'));
    if (!signedIn()) return empty(t('sign_in_for_songs'), `<a class="btn" href="#/g_stay">${esc(t('sign_in'))}</a>`);
    const mine = S.g.me.songs || [];
    return `<form class="card" id="g-song" onsubmit="return false">${fieldsHtml([{ k: 'title', label: t('song_title'), req: true }, { k: 'artist', label: t('artist') }, { k: 'note', label: t('song_note') }])}
      <button class="btn" data-act="g_song">${esc(t('send'))}</button></form>
      ${mine.length ? `<section><h2>${esc(t('my_song_requests'))}</h2><div class="list">${mine.map(x => `<div class="li"><b>${esc(x.title)}</b>${x.artist ? ' · ' + esc(x.artist) : ''} ${chip(t('song_' + x.status), x.status === 'played' ? 'ok' : '')}</div>`).join('')}</div></section>` : ''}`;
  }
});
ACT.g_song = async () => { const f = $('#g-song'); await rpc('guest_song_request', { p_key: S.g.key, p_row: { title: f.title.value, artist: f.artist.value, note: f.note.value } }); toast(t('song_sent')); await gRefreshMe(); route(); };
page('g_scores', {
  mode: 'guest', title: 'live_scores',
  render: async () => { const g = S.g.home.scores || []; return g.length ? `<div class="scores">${g.map(gameBoardPublic).join('')}</div>` : empty(t('no_live_scores')); },
  // every 20 s only the scores are fetched again (not the whole guest app)
  mount: () => { clearInterval(gScoreTimer); gScoreTimer = setInterval(async () => { if (current.key !== 'g_scores') return clearInterval(gScoreTimer); try { S.g.home.scores = (await rpc('public_home', { p_hotel_id: S.g.hotelId, p_from: null, p_to: null, p_only: 'scores' })).scores; route(); } catch { /* later */ } }, 20000); }
});
let gScoreTimer = null;

/* ---------- votes: the open votes of the guest app; the guest taps an answer and sends it; the results as the vote says ---------- */
page('g_votes', {
  mode: 'guest', title: 'votes',
  render: async () => {
    const pub = S.g.home.votes || [];
    if (!signedIn()) return (pub.length ? pub.map(v => `<div class="card vt-card"><h3>${esc(voteQ(v))}</h3><p class="muted">${v.choices.map(c => esc(choiceLabel(c))).join(' · ')}</p></div>`).join('') : empty(t('no_votes_open')))
      + empty(t('sign_in_for_votes'), `<a class="btn" href="#/g_stay">${esc(t('sign_in'))}</a>`);
    const vs = (await rpc('guest_votes', { p_key: S.g.key })).votes;
    if (!vs.length) return empty(t('no_votes_open'));
    return vs.map(v => { const open = v.state === 'open', done = v.mine.length > 0, can2 = open && (!done || !v.once), pick = gVotePick[v.id];
      return `<article class="card vt-card g-vote"><header><h3 class="grow">${esc(voteQ(v))}</h3>${open ? '' : chip(t('vst_' + v.state))}</header>
        ${done ? `<p class="hint-box ok">${ico('check')}<span>${esc(t('vote_you_chose', { c: v.mine.map(id => choiceLabel(v.choices.find(c => c.id === id) || { label: id })).join(', ') }))}</span></p>` : ''}
        ${can2 ? `<div class="vc-choices">${v.choices.map(c => `<button class="vc-choice ${pick === c.id ? 'on' : ''}" data-act="g_vote_pick" data-v="${v.id}" data-c="${esc(c.id)}" aria-pressed="${pick === c.id}">${esc(choiceLabel(c))}</button>`).join('')}</div>
          <button class="btn big wide" data-act="g_vote_go" data-v="${v.id}" ${pick ? '' : 'disabled'}>${ico('check')} ${esc(t('vc_submit'))}</button>` : ''}
        ${v.counts ? voteBars(v, v.counts) : done || !open ? `<p class="muted small">${esc(t('vote_results_later_' + v.visibility))}</p>` : ''}
        ${v.ends_at && open ? `<p class="muted small">${esc(t('vt_until', { t: D.stamp(v.ends_at) }))}</p>` : ''}</article>`; }).join('');
  }
});
const gVotePick = {};   // the answer tapped, before it is sent (per vote)
ACT.g_vote_pick = el => { gVotePick[el.dataset.v] = el.dataset.c; route(); };
ACT.g_vote_go = async el => {
  const id = +el.dataset.v, c = gVotePick[id]; if (!c) return;
  await rpc('guest_vote', { p_key: S.g.key, p_vote: id, p_choice: c });
  delete gVotePick[id]; toast(t('vc_thanks')); route();
};

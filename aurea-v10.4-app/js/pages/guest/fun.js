'use strict';
/* AUREA · pages/guest/fun.js — guest app: quiz of the day, song requests, live scores.
   Uses: core/state · translations/languages · supabase · core/utils · components/modals · core/actions · components/cards · core/router ·
         components/forms · systems/guest-lifecycle · systems/score-games */
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
  render: async () => { const g = S.g.home.scores || []; return g.length ? `<div class="scores">${g.map(x => scoreBoard(x, false)).join('')}</div>` : empty(t('no_live_scores')); },
  // every 20 s only the scores are fetched again (not the whole guest app)
  mount: () => { clearInterval(gScoreTimer); gScoreTimer = setInterval(async () => { if (current.key !== 'g_scores') return clearInterval(gScoreTimer); try { S.g.home.scores = (await rpc('public_home', { p_hotel_id: S.g.hotelId, p_from: null, p_to: null, p_only: 'scores' })).scores; route(); } catch { /* later */ } }, 20000); }
});
let gScoreTimer = null;

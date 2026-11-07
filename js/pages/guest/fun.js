'use strict';
/* Mr Hassan · pages/guest/fun.js — guest app: quiz of the day, song requests (YouTube's search), live scores, votes (the signed-in guest only chooses an answer:
   the room, the nationality and the stay come from their own stay – never typed).
   Uses: core/state · translations/languages · supabase · core/utils · icons/icons · components/modals · core/actions · components/cards ·
         core/router · components/forms · systems/guest-lifecycle · systems/games · systems/votes · systems/operations */
page('g_quiz', {
  mode: 'guest', title: 'quiz_of_day',
  render: async () => {
    const q = S.g.home.quiz; if (!q) return empty(t('no_quiz_today'));
    const done = (S.g.me?.quiz_done || []).find(x => x.quiz_id === q.id);
    if (!signedIn()) return `<div class="card"><p class="q">${esc(q.question)}</p></div>` + empty(t('sign_in_for_quiz'), `<a class="btn" href="#/g_stay">${esc(t('sign_in'))}</a>`);
    return `<div class="card"><p class="q">${esc(q.question)}</p>${done ? `<p>${chip(done.correct ? t('quiz_right') : t('quiz_wrong'), done.correct ? 'ok' : 'bad')}</p>` :
      `<div class="answers">${q.options.map((o, i) => `<button class="btn secondary wide" data-act="g_quiz_go" data-q="${q.id}" data-i="${i}">${esc(o)}</button>`).join('')}</div>`}</div>`;
  }
});
ACT.g_quiz_go = async el => { const j = await rpc('guest_quiz_answer', { p_key: S.g.key, p_quiz_id: +el.dataset.q, p_answer: +el.dataset.i }); toast(j.correct ? t('quiz_right') : t('quiz_wrong'), j.correct ? 'ok' : 'bad'); await gRefreshMe(); route(); };
/* SONG REQUESTS: the guest finds the song with YouTube's own search inside the app (nothing is downloaded or copied – only the song's
   YouTube id, its title and channel are kept; the picture comes from YouTube), picks it and asks for it – or pastes a YouTube link, or
   types it. Who asks is the signed-in stay (room, hotel): nothing to type about oneself. The guest sees only Submitted / Accepted /
   Played / Unable to fulfil. */
let gSong = { mode: null, q: '', res: null, pick: null, err: '' };
const ytId = s => { const v = String(s || '').trim(), m = v.match(/(?:youtu\.be\/|[?&]v=|\/shorts\/|\/embed\/|\/live\/)([A-Za-z0-9_-]{11})/) || v.match(/^([A-Za-z0-9_-]{11})$/); return m ? m[1] : null; };
const unEnt = s => { const x = document.createElement('textarea'); x.innerHTML = s || ''; return x.value; };
async function ytSearch(q) {
  const u = 'https://www.googleapis.com/youtube/v3/search?' + new URLSearchParams({ part: 'snippet', type: 'video', videoCategoryId: '10', safeSearch: 'strict', maxResults: '8', q, key: gSet().yt_key });
  const r = await fetch(u); if (!r.ok) throw new ApiError('yt_search');
  return ((await r.json()).items || []).filter(x => x.id?.videoId).map(x => ({ id: x.id.videoId, title: unEnt(x.snippet?.title), channel: unEnt(x.snippet?.channelTitle) }));
}
// today's (and tomorrow's) evening programme the song can be for
const gSongItems = () => gItems().filter(i => i.status === 'scheduled' && i.type !== 'activity' && (i.date === D.today() || i.date === D.add(D.today(), 1)));
page('g_songs', {
  mode: 'guest', title: 'song_requests',
  render: async () => {
    if (gSet().f_songs !== true) return empty(t('not_found'));
    if (!signedIn()) return empty(t('sign_in_for_songs'), `<a class="btn" href="#/g_stay">${esc(t('sign_in'))}</a>`);
    const yt = !!gSet().yt_key, mode = gSong.mode || (yt ? 'search' : 'type'), mine = S.g.me.songs || [], its = gSongItems();
    const extra = `${fieldHtml({ k: 'note', label: t('song_note') }, '')}${its.length ? fieldHtml({ k: 'item_id', type: 'select', label: t('song_for'), options: [['', t('song_for_any')]].concat(its.map(i => [i.id, hm(i.start_time) + ' ' + itemName(i)])) }, '') : ''}`;
    const p = gSong.pick;
    const body = mode === 'search' ? (p ? `<div class="yt-pick"><div class="yt-media" id="yt-media"><img src="https://i.ytimg.com/vi/${esc(p.id)}/mqdefault.jpg" alt=""><button class="yt-play" data-act="g_yt_play" aria-label="${esc(t('song_preview'))}">${ico('play')}</button></div>
          <p><b>${esc(p.title)}</b><small class="muted"> ${esc(p.channel)}</small></p><form id="g-song" onsubmit="return false">${extra}</form>
          <div class="actions"><button class="btn" data-act="g_song" data-src="youtube">${ico('music')} ${esc(t('song_request_this'))}</button><button class="btn secondary" data-act="g_yt_back">${esc(t('song_other'))}</button></div></div>`
        : `<form class="row yt-find" id="g-yt" onsubmit="return false"><input type="search" name="q" value="${esc(gSong.q)}" placeholder="${esc(t('song_search_ph'))}" aria-label="${esc(t('song_search_ph'))}" enterkeyhint="search"><button class="btn" data-act="g_yt">${ico('search')}</button></form>
          ${gSong.err ? `<p class="hint-box warn">${esc(gSong.err)}</p>` : ''}
          ${gSong.res ? (gSong.res.length ? `<div class="list yt-res">${gSong.res.map((r, i) => `<button class="li row" data-act="g_yt_pick" data-i="${i}"><img src="https://i.ytimg.com/vi/${esc(r.id)}/default.jpg" alt="" loading="lazy"><span class="grow"><b>${esc(r.title)}</b><small class="muted">${esc(r.channel)}</small></span>${ico('plus')}</button>`).join('')}</div>` : `<p class="muted">${esc(t('song_none_found'))}</p>`) : ''}
          <p class="muted small">${esc(t('song_yt_note'))}</p>`)
      : `<form id="g-song" onsubmit="return false">${mode === 'link' ? fieldHtml({ k: 'link', label: t('song_link'), hint: t('song_link_hint'), req: true }, '') : ''}${fieldsHtml([{ k: 'title', label: t('song_title'), req: true }, { k: 'artist', label: t('artist') }])}${extra}
          <button class="btn" data-act="g_song" data-src="${mode === 'link' ? 'link' : 'typed'}">${esc(t('send'))}</button></form>`;
    return `<div class="card song-find"><div class="chips">${(yt ? ['search'] : []).concat(['link', 'type']).map(k => `<button class="chip-btn ${mode === k ? 'on' : ''}" data-act="g_song_mode" data-k="${k}">${esc(t('song_mode_' + k))}</button>`).join('')}</div>${body}</div>
      ${mine.length ? `<section><h2>${esc(t('my_song_requests'))}</h2><div class="list">${mine.map(x => `<div class="li row">${x.video_id ? `<img class="yt-mini" src="https://i.ytimg.com/vi/${esc(x.video_id)}/default.jpg" alt="">` : ico('music')}<span class="grow"><b>${esc(x.title)}</b>${x.artist ? `<small class="muted"> ${esc(x.artist)}</small>` : ''}</span>${gStep(x.status)}${x.status === 'submitted' ? `<button class="icon-btn" data-act="g_song_cancel" data-id="${x.id}" aria-label="${esc(t('cancel'))}">${ico('x')}</button>` : ''}</div>`).join('')}</div></section>` : ''}`;
  }
});
ACT.g_song_mode = el => { gSong = { mode: el.dataset.k, q: gSong.q, res: gSong.res, pick: null, err: '' }; route(); };
ACT.g_yt = async () => { const q = $('#g-yt [name=q]').value.trim(); if (q.length < 2) return; gSong.q = q; gSong.err = '';
  try { gSong.res = await ytSearch(q); } catch { gSong.res = null; gSong.err = t('err_yt_search'); } route(); };
ACT.g_yt_pick = el => { gSong.pick = gSong.res[+el.dataset.i]; route(); };
ACT.g_yt_back = () => { gSong.pick = null; route(); };
// a short listen in YouTube's own (privacy-enhanced) player, only when the guest taps it
ACT.g_yt_play = () => { $('#yt-media').innerHTML = `<iframe src="https://www.youtube-nocookie.com/embed/${encodeURIComponent(gSong.pick.id)}?autoplay=1&rel=0" title="${esc(gSong.pick.title)}" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen></iframe>`; };
ACT.g_song = async el => {
  const f = $('#g-song'), src = el.dataset.src, v = k => f.querySelector(`[name=${k}]`)?.value?.trim() || '';
  const row = { source: src, note: v('note'), item_id: v('item_id') || null };
  if (src === 'youtube') Object.assign(row, { video_id: gSong.pick.id, title: gSong.pick.title, artist: gSong.pick.channel, channel: gSong.pick.channel });
  else {
    Object.assign(row, { title: v('title'), artist: v('artist') });
    if (row.title.length < 2) throw new ApiError('required', { field: t('song_title') });
    if (src === 'link') { row.video_id = ytId(v('link')); if (!row.video_id) throw new ApiError('yt_link'); }
  }
  await rpc('guest_song_request', { p_key: S.g.key, p_row: row }); toast(t('song_sent')); gSong.pick = null; gSong.res = null; await gRefreshMe(); route();
};
ACT.g_song_cancel = async el => { if (!await confirmBox(t('song_cancel_q'))) return; await rpc('guest_song_cancel', { p_key: S.g.key, p_id: +el.dataset.id }); await gRefreshMe(); route(); };
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
          <button class="btn lg wide" data-act="g_vote_go" data-v="${v.id}" ${pick ? '' : 'disabled'}>${ico('check')} ${esc(t('vc_submit'))}</button>` : ''}
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

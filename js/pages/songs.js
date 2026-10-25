'use strict';
/* AUREA · pages/songs.js — staff page: Song requests (DJ tool).
   Uses: core/state · translations/languages · supabase · core/utils · core/actions · components/cards · core/router */
/* ---------- Song requests (DJ tool; guests send them from the guest app) ---------- */
let srStatus = 'new';
page('songs', {
  perm: 'song_requests', icon: 'music', group: 'programme', title: 'song_requests',
  render: async () => {
    const rows = await list('song_requests', { _from: D.add(D.today(), -2), _limit: 300 });
    const r = rows.filter(x => srStatus === 'all' || x.status === srStatus);
    return `${S.settings.f_songs ? '' : `<p class="muted">${esc(t('songs_off'))}</p>`}<div class="chips">${['new', 'played', 'declined', 'all'].map(k => `<button class="chip-btn ${srStatus === k ? 'on' : ''}" data-act="sr_f" data-k="${k}">${esc(k === 'all' ? t('all') : t('song_' + k))} (${k === 'all' ? rows.length : rows.filter(x => x.status === k).length})</button>`).join('')}</div>
      ${r.length ? `<div class="list">${r.map(x => `<div class="li row"><span><b>${esc(x.title)}</b>${x.artist ? ' · ' + esc(x.artist) : ''}<small class="muted"> ${esc(x.guest_name || '')}${x.room ? ' · ' + esc(x.room) : ''} · ${esc(D.stamp(x.created_at))}</small>${x.note ? `<p>${esc(x.note)}</p>` : ''}</span><span class="grow"></span>
        ${x.status === 'new' ? `<button class="btn small" data-act="sr_set" data-id="${x.id}" data-s="played">${esc(t('song_played'))}</button><button class="btn ghost small" data-act="sr_set" data-id="${x.id}" data-s="declined">${esc(t('song_declined'))}</button>` : chip(t('song_' + x.status))}</div>`).join('')}</div>` : empty(t('no_song_requests'))}`;
  }
});
ACT.sr_f = el => { srStatus = el.dataset.k; route(); };
ACT.sr_set = async el => { await save('song_requests', { id: +el.dataset.id, status: el.dataset.s }); route(); };

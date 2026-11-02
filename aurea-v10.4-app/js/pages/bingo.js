'use strict';
/* AUREA · pages/bingo.js — staff page: Bingo caller (90 balls, kept on this phone).
   Uses: core/state · translations/languages · core/utils · components/modals · core/actions · core/router */
/* ---------- Bingo caller (90 balls; kept on this phone so a refresh never loses the game) ---------- */
page('bingo', {
  perm: 'tickets_sell,m_tickets', icon: 'target', group: 'programme', title: 'bingo_caller',
  render: async () => {
    const g = store.get('bingo') || { drawn: [] }; const last = g.drawn[g.drawn.length - 1];
    return `<div class="card center bingo-caller"><div class="ball">${last || '–'}</div><p class="muted">${esc(t('bingo_count', { n: g.drawn.length }))}</p>
      <p class="row" style="justify-content:center"><button class="btn" data-act="bg_draw" ${g.drawn.length >= 90 ? 'disabled' : ''}>${esc(t('bingo_draw'))}</button><button class="btn ghost" data-act="bg_undo" ${g.drawn.length ? '' : 'disabled'}>${esc(t('bingo_undo'))}</button><button class="btn ghost danger" data-act="bg_new">${esc(t('bingo_new'))}</button></p></div>
      <div class="numgrid bingo-board">${Array.from({ length: 90 }, (_, i) => i + 1).map(n => `<span class="${g.drawn.includes(n) ? 'used' : ''} ${n === last ? 'last' : ''}">${n}</span>`).join('')}</div>`;
  }
});
ACT.bg_draw = () => { const g = store.get('bingo') || { drawn: [] }; const left = Array.from({ length: 90 }, (_, i) => i + 1).filter(n => !g.drawn.includes(n)); if (!left.length) return;
  const a = new Uint32Array(1); crypto.getRandomValues(a); g.drawn.push(left[a[0] % left.length]); store.set('bingo', g); route(); };
ACT.bg_undo = () => { const g = store.get('bingo') || { drawn: [] }; g.drawn.pop(); store.set('bingo', g); route(); };
ACT.bg_new = async () => { if (await confirmBox(t('bingo_new_q'))) { store.set('bingo', { drawn: [] }); route(); } };

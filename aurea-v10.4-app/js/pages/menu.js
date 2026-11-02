'use strict';
/* AUREA · pages/menu.js — pages: the full menu (phones) and the menu builder (rename, reorder, hide pages per role).
   Uses: core/state · translations/languages · supabase · core/utils · icons/icons · core/permissions · components/modals · core/actions ·
         core/auth · core/router · components/navigation */
page('menu_all', {
  title: 'menu', hidden: true,
  render: async () => `<div class="menu-all">${menuList(menuFor(roleKey()))}</div>`
});

/* ---------- Menu builder (rename / reorder / hide per role) ---------- */
let mbRole = null, mbCache = [], mbList = [];
page('menu', {
  perm: 'm_settings', icon: 'menu', group: 'admin', title: 'menu_builder',
  render: async () => {
    mbRole = mbRole || S.roles[0]?.key;
    const guest = mbRole === 'guest';
    const [rows, gp] = await Promise.all([list('menu_config', { audience: mbRole }), guest ? list('custom_pages', { audience: 'guests' }) : []]);
    mbCache = rows; const cfg = k => rows.find(x => x.page_key === k) || {};
    const pages = guest ? GUEST_PAGES.map(([key, icon, lk]) => ({ key, icon, label: t(lk) })).concat(gp.map(p => ({ key: 'g_page/' + p.id, icon: p.icon || 'info', label: p.title })))
      : pagesInOrder().filter(p => p.mode === 'staff' && !p.hidden).map(p => ({ key: p.key, icon: p.icon, label: pageTitle(p) }));
    mbList = pages.map((p, i) => Object.assign(p, { own: cfg(p.key).label || '', hide: !!cfg(p.key).hidden, sort: cfg(p.key).sort ?? 1000 + i })).sort((a, b) => a.sort - b.sort);
    return `<p class="hint-box">${ico('info')}<span>${esc(guest ? t('menu_guest_note') : t('menu_intro'))}</span></p>
      <div class="filters"><select data-act-change="mb_role" aria-label="${esc(t('role'))}">${S.roles.map(r => `<option value="${r.key}" ${r.key === mbRole ? 'selected' : ''}>${esc(r.name)}</option>`).join('')}<option value="guest" ${guest ? 'selected' : ''}>${esc(t('menu_guest_app'))}</option></select></div>
      <div class="mb-list" id="mb">${mbRows(guest)}</div><p><button class="btn" data-act="mb_save">${esc(t('save'))}</button></p>`;
  }
});
const mbRows = guest => mbList.map((p, i) => `<div class="mb-row" data-mb="${esc(p.key)}"><span class="mi">${ico(p.icon)}</span><div class="grow"><b>${esc(p.label)}</b><input data-f="label" value="${esc(p.own)}" placeholder="${esc(t('own_label'))}" aria-label="${esc(t('own_label'))} – ${esc(p.label)}"></div>
  <span class="move"><button class="icon-btn" data-act="mb_move" data-i="${i}" data-d="-1" ${i === 0 ? 'disabled' : ''} aria-label="${esc(t('move_up'))}">${ico('up')}</button><button class="icon-btn" data-act="mb_move" data-i="${i}" data-d="1" ${i === mbList.length - 1 ? 'disabled' : ''} aria-label="${esc(t('move_down'))}">${ico('down')}</button></span>
  ${guest ? '' : `<label class="mb-hide"><input data-f="hidden" type="checkbox" ${p.hide ? 'checked' : ''}> ${esc(t('hide_in_menu'))}</label>`}</div>`).join('');
function mbSync() { $$('#mb .mb-row').forEach((r, i) => { mbList[i].own = $('[data-f=label]', r).value.trim(); mbList[i].hide = !!$('[data-f=hidden]', r)?.checked; }); }
ACT.mb_role = el => { mbRole = el.value; route(); };
ACT.mb_move = el => { mbSync(); const i = +el.dataset.i, j = i + +el.dataset.d; if (j < 0 || j >= mbList.length) return; [mbList[i], mbList[j]] = [mbList[j], mbList[i]]; $('#mb').innerHTML = mbRows(mbRole === 'guest'); };
ACT.mb_save = async () => {
  mbSync();
  for (const [i, p] of mbList.entries()) {
    const old = mbCache.find(x => x.page_key === p.key);
    if (old && old.sort === i && (old.label || '') === p.own && !!old.hidden === p.hide) continue;   // unchanged
    await save('menu_config', Object.assign(old ? { id: old.id } : {}, { audience: mbRole, page_key: p.key, label: p.own || null, hidden: p.hide, sort: i }));
  }
  toast(t('saved')); await loadMe(); renderShell(); route();
};

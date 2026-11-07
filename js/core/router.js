'use strict';
/* Mr Hassan · core/router.js — the pages and the menus: every page registers itself (page()), the staff menu (Role + Permissions + menu builder,
   in 8 groups; a page may also put one of its tabs into another group: links) and the guest menu; the address #/page/arg opens a page after
   checking the permission, under the ONE page header (breadcrumbs, title, context, actions). The router announces the page
   (aurea:page-open: the menus mark it; aurea:page-shown: its forms are wired). Opening a page with a starting filter: openWith / takeIntent.
   Uses: core/state · translations/languages · supabase · core/utils · icons/icons · core/permissions · components/modals · core/actions ·
         components/cards · core/auth */
const PAGES = {};
const page = (key, def) => { PAGES[key] = Object.assign({ key, mode: 'staff', group: 'operations' }, def); };
const GROUPS = ['operations', 'programme', 'staff', 'guests', 'entertainment', 'suppliers', 'reports', 'settings'];
const pageTitle = p => (typeof p.title === 'function' ? p.title() : t(p.title || 'pg_' + p.key));
let current = { key: null, arg: '' };
/* the ONE default order of the pages (the menus, the menu builder); the menu builder changes it per role. A page that is not
   listed comes after the listed ones of its group (in the order the files register them) */
const PAGE_ORDER = [
  'login', 'setup', 'menu_all', 'cpage', 'g_hotels', 'g_home', 'g_prog', 'g_item', 'g_feedback', 'g_tickets', 'g_pack', 'g_stay', 'g_more', 'g_info',
  'g_team', 'g_photos', 'g_quiz', 'g_songs', 'g_celebrate', 'g_scores', 'g_votes', 'g_page',
  'dashboard', 'myday', 'tasks', 'tasks/reminders', 'notifs', 'schedule', 'requests', 'chat', 'assistant', 'profile', 'search',
  'programme', 'item', 'prog_export', 'dayplan', 'planner', 'requirements',
  'staffadmin', 'staffadmin/roles', 'attendance', 'team', 'payroll', 'mypay',
  'guests', 'gsupport', 'guestreq', 'feedback', 'votes', 'vote', 'support', 'hotelinfo', 'bus', 'weather',
  'games', 'game', 'tickets', 'ticketsadmin', 'bingo', 'quiz', 'quizadmin', 'gallery',
  'attendance/suppliers', 'attendance/memo',
  'dashboard/stats', 'backup', 'log',
  'hotels', 'staffadmin/teams', 'themes', 'settings', 'menu', 'content', 'qr'
];
const pageRank = key => { const i = PAGE_ORDER.indexOf(key); return i < 0 ? PAGE_ORDER.length + Object.keys(PAGES).indexOf(key) : i; };
const pagesInOrder = () => Object.values(PAGES).sort((a, b) => pageRank(a.key) - pageRank(b.key));

/* every entry of the staff menu: the pages, and the tabs a page puts into another group (links: { arg, group, icon, title, perm }) */
function menuEntries() {
  const out = [];
  pagesInOrder().filter(p => p.mode === 'staff' && !p.hidden && can(p.perm) && (!p.show || p.show())).forEach(p => {
    out.push({ key: p.key, icon: p.icon, group: p.group, label: pageTitle(p) });
    (p.links || []).filter(l => can(l.perm || p.perm)).forEach(l => out.push({ key: p.key + '/' + l.arg, icon: l.icon || p.icon, group: l.group || p.group, label: t(l.title) }));
  });
  return out.sort((a, b) => pageRank(a.key) - pageRank(b.key));
}
function menuFor(roleKey) {
  // the preview shows exactly what that person sees: same menu builder settings and team pages
  const cfgMap = new Map(S.menu.filter(m => m.audience === roleKey).map(m => [m.page_key, m]));
  return menuEntries().map(e => ({ e, c: cfgMap.get(e.key) }))
    .filter(x => !(x.c && x.c.hidden))
    .sort((a, b) => (GROUPS.indexOf(a.e.group) - GROUPS.indexOf(b.e.group)) || ((a.c?.sort ?? 999) - (b.c?.sort ?? 999)) || (pageRank(a.e.key) - pageRank(b.e.key)))
    .map(x => Object.assign({}, x.e, { label: x.c?.label || x.e.label }))
    .concat(S.pages.map(cp => ({ key: 'cpage/' + cp.id, icon: cp.icon || 'info', group: 'operations', label: cp.title })));
}
// the menu entry of the page on the screen: the longest address that the current one starts with
const menuHere = m => { const here = current.key + (current.arg ? '/' + current.arg : ''); return m.filter(x => here === x.key || here.startsWith(x.key + '/')).sort((a, b) => b.key.length - a.key.length)[0]?.key; };
const homeKey = () => (menuFor(roleKey())[0]?.key || 'myday');
/* the ONE guest menu: on/off from Settings → Guest app parts, names and order from the menu builder */
const GUEST_PAGES = [['g_prog', 'list', 'programme', 'f_programme'], ['g_scores', 'trophy', 'live_scores', 'f_programme'], ['g_tickets', 'ticket', 'tickets', 'f_tickets'], ['g_info', 'info', 'hotel_info', 'f_info'],
  ['g_feedback', 'star', 'rate_your_stay', 'f_feedback'], ['g_team', 'users', 'our_team', 'f_team'], ['g_photos', 'image', 'photos', 'f_gallery'], ['g_quiz', 'help', 'quiz_of_day', 'f_quiz'], ['g_songs', 'music', 'song_requests', 'f_songs'], ['g_celebrate', 'gift', 'celebrate', 'f_events'],
  ['g_votes', 'vote', 'votes', 'f_votes']];
function guestMenu() {
  const st = gSet(); const cfg = new Map((S.g.home?.menu || []).map(m => [m.page_key, m]));
  // live scores and votes only while there are some
  return GUEST_PAGES.filter(p => st[p[3]] !== false && (p[0] !== 'g_scores' || (S.g.home?.scores || []).length) && (p[0] !== 'g_votes' || (S.g.home?.votes || []).length)).map(([key, icon, lk], i) => ({ key, icon, label: cfg.get(key)?.label || t(lk), sort: cfg.get(key)?.sort ?? i }))
    .concat((S.g.home?.pages || []).map((p, i) => ({ key: 'g_page/' + p.id, icon: p.icon || 'info', label: cfg.get('g_page/' + p.id)?.label || p.title, sort: cfg.get('g_page/' + p.id)?.sort ?? 50 + i })))
    .sort((a, b) => a.sort - b.sort);
}

/* ---------- router ---------- */
let routeSeq = 0;
async function route() {
  const raw = decodeURIComponent(location.hash.replace(/^#\/?/, ''));
  let [key, ...rest] = raw.split('/');
  const arg = rest.join('/');
  if (S.mode === 'setup') key = 'setup';
  else if (S.mode === 'guest') {
    const gp = PAGES[key];
    if (!gp || gp.mode === 'staff' || key === 'setup') key = 'g_home';
    const part = GUEST_PAGES.find(x => x[0] === key);                 // a part switched off in Settings does not open by its address either
    if (part && gSet()[part[3]] === false) key = 'g_home';
    if (!S.g.hotelId && key !== 'login') key = 'g_hotels';
  } else {
    const sp = PAGES[key];
    if (!sp || sp.mode !== 'staff') key = homeKey();
  }
  const p = PAGES[key];
  if (S.mode === 'staff' && p.mode === 'staff' && !(can(p.perm) && (!p.show || p.show()))) { location.hash = '#/' + homeKey(); return; }
  current = { key, arg };
  const seq = ++routeSeq;
  const view = $('#view');
  view.setAttribute('aria-busy', 'true');
  // a field still in focus is left first: its "changed" event runs now, not in the middle of replacing the page
  if (view.contains(document.activeElement)) document.activeElement.blur();
  view.innerHTML = skeleton('page');
  document.dispatchEvent(new Event('aurea:page-open'));        // the menus mark the page (components/navigation.js)
  try {
    // the guest app reads the programme again when it is older than a minute (never an old name or day kept from the morning)
    if (S.mode === 'guest' && S.g.hotelId && S.g.home && Date.now() - (S.g.at || 0) > 60000) await guestLoad();
    const html = await p.render(arg);
    if (seq !== routeSeq) return;
    view.innerHTML = `<div class="page pg-${key}${p.narrow ? ' narrow-page' : ''}">${pageHead(p, arg)}${html}</div>`;
    pageHeadFill(view, p, arg);
    p.mount && p.mount(view, arg);
    document.dispatchEvent(new CustomEvent('aurea:page-shown', { detail: view }));   // its forms are wired (components/forms.js)
  } catch (e) {
    if (seq !== routeSeq) return;
    console.warn(e);
    view.innerHTML = `<div class="page">${empty(errText(e), `<button class="btn" data-act="reload">${esc(t('try_again'))}</button>`)}</div>`;
  }
  view.removeAttribute('aria-busy');
  window.scrollTo(0, 0);
}
/* ---------- the ONE page header: breadcrumbs (deeper pages), title, context line, the page's actions on the right ----------
   a page may give sub(arg) (the context line) and its actions as an element marked data-pg-actions (moved into the header) */
const pageHead = (p, arg) => `<header class="pg-head"><nav class="crumbs" aria-label="${esc(t('breadcrumbs'))}" hidden></nav><div class="pg-head-row"><div class="pg-head-main">
  <h1 class="pg-title">${esc(p.heading ? p.heading(arg) : pageTitle(p))}</h1>${p.sub ? `<p class="pg-sub">${esc(p.sub(arg) || '')}</p>` : ''}</div><div class="pg-actions"></div></div></header>`;
function pageHeadFill(view, p, arg) {
  const head = $('.pg-head', view); if (!head) return;
  $$('[data-pg-actions]', view).forEach(src => { if (!head.contains(src)) { $('.pg-actions', head).append(...src.childNodes); src.remove(); } });
  if (p.mode !== 'staff') return;
  // breadcrumbs: the group › the page › its tab › the record
  const parent = p.parent ? PAGES[p.parent] : null, tab = $('.tabs a.on', view), base = parent || p;
  const leaf0 = $('[data-crumb]', view);
  // a page on its first tab is the page itself: no breadcrumbs (they start at its other tabs, a record, a detail page)
  if (!parent && !leaf0 && (!tab ? !arg : tab === $('.tabs a', view))) return;
  // a record opened inside a tab names itself (data-crumb: a supplier, a request): the tab becomes the way back
  const parts = [`<span>${esc(t('grp_' + base.group))}</span>`, `<a href="#/${base.key}">${esc(pageTitle(base))}</a>`], here = x => `<span aria-current="page">${esc(x)}</span>`;
  const leaf = leaf0?.dataset.crumb;
  if (parent) parts.push(here(p.heading ? p.heading(arg) : pageTitle(p)));
  else if (tab && leaf) parts.push(`<a href="${esc(tab.getAttribute('href'))}">${esc(tab.textContent.trim())}</a>`, here(leaf));
  else if (tab) parts.push(here(tab.textContent.trim()));
  else parts.push(here(leaf || t('details')));
  const nav = $('.crumbs', head); nav.innerHTML = parts.join(ico('chev')); nav.hidden = false;
}
ACT.reload = () => route();
/* a page opened with a starting filter (a search result, a notification, a guest's tickets): the opener leaves it here, the page takes it
   once when it is drawn – no page ever sets another page's own filters */
let pageIntent = null;
const openWith = (key, filter) => { pageIntent = Object.assign({ key }, filter); };
const takeIntent = key => { const i = pageIntent; if (!i || i.key !== key) return null; pageIntent = null; return i; };
// back to the app after a while (phone in the pocket): the page is read again – unless something is being edited
let hiddenAt = 0;
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { hiddenAt = Date.now(); return; }
  if (hiddenAt && Date.now() - hiddenAt > 60000 && !modalStack.length && !document.querySelector('#view form.dirty, #view .selecting') && S.mode !== 'setup') route();
});
document.addEventListener('click', ev => {
  const g = ev.target.closest('[data-go]'); if (!g) return;
  ev.preventDefault(); location.hash = '#/' + g.dataset.go;
});
window.addEventListener('hashchange', route);

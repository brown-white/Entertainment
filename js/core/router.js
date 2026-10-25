'use strict';
/* AUREA · core/router.js — the pages and the menus: every page registers itself (page()), the staff menu (Role + Permissions + menu builder)
   and the guest menu; the address #/page/arg opens a page after checking the permission. The router announces the page
   (aurea:page-open: the menus mark it; aurea:page-shown: its forms are wired). Opening a page with a starting filter: openWith / takeIntent.
   Uses: core/state · translations/languages · supabase · core/utils · core/permissions · components/modals · core/actions ·
         components/cards · core/auth */
const PAGES = {};
const page = (key, def) => { PAGES[key] = Object.assign({ key, mode: 'staff', group: 'my' }, def); };
const GROUPS = ['my', 'programme', 'team', 'guests', 'manage', 'admin'];
const pageTitle = p => (typeof p.title === 'function' ? p.title() : t(p.title || 'pg_' + p.key));
let current = { key: null, arg: '' };
/* the ONE default order of the pages (the menus, the menu builder); the menu builder changes it per role. A page that is not
   listed comes after the listed ones of its group (in the order the files register them) */
const PAGE_ORDER = [
  'login', 'setup', 'menu_all', 'cpage', 'g_hotels', 'g_home', 'g_prog', 'g_item', 'g_feedback', 'g_tickets', 'g_pack', 'g_stay', 'g_more', 'g_info',
  'g_team', 'g_photos', 'g_quiz', 'g_songs', 'g_scores', 'g_page', 'myday', 'item', 'schedule', 'requests', 'profile', 'programme', 'prog_export', 'tickets',
  'scores', 'tasks', 'chat', 'team', 'quiz', 'gallery', 'bus', 'weather', 'hotelinfo', 'gsupport', 'feedback', 'assistant', 'mypay', 'songs',
  'bingo', 'search', 'dashboard', 'attendance', 'dayplan', 'planner', 'staffadmin', 'hotels', 'guests', 'ticketsadmin', 'quizadmin', 'content',
  'support', 'requirements', 'performers', 'payroll', 'notifs', 'settings', 'menu', 'log', 'backup', 'qr'
];
const pageRank = key => { const i = PAGE_ORDER.indexOf(key); return i < 0 ? PAGE_ORDER.length + Object.keys(PAGES).indexOf(key) : i; };
const pagesInOrder = () => Object.values(PAGES).sort((a, b) => pageRank(a.key) - pageRank(b.key));

function menuFor(roleKey) {
  // the preview shows exactly what that person sees: same menu builder settings and team pages
  const cfg = S.menu.filter(m => m.audience === roleKey);
  const cfgMap = new Map(cfg.map(m => [m.page_key, m]));
  return pagesInOrder()
    .filter(p => p.mode === 'staff' && !p.hidden && can(p.perm) && (!p.show || p.show()))
    .map(p => ({ p, c: cfgMap.get(p.key) }))
    .filter(x => !(x.c && x.c.hidden))
    .sort((a, b) => (GROUPS.indexOf(a.p.group) - GROUPS.indexOf(b.p.group)) || ((a.c?.sort ?? 999) - (b.c?.sort ?? 999)) || (pageRank(a.p.key) - pageRank(b.p.key)))
    .map(x => ({ key: x.p.key, icon: x.p.icon, group: x.p.group, label: x.c?.label || pageTitle(x.p) }))
    .concat(S.pages.map(cp => ({ key: 'cpage/' + cp.id, icon: cp.icon || 'info', group: 'team', label: cp.title })));
}
const homeKey = () => (menuFor(roleKey())[0]?.key || 'myday');
/* the ONE guest menu: on/off from Settings → Guest app parts, names and order from the menu builder */
const GUEST_PAGES = [['g_prog', 'list', 'programme', 'f_programme'], ['g_scores', 'trophy', 'live_scores', 'f_programme'], ['g_tickets', 'ticket', 'tickets', 'f_tickets'], ['g_info', 'info', 'hotel_info', 'f_info'],
  ['g_feedback', 'star', 'rate_your_stay', 'f_feedback'], ['g_team', 'users', 'our_team', 'f_team'], ['g_photos', 'image', 'photos', 'f_gallery'], ['g_quiz', 'help', 'quiz_of_day', 'f_quiz'], ['g_songs', 'music', 'song_requests', 'f_songs']];
function guestMenu() {
  const st = gSet(); const cfg = new Map((S.g.home?.menu || []).map(m => [m.page_key, m]));
  return GUEST_PAGES.filter(p => st[p[3]] !== false && (p[0] !== 'g_scores' || (S.g.home?.scores || []).length)).map(([key, icon, lk], i) => ({ key, icon, label: cfg.get(key)?.label || t(lk), sort: cfg.get(key)?.sort ?? i }))
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
  view.innerHTML = `<div class="loading" aria-label="${esc(t('loading'))}"><span></span><span></span><span></span></div>`;
  document.dispatchEvent(new Event('aurea:page-open'));        // the menus mark the page (components/navigation.js)
  try {
    // the guest app reads the programme again when it is older than a minute (never an old name or day kept from the morning)
    if (S.mode === 'guest' && S.g.hotelId && S.g.home && Date.now() - (S.g.at || 0) > 60000) await guestLoad();
    const html = await p.render(arg);
    if (seq !== routeSeq) return;
    view.innerHTML = `<div class="page pg-${key}"><h1 class="pg-title">${esc(p.heading ? p.heading(arg) : pageTitle(p))}</h1>${html}</div>`;
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

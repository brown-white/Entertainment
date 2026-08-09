/* ============================================================
   AMARINA SAPPHIRE — ENTERTAINMENT APP
   Production Service Worker
   Upload this file next to index.html (same folder).
   ============================================================ */

const SW_VERSION = 'amarina-v1';
const SHELL_CACHE = 'shell-' + SW_VERSION;

/* Files that make up the app shell. Kept intentionally small:
   index.html is the whole app, so caching it gives real offline support. */
const SHELL_FILES = ['./', './index.html'];

/* ---------- install: pre-cache the app shell ---------- */
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(SHELL_CACHE)
      .then(cache => cache.addAll(SHELL_FILES).catch(() => {}))
      .then(() => self.skipWaiting())
  );
});

/* ---------- activate: clean old caches, take control ---------- */
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== SHELL_CACHE).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

/* ---------- fetch: network-first for the app, cache as offline fallback ----------
   Supabase/API calls are never cached — they must always be live. */
self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  // never touch API / realtime / storage traffic
  if (url.hostname.endsWith('supabase.co') ||
      url.hostname.endsWith('anthropic.com') ||
      url.pathname.startsWith('/rest/') ||
      url.pathname.startsWith('/realtime/')) return;

  // navigation requests (opening the app) -> network first, cached shell fallback
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then(res => {
          const copy = res.clone();
          caches.open(SHELL_CACHE).then(c => c.put('./index.html', copy)).catch(() => {});
          return res;
        })
        .catch(() => caches.match('./index.html').then(r => r || caches.match('./')))
    );
    return;
  }

  // other same-origin GETs -> cache first, then network
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(req).then(hit => {
        if (hit) return hit;
        return fetch(req).then(res => {
          if (res && res.status === 200 && res.type === 'basic') {
            const copy = res.clone();
            caches.open(SHELL_CACHE).then(c => c.put(req, copy)).catch(() => {});
          }
          return res;
        }).catch(() => new Response('', { status: 504, statusText: 'offline' }));
      })
    );
  }
});

/* ---------- push: show the notification ----------
   Expected payload (JSON):
   { title, body, url, tag, type }
   Falls back gracefully if the payload is plain text or empty. */
self.addEventListener('push', event => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    try { data = { title: 'Entertainment', body: event.data.text() }; }
    catch (e2) { data = {}; }
  }

  const title = data.title || 'Entertainment';
  const options = {
    body: data.body || '',
    tag: data.tag || ('ent-' + (data.type || 'general')),
    renotify: true,
    vibrate: [120, 60, 120],
    badge: data.badge || undefined,
    icon: data.icon || undefined,
    requireInteraction: data.type === 'urgent',
    data: {
      url: data.url || './',
      type: data.type || 'general',
      id: data.id || null
    }
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

/* ---------- notification click: focus an open tab, or open the app ----------
   Routes to the right page via ?open=<type> which the app reads on load. */
self.addEventListener('notificationclick', event => {
  event.notification.close();

  const d = event.notification.data || {};
  const type = d.type || 'general';

  // map notification type -> in-app destination
  const ROUTE = {
    booking: 'bookings',
    booking_confirmed: 'tickets',
    booking_cancelled: 'tickets',
    activity_soon: 'program',
    announcement: 'home',
    message: 'chat',
    chat: 'chat',
    ticket: 'tickets',
    request: 'guests',
    task: 'tasks',
    assignment: 'tasks',
    attendance: 'workday',
    feedback: 'guests',
    occupancy: 'dash',
    general: ''
  };

  const target = d.url || ('./' + (ROUTE[type] ? '?open=' + ROUTE[type] : ''));

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      // if the app is already open, focus it and tell it where to go
      for (const client of list) {
        if ('focus' in client) {
          client.postMessage({ kind: 'notification-click', type: type, id: d.id || null });
          return client.focus();
        }
      }
      // otherwise open a new window
      if (self.clients.openWindow) return self.clients.openWindow(target);
    })
  );
});

/* ---------- subscription change: tell the app to re-subscribe ---------- */
self.addEventListener('pushsubscriptionchange', event => {
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      list.forEach(c => c.postMessage({ kind: 'resubscribe' }));
    })
  );
});

/* ---------- allow the app to trigger an immediate update ---------- */
self.addEventListener('message', event => {
  if (event.data && event.data.kind === 'skip-waiting') self.skipWaiting();
});

// ── FocusAI Service Worker ──────────────────────────────────────────────────
// Versión: actualizar al desplegar nuevos assets para forzar recarga del caché
const CACHE_VERSION   = 'focusai-v4';
const STATIC_CACHE    = `${CACHE_VERSION}-static`;
const DYNAMIC_CACHE   = `${CACHE_VERSION}-dynamic`;
const API_CACHE       = `${CACHE_VERSION}-api`;

// Assets que se cachean en la instalación (app shell)
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/css/variables.css',
  '/css/auth.css',
  '/css/reset.css',
  '/css/layout.css',
  '/css/components.css',
  '/css/animations.css',
  '/css/themes.css',
  '/css/welcome.css',
  '/js/app.js',
  '/js/state.js',
  '/js/router.js',
  '/js/utils/date.js',
  '/js/utils/helpers.js',
  '/js/utils/validators.js',
  '/js/utils/charts.js',
  '/js/modules/storage.js',
  '/js/modules/ai.js',
  '/js/modules/tasks.js',
  '/js/modules/calendar.js',
  '/js/modules/timer.js',
  '/js/modules/habits.js',
  '/js/modules/goals.js',
  '/js/modules/projects.js',
  '/js/modules/stats.js',
  '/js/modules/focus.js',
  '/js/modules/personal.js',
  '/js/modules/notifications.js',
  '/js/modules/gamification.js',
  '/js/modules/recurrence.js',
  '/js/modules/supabase.js',
  '/data/schema.js',
  '/data/migrations.js',
  '/data/seed.js',
  '/views/dashboard.html',
  '/views/welcome.html',
  '/views/tasks.html',
  '/views/calendar.html',
  '/views/timer.html',
  '/views/habits.html',
  '/views/goals.html',
  '/views/projects.html',
  '/views/stats.html',
  '/views/focus.html',
  '/views/personal.html',
  '/views/gamification.html',
  '/views/settings.html',
  '/views/login.html',
  '/views/teams.html',
  '/components/sidebar.html',
  '/components/ai-chat.html',
  '/components/task-card.html',
  '/components/modal.html',
  '/components/toast.html',
  // CDN libs (se intentan cachear, si fallan se sirven desde red)
  'https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js',
  'https://cdn.jsdelivr.net/npm/sortablejs@1.15.2/Sortable.min.js',
  'https://cdn.jsdelivr.net/npm/dayjs@1.11.10/dayjs.min.js',
];

// ── Instalación ───────────────────────────────────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then(async (cache) => {
      // cachear assets locales primero (críticos)
      const localAssets = STATIC_ASSETS.filter(a => a.startsWith('/'));
      await cache.addAll(localAssets).catch(console.warn);
      // CDN assets: intentar individualmente para no bloquear si alguno falla
      const cdnAssets = STATIC_ASSETS.filter(a => !a.startsWith('/'));
      await Promise.allSettled(cdnAssets.map(url => cache.add(url)));
    }).then(() => self.skipWaiting())
  );
});

// ── Activación ────────────────────────────────────────────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key.startsWith('focusai-') && key !== STATIC_CACHE && key !== DYNAMIC_CACHE && key !== API_CACHE)
          .map((key) => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

// ── Estrategias de fetch ──────────────────────────────────────────────────────
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Ignorar: extensiones de chrome, devtools, requests POST/PUT/DELETE
  if (
    url.protocol === 'chrome-extension:' ||
    request.method !== 'GET'
  ) return;

  // ① API de Anthropic → Network only (no cachear respuestas de IA)
  if (url.hostname === 'api.anthropic.com') {
    event.respondWith(fetch(request));
    return;
  }

  // ② Google Fonts → Cache first
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    event.respondWith(cacheFirst(request, STATIC_CACHE));
    return;
  }

  // ③ CDN libs → Cache first con fallback de red
  if (url.hostname.includes('cdn.jsdelivr.net') || url.hostname.includes('unpkg.com')) {
    event.respondWith(cacheFirst(request, STATIC_CACHE));
    return;
  }

  // ④ App shell (HTML, CSS, JS locales) → Stale-while-revalidate
  if (
    url.pathname.endsWith('.html') ||
    url.pathname.endsWith('.css') ||
    url.pathname.endsWith('.js') ||
    url.pathname === '/'
  ) {
    event.respondWith(staleWhileRevalidate(request, STATIC_CACHE));
    return;
  }

  // ⑤ Assets (imágenes, audio) → Cache first con dynamic cache
  if (
    url.pathname.startsWith('/assets/') ||
    url.pathname.match(/\.(png|jpg|jpeg|svg|webp|gif|ico|mp3|ogg|woff2?)$/)
  ) {
    event.respondWith(cacheFirst(request, DYNAMIC_CACHE));
    return;
  }

  // ⑥ Todo lo demás → Network first con fallback offline
  event.respondWith(networkFirst(request, DYNAMIC_CACHE));
});

// ── Estrategias ───────────────────────────────────────────────────────────────

async function cacheFirst(request, cacheName) {
  const cached = await caches.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    return offlineFallback(request);
  }
}

async function networkFirst(request, cacheName) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    return cached || offlineFallback(request);
  }
}

async function staleWhileRevalidate(request, cacheName) {
  const cache  = await caches.open(cacheName);
  const cached = await cache.match(request);
  const fetchPromise = fetch(request).then((response) => {
    if (response.ok) cache.put(request, response.clone());
    return response;
  }).catch(() => null);
  return cached || fetchPromise || offlineFallback(request);
}

function offlineFallback(request) {
  const url = new URL(request.url);
  // Para páginas HTML → devolver el shell principal
  if (request.headers.get('accept')?.includes('text/html')) {
    return caches.match('/index.html');
  }
  // Para imágenes → SVG placeholder
  if (url.pathname.match(/\.(png|jpg|jpeg|webp|gif)$/)) {
    return new Response(
      `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="0 0 200 200">
        <rect width="200" height="200" fill="#1a1a1f"/>
        <text x="100" y="105" text-anchor="middle" fill="#666" font-size="14" font-family="sans-serif">Sin conexión</text>
      </svg>`,
      { headers: { 'Content-Type': 'image/svg+xml' } }
    );
  }
  return new Response('Sin conexión', { status: 503 });
}

// ── Notificaciones Push ───────────────────────────────────────────────────────
self.addEventListener('push', (event) => {
  if (!event.data) return;

  let data = {};
  try { data = event.data.json(); } catch { data = { title: 'FocusAI', body: event.data.text() }; }

  const options = {
    body:    data.body    || '',
    icon:    data.icon    || '/assets/icons/icon.svg',
    badge:   data.badge   || '/assets/icons/icon.svg',
    tag:     data.tag     || 'focusai-general',
    data:    data.data    || {},
    actions: data.actions || [],
    vibrate: [100, 50, 100],
    requireInteraction: data.requireInteraction || false,
  };

  event.waitUntil(
    self.registration.showNotification(data.title || 'FocusAI', options)
  );
});

// ── Click en notificación ─────────────────────────────────────────────────────
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const { action, notification } = event;
  const data = notification.data || {};
  let targetUrl = '/';

  if (action === 'complete' && data.taskId) {
    // Marcar como completada sin abrir la app
    event.waitUntil(
      self.clients.matchAll({ type: 'window' }).then((clients) => {
        clients.forEach((client) => client.postMessage({ type: 'COMPLETE_TASK', taskId: data.taskId }));
      })
    );
    return;
  }

  if (action === 'snooze' && data.taskId) {
    event.waitUntil(
      self.clients.matchAll({ type: 'window' }).then((clients) => {
        clients.forEach((client) => client.postMessage({ type: 'SNOOZE_TASK', taskId: data.taskId, minutes: 15 }));
      })
    );
    return;
  }

  if (data.url)    targetUrl = data.url;
  else if (data.view) targetUrl = `/#${data.view}`;

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      const existing = clients.find((c) => c.url.includes(self.location.origin));
      if (existing) {
        existing.focus();
        existing.navigate(targetUrl);
      } else {
        self.clients.openWindow(targetUrl);
      }
    })
  );
});

// ── Sincronización en background ──────────────────────────────────────────────
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-tasks') {
    event.waitUntil(syncPendingData('tasks'));
  } else if (event.tag === 'sync-habits') {
    event.waitUntil(syncPendingData('habits'));
  }
});

async function syncPendingData(type) {
  // Notificar a la página principal para que ejecute la sincronización
  const clients = await self.clients.matchAll({ type: 'window' });
  clients.forEach((client) => client.postMessage({ type: 'BACKGROUND_SYNC', dataType: type }));
}

// ── Mensajes desde la app principal ──────────────────────────────────────────
self.addEventListener('message', (event) => {
  const { type, payload } = event.data || {};

  if (type === 'SKIP_WAITING') {
    self.skipWaiting();
  }

  if (type === 'CACHE_URLS') {
    event.waitUntil(
      caches.open(DYNAMIC_CACHE).then((cache) => cache.addAll(payload.urls || []))
    );
  }

  if (type === 'CLEAR_CACHE') {
    event.waitUntil(
      caches.keys().then((keys) => Promise.all(keys.map((k) => caches.delete(k))))
    );
  }
});

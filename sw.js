// GradeHub Service Worker
// Estrategia: network-first para HTML (usuario siempre ve la versión más nueva),
// cache-first para assets estáticos (íconos, fuentes).
// Los datos del usuario viven en localStorage + Supabase — el SW solo maneja la app shell.

const CACHE_NAME = 'gradehub-v63';
const SHELL = [
  '/',
  '/index.html',
  '/privacidad.html',
  '/data.js',
  '/engine.js',
  '/app.js',
  '/render-agenda.js',
  '/styles.css',
  '/manifest.json',
  '/icon.svg',
  '/icon-192.png',
  '/icon-512.png',
];

// ── INSTALL: precachear la app shell ─────────────────────────────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(SHELL))
      .then(() => self.skipWaiting())
  );
});

// ── ACTIVATE: limpiar caches viejos ──────────────────────────────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys
          .filter(key => key !== CACHE_NAME)
          .map(key => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

// ── FETCH: lógica de respuesta ────────────────────────────────────────────────
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // Requests externos
  if (url.origin !== location.origin) {
    // Google Fonts: cache-then-network
    if (url.hostname.includes('fonts.googleapis.com') ||
        url.hostname.includes('fonts.gstatic.com')) {
      event.respondWith(
        caches.open(CACHE_NAME).then(cache =>
          cache.match(request).then(cached => {
            const networkFetch = fetch(request).then(response => {
              cache.put(request, response.clone());
              return response;
            });
            return cached || networkFetch;
          })
        )
      );
    }
    // Resto de externos (Supabase, etc.): pasar sin cachear
    return;
  }

  // Navegación: network-first → usuario siempre ve versión nueva online,
  // y la cacheada offline.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then(response => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(request, clone));
          return response;
        })
        .catch(() => caches.match('/index.html'))
    );
    return;
  }

  // Assets estáticos: cache-first
  event.respondWith(
    caches.match(request).then(cached =>
      cached || fetch(request).then(response => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(request, clone));
        }
        return response;
      })
    ).catch(() => {})
  );
});

// GradeHub Service Worker
// Estrategia: network-first para HTML (usuario siempre ve la versión más nueva),
// cache-first para assets estáticos (íconos, fuentes).
// Los datos del usuario viven en localStorage + Supabase — el SW solo maneja la app shell.

// Lo sella el deploy con el SHA del commit (.github/workflows/deploy.yml).
// NO lo edites a mano y NO lo vuelvas a convertir en un contador: era una línea
// que todas las ramas escribían a la vez. Seis conflictos, uno publicó un
// service worker con marcadores de conflicto adentro, y la última vez tres PRs
// reclamaron 'gradehub-v73' al mismo tiempo — el segundo y el tercero en
// mergearse habrían publicado sin cambiar el cache, en silencio.
// En local se queda en 'dev': no hay nada que invalidar sirviendo archivos.
const CACHE_NAME = 'gradehub-dev';
const SHELL = [
  '/',
  '/index.html',
  '/preguntas.html',
  '/privacidad.html',
  '/data.js?v=__ASSET_VERSION__',
  '/engine.js?v=__ASSET_VERSION__',
  '/app.js?v=__ASSET_VERSION__',
  '/app-session.js?v=__ASSET_VERSION__',
  '/marketplace.js?v=__ASSET_VERSION__',
  '/render-main.js?v=__ASSET_VERSION__',
  '/render-agenda.js?v=__ASSET_VERSION__',
  '/styles.css?v=__ASSET_VERSION__',
  '/manifest.json',
  '/icon.svg',
  '/icon.svg?v=__ASSET_VERSION__',
  '/logo.svg?v=__ASSET_VERSION__',
  '/icon.svg?v=capas-1',
  '/icon-192.png',
  '/icon-192.png?v=__ASSET_VERSION__',
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
  // cache.put solo acepta GET: un POST reventaba el handler en cada request.
  if (request.method !== 'GET') return;
  const url = new URL(request.url);

  // Requests externos
  if (url.origin !== location.origin) {
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

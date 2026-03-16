// ChipHappens — Service Worker
// Cache-first for static assets, network-first for HTML pages.
// Precache list is injected at build time by scripts/inject-precache.mjs

const CACHE_VERSION = 'v-__BUILD_HASH__';
const CACHE_NAME = `chiphappens-${CACHE_VERSION}`;

// ── Install: pre-cache all static assets ──────────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) =>
        cache.addAll([
/* __PRECACHE_ASSETS__ */
        ])
      )
      .then(() => self.skipWaiting())
  );
});

// ── Activate: delete old caches ───────────────────────────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== CACHE_NAME)
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

// ── Fetch: network-first for navigation and API, cache-first for same-origin assets ──
self.addEventListener('fetch', (event) => {
  const { request } = event;

  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (!url.protocol.startsWith('http')) return;

  const isNavigation = request.mode === 'navigate';
  // Never cache Supabase (and other external APIs) so list/group updates are visible in PWA
  const isApi = url.hostname.endsWith('.supabase.co') || url.hostname === 'supabase.co';

  if (isNavigation) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          return response;
        })
        .catch(async () => {
          // Try exact match first, then .html fallback for clean URLs
          const cached = await caches.match(request);
          if (cached) return cached;

          // /side-pot -> /side-pot.html (root fallback for offline)
          const htmlUrl = request.url.replace(/\/?$/, '.html').replace('/.html', '.html');
          const htmlCached = await caches.match(htmlUrl);
          if (htmlCached) return htmlCached;

          // Last resort: serve the index page
          return caches.match('/') || caches.match('/index.html');
        })
    );
  } else if (isApi) {
    // API requests: network-only so new groups/settings show up after mutations
    event.respondWith(fetch(request));
  } else {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ||
          fetch(request).then((response) => {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
            return response;
          })
      )
    );
  }
});

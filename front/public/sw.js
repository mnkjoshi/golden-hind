// Golden Hind service worker
// Strategy:
//   - HTML navigation: network-first, fall back to cached shell (so a fresh deploy
//     is picked up immediately but the app still loads offline).
//   - Static assets (/, /assets/*, icons, manifest): stale-while-revalidate.
//   - Anything else (API calls, TMDB images, proxy streams): bypass — never cache.

const VERSION = 'ghind-v1';
const SHELL_CACHE = `${VERSION}-shell`;
const ASSET_CACHE = `${VERSION}-assets`;

const SHELL_URLS = ['/', '/app', '/manifest.webmanifest', '/icon-512.png'];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(SHELL_CACHE).then((cache) => cache.addAll(SHELL_URLS)).then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) =>
            Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k)))
        ).then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', (event) => {
    const req = event.request;
    if (req.method !== 'GET') return;

    const url = new URL(req.url);

    // Skip cross-origin (API, TMDB, proxied streams) — fetch directly.
    if (url.origin !== self.location.origin) return;

    // Navigation requests: network-first with cached shell fallback.
    if (req.mode === 'navigate') {
        event.respondWith(
            fetch(req).then((res) => {
                const copy = res.clone();
                caches.open(SHELL_CACHE).then((cache) => cache.put(req, copy)).catch(() => {});
                return res;
            }).catch(() => caches.match(req).then((cached) => cached || caches.match('/')))
        );
        return;
    }

    // Built bundles + public files: stale-while-revalidate.
    if (url.pathname.startsWith('/assets/') || /\.(js|css|svg|png|webp|jpg|woff2?)$/.test(url.pathname)) {
        event.respondWith(
            caches.open(ASSET_CACHE).then(async (cache) => {
                const cached = await cache.match(req);
                const network = fetch(req).then((res) => {
                    if (res.ok) cache.put(req, res.clone()).catch(() => {});
                    return res;
                }).catch(() => cached);
                return cached || network;
            })
        );
    }
});

// Golden Hind service worker
// Strategy:
//   - HTML navigation: network-first (revalidating), fall back to the cached
//     shell — so a deploy is picked up immediately but the app still opens
//     offline (the router then shows the Downloads page).
//   - Static assets (/assets/*, icons, manifest): stale-while-revalidate.
//   - /offline-video/<key>: movies/episodes saved on this device, served from
//     the gh-offline-videos cache with Range support (video players request
//     byte ranges, iOS Safari always does).
//   - Cross-origin images (posters, covers): network, falling back to art
//     saved alongside downloads (gh-offline-art).
//   - Anything else (API calls, proxy streams): bypass — never cache.

const VERSION = 'ghind-v3';
const SHELL_CACHE = `${VERSION}-shell`;
const ASSET_CACHE = `${VERSION}-assets`;
// Downloads live in their own caches and must survive app updates.
const OFFLINE_VIDEOS = 'gh-offline-videos';

const SHELL_URLS = ['/', '/app', '/manifest.webmanifest', '/icon-512.png'];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(SHELL_CACHE).then((cache) => cache.addAll(SHELL_URLS)).then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) =>
            // Only old *app* caches — never the gh-offline-* downloads.
            Promise.all(keys.filter((k) => k.startsWith('ghind-') && !k.startsWith(VERSION)).map((k) => caches.delete(k)))
        ).then(() => self.clients.claim())
    );
});

async function serveOfflineVideo(req) {
    const cache = await caches.open(OFFLINE_VIDEOS);
    const cached = await cache.match(req.url);
    if (!cached) return new Response('Not downloaded on this device', { status: 404 });
    const range = req.headers.get('range');
    if (!range) return cached;
    const blob = await cached.blob();
    const size = blob.size;
    const m = /bytes=(\d*)-(\d*)/.exec(range);
    if (!m) return cached;
    let start, end;
    if (m[1] === '') { start = Math.max(0, size - Number(m[2])); end = size - 1; }
    else { start = Number(m[1]); end = m[2] === '' ? size - 1 : Math.min(Number(m[2]), size - 1); }
    if (start >= size || start > end) {
        return new Response('', { status: 416, headers: { 'Content-Range': `bytes */${size}` } });
    }
    return new Response(blob.slice(start, end + 1), {
        status: 206,
        headers: {
            'Content-Type': cached.headers.get('Content-Type') || 'video/mp4',
            'Content-Range': `bytes ${start}-${end}/${size}`,
            'Content-Length': String(end - start + 1),
            'Accept-Ranges': 'bytes',
        },
    });
}

self.addEventListener('fetch', (event) => {
    const req = event.request;
    if (req.method !== 'GET') return;

    const url = new URL(req.url);

    if (url.origin !== self.location.origin) {
        // Posters and covers: network first, saved art when offline.
        if (req.destination === 'image') {
            event.respondWith(
                fetch(req).catch(() => caches.match(req, { ignoreVary: true }).then((r) => r || Response.error()))
            );
        }
        return; // API, TMDB data, proxied streams: straight to the network
    }

    if (url.pathname.startsWith('/offline-video/')) {
        event.respondWith(serveOfflineVideo(req));
        return;
    }

    // Navigation requests: network-first with cached shell fallback. The
    // no-cache mode makes the network leg revalidate with the server instead
    // of reusing the browser's HTTP-cached HTML — otherwise a stale page (and
    // the old bundle it points at) can outlive a deploy.
    if (req.mode === 'navigate') {
        event.respondWith(
            fetch(req, { cache: 'no-cache' }).then((res) => {
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

// Artwork saved with downloads so covers and posters still show offline. The
// service worker falls back to this cache for cross-origin images.
const ART_CACHE = 'gh-offline-art';

export async function saveArt(urls) {
    if (typeof caches === 'undefined') return;
    try {
        const cache = await caches.open(ART_CACHE);
        await Promise.all(urls.filter(Boolean).map(async (url) => {
            const req = new Request(url, { mode: 'no-cors' });
            try { await cache.put(req, await fetch(req)); } catch { /* art is best-effort */ }
        }));
    } catch { /* storage unavailable */ }
}

// Recommendation-cache helpers, extracted from server.js for unit testing.
//
// AI recommendations are expensive (a Gemini call plus a TMDB lookup per
// pick), so the server keeps the last computed list per user+mode in RTDB and
// serves it stale-while-revalidate: cached rows return instantly and a
// background recompute runs when the cache is old or the inputs that produced
// it (favourites / continue-watching) have changed.

// Which library items feed each mode. 'lifetime' weighs the whole library
// (all bookmarks + the 5 most recent continues); 'recent' looks only at the
// last 5 things watched.
export function recSourceIds(favIds, contIds, mode) {
    const favs = Array.isArray(favIds) ? favIds : [];
    const conts = Array.isArray(contIds) ? contIds : [];
    return mode === 'lifetime' ? [...favs, ...conts.slice(-5)] : conts.slice(-5);
}

// Canonical fingerprint of the inputs — stored alongside the cache so a
// library change invalidates it even before the TTL runs out.
export function recSourceKey(favIds, contIds, mode) {
    return JSON.stringify(recSourceIds(favIds, contIds, mode));
}

// A cache entry is fresh when it's younger than the TTL AND was computed from
// the same inputs the user has now.
export function recCacheIsFresh(cached, sourceKey, now, ttlMs) {
    return !!(cached
        && typeof cached.ts === 'number'
        && now - cached.ts < ttlMs
        && cached.inputKey === sourceKey);
}

// Cached items are stored as a JSON string (matching the app-wide convention
// for lists in RTDB). Returns the parsed non-empty array, or null when the
// entry is missing/corrupt/empty — callers treat null as "compute inline".
export function parseCachedRecItems(cached) {
    if (!cached || typeof cached.items !== 'string') return null;
    try {
        const items = JSON.parse(cached.items);
        return Array.isArray(items) && items.length > 0 ? items : null;
    } catch {
        return null;
    }
}

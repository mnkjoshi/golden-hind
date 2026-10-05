// Songs downloaded to THIS device for offline playback, kept as MP3 blobs in
// IndexedDB (the music player prefers these over streaming). Everything here
// degrades to "nothing downloaded" if IndexedDB is unavailable.
const API = 'https://ghb.mnkjoshi.ca';
const DB_NAME = 'gh-music';
const STORE = 'songs';

let dbPromise = null;
function openDb() {
    if (!dbPromise) {
        dbPromise = new Promise((resolve, reject) => {
            if (typeof indexedDB === 'undefined') return reject(new Error('no indexedDB'));
            const req = indexedDB.open(DB_NAME, 1);
            req.onupgradeneeded = () => req.result.createObjectStore(STORE);
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
        });
        dbPromise.catch(() => { dbPromise = null; });
    }
    return dbPromise;
}

function tx(mode, fn) {
    return openDb().then(db => new Promise((resolve, reject) => {
        const t = db.transaction(STORE, mode);
        const result = fn(t.objectStore(STORE));
        t.oncomplete = () => resolve(result?.result ?? result);
        t.onerror = () => reject(t.error);
        t.onabort = () => reject(t.error);
    }));
}

const objectUrls = new Map(); // videoId -> blob: URL (one per song, reused)

export async function getOfflineUrl(videoId) {
    if (objectUrls.has(videoId)) return objectUrls.get(videoId);
    try {
        const blob = await tx('readonly', s => s.get(videoId));
        if (!blob) return null;
        const url = URL.createObjectURL(blob);
        objectUrls.set(videoId, url);
        return url;
    } catch {
        return null;
    }
}

export async function listOffline() {
    try {
        return new Set(await tx('readonly', s => s.getAllKeys()));
    } catch {
        return new Set();
    }
}

// Download one song onto this device. Asks the browser to keep our storage
// (so iOS/Chrome don't evict it under pressure) the first time.
export async function saveOffline(videoId) {
    if (navigator.storage?.persist) navigator.storage.persist().catch(() => {});
    const user = localStorage.getItem('user');
    const token = localStorage.getItem('token');
    const res = await fetch(`${API}/music/stream/${videoId}?user=${encodeURIComponent(user)}&token=${encodeURIComponent(token)}`);
    if (!res.ok) {
        let msg = 'Download failed';
        try { msg = (await res.json()).error || msg; } catch { /* not JSON */ }
        throw new Error(msg);
    }
    const blob = await res.blob();
    await tx('readwrite', s => s.put(blob, videoId));
    return blob.size;
}

export async function removeOffline(videoId) {
    const url = objectUrls.get(videoId);
    if (url) { URL.revokeObjectURL(url); objectUrls.delete(videoId); }
    try { await tx('readwrite', s => s.delete(videoId)); } catch { /* already gone */ }
}

export async function offlineUsageBytes() {
    try { return (await navigator.storage.estimate()).usage || 0; } catch { return 0; }
}

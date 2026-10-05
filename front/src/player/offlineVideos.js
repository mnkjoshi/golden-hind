// Movies and episodes saved on THIS device. The MP4 streams straight into
// Cache Storage (never fully in memory — films are gigabytes) under
// /offline-video/<key>, which the service worker serves with Range support.
// Metadata (title, poster, size) is kept in localStorage.
import { saveArt } from './offlineArt.js';

const API = 'https://ghb.mnkjoshi.ca';
const VIDEO_CACHE = 'gh-offline-videos';
const META_KEY = 'offlineVideos';

export const videoKey = (contentId, season, episode) =>
    (contentId[0] === 't' ? `${contentId}-s${parseInt(season) || 1}e${parseInt(episode) || 1}` : contentId);
export const offlineVideoUrl = (key) => `/offline-video/${key}`;

export function listVideos() {
    try { return JSON.parse(localStorage.getItem(META_KEY) || '[]'); } catch { return []; }
}
function writeMeta(list) {
    try { localStorage.setItem(META_KEY, JSON.stringify(list)); } catch { /* quota */ }
}
export const isVideoSaved = (key) => listVideos().some(v => v.key === key);

const auth = () => ({ user: localStorage.getItem('user'), token: localStorage.getItem('token') });
const params = (contentId, season, episode) => {
    const { user, token } = auth();
    const p = new URLSearchParams({ user, token, id: contentId });
    if (contentId[0] === 't') { p.set('season', season); p.set('episode', episode); }
    return p;
};

// Ask the server to prepare the file, polling until it's ready.
export async function waitUntilPrepared(contentId, season, episode, onProgress, signal) {
    for (;;) {
        if (signal?.aborted) throw new DOMException('Cancelled', 'AbortError');
        const { user, token } = auth();
        const res = await fetch(`${API}/download/video/prepare`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, signal,
            body: JSON.stringify({ user, token, id: contentId, season, episode }),
        });
        const body = await res.json().catch(() => ({}));
        if (body.status === 'ready') return body;
        if (body.status === 'error' || !res.ok) throw new Error(body.error || 'Could not prepare this video.');
        onProgress?.({ phase: body.status === 'busy' ? 'queued' : 'preparing' });
        await new Promise(r => setTimeout(r, 5000));
    }
}

export const videoFileUrl = (contentId, season, episode) => `${API}/download/video/file?${params(contentId, season, episode)}`;

export async function saveVideo({ contentId, season, episode, title, poster }, onProgress, signal) {
    if (typeof caches === 'undefined') throw new Error("This browser can't save videos offline.");
    if (navigator.storage?.persist) navigator.storage.persist().catch(() => {});
    const key = videoKey(contentId, season, episode);

    const prepared = await waitUntilPrepared(contentId, season, episode, onProgress, signal);
    const res = await fetch(videoFileUrl(contentId, season, episode), { signal });
    if (!res.ok || !res.body) throw new Error('Download failed');
    const total = Number(res.headers.get('content-length')) || prepared.size || 0;
    let loaded = 0;
    const counted = res.body.pipeThrough(new TransformStream({
        transform(chunk, controller) {
            loaded += chunk.byteLength;
            onProgress?.({ phase: 'downloading', loaded, total });
            controller.enqueue(chunk);
        },
    }));
    const cache = await caches.open(VIDEO_CACHE);
    await cache.put(new Request(new URL(offlineVideoUrl(key), location.origin).href), new Response(counted, {
        headers: { 'Content-Type': 'video/mp4', ...(total ? { 'Content-Length': String(total) } : {}) },
    }));
    await saveArt([poster]);

    const list = listVideos().filter(v => v.key !== key);
    list.unshift({ key, contentId, season: contentId[0] === 't' ? parseInt(season) : null, episode: contentId[0] === 't' ? parseInt(episode) : null, title, poster, size: loaded, savedAt: Date.now() });
    writeMeta(list);
    return key;
}

export async function removeVideo(key) {
    try { await (await caches.open(VIDEO_CACHE)).delete(new URL(offlineVideoUrl(key), location.origin).href); } catch { /* gone */ }
    writeMeta(listVideos().filter(v => v.key !== key));
    try { localStorage.removeItem(`offlinePos_${key}`); } catch { /* noop */ }
}

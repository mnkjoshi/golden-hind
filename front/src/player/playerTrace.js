// Playback trace for debugging background playback (e.g. a locked iPhone
// that "plays" with no sound after AirPods go back in). Events are kept in
// localStorage — the page may be frozen or offline when they happen — and
// uploaded to the server log whenever the app is up and online.
const API = 'https://ghb.mnkjoshi.ca';
const KEY = 'playerTrace';
const MAX = 400;
const BUILD = 'trace-1';

let buf = [];
try { buf = JSON.parse(localStorage.getItem(KEY) || '[]'); } catch { buf = []; }

const save = () => { try { localStorage.setItem(KEY, JSON.stringify(buf.slice(-MAX))); } catch { /* quota */ } };

export function trace(event, data = {}) {
    buf.push({
        t: Date.now(),
        e: event,
        vis: typeof document !== 'undefined' ? document.visibilityState[0] : '?',
        ...data,
    });
    if (buf.length > MAX) buf = buf.slice(-MAX);
    save();
}

// Snapshot of an <audio> element worth logging alongside an event.
export const audioInfo = (a) => a ? {
    paused: a.paused,
    ct: Math.round((a.currentTime || 0) * 10) / 10,
    rs: a.readyState,
    ns: a.networkState,
    err: a.error ? a.error.code : 0,
    src: a.currentSrc ? (a.currentSrc.startsWith('blob:') ? 'blob' : 'net') : 'none',
} : {};

let flushing = false;
export async function flushTrace(clientId) {
    if (flushing || !buf.length || (typeof navigator !== 'undefined' && navigator.onLine === false)) return;
    const user = localStorage.getItem('user');
    const token = localStorage.getItem('token');
    if (!user || !token) return;
    flushing = true;
    const entries = buf.slice(0, 200);
    try {
        const r = await fetch(`${API}/music/player/trace`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ user, token, clientId, build: BUILD, ua: navigator.userAgent, entries }),
            keepalive: true,
        });
        if (r.ok) { buf = buf.slice(entries.length); save(); }
    } catch { /* try again next time */ }
    flushing = false;
}

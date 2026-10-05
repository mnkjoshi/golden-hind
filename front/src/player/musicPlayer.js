// Shared music player engine (Spotify Connect-style).
//
// One module-level <audio> element and one SSE connection, so playback
// survives page changes (components only subscribe). The account-wide state
// lives at users/{u}/player on the server: exactly one tab — the "active
// device" — produces sound and reports its progress; every other signed-in
// tab mirrors the state and can pause/skip/seek it or take over ("Play here").
// A tab is the unit of "device" (per-tab id in sessionStorage), so two tabs
// in one browser never play at once.
import axios from 'axios';
import { useSyncExternalStore } from 'react';
import { defaultDeviceName } from '../utils/remote.js';
import { nextIndex, prevAction, estimateRemotePosition } from '../utils/player.js';
import { getOfflineUrl } from './offlineSongs.js';

const API = 'https://ghb.mnkjoshi.ca';
const REPORT_EVERY_MS = 10000;

function tabId() {
    try {
        let id = sessionStorage.getItem('playerTabId');
        if (!id) {
            id = 't' + Math.random().toString(36).slice(2, 12);
            sessionStorage.setItem('playerTabId', id);
        }
        return id;
    } catch {
        return 't' + Math.random().toString(36).slice(2, 12);
    }
}
const CLIENT_ID = tabId();
const deviceName = () => localStorage.getItem('remoteDeviceName')
    || defaultDeviceName(navigator.userAgent, false);
const auth = () => ({ user: localStorage.getItem('user'), token: localStorage.getItem('token') });

const audio = typeof Audio !== 'undefined' ? new Audio() : null;
if (audio) audio.preload = 'auto';

let state = {
    queue: [],            // video ids
    index: 0,
    paused: true,
    position: 0,          // last known position (local audio, or remote report)
    positionAt: 0,        // server time of a remote report
    clockOffset: 0,       // serverNow - localNow
    duration: 0,
    shuffle: false,
    repeat: 'off',
    activeDevice: null,   // { id, name }
    songs: {},            // videoId -> { title, artist, thumbnail }
    connected: false,
    blocked: false,       // browser refused to start audio without a tap
    loading: false,
    error: '',
    expanded: false,      // full-screen player open (phone-style "Now Playing")
    dismissed: false,     // bar hidden on this device (closed, or app just reopened)
};
const listeners = new Set();
const set = (patch) => { state = { ...state, ...patch }; listeners.forEach(fn => fn()); };

export const isActiveHere = (s = state) => s.activeDevice?.id === CLIENT_ID;
export const currentSong = (s = state) => {
    const id = s.queue[s.index];
    return id ? { videoId: id, ...(s.songs[id] || { title: 'Loading…', artist: '' }) } : null;
};
export const coverUrl = (videoId) => `${API}/music/cover/${videoId}`;
export const streamUrl = (videoId, download = false) => {
    const { user, token } = auth();
    return `${API}/music/stream/${videoId}?user=${encodeURIComponent(user)}&token=${encodeURIComponent(token)}${download ? '&download=1' : ''}`;
};
// The playing device reports every 10s; silence past 30s means it's gone
// (tab closed, laptop asleep) and its "playing" state can't be trusted.
export function remoteIsStale(s = state) {
    return !isActiveHere(s) && !s.paused && !!s.positionAt
        && Date.now() + s.clockOffset - s.positionAt > 30000;
}
export function displayPosition(s = state) {
    if (isActiveHere(s)) return s.position;
    if (remoteIsStale(s)) return s.position;
    return estimateRemotePosition(s, Date.now(), s.clockOffset, s.duration);
}

// ── Server sync ─────────────────────────────────────────────────────────────

function send(patch) {
    const { user, token } = auth();
    if (!user || !token) return;
    axios.post(`${API}/music/player/update`, { user, token, clientId: CLIENT_ID, patch }).catch(() => {});
}

let lastReport = 0;
function report(force = false) {
    if (!isActiveHere() || !audio) return;
    const now = Date.now();
    if (!force && now - lastReport < REPORT_EVERY_MS) return;
    lastReport = now;
    send({ index: state.index, position: audio.currentTime || 0, paused: audio.paused });
}

let es = null;
let started = false;
function connect() {
    const { user, token } = auth();
    if (!user || !token) return;
    es = new EventSource(`${API}/music/player/stream?user=${encodeURIComponent(user)}`
        + `&token=${encodeURIComponent(token)}&clientId=${encodeURIComponent(CLIENT_ID)}`);
    es.onopen = () => set({ connected: true });
    es.onmessage = (ev) => {
        try { applyRemote(JSON.parse(ev.data)); } catch { /* malformed */ }
    };
    es.onerror = () => {
        set({ connected: false });
        if (es.readyState === EventSource.CLOSED) {
            try { es.close(); } catch { /* noop */ }
            setTimeout(connect, 3000);
        }
    };
}

export function ensureStarted() {
    if (started || !audio) return;
    started = true;
    connect();
    refreshLibrary();
}

export async function refreshLibrary() {
    const { user, token } = auth();
    if (!user || !token) return [];
    try {
        const r = await axios.post(`${API}/music/library`, { user, token });
        const list = r.data?.songs || [];
        try { localStorage.setItem('musicLibraryCache', JSON.stringify(list)); } catch { /* quota */ }
        mergeSongs(list);
        return list;
    } catch {
        // Offline: fall back to the last list we saw.
        const cached = cachedLibrary();
        mergeSongs(cached);
        return cached;
    }
}

export function cachedLibrary() {
    try { return JSON.parse(localStorage.getItem('musicLibraryCache') || '[]'); } catch { return []; }
}

function mergeSongs(list) {
    if (!list?.length) return;
    const songs = { ...state.songs };
    for (const s of list) songs[s.videoId] = { title: s.title, artist: s.artist, thumbnail: s.thumbnail };
    set({ songs });
}

let gotSnapshot = false;

// State from another tab (or our own initial snapshot on connect).
function applyRemote(s) {
    const isSnapshot = !gotSnapshot;
    gotSnapshot = true;
    const clockOffset = s.serverNow ? s.serverNow - Date.now() : state.clockOffset;
    const next = {
        queue: Array.isArray(s.queue) ? s.queue : state.queue,
        index: Number.isInteger(s.index) ? s.index : state.index,
        paused: typeof s.paused === 'boolean' ? s.paused : state.paused,
        position: typeof s.position === 'number' ? s.position : state.position,
        positionAt: s.positionAt || state.positionAt,
        shuffle: !!s.shuffle,
        repeat: s.repeat || 'off',
        activeDevice: s.activeDevice || null,
        clockOffset,
    };
    const wasActive = isActiveHere();
    set(next);
    // Opening the app: unless something is actively playing on another
    // device, start with the player dismissed (like a freshly launched app).
    // Later: whenever another device starts playing, show it again.
    const playingElsewhere = !isActiveHere() && !state.paused && !remoteIsStale();
    if (isSnapshot) set({ dismissed: !playingElsewhere });
    else if (playingElsewhere) set({ dismissed: false });
    if (next.queue.some(id => !state.songs[id])) refreshLibrary();

    if (isActiveHere()) {
        // Another device changed what we're playing: follow it.
        const id = state.queue[state.index];
        const target = estimateRemotePosition(state, Date.now(), clockOffset);
        if (id && loadedId !== id && isSnapshot) {
            // This tab was the player before a reload: come back paused (and
            // dismissed) rather than blasting audio unprompted.
            set({ paused: true, position: state.position });
            send({ paused: true, position: state.position });
        } else if (id && loadedId !== id) {
            loadAndPlay(target, !state.paused);
        } else if (audio) {
            if (Math.abs((audio.currentTime || 0) - target) > 2.5) audio.currentTime = target;
            if (state.paused && !audio.paused) audio.pause();
            if (!state.paused && audio.paused) tryPlay();
        }
    } else if (wasActive || (audio && !audio.paused)) {
        // Playback moved to another device.
        audio?.pause();
    }
}

// ── Local audio ─────────────────────────────────────────────────────────────

let loadedId = null;

async function loadAndPlay(startAt = 0, autoplay = true) {
    if (!audio) return;
    const id = state.queue[state.index];
    if (!id) return;
    loadedId = id;
    set({ loading: true, error: '', duration: 0, position: startAt });
    audio.src = (await getOfflineUrl(id)) || streamUrl(id);
    const seek = () => {
        if (startAt > 0) audio.currentTime = startAt;
        audio.removeEventListener('loadedmetadata', seek);
    };
    audio.addEventListener('loadedmetadata', seek);
    if (autoplay) tryPlay();
    updateMediaSession();
}

function tryPlay() {
    audio.play().then(() => set({ blocked: false })).catch((e) => {
        if (e?.name === 'NotAllowedError') set({ blocked: true });
    });
}

if (audio) {
    audio.addEventListener('timeupdate', () => {
        if (!isActiveHere()) return;
        set({ position: audio.currentTime || 0 });
        report();
        updatePositionState();
    });
    audio.addEventListener('loadedmetadata', () => { set({ duration: audio.duration || 0, loading: false }); updatePositionState(true); });
    audio.addEventListener('playing', () => {
        set({ paused: false, loading: false });
        report(true);
        if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'playing';
        updatePositionState(true);
    });
    audio.addEventListener('pause', () => {
        if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'paused';
        if (isActiveHere()) { set({ paused: true }); report(true); }
    });
    audio.addEventListener('waiting', () => set({ loading: true }));
    audio.addEventListener('ended', () => { if (isActiveHere()) next(true); });
    audio.addEventListener('error', () => {
        if (!audio.src) return;
        set({ loading: false, error: "Couldn't load this song." });
    });
}

// Lock-screen / Control Center scrubber.
let lastPositionState = 0;
function updatePositionState(force = false) {
    if (!('mediaSession' in navigator) || !navigator.mediaSession.setPositionState || !audio) return;
    const now = Date.now();
    if (!force && now - lastPositionState < 5000) return;
    lastPositionState = now;
    const duration = audio.duration;
    if (!Number.isFinite(duration) || duration <= 0) return;
    try {
        navigator.mediaSession.setPositionState({
            duration,
            position: Math.min(audio.currentTime || 0, duration),
            playbackRate: audio.playbackRate || 1,
        });
    } catch { /* unsupported */ }
}

function updateMediaSession() {
    if (!('mediaSession' in navigator)) return;
    const song = currentSong();
    if (!song) return;
    try {
        navigator.mediaSession.metadata = new MediaMetadata({
            title: song.title,
            artist: song.artist,
            album: 'Golden Hind',
            artwork: [
                { src: coverUrl(song.videoId), sizes: '600x600', type: 'image/jpeg' },
                { src: `https://i.ytimg.com/vi/${song.videoId}/hqdefault.jpg`, sizes: '480x360', type: 'image/jpeg' },
            ],
        });
    } catch { /* unsupported */ }
}
if (typeof navigator !== 'undefined' && 'mediaSession' in navigator) {
    const handlers = {
        play: () => togglePlay(false),
        pause: () => togglePlay(true),
        previoustrack: () => prev(),
        nexttrack: () => next(),
        seekto: (d) => seek(d.seekTime),
        // Left unset on purpose: iOS shows ±10s buttons instead of previous/
        // next track whenever seek handlers exist, and track skipping is what
        // a music player's lock screen should offer.
        seekbackward: null,
        seekforward: null,
    };
    for (const [action, fn] of Object.entries(handlers)) {
        try { navigator.mediaSession.setActionHandler(action, fn); } catch { /* unsupported */ }
    }
}

// ── Actions (work from any device) ──────────────────────────────────────────

const me = () => ({ id: CLIENT_ID, name: deviceName() });

// Start a queue on THIS device (tapping play makes it the active device).
export function playQueue(songs, startIndex = 0) {
    if (!songs?.length) return;
    mergeSongs(songs);
    const queue = songs.map(s => s.videoId);
    set({ queue, index: startIndex, paused: false, position: 0, activeDevice: me(), dismissed: false });
    loadAndPlay(0, true);
    send({ queue, index: startIndex, position: 0, paused: false, activeDevice: me(), shuffle: state.shuffle, repeat: state.repeat });
}

export function togglePlay(forcePaused) {
    if (!currentSong()) return;
    // The device that was playing is gone — play here instead.
    if (remoteIsStale() || (!state.activeDevice && forcePaused !== true)) return transferHere();
    const pause = typeof forcePaused === 'boolean' ? forcePaused : !state.paused;
    if (isActiveHere()) {
        if (pause) audio.pause();
        else if (loadedId !== state.queue[state.index]) loadAndPlay(state.position, true);
        else tryPlay();
    } else {
        set({ paused: pause });
        send({ paused: pause });
    }
}

function goTo(index, startAt = 0) {
    set({ index, position: startAt, paused: false });
    if (isActiveHere()) {
        loadAndPlay(startAt, true);
        send({ index, position: startAt, paused: false });
    } else {
        send({ index, position: startAt, paused: false });
    }
}

export function next(fromEnded = false) {
    const i = nextIndex({ length: state.queue.length, index: state.index, shuffle: state.shuffle, repeat: state.repeat });
    if (i === null) {
        if (fromEnded) { set({ paused: true }); report(true); }
        return;
    }
    if (i === state.index && isActiveHere()) { audio.currentTime = 0; tryPlay(); return; }
    goTo(i);
}

export function prev() {
    const action = prevAction({ length: state.queue.length, index: state.index, position: displayPosition() });
    if (action.type === 'restart') seek(0);
    else if (action.type === 'index') goTo(action.index);
}

export function playIndex(index) {
    if (index >= 0 && index < state.queue.length) goTo(index);
}

export function seek(seconds) {
    const t = Math.max(0, Number(seconds) || 0);
    if (isActiveHere()) {
        audio.currentTime = t;
        set({ position: t });
        report(true);
    } else {
        set({ position: t, positionAt: Date.now() + state.clockOffset });
        send({ position: t });
    }
}

export function setVolume(v) {
    if (!audio) return;
    audio.volume = Math.min(1, Math.max(0, v));
    try { localStorage.setItem('musicVolume', String(audio.volume)); } catch { /* noop */ }
    set({});
}
export const getVolume = () => audio?.volume ?? 1;
try {
    const v = parseFloat(localStorage.getItem('musicVolume'));
    if (audio && Number.isFinite(v)) audio.volume = v;
} catch { /* noop */ }

export function setShuffle(on) { set({ shuffle: on }); send({ shuffle: on }); }
export function setRepeat(mode) { set({ repeat: mode }); send({ repeat: mode }); }

// Move playback to this device, picking up where the other one is.
export function transferHere() {
    if (!currentSong()) return;
    const at = displayPosition();
    set({ activeDevice: me(), position: at, paused: false, dismissed: false });
    loadAndPlay(at, true);
    send({ activeDevice: me(), position: at, paused: false, index: state.index });
}

// Starting a video pauses the music if it's playing here.
export function pauseForVideo() {
    if (isActiveHere() && audio && !audio.paused) audio.pause();
}

export function setExpanded(open) { set({ expanded: !!open }); }

// Bring a dismissed player back, opened full-screen ("Jump back in").
export function reopenPlayer() { set({ dismissed: false, expanded: true }); }

// "×" on the player: stop playing here (if this is the playing device) and
// hide the bar on this device. Other devices are left alone.
export function closePlayer() {
    if (isActiveHere() && audio && !audio.paused) audio.pause();
    set({ dismissed: true, expanded: false });
}

// Closing the app (or tab) while it's the one playing: tell the server it's
// paused, so other devices don't show it as still playing. sendBeacon is the
// only request that survives page teardown; it can't send JSON cross-origin,
// so the body goes as text/plain (the server accepts that for this route).
if (typeof window !== 'undefined') {
    window.addEventListener('pagehide', () => {
        if (!isActiveHere() || !audio || audio.paused || !navigator.sendBeacon) return;
        const { user, token } = auth();
        if (!user || !token) return;
        const body = JSON.stringify({ user, token, clientId: CLIENT_ID, patch: { paused: true, position: audio.currentTime || 0 } });
        navigator.sendBeacon(`${API}/music/player/update`, new Blob([body], { type: 'text/plain' }));
    });
}

export function subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }
export const getState = () => state;
export function useMusicPlayer() {
    return useSyncExternalStore(subscribe, getState);
}

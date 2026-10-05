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
import { nextIndex, prevAction, estimateRemotePosition, shuffleOrder, isStaleOwnEcho } from '../utils/player.js';
import { getOfflineUrl } from './offlineSongs.js';
import { trace, audioInfo, flushTrace } from './playerTrace.js';

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
export const deviceName = () => localStorage.getItem('remoteDeviceName')
    || defaultDeviceName(navigator.userAgent, false, navigator.maxTouchPoints);
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
    originalQueue: null,  // queue order before shuffling, to restore on un-shuffle
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
// The server pings every 25s. A stream can die silently (the phone slept and
// iOS dropped the socket without an error), so silence past this reconnects.
const STREAM_SILENCE_MS = 60000;
let lastStreamActivity = 0;
let retryTimer = null;
function connect() {
    const { user, token } = auth();
    if (!user || !token) return;
    clearTimeout(retryTimer);
    if (es) { try { es.close(); } catch { /* noop */ } }
    lastStreamActivity = Date.now();
    const source = new EventSource(`${API}/music/player/stream?user=${encodeURIComponent(user)}`
        + `&token=${encodeURIComponent(token)}&clientId=${encodeURIComponent(CLIENT_ID)}`);
    es = source;
    source.onopen = () => { lastStreamActivity = Date.now(); trace('sse:open'); set({ connected: true }); };
    source.onmessage = (ev) => {
        lastStreamActivity = Date.now();
        try { applyRemote(JSON.parse(ev.data)); } catch { /* malformed */ }
    };
    source.addEventListener('ping', () => { lastStreamActivity = Date.now(); });
    source.onerror = () => {
        if (es !== source) return;
        trace('sse:error', { rs: source.readyState });
        set({ connected: false });
        if (source.readyState === EventSource.CLOSED) {
            try { source.close(); } catch { /* noop */ }
            retryTimer = setTimeout(connect, 3000);
        }
    };
}
const streamIsSilent = () => es && Date.now() - lastStreamActivity > STREAM_SILENCE_MS;
if (typeof window !== 'undefined') {
    setInterval(() => { if (started && streamIsSilent()) connect(); }, 20000);
    // Unlocking / returning to the app: timers were frozen, so check now.
    const revive = (ev) => {
        trace(`page:${ev?.type}`, { ...audioInfo(audio), state: state.paused ? 'paused' : 'playing' });
        // Back in the app: an ordinary pause again, no need to stay awake.
        if (document.visibilityState === 'visible') restoreFromHold('visible');
        if (document.visibilityState === 'visible') flushTrace(CLIENT_ID);
        if (started && document.visibilityState === 'visible' && streamIsSilent()) connect();
    };
    document.addEventListener('visibilitychange', revive);
    window.addEventListener('pageshow', revive);
    window.addEventListener('online', () => { trace('net:online'); if (started) connect(); });
    window.addEventListener('offline', () => trace('net:offline'));
    window.addEventListener('pagehide', () => trace('page:pagehide', audioInfo(audio)));
    document.addEventListener('freeze', () => trace('page:freeze'));
    document.addEventListener('resume', () => trace('page:resume'));
    setInterval(() => { if (document.visibilityState === 'visible') flushTrace(CLIENT_ID); }, 15000);
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
    // e.g. locked phone: AirPods out → paused (reported), iOS suspends the
    // page and drops this stream; AirPods in → play() → the stream reconnects
    // and replays our own "paused", which would stop the song mid-resume.
    const ownEcho = isStaleOwnEcho({ updatedBy: s.updatedBy, clientId: CLIENT_ID, activeHere: isActiveHere(), audioLoaded: !!loadedId, firstSnapshot: isSnapshot });
    trace('remote', { paused: s.paused, by: s.updatedBy === CLIENT_ID ? 'me' : 'other', snap: isSnapshot, ignored: ownEcho, ...audioInfo(audio) });
    if (ownEcho) {
        set({ clockOffset });
        return;
    }
    const next = {
        queue: Array.isArray(s.queue) ? s.queue : state.queue,
        index: Number.isInteger(s.index) ? s.index : state.index,
        paused: typeof s.paused === 'boolean' ? s.paused : state.paused,
        position: typeof s.position === 'number' ? s.position : state.position,
        positionAt: s.positionAt || state.positionAt,
        shuffle: !!s.shuffle,
        originalQueue: Array.isArray(s.originalQueue) ? s.originalQueue : null,
        repeat: s.repeat || 'off',
        activeDevice: s.activeDevice || null,
        clockOffset,
    };
    // Watching another device: its reported length drives the seek bar here.
    // (The playing device keeps the length its own <audio> element reports.)
    if (s.activeDevice?.id !== CLIENT_ID) next.duration = typeof s.duration === 'number' ? s.duration : 0;
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
        } else if (holding) {
            // Another device pressed play (or moved the position) for us.
            heldAt = target;
            if (!state.paused) resumeFromHold('remote');
        } else if (audio) {
            if (Math.abs((audio.currentTime || 0) - target) > 2.5) audio.currentTime = target;
            if (state.paused && !audio.paused) audio.pause();
            if (!state.paused && audio.paused) tryPlay();
        }
    } else if (wasActive || (audio && !audio.paused)) {
        // Playback moved to another device.
        endHold();
        audio?.pause();
    }
}

// ── Local audio ─────────────────────────────────────────────────────────────

let loadedId = null;

async function loadAndPlay(startAt = 0, autoplay = true) {
    if (!audio) return;
    const id = state.queue[state.index];
    if (!id) return;
    endHold();
    loadedId = id;
    set({ loading: true, error: '', duration: 0, position: startAt });
    const src = (await getOfflineUrl(id)) || streamUrl(id);
    audio.loop = false;   // the hold's silent clip loops
    audio.src = src;
    const seek = () => {
        if (startAt > 0) audio.currentTime = startAt;
        audio.removeEventListener('loadedmetadata', seek);
    };
    audio.addEventListener('loadedmetadata', seek);
    updateMediaSession();
    registerMediaActions();
    if (autoplay) tryPlay();
}

// ── Background hold ─────────────────────────────────────────────────────────
// iOS freezes a web app a few seconds after its audio pauses in the
// background (a separate Web Audio keep-alive gets cut off too, ~12s in), and
// from then on lock-screen "play" / AirPods never reach us — it "plays" with
// no sound. What iOS does keep alive is a media element that's playing. So a
// pause while the phone is locked doesn't stop the element: it swaps the song
// for a looping inaudible clip and remembers the spot ("holding"). Play — or
// the lock screen's centre button either way, since iOS now thinks we're
// playing — swaps the song back in. Opening the app, another device taking
// over, or the 15-minute cap restore a normal pause.
const HOLD_MAX_MS = 15 * 60 * 1000;
let holding = false;
let heldAt = 0;
let heldSrc = '';   // the song's URL (offline blob URLs stay valid until removed)
let heldId = null;
let holdTimer = null;
let holdTick = null;
let silenceUrl = null;

// 4s of 8 kHz mono 8-bit PCM digital silence (128 is zero for unsigned 8-bit).
// iOS judges a media element by whether it's playing, not by its samples, so
// silence keeps the app awake. (A small constant offset clicked at each loop.)
function silentClip() {
    if (silenceUrl) return silenceUrl;
    const rate = 8000, n = rate * 4;
    const buf = new ArrayBuffer(44 + n);
    const v = new DataView(buf);
    const str = (o, t) => { for (let i = 0; i < t.length; i++) v.setUint8(o + i, t.charCodeAt(i)); };
    str(0, 'RIFF'); v.setUint32(4, 36 + n, true); str(8, 'WAVE');
    str(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
    v.setUint32(24, rate, true); v.setUint32(28, rate, true); v.setUint16(32, 1, true); v.setUint16(34, 8, true);
    str(36, 'data'); v.setUint32(40, n, true);
    new Uint8Array(buf, 44).fill(128);
    silenceUrl = URL.createObjectURL(new Blob([buf], { type: 'audio/wav' }));
    return silenceUrl;
}

const inBackground = () => typeof document !== 'undefined' && document.visibilityState === 'hidden';

// Pause (from a lock-screen command while hidden) by holding instead.
function startHold() {
    if (holding || !audio) return;
    holding = true;
    heldAt = audio.currentTime || state.position || 0;
    heldSrc = audio.currentSrc || audio.src;
    heldId = loadedId;
    const duration = audio.duration;
    audio.loop = true;
    audio.src = silentClip();
    audio.play().catch((e) => { trace('hold:play-fail', { name: e?.name }); endHold(); });
    set({ paused: true, position: heldAt });
    send({ index: state.index, position: heldAt, paused: true });
    try {
        navigator.mediaSession.playbackState = 'paused';
        if (Number.isFinite(duration) && duration > 0) {
            navigator.mediaSession.setPositionState({ duration, position: Math.min(heldAt, duration), playbackRate: 1 });
        }
    } catch { /* unsupported */ }
    clearTimeout(holdTimer);
    holdTimer = setTimeout(() => restoreFromHold('timeout'), HOLD_MAX_MS);
    clearInterval(holdTick);
    holdTick = setInterval(() => trace('hold:tick', audioInfo(audio)), 3000);
    trace('hold:start', { at: Math.round(heldAt) });
}
// Stop holding without touching playback (loadAndPlay is about to take over;
// it also clears the loop right before loading the song).
function endHold() {
    if (!holding) return;
    holding = false;
    clearTimeout(holdTimer);
    clearInterval(holdTick);
}
// Put the held song back in the element, synchronously — inside the lock
// screen's command handler, where iOS allows playback to start.
function swapBack(play) {
    const at = heldAt;
    endHold();
    if (!heldSrc || heldId !== state.queue[state.index]) {
        // The queue moved on while we held (e.g. another device skipped).
        loadAndPlay(at, play);
        return;
    }
    audio.loop = false;
    audio.src = heldSrc;   // loading resets paused to true without a 'pause' event
    const seekTo = () => { audio.currentTime = at; audio.removeEventListener('loadedmetadata', seekTo); };
    audio.addEventListener('loadedmetadata', seekTo);
    set({ position: at, error: '' });
    if (play) tryPlay();
}
// Play: the song comes back where it was.
function resumeFromHold(reason) {
    if (!holding) return;
    trace('hold:resume', { reason });
    set({ paused: false });
    send({ index: state.index, position: heldAt, paused: false });
    swapBack(true);
}
// Back to an ordinary pause on the song (app opened, time cap, clip error).
function restoreFromHold(reason) {
    if (!holding) return;
    trace('hold:restore', { reason });
    swapBack(false);
    try { navigator.mediaSession.playbackState = 'paused'; } catch { /* unsupported */ }
}

// Ask iOS for the music-playback audio session (Safari 17+).
try { if (typeof navigator !== 'undefined' && navigator.audioSession) navigator.audioSession.type = 'playback'; } catch { /* unsupported */ }

function tryPlay() {
    trace('tryPlay', audioInfo(audio));
    audio.play().then(() => { trace('play-ok', audioInfo(audio)); set({ blocked: false }); }).catch((e) => {
        trace('play-fail', { name: e?.name, msg: String(e?.message || '').slice(0, 120), ...audioInfo(audio) });
        if (e?.name === 'NotAllowedError') set({ blocked: true });
    });
}

if (audio) {
    for (const ev of ['play', 'playing', 'pause', 'waiting', 'stalled', 'suspend', 'error', 'ended', 'emptied', 'abort', 'loadstart', 'canplay', 'seeking', 'seeked']) {
        audio.addEventListener(ev, () => trace(`audio:${ev}`, audioInfo(audio)));
    }
    audio.addEventListener('timeupdate', () => {
        if (holding || !isActiveHere()) return;
        set({ position: audio.currentTime || 0 });
        report();
        updatePositionState();
    });
    audio.addEventListener('loadedmetadata', () => {
        if (holding) return;
        set({ duration: audio.duration || 0, loading: false });
        updatePositionState(true);
        // Other devices only know the length if the player tells them.
        if (isActiveHere() && Number.isFinite(audio.duration)) send({ duration: audio.duration });
    });
    audio.addEventListener('playing', () => {
        if (holding) return;
        set({ paused: false, loading: false });
        report(true);
        if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'playing';
        registerMediaActions();
        updatePositionState(true);
    });
    audio.addEventListener('pause', () => {
        if (holding) return;
        if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'paused';
        if (isActiveHere()) { set({ paused: true }); report(true); }
    });
    audio.addEventListener('waiting', () => { if (!holding) set({ loading: true }); });
    audio.addEventListener('ended', () => { if (!holding && isActiveHere()) next(true); });
    audio.addEventListener('error', () => {
        if (holding) { trace('hold:error', audioInfo(audio)); restoreFromHold('error'); return; }
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
// Lock-screen buttons. seekbackward/seekforward are cleared on purpose: iOS
// shows ±10s buttons instead of previous/next track whenever seeking is
// on offer, and track skipping is what a music player should show. iOS can
// drop back to its default ±10s when a new source starts, so this runs again
// on every load and play, not just once at startup.
function registerMediaActions() {
    if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return;
    const handlers = {
        play: () => togglePlay(false),
        // Locked: hold rather than pause, so iOS doesn't freeze the app. While
        // holding the lock screen shows "playing", so its button resumes.
        pause: () => {
            if (holding) return resumeFromHold('cmd-pause');
            if (inBackground() && isActiveHere() && audio && !audio.paused) return startHold();
            togglePlay(true);
        },
        previoustrack: () => prev(),
        nexttrack: () => next(),
        seekto: (d) => seek(d.seekTime),
        seekbackward: null,
        seekforward: null,
    };
    for (const [action, fn] of Object.entries(handlers)) {
        const traced = fn && ((d) => { trace(`cmd:${action}`, { ...audioInfo(audio), state: state.paused ? 'paused' : 'playing' }); fn(d); });
        try { navigator.mediaSession.setActionHandler(action, traced); } catch { /* unsupported */ }
    }
}
registerMediaActions();

// ── Actions (work from any device) ──────────────────────────────────────────

const me = () => ({ id: CLIENT_ID, name: deviceName() });

// Start a queue on THIS device (tapping play makes it the active device).
// With shuffle on (or opts.shuffle), the tapped song plays first and the rest
// follow in a shuffled order — previous/next then walk that order.
export function playQueue(songs, startIndex = 0, opts = {}) {
    if (!songs?.length) return;
    mergeSongs(songs);
    const ids = songs.map(s => s.videoId);
    const shuffle = typeof opts.shuffle === 'boolean' ? opts.shuffle : state.shuffle;
    const queue = shuffle ? shuffleOrder(ids, startIndex) : ids;
    const index = shuffle ? 0 : startIndex;
    const originalQueue = shuffle ? ids : null;
    set({ queue, index, shuffle, originalQueue, paused: false, position: 0, activeDevice: me(), dismissed: false });
    loadAndPlay(0, true);
    send({ queue, index, originalQueue, position: 0, duration: 0, paused: false, activeDevice: me(), shuffle, repeat: state.repeat });
}

export function togglePlay(forcePaused) {
    if (!currentSong()) return;
    // The device that was playing is gone — play here instead.
    if (remoteIsStale() || (!state.activeDevice && forcePaused !== true)) return transferHere();
    const pause = typeof forcePaused === 'boolean' ? forcePaused : !state.paused;
    if (isActiveHere() && holding) {
        if (!pause) resumeFromHold('play');
        return;
    }
    if (isActiveHere()) {
        if (pause) audio.pause();
        else if (loadedId !== state.queue[state.index] || audio.error || !audio.currentSrc) {
            loadAndPlay(audio.currentTime || state.position, true);
        } else tryPlay();
    } else {
        set({ paused: pause });
        send({ paused: pause });
    }
}

function goTo(index, startAt = 0) {
    if (isActiveHere()) {
        set({ index, position: startAt, paused: false });
        loadAndPlay(startAt, true);
        send({ index, position: startAt, duration: 0, paused: false });
    } else {
        // Remote: the new song's length arrives once the player loads it.
        set({ index, position: startAt, paused: false, duration: 0 });
        send({ index, position: startAt, duration: 0, paused: false });
    }
}

export function next(fromEnded = false) {
    const i = nextIndex({ length: state.queue.length, index: state.index, repeat: state.repeat });
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
    if (isActiveHere() && holding) {
        heldAt = t;
        set({ position: t });
        send({ position: t });
        return;
    }
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

// Shuffle reorders the queue around the current song (Spotify-style); turning
// it off restores the original order, still on the same song.
export function setShuffle(on) {
    if (on === state.shuffle) return;
    const id = state.queue[state.index];
    let patch;
    if (on) {
        patch = { shuffle: true, originalQueue: state.queue, queue: shuffleOrder(state.queue, state.index), index: 0 };
    } else {
        const queue = state.originalQueue?.length ? state.originalQueue : state.queue;
        patch = { shuffle: false, originalQueue: null, queue, index: Math.max(0, queue.indexOf(id)) };
    }
    if (!state.queue.length) patch = { shuffle: on, originalQueue: null };
    set(patch);
    send(patch);
}
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

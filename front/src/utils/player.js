// Pure helpers for the shared music player (unit tested). The stateful side
// lives in player/musicPlayer.js.

// Where "next" goes. Returns null at the end of the queue (repeat off).
// Shuffle doesn't pick at random here: turning it on reorders the queue
// itself (see shuffleOrder), so next/previous walk one fixed shuffled order.
export function nextIndex({ length, index, repeat }) {
    if (!length) return null;
    if (repeat === 'one') return index;
    if (index + 1 < length) return index + 1;
    return repeat === 'all' ? 0 : null;
}

// A shuffled copy of `queue` that starts with queue[index] (the song that's
// playing keeps playing), the rest in random order. `rand` is injectable.
export function shuffleOrder(queue, index, rand = Math.random) {
    const first = queue[index];
    const rest = queue.filter((_, i) => i !== index);
    for (let i = rest.length - 1; i > 0; i--) {
        const j = Math.floor(rand() * (i + 1));
        [rest[i], rest[j]] = [rest[j], rest[i]];
    }
    return first === undefined ? rest : [first, ...rest];
}

// "Previous": restart the song if it's more than 3s in, otherwise step back.
export function prevAction({ length, index, position }) {
    if (!length) return { type: 'none' };
    if (position > 3 || index === 0) return { type: 'restart' };
    return { type: 'index', index: index - 1 };
}

// Live position of a song playing on ANOTHER device, from its last report.
// positionAt is server time; clockOffset = serverNow - localNow at receipt.
export function estimateRemotePosition({ position = 0, positionAt = 0, paused = true }, now, clockOffset = 0, duration = 0) {
    if (paused || !positionAt) return position;
    const pos = position + Math.max(0, (now + clockOffset - positionAt) / 1000);
    return duration > 0 ? Math.min(pos, duration) : pos;
}

export const nextRepeatMode = (mode) => ({ off: 'all', all: 'one', one: 'off' }[mode] || 'off');

// Should this device ignore a player state from the server? Only for our OWN
// write replayed back: the server skips our echoes except on (re)connect,
// when it resends the whole node. While this device is playing with audio
// already loaded, that replay is older than what the <audio> element is
// actually doing — applying it would e.g. re-pause a song we just resumed.
// A fresh page (first snapshot, nothing loaded) still takes it.
export function isStaleOwnEcho({ updatedBy, clientId, activeHere, audioLoaded, firstSnapshot }) {
    return !firstSnapshot && !!audioLoaded && !!activeHere && !!clientId && updatedBy === clientId;
}

// Where music may play and its player may show: the music section, the home
// screen, and the Downloads list (its songs play through the player). Never
// on a movie/episode page or anywhere else.
export function musicAllowedAt(pathname) {
    const p = String(pathname || '').replace(/\/+$/, '') || '/';
    return p === '/app' || p === '/music' || p.startsWith('/music/') || p === '/downloads';
}

// ── Queue editing ("Up next") ───────────────────────────────────────────────
// Each takes { queue, index, originalQueue } and returns the same shape with
// `index` still on the song that's playing. originalQueue (the order to
// restore when shuffle is turned off) gains added songs and loses removed
// ones; a manual reorder only changes the shuffled order.

export const MAX_QUEUE = 500;   // matches the server's sanitizePlayerUpdate

export function moveQueueItem(q, from, to) {
    const { queue, index } = q;
    const n = queue.length;
    if (from === to || from < 0 || to < 0 || from >= n || to >= n) return q;
    const next = queue.slice();
    const [id] = next.splice(from, 1);
    next.splice(to, 0, id);
    let i = index;
    if (from === index) i = to;
    else if (from < index && to >= index) i = index - 1;
    else if (from > index && to <= index) i = index + 1;
    return { ...q, queue: next, index: i };
}

// The playing song can't be removed (skip it instead).
export function removeQueueItem(q, at) {
    const { queue, index, originalQueue } = q;
    if (at < 0 || at >= queue.length || at === index) return q;
    const id = queue[at];
    let original = originalQueue;
    if (original) {
        const k = original.indexOf(id);
        if (k !== -1) original = original.filter((_, i) => i !== k);
    }
    return { ...q, queue: queue.filter((_, i) => i !== at), index: at < index ? index - 1 : index, originalQueue: original };
}

// Add ids at the end, or right after the playing song with { next: true }.
export function addToQueue(q, ids, { next = false } = {}) {
    const { queue, index, originalQueue } = q;
    const add = (ids || []).slice(0, Math.max(0, MAX_QUEUE - queue.length));
    if (!add.length) return q;
    const at = next ? Math.min(index + 1, queue.length) : queue.length;
    return {
        ...q,
        queue: [...queue.slice(0, at), ...add, ...queue.slice(at)],
        originalQueue: originalQueue ? [...originalQueue, ...add] : originalQueue,
    };
}

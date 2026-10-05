// Pure helpers for the shared music player (unit tested). The stateful side
// lives in player/musicPlayer.js.

// Where "next" goes. Returns null at the end of the queue (repeat off).
// `rand` is injectable for tests; shuffle never repeats the current song
// unless it's the only one.
export function nextIndex({ length, index, shuffle, repeat }, rand = Math.random) {
    if (!length) return null;
    if (repeat === 'one') return index;
    if (shuffle) {
        if (length === 1) return repeat === 'all' ? 0 : null;
        const pick = Math.floor(rand() * (length - 1));
        return pick >= index ? pick + 1 : pick;
    }
    if (index + 1 < length) return index + 1;
    return repeat === 'all' ? 0 : null;
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

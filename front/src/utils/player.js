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

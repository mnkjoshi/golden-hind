// Synced-lyrics helpers (pure, unit tested).

// LRC text → [{ time (s), text }] sorted by time. A line can carry several
// timestamps ("[00:12.00][01:30.00]Chorus"); metadata tags ([ar:…]) and
// lines without a timestamp are skipped. Empty lines are kept (they're the
// gaps between verses).
export function parseLrc(lrc) {
    const out = [];
    for (const raw of String(lrc || '').split(/\r?\n/)) {
        const stamps = [...raw.matchAll(/\[(\d{1,3}):(\d{1,2}(?:[.:]\d{1,3})?)\]/g)];
        if (!stamps.length) continue;
        const text = raw.replace(/\[[^\]]*\]/g, '').trim();
        for (const [, m, sec] of stamps) {
            out.push({ time: Number(m) * 60 + Number(sec.replace(':', '.')), text });
        }
    }
    return out.sort((a, b) => a.time - b.time);
}

// Index of the line being sung at `time` (the last one that has started),
// or -1 before the first line.
export function activeLyricIndex(lines, time) {
    let lo = 0, hi = lines.length - 1, found = -1;
    while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        if (lines[mid].time <= time) { found = mid; lo = mid + 1; } else hi = mid - 1;
    }
    return found;
}

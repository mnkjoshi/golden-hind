// Lyrics lookup helpers (pure, unit tested). Lyrics come from LRCLIB
// (lrclib.net — free, no key), which matches on clean track/artist names, so
// YouTube-style titles are tidied first.

// "The Weeknd - Blinding Lights (Official Video) [4K] ft. X" by "The Weeknd - Topic"
// → { track: "Blinding Lights", artist: "The Weeknd" }
export function cleanLyricsQuery(title, artist) {
    let a = String(artist || '')
        .replace(/\s*-\s*Topic$/i, '')
        .replace(/VEVO$/i, '')
        .replace(/\s*\(.*?\)\s*/g, ' ')
        .trim();
    let t = String(title || '')
        .replace(/\(.*?\)|\[.*?\]|【.*?】/g, ' ')
        .replace(/\s+(ft\.?|feat\.?|featuring)\s+.*$/i, '')
        .replace(/\s*[|｜].*$/, '')
        .replace(/\s+/g, ' ')
        .trim();
    // "Artist - Track": drop the artist half (or take it as the artist if unknown).
    const dash = t.match(/^(.+?)\s+[-–—]\s+(.+)$/);
    if (dash) {
        const [, left, right] = dash;
        if (!a || left.toLowerCase().includes(a.toLowerCase()) || a.toLowerCase().includes(left.toLowerCase())) {
            if (!a) a = left.trim();
            t = right.trim();
        }
    }
    t = t.replace(/^["'“]|["'”]$/g, '').trim();
    return { track: t, artist: a };
}

// LRCLIB record → what the player needs (or null if it has nothing usable).
export function pickLyrics(record) {
    if (!record || typeof record !== 'object') return null;
    if (record.instrumental) return { instrumental: true, synced: null, plain: null };
    const synced = typeof record.syncedLyrics === 'string' && record.syncedLyrics.trim() ? record.syncedLyrics : null;
    const plain = typeof record.plainLyrics === 'string' && record.plainLyrics.trim() ? record.plainLyrics : null;
    if (!synced && !plain) return null;
    return { instrumental: false, synced, plain };
}

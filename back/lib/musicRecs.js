// Music recommendations (pure, unit tested). Only "power users" get them —
// people who listen enough that their history says something — so the
// Gemini call and the per-song YouTube lookups are never spent on anyone else.
// Input is users/{u}/music_listens/{videoId} = { seconds, title, artist, lastAt }.

// Thresholds for running recommendations at all: enough listening, OR a big
// enough library (listening time is only recorded from Nov 2026 on, so the
// library is the only history for anything played before that).
export const POWER_USER = {
    minSongs: 15,             // distinct songs, each played at least…
    minSongSeconds: 60,       // …this long
    minTotalSeconds: 2 * 3600,
    minLibrarySongs: 40,      // users/{u}/songs
};
export const SEEDS_PER_LIST = 8;
export const RECS_PER_LIST = 10;

const toList = (listens) => Object.entries(listens || {})
    .map(([videoId, l]) => ({
        videoId,
        title: String(l?.title || '').trim(),
        artist: String(l?.artist || '').trim(),
        seconds: Number(l?.seconds) || 0,
        lastAt: Number(l?.lastAt) || 0,
    }))
    .filter(s => s.seconds > 0 && s.title);

// Library songs, newest first: users/{u}/songs/{videoId} = { title, artist, addedAt }
const libraryList = (library) => Object.entries(library || {})
    .map(([videoId, s]) => ({ videoId, title: String(s?.title || '').trim(), artist: String(s?.artist || '').trim(), addedAt: Number(s?.addedAt) || 0 }))
    .filter(s => s.title)
    .sort((a, b) => b.addedAt - a.addedAt);

// Why someone qualifies: 'listening', 'library', or null if they don't.
export function musicPowerUserReason(listens, library = null, t = POWER_USER) {
    const list = toList(listens);
    const total = list.reduce((sum, s) => sum + s.seconds, 0);
    const songs = list.filter(s => s.seconds >= t.minSongSeconds).length;
    if (songs >= t.minSongs && total >= t.minTotalSeconds) return 'listening';
    if (Object.keys(library || {}).length >= t.minLibrarySongs) return 'library';
    return null;
}
export const isMusicPowerUser = (listens, library = null, t = POWER_USER) => !!musicPowerUserReason(listens, library, t);

// Most-listened and most-recent songs (the recent list skips anything already
// in the top list so each prompt section adds signal). While listening
// history is thin, each list is topped up with recently added library songs.
export function pickMusicSeeds(listens, library = null, n = SEEDS_PER_LIST) {
    const list = toList(listens);
    const used = new Set();
    const take = (candidates, out) => {
        for (const s of candidates) {
            if (out.length >= n) break;
            if (used.has(s.videoId)) continue;
            used.add(s.videoId);
            out.push(s);
        }
        return out;
    };
    const lib = libraryList(library);
    const top = take([...list].sort((a, b) => b.seconds - a.seconds), []);
    const recent = take([...list].sort((a, b) => b.lastAt - a.lastAt), []);
    take(lib, top);
    take(lib, recent);
    return { top, recent, key: [...top, ...recent].map(s => s.videoId).join(',') };
}

const describe = (s) => `- "${s.title}"${s.artist ? ` by ${s.artist}` : ''}`;

export function buildMusicRecPrompt({ top, recent }, n = RECS_PER_LIST) {
    return `You are a music recommendation engine.\n\n`
        + `The user's most-played songs of all time:\n${top.map(describe).join('\n')}\n\n`
        + `Songs the user has been playing recently:\n${(recent.length ? recent : top).map(describe).join('\n')}\n\n`
        + `Recommend real, released songs the user does not already have above. `
        + `"favourites": exactly ${n} songs matching their long-term taste. `
        + `"recent": exactly ${n} songs matching their recent listening mood. `
        + `Vary the artists: at most 2 songs per artist across both lists, and include artists not listed above.\n`
        + `Return ONLY raw JSON, no markdown or explanation:\n`
        + `{"favourites":[{"title":"Song","artist":"Artist"}],"recent":[{"title":"Song","artist":"Artist"}]}`;
}

// Loose identity for "same song": lowercased title + artist, minus
// punctuation and bracketed extras like "(Official Video)".
export function songKey(title, artist) {
    const norm = (v) => String(v || '').toLowerCase()
        .replace(/\(.*?\)|\[.*?\]/g, ' ')
        .replace(/[^\p{L}\p{N}]+/gu, ' ')
        .trim();
    return `${norm(title)}|${norm(artist)}`;
}

// Gemini's reply → { favourites, recent }, each a clean, de-duplicated list
// of { title, artist } that skips songs in `exclude` (a Set of songKey) and
// repeats across the two lists.
export function parseMusicRecResponse(text, exclude = new Set(), n = RECS_PER_LIST) {
    const match = String(text || '').match(/\{[\s\S]*\}/);
    if (!match) throw new Error('No JSON object in recommendation response');
    const raw = JSON.parse(match[0]);
    const seen = new Set(exclude);
    const clean = (list) => {
        const out = [];
        for (const s of Array.isArray(list) ? list : []) {
            const title = String(s?.title || '').trim().slice(0, 200);
            const artist = String(s?.artist || '').trim().slice(0, 120);
            if (!title || !artist) continue;
            const key = songKey(title, artist);
            if (seen.has(key)) continue;
            seen.add(key);
            out.push({ title, artist });
            if (out.length >= n) break;
        }
        return out;
    };
    const favourites = clean(raw.favourites);
    const recent = clean(raw.recent);
    return { favourites, recent };
}

// At most once a day: rebuild only when there's no result yet or it's a day
// old. (Like the movie recs, the stale list is served while it rebuilds.)
export const MUSIC_RECS_TTL_MS = 24 * 3600e3;
export function musicRecsNeedRefresh(cache, now, ttlMs = MUSIC_RECS_TTL_MS) {
    if (!cache || !Number.isFinite(cache.ts)) return true;
    return now - cache.ts >= ttlMs;
}

// Music listening time for the stats page (pure, unit tested).
// users/{u}/music_listens/{videoId} = { seconds, title, artist, lastAt }

const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;
// A device reports at most once a minute, so anything far beyond that is junk.
const MAX_SECONDS_PER_REPORT = 180;
const MAX_SONGS_PER_REPORT = 25;

// eslint-disable-next-line no-control-regex
const cleanText = (v, max) => String(v ?? '').replace(/[\x00-\x1F\x7F]/g, ' ').trim().slice(0, max);

// { videoId: { seconds, title, artist } } from the player → a clean copy,
// dropping bad ids, non-positive or oversized durations.
export function sanitizeListenReport(raw) {
    const out = {};
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
    for (const [id, entry] of Object.entries(raw).slice(0, MAX_SONGS_PER_REPORT)) {
        if (!VIDEO_ID.test(id) || !entry || typeof entry !== 'object') continue;
        const seconds = Number(entry.seconds);
        if (!Number.isFinite(seconds) || seconds <= 0 || seconds > MAX_SECONDS_PER_REPORT) continue;
        out[id] = {
            seconds: Math.round(seconds * 10) / 10,
            title: cleanText(entry.title, 200),
            artist: cleanText(entry.artist, 120),
        };
    }
    return out;
}

// Stats-page summary: total time, distinct songs, top songs and artists.
export function aggregateListening(listens, top = 5) {
    const songs = Object.entries(listens || {})
        .map(([videoId, l]) => ({
            videoId,
            title: l?.title || videoId,
            artist: l?.artist || '',
            seconds: Number(l?.seconds) || 0,
        }))
        .filter(s => s.seconds > 0)
        .sort((a, b) => b.seconds - a.seconds);
    const byArtist = new Map();
    for (const s of songs) {
        if (!s.artist) continue;
        byArtist.set(s.artist, (byArtist.get(s.artist) || 0) + s.seconds);
    }
    return {
        totalSeconds: Math.round(songs.reduce((sum, s) => sum + s.seconds, 0)),
        songCount: songs.length,
        topSongs: songs.slice(0, top),
        topArtists: [...byArtist.entries()]
            .map(([name, seconds]) => ({ name, seconds }))
            .sort((a, b) => b.seconds - a.seconds)
            .slice(0, top),
    };
}

// "Recently played" and "Most played" lists for the library (no times: those
// only show on the stats page).
export function listeningHistory(listens, limit = 50) {
    const songs = Object.entries(listens || {})
        .map(([videoId, l]) => ({
            videoId,
            title: l?.title || '',
            artist: l?.artist || '',
            seconds: Number(l?.seconds) || 0,
            lastAt: Number(l?.lastAt) || 0,
        }))
        .filter(s => s.title && s.seconds > 0);
    const strip = ({ videoId, title, artist }) => ({ videoId, title, artist });
    return {
        recent: [...songs].sort((a, b) => b.lastAt - a.lastAt).slice(0, limit).map(strip),
        most: [...songs].sort((a, b) => b.seconds - a.seconds).slice(0, limit).map(strip),
    };
}

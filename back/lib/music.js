// Music search helpers, extracted from server.js for unit testing.
//
// /music/search runs `yt-dlp --flat-playlist --dump-json "ytsearchN:<query>"`,
// which prints one JSON object per result line. Everything here is pure:
// cleaning the user's query and turning that output into the small result
// shape the music page renders.

const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;

// Trim, collapse whitespace, strip control characters, cap length. Returns
// null when nothing searchable is left.
export function sanitizeSearchQuery(raw) {
    // eslint-disable-next-line no-control-regex
    const q = String(raw ?? '').replace(/[\x00-\x1F\x7F]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 100);
    return q.length > 0 ? q : null;
}

// Seconds → "3:45" / "1:02:05". Null for missing/invalid (live streams have
// no duration).
export function formatDuration(seconds) {
    const n = Number(seconds);
    if (!Number.isFinite(n) || n <= 0) return null;
    const s = Math.round(n);
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = String(s % 60).padStart(2, '0');
    return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
}

// yt-dlp stdout → [{ videoId, url, title, channel, duration, thumbnail,
// verified, official }]. Skips unparseable lines, non-video entries
// (channels/playlists have no 11-char id), and duplicates. `official` marks
// entries from YouTube Music's Songs section — the artist's own catalog
// tracks rather than fan uploads.
export function parseYtSearchOutput(stdout, { official = false } = {}) {
    const results = [];
    const seen = new Set();
    for (const line of String(stdout || '').split('\n')) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        let entry;
        try { entry = JSON.parse(trimmed); } catch { continue; }
        const videoId = entry?.id;
        if (typeof videoId !== 'string' || !VIDEO_ID.test(videoId) || seen.has(videoId)) continue;
        seen.add(videoId);
        results.push({
            videoId,
            // Always the www URL: the download endpoint only accepts
            // youtube.com / youtu.be, not music.youtube.com.
            url: `https://www.youtube.com/watch?v=${videoId}`,
            title: String(entry.title || 'Untitled').slice(0, 200),
            channel: String(entry.channel || entry.uploader || '').slice(0, 100) || null,
            duration: formatDuration(entry.duration),
            thumbnail: `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`,
            verified: entry.channel_is_verified === true,
            official,
        });
    }
    return results;
}

// oEmbed names auto-generated catalog channels "<Artist> - Topic".
export function artistFromOembedAuthor(name) {
    const s = String(name || '').trim();
    return s.replace(/\s+-\s+Topic$/i, '').trim() || null;
}

// Fan-upload markers. A result is only penalised for a marker the user
// didn't ask for — searching "DtMF slowed" should still surface slowed edits.
const JUNK_MARKERS = [
    'lyrics', 'lyric video', 'letra', 'cover', 'reaction', 'karaoke',
    'nightcore', 'slowed', 'sped up', '8d', 'instrumental', '1 hour', 'loop',
];

// Reorder regular YouTube results so the real artist upload beats fan
// uploads: verified channels rise, titles carrying junk markers sink. Stable
// for ties, so YouTube's own relevance order survives otherwise.
export function rankYouTubeResults(results, query) {
    const q = String(query || '').toLowerCase();
    const score = (r) => {
        const title = String(r.title || '').toLowerCase();
        let s = r.verified ? 2 : 0;
        for (const marker of JUNK_MARKERS) {
            if (!q.includes(marker) && new RegExp(`\\b${marker}\\b`).test(title)) s -= 3;
        }
        return s;
    };
    return results
        .map((r, i) => ({ r, i, s: score(r) }))
        .sort((a, b) => b.s - a.s || a.i - b.i)
        .map(x => x.r);
}

// Accent-insensitive words of 3+ chars ("DtMF" → ["dtmf"], "Pitorro de coco"
// → ["pitorro", "coco"]); short words like "de"/"la" match too much.
function queryTokens(s) {
    return String(s || '')
        .normalize('NFD').replace(/[̀-ͯ]/g, '')
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter(t => t.length >= 3);
}

// YouTube Music's Songs section drifts from the exact match into the same
// artist's other hits. Keep a song only when its title or artist shares a
// word with the query. The top match is always kept (it's usually right even
// for misspelled queries), and queries without usable words keep everything.
export function filterRelevantSongs(songs, query) {
    const wanted = new Set(queryTokens(query));
    if (wanted.size === 0) return songs || [];
    return (songs || []).filter((s, i) => {
        if (i === 0) return true;
        return queryTokens(`${s.title} ${s.channel || ''}`).some(t => wanted.has(t));
    });
}

// Official songs first, then ranked YouTube results, deduped by video id.
export function mergeSearchResults(songs, videos, { maxSongs = 5, total = 10 } = {}) {
    const out = [];
    const seen = new Set();
    for (const r of (songs || []).slice(0, maxSongs)) {
        if (!seen.has(r.videoId)) { seen.add(r.videoId); out.push(r); }
    }
    for (const r of videos || []) {
        if (out.length >= total) break;
        if (!seen.has(r.videoId)) { seen.add(r.videoId); out.push(r); }
    }
    return out;
}

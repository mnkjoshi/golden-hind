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

// yt-dlp stdout → [{ videoId, url, title, channel, duration, thumbnail }].
// Skips unparseable lines, non-video entries (channels/playlists have no
// 11-char id), and duplicates.
export function parseYtSearchOutput(stdout) {
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
            url: `https://www.youtube.com/watch?v=${videoId}`,
            title: String(entry.title || 'Untitled').slice(0, 200),
            channel: String(entry.channel || entry.uploader || '').slice(0, 100) || null,
            duration: formatDuration(entry.duration),
            thumbnail: `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`,
        });
    }
    return results;
}

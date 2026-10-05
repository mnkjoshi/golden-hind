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

// ── MP3 tagging ─────────────────────────────────────────────────────────────

const tagText = (v) => (typeof v === 'string' && v.trim() && v.trim() !== 'NA' ? v.trim() : '');

// yt-dlp metadata (from --print '%(.{title,track,artists,...})j') → ID3 tags
// plus the download file name. YouTube Music tracks carry real track/album/
// artist fields; plain videos fall back to the video title and channel.
// `artists` also lists songwriters after the performer, so only the first
// (primary) artist is used.
export function buildTrackTags(info, videoId) {
    const track = tagText(info?.track);
    const title = track || tagText(info?.title) || videoId;
    const listed = Array.isArray(info?.artists) ? info.artists.map(tagText).filter(Boolean) : [];
    const artist = listed[0]
        || tagText(info?.artist).split(',')[0].trim()
        || artistFromOembedAuthor(tagText(info?.uploader))
        || '';
    const album = tagText(info?.album);
    const releaseYear = Number(info?.release_year);
    const uploadDate = String(info?.upload_date ?? '');
    const year = Number.isInteger(releaseYear) && releaseYear > 1800
        ? String(releaseYear)
        : (/^\d{8}$/.test(uploadDate) ? uploadDate.slice(0, 4) : '');
    // "Artist - Track" only with real track metadata — a plain video title
    // usually already names the artist.
    const base = track && artist ? `${artist} - ${track}` : title;
    const fileName = base.replace(/[/\\?%*:|"<>]/g, '-').slice(0, 150);
    return { title, artist, album, year, fileName };
}

// Cover sources, best first. Both are 16:9 without letterboxing, unlike
// hq/sddefault (4:3 with black bars), so a centre-square crop is clean. For
// YouTube Music tracks the centre square is exactly the album art.
// maxresdefault 404s on videos without a 720p+ upload.
export function coverCandidates(videoId) {
    return [
        `https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg`,
        `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`,
    ];
}

// ffmpeg argv: audio from stdin (yt-dlp), optional cover image embedded as
// the ID3 front-cover picture (APIC), tags only when known. outPath must be
// a seekable file: ffmpeg rewrites the ID3 header (with the picture) and the
// Xing duration frame at the end, so over a pipe the tag comes out unreadable
// and players show the wrong length.
export function buildMp3FfmpegArgs(tags, coverPath, outPath) {
    const args = ['-y', '-i', 'pipe:0'];
    if (coverPath) args.push('-i', coverPath);
    args.push('-map', '0:a');
    if (coverPath) {
        args.push(
            '-map', '1:v',
            '-c:v', 'mjpeg', '-q:v', '2',
            '-vf', 'crop=min(iw\\,ih):min(iw\\,ih),scale=600:600',
            '-disposition:v', 'attached_pic',
            '-metadata:s:v', 'title=Album cover',
            '-metadata:s:v', 'comment=Cover (front)',
        );
    }
    args.push('-codec:a', 'libmp3lame', '-q:a', '2', '-id3v2_version', '3');
    const meta = { title: tags.title, artist: tags.artist, album: tags.album, date: tags.year };
    for (const [key, value] of Object.entries(meta)) {
        if (value) args.push('-metadata', `${key}=${value}`);
    }
    args.push('-f', 'mp3', outPath);
    return args;
}

// ── My Songs library ────────────────────────────────────────────────────────

// Validate a song before it's written to users/{u}/songs/{videoId}. Returns
// null for anything malformed so the endpoint can 400 it.
export function sanitizeLibrarySong(raw) {
    const videoId = String(raw?.videoId ?? '');
    if (!VIDEO_ID.test(videoId)) return null;
    const title = tagText(raw?.title).slice(0, 200) || videoId;
    const artist = (artistFromOembedAuthor(tagText(raw?.artist)) || '').slice(0, 100);
    return { videoId, title, artist };
}

// Unique, filesystem-safe names for the songs inside the My Songs ZIP.
export function zipEntryNames(fileNames) {
    const used = new Map();
    return fileNames.map((name) => {
        const base = String(name || 'track').replace(/[/\\?%*:|"<>\x00-\x1F]/g, '-').trim().slice(0, 150) || 'track';
        const n = (used.get(base.toLowerCase()) || 0) + 1;
        used.set(base.toLowerCase(), n);
        return n === 1 ? `${base}.mp3` : `${base} (${n}).mp3`;
    });
}

// ── Shared player state (Spotify Connect-style) ─────────────────────────────
// One node per user at users/{u}/player. Any signed-in device may write a
// change; the active device plays the audio, the rest mirror and control it.

export const REPEAT_MODES = ['off', 'all', 'one'];

// Whitelist + coerce a client's player change. Returns {} for junk, so a bad
// write can never stash arbitrary keys under the user's node.
export function sanitizePlayerUpdate(raw) {
    const out = {};
    if (!raw || typeof raw !== 'object') return out;
    if (Array.isArray(raw.queue)) {
        out.queue = raw.queue.map(String).filter(id => VIDEO_ID.test(id)).slice(0, 500);
    }
    const index = Number(raw.index);
    if (Number.isInteger(index) && index >= 0) {
        out.index = out.queue ? Math.min(index, Math.max(0, out.queue.length - 1)) : index;
    }
    const position = Number(raw.position);
    if (Number.isFinite(position) && position >= 0) out.position = Math.round(position * 10) / 10;
    if (typeof raw.paused === 'boolean') out.paused = raw.paused;
    if (typeof raw.shuffle === 'boolean') out.shuffle = raw.shuffle;
    if (REPEAT_MODES.includes(raw.repeat)) out.repeat = raw.repeat;
    const dev = raw.activeDevice;
    if (dev && /^[A-Za-z0-9_-]{4,64}$/.test(String(dev.id || ''))) {
        out.activeDevice = { id: String(dev.id), name: tagText(dev.name).slice(0, 40) || 'Device' };
    }
    return out;
}

// ── Playlists ───────────────────────────────────────────────────────────────
// users/{u}/playlists/{id} = { name, songs: [videoId…], createdAt, updatedAt }

// 1–60 visible characters, or null.
export function sanitizePlaylistName(raw) {
    // eslint-disable-next-line no-control-regex
    const name = String(raw ?? '').replace(/[\x00-\x1F\x7F]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60);
    return name || null;
}

// Valid, de-duplicated video ids in their original order (max 500).
export function sanitizePlaylistSongs(raw) {
    if (!Array.isArray(raw)) return [];
    const seen = new Set();
    const out = [];
    for (const id of raw.map(String)) {
        if (!VIDEO_ID.test(id) || seen.has(id)) continue;
        seen.add(id);
        out.push(id);
        if (out.length >= 500) break;
    }
    return out;
}

// RTDB push keys ("-Nx…"), safe to use as a path segment.
export const isValidPlaylistId = (id) => /^-?[A-Za-z0-9_-]{1,40}$/.test(String(id || ''));

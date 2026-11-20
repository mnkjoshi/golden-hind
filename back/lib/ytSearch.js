// youtubei.js search results → the same shape parseYtSearchOutput gives the
// music page (pure, unit tested). youtubei.js talks to YouTube's own API
// directly, so a search doesn't start yt-dlp (a fresh Python process plus
// page scraping) and YouTube Music results already carry the artist.
import { formatDuration } from './music.js';

const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;
const text = (v) => String(v?.toString?.() ?? v ?? '').trim();

function result(videoId, title, channel, seconds, { verified = false, official = false } = {}) {
    return {
        videoId,
        url: `https://www.youtube.com/watch?v=${videoId}`,
        title: title.slice(0, 200) || 'Untitled',
        channel: channel.slice(0, 100) || null,
        duration: formatDuration(seconds),
        thumbnail: `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`,
        verified,
        official,
    };
}

// yt.music.search(q, { type: 'song' }).songs.contents → official catalog songs.
export function mapMusicSongs(items, limit = 5) {
    const out = [];
    const seen = new Set();
    for (const item of items || []) {
        const id = item?.id;
        if (!VIDEO_ID.test(String(id || '')) || seen.has(id)) continue;
        seen.add(id);
        const artist = (item.artists || []).map(a => text(a?.name)).filter(Boolean).join(', ');
        out.push(result(id, text(item.title), artist, item.duration?.seconds, { official: true }));
        if (out.length >= limit) break;
    }
    return out;
}

// yt.search(q, { type: 'video' }).videos → regular uploads, skipping live
// streams (no length) and anything that isn't a plain video.
export function mapVideos(items, limit = 8) {
    const out = [];
    const seen = new Set();
    for (const item of items || []) {
        if (item?.type && item.type !== 'Video') continue;
        const id = item?.video_id || item?.id;
        if (!VIDEO_ID.test(String(id || '')) || seen.has(id)) continue;
        if (!(item.duration?.seconds > 0)) continue;
        seen.add(id);
        out.push(result(id, text(item.title), text(item.author?.name), item.duration.seconds, { verified: item.author?.is_verified === true }));
        if (out.length >= limit) break;
    }
    return out;
}

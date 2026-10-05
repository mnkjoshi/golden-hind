// Video download helpers, extracted from server.js for unit testing.

// Cache key for one movie or one episode: "m550", "t1396-s2e4".
export function videoCacheKey(id, season, episode) {
    const contentId = String(id || '');
    if (!/^[mt]\d{1,12}$/.test(contentId)) return null;
    if (contentId[0] === 'm') return contentId;
    const s = parseInt(season), e = parseInt(episode);
    if (!Number.isInteger(s) || !Number.isInteger(e) || s < 0 || e < 1) return null;
    return `${contentId}-s${s}e${e}`;
}

// "Title.mp4" / "Title.S01E02.mp4", filesystem-safe.
export function videoFileName(title, mediaType, season, episode) {
    const safe = String(title || 'video').replace(/[/\\?%*:|"<>]/g, '-').trim() || 'video';
    const pad = (n) => String(parseInt(n) || 1).padStart(2, '0');
    return mediaType === 'tv' ? `${safe}.S${pad(season)}E${pad(episode)}.mp4` : `${safe}.mp4`;
}

// Prepared files only need to outlive the phone's download.
export const VIDEO_CACHE_TTL_MS = 3 * 24 * 60 * 60 * 1000;
export const isExpiredVideo = (mtimeMs, now, ttl = VIDEO_CACHE_TTL_MS) => now - mtimeMs > ttl;

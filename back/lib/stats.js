// Watch-statistics aggregation ("year in review"), extracted for unit testing.
//
// Input is the raw list of watch_sessions entries the app has always logged:
// { contentId, contentName, duration (seconds), timestamp (ms) }. Everything
// here is pure math over that list; TMDB enrichment (posters, genres) happens
// in server.js on the aggregated output, which keeps the expensive lookups
// bounded to the handful of top titles.

const DAY_MS = 24 * 60 * 60 * 1000;

function monthKey(ts) {
    const d = new Date(ts);
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

// Aggregate sessions into everything the stats page renders. `now` is
// injectable for tests. Sessions with junk durations/timestamps are skipped
// rather than poisoning totals.
export function aggregateWatchSessions(sessions, now = Date.now()) {
    const list = (Array.isArray(sessions) ? sessions : []).filter(s =>
        s && typeof s.duration === 'number' && s.duration > 0
        && typeof s.timestamp === 'number' && s.timestamp > 0 && s.timestamp <= now + DAY_MS);

    // Last 12 calendar months, oldest first, every month present even if 0.
    const byMonth = [];
    const monthIndex = new Map();
    const base = new Date(now);
    for (let i = 11; i >= 0; i--) {
        const d = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() - i, 1));
        const key = monthKey(d.getTime());
        monthIndex.set(key, byMonth.length);
        byMonth.push({ month: key, seconds: 0 });
    }

    const perTitle = new Map(); // contentId -> { contentId, name, seconds, sessions, lastTimestamp }
    const days = new Set();
    let totalSeconds = 0;
    let longestSession = null;

    for (const s of list) {
        totalSeconds += s.duration;
        days.add(Math.floor(s.timestamp / DAY_MS));

        const mi = monthIndex.get(monthKey(s.timestamp));
        if (mi !== undefined) byMonth[mi].seconds += s.duration;

        if (!longestSession || s.duration > longestSession.seconds) {
            longestSession = {
                contentId: s.contentId || '',
                name: s.contentName || 'Unknown',
                seconds: s.duration,
                timestamp: s.timestamp,
            };
        }

        const id = s.contentId || `?${s.contentName || 'unknown'}`;
        const entry = perTitle.get(id) || { contentId: s.contentId || '', name: '', seconds: 0, sessions: 0, lastTimestamp: 0 };
        entry.seconds += s.duration;
        entry.sessions += 1;
        if (s.timestamp >= entry.lastTimestamp) {
            entry.lastTimestamp = s.timestamp;
            entry.name = s.contentName || entry.name || 'Unknown';
        }
        perTitle.set(id, entry);
    }

    const topTitles = [...perTitle.values()]
        .sort((a, b) => b.seconds - a.seconds)
        .slice(0, 6)
        .map(({ lastTimestamp, ...t }) => t);

    return {
        totalSeconds,
        sessionCount: list.length,
        distinctDays: days.size,
        topTitles,
        longestSession,
        byMonth,
    };
}

// TMDB genre id → name, mirroring front/src/utils/genres.js (GetInfo returns
// numeric genre_ids only).
export const GENRE_NAMES = {
    28: "Action", 12: "Adventure", 16: "Animation", 35: "Comedy", 80: "Crime",
    99: "Documentary", 18: "Drama", 10751: "Family", 14: "Fantasy", 36: "History",
    27: "Horror", 10402: "Music", 9648: "Mystery", 10749: "Romance",
    878: "Science Fiction", 10770: "TV Movie", 53: "Thriller", 10752: "War", 37: "Western",
    10759: "Action & Adventure", 10762: "Kids", 10763: "News", 10764: "Reality",
    10765: "Sci-Fi & Fantasy", 10766: "Soap", 10767: "Talk", 10768: "War & Politics",
};

// Fold per-title TMDB genres into a weighted breakdown: each title
// contributes its watch-seconds to every genre TMDB lists for it. Returns the
// top `limit` genres by seconds, descending.
export function genreBreakdown(titlesWithGenres, limit = 5) {
    const totals = new Map();
    for (const t of titlesWithGenres || []) {
        if (!t || typeof t.seconds !== 'number') continue;
        for (const g of t.genres || []) {
            const name = typeof g === 'string' ? g : g?.name;
            if (!name) continue;
            totals.set(name, (totals.get(name) || 0) + t.seconds);
        }
    }
    return [...totals.entries()]
        .map(([name, seconds]) => ({ name, seconds }))
        .sort((a, b) => b.seconds - a.seconds)
        .slice(0, limit);
}

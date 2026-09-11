// Episode-level watched tracking helpers, extracted for unit testing.
//
// Watched episodes live at users/{u}/watched/{contentId} as a native RTDB
// object of { "s<season>e<episode>": timestamp }. Mutations are expressed as
// a single multi-path update object (null deletes a key), so marking a whole
// season is one atomic write with no read-modify-write race — unlike the
// JSON-string lists elsewhere in the schema.

export function episodeKey(season, episode) {
    const s = parseInt(season);
    const e = parseInt(episode);
    if (!Number.isFinite(s) || !Number.isFinite(e) || s < 0 || e < 1 || s > 999 || e > 9999) return null;
    return `s${s}e${e}`;
}

// Build the RTDB update object for marking/unmarking a set of episodes in one
// season. Returns null when the request is malformed (bad season, empty or
// oversized episode list) so the endpoint can 400 it.
export function buildWatchedUpdate(season, episodes, watched, ts) {
    if (!Array.isArray(episodes) || episodes.length === 0 || episodes.length > 500) return null;
    const update = {};
    for (const ep of episodes) {
        const key = episodeKey(season, ep);
        if (!key) return null;
        update[key] = watched ? ts : null;
    }
    return update;
}

// Summary for a season's header ("7/13 watched", and whether the bulk button
// should offer mark or unmark). episodeNumbers is the season's real episode
// list from TMDB — the watched map may contain keys for episodes that no
// longer exist, which are ignored.
export function seasonSummary(watchedMap, season, episodeNumbers) {
    const map = watchedMap || {};
    const nums = Array.isArray(episodeNumbers) ? episodeNumbers : [];
    let watchedCount = 0;
    for (const ep of nums) {
        const key = episodeKey(season, ep);
        if (key && map[key]) watchedCount++;
    }
    return {
        total: nums.length,
        watchedCount,
        allWatched: nums.length > 0 && watchedCount === nums.length,
    };
}

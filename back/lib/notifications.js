// Pure logic for detecting new episodes / seasons of a followed TV show by
// comparing a stored snapshot against fresh TMDB data. Extracted so it can be
// unit tested without TMDB / Firebase.

// Build the compact snapshot we persist per show between checks.
export function showSnapshot(show) {
    const le = show && show.last_episode_to_air;
    return {
        seasonCount: (show && show.number_of_seasons) || 0,
        episodeCount: (show && show.number_of_episodes) || 0,
        lastEpisodeKey: le ? `s${le.season_number}e${le.episode_number}` : null,
    };
}

// Compare the previous snapshot to current TMDB data.
// Returns { snapshot, notifications } where notifications is [] unless a new
// season or episode appeared. With no prior snapshot we only record a baseline
// (no notification) so existing library items don't all fire on first run.
export function detectShowChanges(prev, show) {
    const snapshot = showSnapshot(show);
    if (!prev) return { snapshot, notifications: [] };

    const notifications = [];
    const le = show && show.last_episode_to_air;
    const name = (show && show.name) || 'a show you follow';

    if (snapshot.seasonCount > prev.seasonCount) {
        notifications.push({
            type: 'new_season',
            season: snapshot.seasonCount,
            message: `New season of ${name} is out`,
        });
    } else if (
        le &&
        snapshot.episodeCount > prev.episodeCount &&
        snapshot.lastEpisodeKey !== prev.lastEpisodeKey
    ) {
        notifications.push({
            type: 'new_episode',
            season: le.season_number,
            episode: le.episode_number,
            message: `New episode of ${name}: S${le.season_number}E${le.episode_number}`,
        });
    }

    return { snapshot, notifications };
}

// Collect, per TV contentId, the set of usernames following it (from each
// user's watchlist + favourites). Movies (ids not starting with 't') are
// ignored. `users` is the raw /users node value.
export function collectShowFollowers(users) {
    const followers = new Map();
    for (const [username, u] of Object.entries(users || {})) {
        const ids = [];
        for (const key of ['watchlist', 'favourites']) {
            try {
                const arr = JSON.parse((u && u[key]) || '[]');
                if (Array.isArray(arr)) ids.push(...arr);
            } catch { /* ignore malformed */ }
        }
        for (const cid of ids) {
            if (typeof cid === 'string' && cid.startsWith('t')) {
                if (!followers.has(cid)) followers.set(cid, new Set());
                followers.get(cid).add(username);
            }
        }
    }
    return followers;
}

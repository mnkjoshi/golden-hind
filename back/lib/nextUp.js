// "Next up" for a show (pure, unit tested): which episode Continue Watching
// and the detail page's Play button should offer.
//
// Opening an episode marks it watched, so "watched" really means "started".
// What tells a half-watched episode apart is its saved playback position
// (server 1 only): partway through means resume it; otherwise move on to the
// next episode that isn't marked watched, stopping at the last one aired.

const RESUME_MIN = 0.02;
const RESUME_MAX = 0.9;   // matches the "watched" threshold in lib/watched.js

// seasons: [{ season, episodes }] (specials / empty seasons are ignored)
// lastAired: { season, episode } or null when unknown
// progress: { season, episode } — the episode they were last on, or null
// watched: { "s<season>e<episode>": ts }
// positionPct: how far into the progress episode they got (0–1), if known
export function nextUpEpisode({ seasons, lastAired = null, progress = null, watched = {}, positionPct = null }) {
    const counts = new Map((seasons || [])
        .filter(s => s.season > 0 && s.episodes > 0)
        .map(s => [s.season, s.episodes]));
    if (!counts.size) return null;
    const order = [...counts.keys()].sort((a, b) => a - b);
    const aired = (s, e) => !lastAired || s < lastAired.season || (s === lastAired.season && e <= lastAired.episode);
    const isWatched = (s, e) => !!watched?.[`s${s}e${e}`];

    let s = progress && counts.has(progress.season) ? progress.season : order[0];
    let e = progress && counts.has(progress.season) ? Math.min(Math.max(1, progress.episode), counts.get(s)) : 1;
    if (!aired(s, e)) return null;
    if (progress && positionPct > RESUME_MIN && positionPct < RESUME_MAX) return { season: s, episode: e, kind: 'resume' };
    if (!isWatched(s, e)) return { season: s, episode: e, kind: progress ? 'resume' : 'start' };

    for (let guard = 0; guard < 10000; guard++) {
        e += 1;
        if (e > counts.get(s)) {
            const i = order.indexOf(s);
            if (i + 1 >= order.length) return null;
            s = order[i + 1];
            e = 1;
        }
        if (!aired(s, e)) return null;
        if (!isWatched(s, e)) return { season: s, episode: e, kind: 'next' };
    }
    return null;
}

// TMDB /tv/{id} → the bits nextUpEpisode needs.
export function showStructure(tmdb) {
    const last = tmdb?.last_episode_to_air;
    return {
        seasons: (tmdb?.seasons || []).map(s => ({ season: Number(s.season_number), episodes: Number(s.episode_count) || 0 })),
        lastAired: last ? { season: Number(last.season_number), episode: Number(last.episode_number) } : null,
    };
}

// Saved positions under users/{u}/positions → { episode: fraction } for one
// season of one show (keys look like playbackPos_<id>_s<season>_e<episode>).
export function seasonProgress(positions, contentId, season) {
    const prefix = `playbackPos_${contentId}_s${season}_e`;
    const out = {};
    for (const [key, p] of Object.entries(positions || {})) {
        if (!key.startsWith(prefix)) continue;
        const ep = Number(key.slice(prefix.length));
        const pos = Number(p?.position), dur = Number(p?.duration);
        if (!Number.isInteger(ep) || !(dur > 0) || !(pos > 0)) continue;
        out[ep] = Math.min(1, Math.round((pos / dur) * 1000) / 1000);
    }
    return out;
}

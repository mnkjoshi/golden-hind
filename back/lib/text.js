// Cleanup for display text from TMDB (pure, unit tested). Some titles and
// overviews carry zero-width, bidi-control or other invisible characters that
// render as odd gaps or boxes.

// Zero-width spaces/joiners, LRM/RLM, bidi embeddings and isolates, word
// joiner and friends, BOM, soft hyphen, and C0/C1 control characters.
const INVISIBLE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F\u00AD\u180E\u200B-\u200F\u202A-\u202E\u2060-\u2064\u2066-\u206F\uFEFF]/g;
// Non-breaking, en/em, thin and other unusual spaces, plus line/paragraph separators.
const ODD_SPACES = /[\u00A0\u1680\u2000-\u200A\u2028\u2029\u202F\u205F\u3000]/g;

export function cleanText(text) {
    if (typeof text !== 'string') return text;
    return text
        .normalize('NFC')
        .replace(INVISIBLE, '')
        .replace(ODD_SPACES, ' ')
        .replace(/[ \t]{2,}/g, ' ')
        .trim();
}

// A TMDB episode with its title and overview cleaned (returns a copy).
export function cleanEpisode(ep) {
    if (!ep || typeof ep !== 'object') return ep;
    return { ...ep, name: cleanText(ep.name), overview: cleanText(ep.overview) };
}

// A TMDB season response with every episode's text cleaned.
export function cleanSeason(season) {
    if (!season || !Array.isArray(season.episodes)) return season;
    return {
        ...season,
        name: cleanText(season.name),
        overview: cleanText(season.overview),
        episodes: season.episodes.map(cleanEpisode),
    };
}

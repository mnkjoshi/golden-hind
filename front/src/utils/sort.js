// Search-result sorting. 'relevance' preserves the API's original order; the
// rest sort a copy so the source array is never mutated.

// Year used for date sorts (movies use release_date, TV uses first_air_date).
export function itemYear(r) {
    const d = r.release_date || r.first_air_date;
    return d ? new Date(d).getFullYear() : 0;
}

export function sortResults(results, sortBy) {
    const arr = [...(results || [])];
    switch (sortBy) {
        case 'rating':     return arr.sort((a, b) => (b.vote_average || 0) - (a.vote_average || 0));
        case 'popularity': return arr.sort((a, b) => (b.popularity || 0) - (a.popularity || 0));
        case 'newest':     return arr.sort((a, b) => itemYear(b) - itemYear(a));
        case 'oldest':     return arr.sort((a, b) => (itemYear(a) || Infinity) - (itemYear(b) || Infinity));
        default:           return arr;
    }
}

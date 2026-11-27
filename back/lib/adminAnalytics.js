// Filtering the admin activity feed (pure, unit tested). Events are
// { user, event, data, timestamp } from admin/analytics/events.

// Newest first, keeping only matches: excludeUsers drops people (e.g. the
// admin's own song plays), users (if non-empty) keeps only those people,
// events (if non-empty) keeps only those event types. Counts per event type
// and the people seen are taken after the user filters but before the event
// filter, so the type chips always show what's available.
export function filterAnalytics(events, { excludeUsers = [], users = [], events: types = [] } = {}, limit = 300) {
    const exclude = new Set(excludeUsers);
    const only = new Set(users);
    const want = new Set(types);
    const byUser = (Array.isArray(events) ? events : [])
        .filter(e => e && e.event !== 'page_view')
        .filter(e => !exclude.has(e.user) && (!only.size || only.has(e.user)))
        .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
    const counts = {};
    for (const e of byUser) counts[e.event] = (counts[e.event] || 0) + 1;
    const people = [...new Set((Array.isArray(events) ? events : []).map(e => e?.user).filter(Boolean))].sort();
    const matching = want.size ? byUser.filter(e => want.has(e.event)) : byUser;
    return {
        events: matching.slice(0, limit),
        total: matching.length,
        counts,
        people,
        activeUsers: new Set(matching.map(e => e.user)).size,
    };
}

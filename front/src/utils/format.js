// Small pure formatting helpers shared across routes (and unit tested).

// "Just now" / "5m ago" / "3h ago" / "Yesterday" / "4d ago" from a timestamp.
export function formatRelativeTime(ts) {
    if (!ts) return '';
    const diff = Date.now() - parseInt(ts);
    const mins = Math.floor(diff / 60000);
    if (mins < 2) return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return days === 1 ? 'Yesterday' : `${days}d ago`;
}

// Seconds → "0m" / "45m" / "2h" / "2h 15m".
export function formatWatchTime(seconds) {
    if (!seconds || seconds < 1) return '0m';
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

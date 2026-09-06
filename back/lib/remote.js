// Remote-control helpers, extracted from server.js for unit testing.
//
// A logged-in device can expose itself as a "player" (a TV in player mode)
// that other devices on the same account drive. Commands travel through RTDB
// at remotes/{user}/{deviceId}/commands and reach the player over SSE, the
// same transport the watch-party feature uses. Everything here is pure so it
// can be tested without Express or Firebase.

// Client-generated device ids are used as RTDB keys, so they must be strictly
// path-safe.
export function isValidDeviceId(deviceId) {
    return /^[A-Za-z0-9_-]{4,64}$/.test(String(deviceId || ''));
}

// Human-facing device label ("Living room TV"). Control characters are
// stripped because the name is echoed into SSE JSON and controller UIs.
export function sanitizeDeviceName(name) {
    // eslint-disable-next-line no-control-regex
    const clean = String(name || '').replace(/[\x00-\x1F\x7F]/g, '').trim().slice(0, 40);
    return clean || 'Device';
}

export const REMOTE_COMMAND_TYPES = ['play', 'pause', 'resume', 'seek', 'seekBy', 'volume', 'episode', 'stop'];

// Validate + normalize a raw client command into exactly the shape the player
// will execute. Returns null for anything malformed so /remote/command can
// reject it — clients never get to push arbitrary payloads to another device.
export function sanitizeCommand(raw) {
    if (!raw || typeof raw !== 'object' || typeof raw.type !== 'string') return null;
    const type = raw.type;
    switch (type) {
        case 'play': {
            // Content ids follow the app-wide m/t prefix convention (m550, t1396).
            const contentId = String(raw.contentId || '');
            if (!/^[mt]\d{1,12}$/.test(contentId)) return null;
            const cmd = { type, contentId };
            const season = parseInt(raw.season);
            const episode = parseInt(raw.episode);
            if (Number.isFinite(season) && season > 0) cmd.season = season;
            if (Number.isFinite(episode) && episode > 0) cmd.episode = episode;
            return cmd;
        }
        case 'seek': {
            const position = Number(raw.position);
            if (!Number.isFinite(position) || position < 0) return null;
            return { type, position: Math.floor(position) };
        }
        case 'seekBy': {
            const delta = Number(raw.delta);
            if (!Number.isFinite(delta) || delta === 0 || Math.abs(delta) > 3600) return null;
            return { type, delta: Math.round(delta) };
        }
        case 'volume': {
            const level = Number(raw.level);
            if (!Number.isFinite(level)) return null;
            return { type, level: Math.min(1, Math.max(0, level)) };
        }
        case 'episode': {
            const season = parseInt(raw.season);
            const episode = parseInt(raw.episode);
            if (!Number.isFinite(season) || !Number.isFinite(episode) || season < 1 || episode < 1) return null;
            return { type, season, episode };
        }
        case 'pause':
        case 'resume':
        case 'stop':
            return { type };
        default:
            return null;
    }
}

// State a player is allowed to report about itself. Whitelisted like
// /party/update so a compromised client can't stuff arbitrary keys under
// another key path via the shared user node.
export function sanitizeState(raw) {
    if (!raw || typeof raw !== 'object') return {};
    const state = {};
    if (typeof raw.contentId === 'string' && /^[mt]\d{1,12}$/.test(raw.contentId)) state.contentId = raw.contentId;
    if (typeof raw.title === 'string') state.title = raw.title.slice(0, 120);
    const season = parseInt(raw.season);
    const episode = parseInt(raw.episode);
    if (Number.isFinite(season) && season > 0) state.season = season;
    if (Number.isFinite(episode) && episode > 0) state.episode = episode;
    const position = Number(raw.position);
    if (Number.isFinite(position) && position >= 0) state.position = Math.floor(position);
    const duration = Number(raw.duration);
    if (Number.isFinite(duration) && duration > 0) state.duration = Math.floor(duration);
    if (typeof raw.paused === 'boolean') state.paused = raw.paused;
    const volume = Number(raw.volume);
    if (Number.isFinite(volume)) state.volume = Math.min(1, Math.max(0, volume));
    const provider = parseInt(raw.provider);
    if (Number.isFinite(provider) && provider >= 1 && provider <= 4) state.provider = provider;
    return state;
}

// A player refreshes lastSeen on its SSE heartbeat (25s), so anything not
// seen for ~3 beats is treated as gone even if its node lingered after a
// server restart dropped the connection cleanup.
export const DEVICE_ONLINE_TTL_MS = 80 * 1000;

export function deviceIsOnline(device, now, ttlMs = DEVICE_ONLINE_TTL_MS) {
    return !!device && typeof device.lastSeen === 'number' && now - device.lastSeen < ttlMs;
}

// Public listing shape sent to controllers — strips the command queue and
// anything else that might live on the node.
export function deviceSummary(deviceId, device, now) {
    return {
        deviceId,
        name: sanitizeDeviceName(device && device.name),
        online: deviceIsOnline(device, now),
        since: (device && device.since) || null,
        state: (device && device.state) || null,
    };
}

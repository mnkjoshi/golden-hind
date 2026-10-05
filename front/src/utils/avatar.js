// Pure helpers for profile pictures (unit tested). The stateful side lives
// in components/userAvatar.jsx.

// Centre square of a w×h image, as the source rect to draw from.
export function squareCrop(w, h) {
    const side = Math.max(0, Math.min(w, h));
    return { sx: Math.round((w - side) / 2), sy: Math.round((h - side) / 2), side };
}

// URL of a user's picture. `version` (the upload time) busts the cache after
// a change; without it the server only lets browsers cache it briefly.
export function avatarUrl(api, user, version) {
    return `${api}/avatar/${encodeURIComponent(user)}${version ? `?v=${version}` : ''}`;
}

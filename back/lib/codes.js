// Token / room-code helpers, extracted from server.js for unit testing.

// Opaque session token. Not cryptographically strong — matches the app's
// existing scheme; kept here only so its shape can be asserted in tests.
export function generateToken() {
    return Math.random().toString(36).substr(2) + Math.random().toString(36).substr(2);
}

// 6-char watch-party room code, omitting easily-confused glyphs (I, O, 0, 1).
export const PARTY_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function generatePartyCode() {
    let code = '';
    for (let i = 0; i < 6; i++) {
        code += PARTY_CODE_ALPHABET[Math.floor(Math.random() * PARTY_CODE_ALPHABET.length)];
    }
    return code;
}

// True when a string is a syntactically valid party code (what joinWatchParty
// validates against on both web and mobile).
export function isValidPartyCode(code) {
    return /^[A-Z2-9]{6}$/.test(String(code || ''));
}

// localStorage / resume-position key. Movies key by content id; TV episodes
// key per season+episode so each episode resumes independently. Shared scheme
// across web and mobile.
export function buildPosKey(id, type, season, episode) {
    return type === 'tv' ? `playbackPos_${id}_s${season}_e${episode}` : `playbackPos_${id}`;
}

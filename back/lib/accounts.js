// Account key helpers (pure, unit tested). Usernames and emails are used as
// Firebase RTDB keys, which can't contain ".", "#", "$", "[", "]" or "/".

const FORBIDDEN_KEY_CHARS = /[.#$[\]/]/;

// Emails are stored under emails/<key> with every "." swapped for "@@@".
// Emails with a single dot map to the same key as the old first-dot-only
// escape, so existing records still match.
export function emailKey(email) {
    return email.replaceAll('.', '@@@');
}

export function emailFromKey(key) {
    return key.replaceAll('@@@', '.');
}

export function isValidUsername(username) {
    return typeof username === 'string'
        && username.trim() === username
        && username.length > 0
        && username.length <= 64
        && !FORBIDDEN_KEY_CHARS.test(username);
}

export function isValidEmail(email) {
    return typeof email === 'string'
        && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
        && !FORBIDDEN_KEY_CHARS.test(emailKey(email));
}

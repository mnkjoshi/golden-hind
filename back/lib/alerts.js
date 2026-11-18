// Admin alerts (pure, unit tested): pop-up notices for the admin about new
// kinds of errors, sign-up attempts, settings changes and new music power
// users. Stored at admin/alerts as { type, user, message, timestamp }.
import crypto from 'crypto';

// Same kind of error → same signature: numbers and content ids are masked so
// "timeout after 3012ms on /t1399" and "…4100ms on /t95396" count as one.
export function errorSignature(endpoint, message) {
    const ep = String(endpoint || '').replace(/[mt]\d+/g, '#').trim();
    const msg = String(message || '').toLowerCase().replace(/\d+/g, '#').replace(/\s+/g, ' ').trim().slice(0, 160);
    return crypto.createHash('sha1').update(`${ep}|${msg}`).digest('hex').slice(0, 16);
}

const REGISTER_OUTCOMES = {
    UCS: 'created an account',
    UNT: 'tried to sign up, but the username was taken',
    ET: 'tried to sign up, but the email was already registered',
    IUN: 'tried to sign up with an invalid username',
    IE: 'tried to sign up with an invalid email',
};
export function registerAlertMessage(username, email, outcome) {
    const who = String(username || '').slice(0, 64) || 'Someone';
    const what = REGISTER_OUTCOMES[outcome] || `tried to sign up (${String(outcome || 'error').slice(0, 80)})`;
    return `${who} ${what}${email ? ` · ${String(email).slice(0, 120)}` : ''}`;
}

// Newest-last list of alerts after `since`, at most `limit`.
export function alertsSince(alertsVal, since = 0, limit = 50) {
    return Object.entries(alertsVal || {})
        .map(([id, a]) => ({ id, ...a }))
        .filter(a => Number(a.timestamp) > since)
        .sort((a, b) => a.timestamp - b.timestamp)
        .slice(-limit);
}

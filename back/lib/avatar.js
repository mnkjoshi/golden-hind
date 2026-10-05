// Profile pictures: validation and storage naming (pure, unit tested).
// The browser crops and shrinks the picture to a small square JPEG before
// uploading it as a data URL; the server checks it really is an image.
import crypto from 'crypto';

export const AVATAR_MAX_BYTES = 96 * 1024;

// Image type from the file's first bytes (never trust the declared type).
export function sniffImageType(buf) {
    if (!buf || buf.length < 12) return null;
    if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
    if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'image/png';
    if (buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
    return null;
}

// "data:image/jpeg;base64,…" → { buffer, type }, or null if it isn't a
// JPEG/PNG/WebP within the size limit.
export function parseAvatarDataUrl(dataUrl) {
    if (typeof dataUrl !== 'string') return null;
    const m = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
    if (!m) return null;
    const buffer = Buffer.from(m[2], 'base64');
    if (!buffer.length || buffer.length > AVATAR_MAX_BYTES) return null;
    const type = sniffImageType(buffer);
    return type ? { buffer, type } : null;
}

// Usernames are free-form database keys, so files are named by a hash of the
// username instead — always a safe, fixed-length file name.
export function avatarFileName(user) {
    return crypto.createHash('sha256').update(String(user)).digest('hex').slice(0, 32) + '.img';
}

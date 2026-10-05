import test from 'node:test';
import assert from 'node:assert/strict';
import { sniffImageType, parseAvatarDataUrl, avatarFileName, AVATAR_MAX_BYTES } from '../lib/avatar.js';

const jpeg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(60, 1)]);
const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(60, 1)]);
const webp = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBP'), Buffer.alloc(60, 1)]);
const url = (type, buf) => `data:image/${type};base64,${buf.toString('base64')}`;

test('sniffImageType recognises jpeg, png and webp by their bytes', () => {
    assert.equal(sniffImageType(jpeg), 'image/jpeg');
    assert.equal(sniffImageType(png), 'image/png');
    assert.equal(sniffImageType(webp), 'image/webp');
    assert.equal(sniffImageType(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg">')), null);
    assert.equal(sniffImageType(Buffer.alloc(4)), null);
    assert.equal(sniffImageType(null), null);
});

test('parseAvatarDataUrl accepts real images and rejects everything else', () => {
    assert.equal(parseAvatarDataUrl(url('jpeg', jpeg)).type, 'image/jpeg');
    assert.equal(parseAvatarDataUrl(url('png', png)).type, 'image/png');
    // The declared type doesn't matter, the bytes do
    assert.equal(parseAvatarDataUrl(url('png', jpeg)).type, 'image/jpeg');
    assert.equal(parseAvatarDataUrl(url('jpeg', Buffer.from('<html>not an image at all</html>'))), null);
    assert.equal(parseAvatarDataUrl('data:image/svg+xml;base64,' + Buffer.from('<svg/>').toString('base64')), null);
    assert.equal(parseAvatarDataUrl('https://example.com/a.jpg'), null);
    assert.equal(parseAvatarDataUrl(null), null);
    const huge = Buffer.concat([jpeg, Buffer.alloc(AVATAR_MAX_BYTES)]);
    assert.equal(parseAvatarDataUrl(url('jpeg', huge)), null);
});

test('avatarFileName is a fixed-length hash, safe for any username', () => {
    const a = avatarFileName('manav');
    assert.match(a, /^[0-9a-f]{32}\.img$/);
    assert.equal(avatarFileName('manav'), a);
    assert.notEqual(avatarFileName('Manav'), a);
    assert.match(avatarFileName('../../etc/passwd'), /^[0-9a-f]{32}\.img$/);
});

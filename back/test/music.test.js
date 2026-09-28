import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeSearchQuery, formatDuration, parseYtSearchOutput } from '../lib/music.js';

test('sanitizeSearchQuery trims, collapses, strips control chars, caps length', () => {
    assert.equal(sanitizeSearchQuery('  never   gonna give  '), 'never gonna give');
    assert.equal(sanitizeSearchQuery('a\nb\tc\x00d'), 'a b c d');
    assert.equal(sanitizeSearchQuery('x'.repeat(250)).length, 100);
    assert.equal(sanitizeSearchQuery(''), null);
    assert.equal(sanitizeSearchQuery('   '), null);
    assert.equal(sanitizeSearchQuery(null), null);
    assert.equal(sanitizeSearchQuery(undefined), null);
});

test('formatDuration handles minutes, hours, and junk', () => {
    assert.equal(formatDuration(225), '3:45');
    assert.equal(formatDuration(7), '0:07');
    assert.equal(formatDuration(3725), '1:02:05');
    assert.equal(formatDuration(212.6), '3:33');
    assert.equal(formatDuration(0), null);
    assert.equal(formatDuration(null), null);
    assert.equal(formatDuration('nope'), null);
});

test('parseYtSearchOutput maps yt-dlp JSON lines to results', () => {
    const stdout = [
        JSON.stringify({ id: 'dQw4w9WgXcQ', title: 'Never Gonna Give You Up', channel: 'Rick Astley', duration: 213 }),
        JSON.stringify({ id: 'abcdefghijk', title: 'Live set', uploader: 'Some DJ' }),
    ].join('\n');
    assert.deepEqual(parseYtSearchOutput(stdout), [
        {
            videoId: 'dQw4w9WgXcQ',
            url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
            title: 'Never Gonna Give You Up',
            channel: 'Rick Astley',
            duration: '3:33',
            thumbnail: 'https://i.ytimg.com/vi/dQw4w9WgXcQ/mqdefault.jpg',
        },
        {
            videoId: 'abcdefghijk',
            url: 'https://www.youtube.com/watch?v=abcdefghijk',
            title: 'Live set',
            channel: 'Some DJ',
            duration: null,
            thumbnail: 'https://i.ytimg.com/vi/abcdefghijk/mqdefault.jpg',
        },
    ]);
});

test('parseYtSearchOutput skips garbage, non-videos, and duplicates', () => {
    const stdout = [
        'WARNING: not json',
        '',
        JSON.stringify({ id: 'UCxxxxxxxxxxxxxxxxxxxxxx', title: 'A channel' }), // not an 11-char video id
        JSON.stringify({ id: 'dQw4w9WgXcQ', title: 'First' }),
        JSON.stringify({ id: 'dQw4w9WgXcQ', title: 'Duplicate' }),
        JSON.stringify({ title: 'No id' }),
    ].join('\n');
    const out = parseYtSearchOutput(stdout);
    assert.equal(out.length, 1);
    assert.equal(out[0].title, 'First');
    assert.equal(out[0].channel, null);
    assert.deepEqual(parseYtSearchOutput(''), []);
    assert.deepEqual(parseYtSearchOutput(null), []);
});

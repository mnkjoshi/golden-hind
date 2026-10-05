import { test } from 'node:test';
import assert from 'node:assert/strict';
import { videoCacheKey, videoFileName, isExpiredVideo, VIDEO_CACHE_TTL_MS } from '../lib/video.js';

test('videoCacheKey covers movies and episodes and rejects junk', () => {
    assert.equal(videoCacheKey('m550'), 'm550');
    assert.equal(videoCacheKey('m550', 3, 4), 'm550');
    assert.equal(videoCacheKey('t1396', '2', '4'), 't1396-s2e4');
    assert.equal(videoCacheKey('t1396'), null);
    assert.equal(videoCacheKey('t1396', 1, 0), null);
    assert.equal(videoCacheKey('../etc', 1, 1), null);
    assert.equal(videoCacheKey(undefined), null);
});

test('videoFileName pads episodes and strips unsafe characters', () => {
    assert.equal(videoFileName('Breaking Bad', 'tv', 2, 4), 'Breaking Bad.S02E04.mp4');
    assert.equal(videoFileName('Fight Club', 'movie'), 'Fight Club.mp4');
    assert.equal(videoFileName('A/B: C?', 'movie'), 'A-B- C-.mp4');
    assert.equal(videoFileName('', 'movie'), 'video.mp4');
});

test('isExpiredVideo uses a three-day TTL', () => {
    const now = 10 * VIDEO_CACHE_TTL_MS;
    assert.equal(isExpiredVideo(now - VIDEO_CACHE_TTL_MS - 1, now), true);
    assert.equal(isExpiredVideo(now - 1000, now), false);
});

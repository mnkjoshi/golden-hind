import { test } from 'node:test';
import assert from 'node:assert/strict';
import { episodeKey, buildWatchedUpdate, seasonSummary } from '../lib/watched.js';

test('episodeKey builds path-safe keys and rejects junk', () => {
    assert.equal(episodeKey(1, 5), 's1e5');
    assert.equal(episodeKey('2', '10'), 's2e10');
    assert.equal(episodeKey(0, 1), 's0e1');         // specials season
    assert.equal(episodeKey(1, 0), null);           // episodes are 1-based
    assert.equal(episodeKey(-1, 3), null);
    assert.equal(episodeKey('x', 3), null);
    assert.equal(episodeKey(1000, 1), null);
});

test('buildWatchedUpdate marks with a timestamp and unmarks with null', () => {
    assert.deepEqual(buildWatchedUpdate(2, [1, 2, 3], true, 123), {
        s2e1: 123, s2e2: 123, s2e3: 123,
    });
    assert.deepEqual(buildWatchedUpdate(2, [4], false, 123), { s2e4: null });
});

test('buildWatchedUpdate rejects malformed requests wholesale', () => {
    assert.equal(buildWatchedUpdate(1, [], true, 1), null);
    assert.equal(buildWatchedUpdate(1, null, true, 1), null);
    assert.equal(buildWatchedUpdate(1, [1, 'nope'], true, 1), null);
    assert.equal(buildWatchedUpdate('bad', [1], true, 1), null);
    assert.equal(buildWatchedUpdate(1, Array.from({ length: 501 }, (_, i) => i + 1), true, 1), null);
});

test('seasonSummary counts only real episodes of that season', () => {
    const map = { s1e1: 111, s1e2: 222, s2e1: 333, s1e99: 444 }; // e99 no longer exists
    assert.deepEqual(seasonSummary(map, 1, [1, 2, 3]), { total: 3, watchedCount: 2, allWatched: false });
    assert.deepEqual(seasonSummary(map, 1, [1, 2]), { total: 2, watchedCount: 2, allWatched: true });
    assert.deepEqual(seasonSummary(map, 2, [1]), { total: 1, watchedCount: 1, allWatched: true });
    assert.deepEqual(seasonSummary(null, 1, [1]), { total: 1, watchedCount: 0, allWatched: false });
    assert.deepEqual(seasonSummary(map, 1, []), { total: 0, watchedCount: 0, allWatched: false });
});

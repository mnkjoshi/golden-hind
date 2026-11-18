import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeListenReport, aggregateListening } from '../lib/listening.js';

test('sanitizeListenReport keeps valid entries and rounds seconds', () => {
    assert.deepEqual(
        sanitizeListenReport({ dQw4w9WgXcQ: { seconds: 42.345, title: ' Song ', artist: 'Artist' } }),
        { dQw4w9WgXcQ: { seconds: 42.3, title: 'Song', artist: 'Artist' } },
    );
});

test('sanitizeListenReport drops bad ids and durations', () => {
    assert.deepEqual(sanitizeListenReport({
        short: { seconds: 10 },
        dQw4w9WgXcQ: { seconds: 0 },
        aaaaaaaaaaa: { seconds: 999 },
        bbbbbbbbbbb: { seconds: 'x' },
        ccccccccccc: null,
    }), {});
    assert.deepEqual(sanitizeListenReport(null), {});
    assert.deepEqual(sanitizeListenReport([1, 2]), {});
});

test('aggregateListening totals, ranks songs and sums artists', () => {
    const agg = aggregateListening({
        a: { seconds: 100, title: 'A', artist: 'X' },
        b: { seconds: 300, title: 'B', artist: 'Y' },
        c: { seconds: 250, title: 'C', artist: 'X' },
        d: { seconds: 0, title: 'D', artist: 'Z' },
    });
    assert.equal(agg.totalSeconds, 650);
    assert.equal(agg.songCount, 3);
    assert.deepEqual(agg.topSongs.map(s => s.videoId), ['b', 'c', 'a']);
    assert.deepEqual(agg.topArtists, [{ name: 'X', seconds: 350 }, { name: 'Y', seconds: 300 }]);
});

test('aggregateListening handles no data', () => {
    assert.deepEqual(aggregateListening(null), { totalSeconds: 0, songCount: 0, topSongs: [], topArtists: [] });
});

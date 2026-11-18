import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeListenReport, aggregateListening, listeningHistory } from '../lib/listening.js';

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

test('listeningHistory orders by last play and by time, without exposing times', () => {
    const h = listeningHistory({
        a: { seconds: 100, title: 'A', artist: 'X', lastAt: 30 },
        b: { seconds: 900, title: 'B', artist: 'Y', lastAt: 10 },
        c: { seconds: 50, title: 'C', artist: 'Z', lastAt: 20 },
        d: { seconds: 0, title: 'D', artist: 'Z', lastAt: 40 },
        e: { seconds: 70, title: '', artist: 'Z', lastAt: 50 },
    });
    assert.deepEqual(h.recent.map(s => s.videoId), ['a', 'c', 'b']);
    assert.deepEqual(h.most.map(s => s.videoId), ['b', 'a', 'c']);
    assert.deepEqual(h.most[0], { videoId: 'b', title: 'B', artist: 'Y' });
    assert.deepEqual(listeningHistory(null), { recent: [], most: [] });
});

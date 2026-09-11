import { test } from 'node:test';
import assert from 'node:assert/strict';
import { aggregateWatchSessions, genreBreakdown } from '../lib/stats.js';

const NOW = Date.UTC(2026, 8, 15); // 2026-09-15
const DAY = 24 * 60 * 60 * 1000;

const session = (contentId, name, duration, timestamp) =>
    ({ contentId, contentName: name, duration, timestamp });

test('aggregates totals, days, and per-title ranking', () => {
    const out = aggregateWatchSessions([
        session('t1', 'Breaking Bad', 3600, NOW - 1 * DAY),
        session('t1', 'Breaking Bad', 1800, NOW - 1 * DAY + 3600e3),
        session('m2', 'Fight Club', 7200, NOW - 40 * DAY),
        session('t3', 'The Wire', 600, NOW - 2 * DAY),
    ], NOW);

    assert.equal(out.totalSeconds, 13200);
    assert.equal(out.sessionCount, 4);
    assert.equal(out.distinctDays, 3);
    assert.deepEqual(out.topTitles.map(t => t.contentId), ['m2', 't1', 't3']);
    assert.equal(out.topTitles[1].seconds, 5400);
    assert.equal(out.topTitles[1].sessions, 2);
    assert.deepEqual(out.longestSession, {
        contentId: 'm2', name: 'Fight Club', seconds: 7200, timestamp: NOW - 40 * DAY,
    });
});

test('byMonth covers exactly the last 12 months, zero-filled, oldest first', () => {
    const out = aggregateWatchSessions([
        session('t1', 'X', 100, NOW - 3 * DAY),          // 2026-09
        session('t1', 'X', 200, NOW - 40 * DAY),         // 2026-08
        session('t1', 'X', 999, NOW - 400 * DAY),        // outside window — dropped from byMonth
    ], NOW);

    assert.equal(out.byMonth.length, 12);
    assert.equal(out.byMonth[0].month, '2025-10');
    assert.equal(out.byMonth[11].month, '2026-09');
    assert.equal(out.byMonth[11].seconds, 100);
    assert.equal(out.byMonth[10].seconds, 200);
    assert.equal(out.byMonth.reduce((s, m) => s + m.seconds, 0), 300);
    // ...but the out-of-window session still counts toward lifetime totals
    assert.equal(out.totalSeconds, 1299);
});

test('junk sessions are skipped, empty input degrades cleanly', () => {
    const out = aggregateWatchSessions([
        null,
        { contentName: 'no duration', timestamp: NOW },
        session('t1', 'future', 100, NOW + 30 * DAY),    // implausible timestamp
        session('t1', 'ok', 50, NOW - DAY),
    ], NOW);
    assert.equal(out.sessionCount, 1);
    assert.equal(out.totalSeconds, 50);

    const empty = aggregateWatchSessions([], NOW);
    assert.equal(empty.totalSeconds, 0);
    assert.equal(empty.longestSession, null);
    assert.deepEqual(empty.topTitles, []);
    assert.equal(empty.byMonth.length, 12);
});

test('sessions without contentId group by name and keep the latest name spelling', () => {
    const out = aggregateWatchSessions([
        session('', 'Old Name', 100, NOW - 2 * DAY),
        { contentId: 't9', contentName: 'Old Name', duration: 10, timestamp: NOW - 3 * DAY },
        { contentId: 't9', contentName: 'New Name', duration: 10, timestamp: NOW - DAY },
    ], NOW);
    const t9 = out.topTitles.find(t => t.contentId === 't9');
    assert.equal(t9.name, 'New Name');
    assert.equal(t9.seconds, 20);
});

test('genreBreakdown weights genres by watch seconds', () => {
    const out = genreBreakdown([
        { seconds: 100, genres: [{ name: 'Drama' }, { name: 'Crime' }] },
        { seconds: 50, genres: [{ name: 'Drama' }] },
        { seconds: 10, genres: ['Comedy'] },
        { seconds: 5, genres: null },
    ], 2);
    assert.deepEqual(out, [
        { name: 'Drama', seconds: 150 },
        { name: 'Crime', seconds: 100 },
    ]);
    assert.deepEqual(genreBreakdown([]), []);
});

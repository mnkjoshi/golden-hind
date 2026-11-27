import { test } from 'node:test';
import assert from 'node:assert/strict';
import { filterAnalytics } from '../lib/adminAnalytics.js';

const ev = (user, event, timestamp) => ({ user, event, timestamp, data: {} });
const all = [
    ev('manav', 'music_play', 5), ev('manav', 'music_play', 6), ev('anais', 'watch', 4),
    ev('bob', 'search', 7), ev('anais', 'music_play', 3), ev('bob', 'page_view', 8),
];

test('excluding the admin hides their events and their counts', () => {
    const r = filterAnalytics(all, { excludeUsers: ['manav'] });
    assert.deepEqual(r.events.map(e => `${e.user}:${e.event}`), ['bob:search', 'anais:watch', 'anais:music_play']);
    assert.deepEqual(r.counts, { search: 1, watch: 1, music_play: 1 });
    assert.equal(r.activeUsers, 2);
    assert.deepEqual(r.people, ['anais', 'bob', 'manav']);
});

test('filters by person and by event type; type counts ignore the type filter', () => {
    const r = filterAnalytics(all, { users: ['anais'], events: ['watch'] });
    assert.deepEqual(r.events.map(e => e.event), ['watch']);
    assert.deepEqual(r.counts, { watch: 1, music_play: 1 });
    assert.equal(r.total, 1);
});

test('caps the list and drops page views', () => {
    const r = filterAnalytics(all, {}, 2);
    assert.equal(r.events.length, 2);
    assert.equal(r.total, 5);
    assert.ok(!r.events.some(e => e.event === 'page_view'));
});

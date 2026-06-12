import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectShowChanges, showSnapshot, collectShowFollowers } from '../lib/notifications.js';

const show = (seasons, episodes, lastEp) => ({
    name: 'Test Show',
    number_of_seasons: seasons,
    number_of_episodes: episodes,
    last_episode_to_air: lastEp,
});

test('showSnapshot captures season/episode counts and last-episode key', () => {
    const s = showSnapshot(show(2, 16, { season_number: 2, episode_number: 8 }));
    assert.deepEqual(s, { seasonCount: 2, episodeCount: 16, lastEpisodeKey: 's2e8' });
});

test('first check records a baseline and never notifies', () => {
    const { snapshot, notifications } = detectShowChanges(null, show(1, 8, { season_number: 1, episode_number: 8 }));
    assert.equal(notifications.length, 0);
    assert.equal(snapshot.episodeCount, 8);
});

test('no change → no notification', () => {
    const prev = showSnapshot(show(1, 8, { season_number: 1, episode_number: 8 }));
    const { notifications } = detectShowChanges(prev, show(1, 8, { season_number: 1, episode_number: 8 }));
    assert.equal(notifications.length, 0);
});

test('new episode is detected with its season + episode', () => {
    const prev = showSnapshot(show(1, 8, { season_number: 1, episode_number: 8 }));
    const { notifications } = detectShowChanges(prev, show(1, 9, { season_number: 1, episode_number: 9 }));
    assert.equal(notifications.length, 1);
    assert.equal(notifications[0].type, 'new_episode');
    assert.equal(notifications[0].season, 1);
    assert.equal(notifications[0].episode, 9);
    assert.match(notifications[0].message, /New episode of Test Show: S1E9/);
});

test('new season takes precedence over episode count bump', () => {
    const prev = showSnapshot(show(1, 8, { season_number: 1, episode_number: 8 }));
    const { notifications } = detectShowChanges(prev, show(2, 10, { season_number: 2, episode_number: 2 }));
    assert.equal(notifications.length, 1);
    assert.equal(notifications[0].type, 'new_season');
    assert.equal(notifications[0].season, 2);
});

test('episode count up but same last-episode key does not fire (dedupe)', () => {
    const prev = showSnapshot(show(1, 8, { season_number: 1, episode_number: 8 }));
    // count rose but last_episode_to_air unchanged (e.g. a TMDB correction)
    const { notifications } = detectShowChanges(prev, show(1, 9, { season_number: 1, episode_number: 8 }));
    assert.equal(notifications.length, 0);
});

test('collectShowFollowers maps TV ids to follower sets from watchlist + favourites', () => {
    const users = {
        alice: { watchlist: '["t1","m5"]', favourites: '["t2"]' },
        bob:   { watchlist: '["t1"]', favourites: '[]' },
        carol: { watchlist: 'not-json', favourites: '["t2","m9"]' },
    };
    const followers = collectShowFollowers(users);
    assert.deepEqual([...followers.get('t1')].sort(), ['alice', 'bob']);
    assert.deepEqual([...followers.get('t2')].sort(), ['alice', 'carol']);
    assert.ok(!followers.has('m5')); // movies ignored
    assert.ok(!followers.has('m9'));
});

test('collectShowFollowers tolerates missing / empty users', () => {
    assert.equal(collectShowFollowers({}).size, 0);
    assert.equal(collectShowFollowers(null).size, 0);
    assert.equal(collectShowFollowers({ x: {} }).size, 0);
});

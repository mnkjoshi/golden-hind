import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nextUpEpisode, showStructure, seasonProgress } from '../lib/nextUp.js';

const seasons = [{ season: 0, episodes: 3 }, { season: 1, episodes: 3 }, { season: 2, episodes: 2 }];

test('no progress starts at S1E1 (skipping specials)', () => {
    assert.deepEqual(nextUpEpisode({ seasons }), { season: 1, episode: 1, kind: 'start' });
});

test('a started episode that was left partway resumes', () => {
    assert.deepEqual(
        nextUpEpisode({ seasons, progress: { season: 1, episode: 2 }, watched: { s1e2: 1 }, positionPct: 0.4 }),
        { season: 1, episode: 2, kind: 'resume' },
    );
});

test('a finished (or opened elsewhere) episode moves to the next unwatched one, across seasons', () => {
    assert.deepEqual(
        nextUpEpisode({ seasons, progress: { season: 1, episode: 2 }, watched: { s1e2: 1, s1e3: 1 } }),
        { season: 2, episode: 1, kind: 'next' },
    );
    assert.deepEqual(
        nextUpEpisode({ seasons, progress: { season: 1, episode: 2 }, watched: { s1e2: 1 }, positionPct: 0.95 }),
        { season: 1, episode: 3, kind: 'next' },
    );
});

test('stops at the last aired episode and at the end of the show', () => {
    assert.equal(nextUpEpisode({ seasons, lastAired: { season: 2, episode: 1 }, progress: { season: 2, episode: 1 }, watched: { s2e1: 1 } }), null);
    assert.equal(nextUpEpisode({ seasons, progress: { season: 2, episode: 2 }, watched: { s2e2: 1 } }), null);
    assert.equal(nextUpEpisode({ seasons: [] }), null);
});

test('an unwatched progress episode is offered as a resume', () => {
    assert.deepEqual(nextUpEpisode({ seasons, progress: { season: 2, episode: 9 } }), { season: 2, episode: 2, kind: 'resume' });
});

test('showStructure reads TMDB seasons and the last aired episode', () => {
    assert.deepEqual(showStructure({
        seasons: [{ season_number: 1, episode_count: 10 }],
        last_episode_to_air: { season_number: 1, episode_number: 7 },
    }), { seasons: [{ season: 1, episodes: 10 }], lastAired: { season: 1, episode: 7 } });
    assert.deepEqual(showStructure(null), { seasons: [], lastAired: null });
});

test('seasonProgress maps one season of saved positions to fractions', () => {
    assert.deepEqual(seasonProgress({
        playbackPos_t1_s1_e1: { position: 600, duration: 1200 },
        playbackPos_t1_s1_e2: { position: 0, duration: 1200 },
        playbackPos_t1_s2_e1: { position: 100, duration: 1000 },
        playbackPos_t11_s1_e3: { position: 100, duration: 1000 },
        playbackPos_t1_s1_e10: { position: 999, duration: 1000 },
    }, 't1', 1), { 1: 0.5, 10: 0.999 });
});

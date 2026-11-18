import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    isMusicPowerUser, pickMusicSeeds, buildMusicRecPrompt, songKey, parseMusicRecResponse, musicRecsNeedRefresh,
} from '../lib/musicRecs.js';

const listens = (n, seconds, start = 0) => Object.fromEntries(
    Array.from({ length: n }, (_, i) => [`vid${String(i + start).padStart(8, '0')}`, { seconds, title: `Song ${i + start}`, artist: `Artist ${(i + start) % 4}`, lastAt: 1000 + i + start }]),
);

test('isMusicPowerUser needs enough songs and enough total time', () => {
    assert.equal(isMusicPowerUser(listens(15, 600)), true);            // 15 songs, 2.5h
    assert.equal(isMusicPowerUser(listens(14, 900)), false);           // too few songs
    assert.equal(isMusicPowerUser(listens(20, 120)), false);           // only 40 minutes
    assert.equal(isMusicPowerUser({ ...listens(10, 1000), ...listens(10, 30, 10) }), false); // short plays don't count
    assert.equal(isMusicPowerUser(null), false);
});

test('pickMusicSeeds takes top by time and recent by last play, without overlap', () => {
    const l = {
        a: { seconds: 900, title: 'A', artist: 'X', lastAt: 1 },
        b: { seconds: 100, title: 'B', artist: 'Y', lastAt: 50 },
        c: { seconds: 500, title: 'C', artist: 'Z', lastAt: 40 },
        d: { seconds: 50, title: 'D', artist: 'W', lastAt: 30 },
    };
    const seeds = pickMusicSeeds(l, 2);
    assert.deepEqual(seeds.top.map(s => s.videoId), ['a', 'c']);
    assert.deepEqual(seeds.recent.map(s => s.videoId), ['b', 'd']);
    assert.equal(seeds.key, 'a,c,b,d');
});

test('buildMusicRecPrompt lists both seed groups and asks for JSON', () => {
    const p = buildMusicRecPrompt({ top: [{ title: 'A', artist: 'X' }], recent: [{ title: 'B', artist: '' }] }, 5);
    assert.match(p, /"A" by X/);
    assert.match(p, /"B"\n/);
    assert.match(p, /exactly 5 songs/);
    assert.match(p, /"favourites":\[/);
});

test('songKey ignores case, punctuation and bracketed extras', () => {
    assert.equal(songKey('Blinding Lights (Official Video)', 'The Weeknd'), songKey('blinding lights', 'the weeknd'));
    assert.notEqual(songKey('Song', 'A'), songKey('Song', 'B'));
});

test('parseMusicRecResponse cleans, de-duplicates and excludes known songs', () => {
    const text = 'Here you go:\n```json\n' + JSON.stringify({
        favourites: [
            { title: 'New One', artist: 'Band' },
            { title: 'Known Song', artist: 'Artist' },
            { title: 'new one!', artist: 'band' },
            { title: '', artist: 'Nobody' },
        ],
        recent: [{ title: 'New One', artist: 'Band' }, { title: 'Other', artist: 'Singer' }],
    }) + '\n```';
    const out = parseMusicRecResponse(text, new Set([songKey('Known Song', 'Artist')]));
    assert.deepEqual(out, {
        favourites: [{ title: 'New One', artist: 'Band' }],
        recent: [{ title: 'Other', artist: 'Singer' }],
    });
    assert.throws(() => parseMusicRecResponse('no json'));
});

test('musicRecsNeedRefresh: missing, or a day old — never sooner', () => {
    const h = 3600e3;
    assert.equal(musicRecsNeedRefresh(null, 0), true);
    assert.equal(musicRecsNeedRefresh({}, 0), true);
    assert.equal(musicRecsNeedRefresh({ ts: 0 }, 23 * h), false);
    assert.equal(musicRecsNeedRefresh({ ts: 0 }, 24 * h), true);
});

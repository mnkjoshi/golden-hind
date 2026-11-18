import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanLyricsQuery, pickLyrics } from '../lib/lyrics.js';

test('cleanLyricsQuery strips YouTube clutter and the artist prefix', () => {
    assert.deepEqual(cleanLyricsQuery('The Weeknd - Blinding Lights (Official Video) [4K]', 'The Weeknd'), { track: 'Blinding Lights', artist: 'The Weeknd' });
    assert.deepEqual(cleanLyricsQuery('Blinding Lights', 'The Weeknd - Topic'), { track: 'Blinding Lights', artist: 'The Weeknd' });
    assert.deepEqual(cleanLyricsQuery('Song Name ft. Someone', 'Artist'), { track: 'Song Name', artist: 'Artist' });
    assert.deepEqual(cleanLyricsQuery('Adele - Hello', ''), { track: 'Hello', artist: 'Adele' });
    assert.deepEqual(cleanLyricsQuery('Title | Live at Wembley', 'Band'), { track: 'Title', artist: 'Band' });
});

test('cleanLyricsQuery keeps dashes that are part of the title', () => {
    assert.deepEqual(cleanLyricsQuery('Run - Remastered', 'Someone Else'), { track: 'Run - Remastered', artist: 'Someone Else' });
});

test('pickLyrics prefers what LRCLIB has', () => {
    assert.deepEqual(pickLyrics({ syncedLyrics: '[00:01.00]Hi', plainLyrics: 'Hi' }), { instrumental: false, synced: '[00:01.00]Hi', plain: 'Hi' });
    assert.deepEqual(pickLyrics({ syncedLyrics: '', plainLyrics: 'Hi' }), { instrumental: false, synced: null, plain: 'Hi' });
    assert.deepEqual(pickLyrics({ instrumental: true }), { instrumental: true, synced: null, plain: null });
    assert.equal(pickLyrics({ syncedLyrics: null, plainLyrics: null }), null);
    assert.equal(pickLyrics(null), null);
});

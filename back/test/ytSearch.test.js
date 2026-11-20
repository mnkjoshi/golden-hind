import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mapMusicSongs, mapVideos } from '../lib/ytSearch.js';

const title = (s) => ({ toString: () => s });

test('mapMusicSongs keeps official songs with their artists, de-duplicated and capped', () => {
    const out = mapMusicSongs([
        { id: 'J7p4bzqLvCw', title: 'Blinding Lights', artists: [{ name: 'The Weeknd' }], duration: { seconds: 202 } },
        { id: 'J7p4bzqLvCw', title: 'dup' },
        { id: 'bad', title: 'x' },
        { id: 'BSTsnWoslP4', title: 'Bohemian Rhapsody', artists: [{ name: 'Queen' }, { name: 'Freddie' }], duration: { seconds: 355 } },
    ], 5);
    assert.equal(out.length, 2);
    assert.deepEqual(out[0], {
        videoId: 'J7p4bzqLvCw', url: 'https://www.youtube.com/watch?v=J7p4bzqLvCw', title: 'Blinding Lights', channel: 'The Weeknd',
        duration: out[0].duration, thumbnail: 'https://i.ytimg.com/vi/J7p4bzqLvCw/mqdefault.jpg', verified: false, official: true,
    });
    assert.equal(out[1].channel, 'Queen, Freddie');
    assert.equal(mapMusicSongs(null).length, 0);
});

test('mapVideos skips live streams and non-videos', () => {
    const out = mapVideos([
        { type: 'Video', video_id: '4NRXx6U8ABQ', title: title('The Weeknd - Blinding Lights'), author: { name: 'The Weeknd', is_verified: true }, duration: { seconds: 263 } },
        { type: 'Video', video_id: 'rFZHOHl-L8A', title: title('lofi radio'), author: { name: 'Lofi Girl' }, duration: { seconds: 0 } },
        { type: 'Channel', id: 'UCxxxxxxxxx' },
    ]);
    assert.equal(out.length, 1);
    assert.equal(out[0].videoId, '4NRXx6U8ABQ');
    assert.equal(out[0].title, 'The Weeknd - Blinding Lights');
    assert.equal(out[0].verified, true);
    assert.equal(out[0].official, false);
});

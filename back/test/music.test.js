import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    sanitizeSearchQuery, formatDuration, parseYtSearchOutput,
    artistFromOembedAuthor, rankYouTubeResults, mergeSearchResults, filterRelevantSongs,
    buildTrackTags, coverCandidates, buildMp3FfmpegArgs, sanitizeLibrarySong, zipEntryNames,
} from '../lib/music.js';

test('sanitizeSearchQuery trims, collapses, strips control chars, caps length', () => {
    assert.equal(sanitizeSearchQuery('  never   gonna give  '), 'never gonna give');
    assert.equal(sanitizeSearchQuery('a\nb\tc\x00d'), 'a b c d');
    assert.equal(sanitizeSearchQuery('x'.repeat(250)).length, 100);
    assert.equal(sanitizeSearchQuery(''), null);
    assert.equal(sanitizeSearchQuery('   '), null);
    assert.equal(sanitizeSearchQuery(null), null);
    assert.equal(sanitizeSearchQuery(undefined), null);
});

test('formatDuration handles minutes, hours, and junk', () => {
    assert.equal(formatDuration(225), '3:45');
    assert.equal(formatDuration(7), '0:07');
    assert.equal(formatDuration(3725), '1:02:05');
    assert.equal(formatDuration(212.6), '3:33');
    assert.equal(formatDuration(0), null);
    assert.equal(formatDuration(null), null);
    assert.equal(formatDuration('nope'), null);
});

test('parseYtSearchOutput maps yt-dlp JSON lines to results', () => {
    const stdout = [
        JSON.stringify({ id: 'dQw4w9WgXcQ', title: 'Never Gonna Give You Up', channel: 'Rick Astley', duration: 213, channel_is_verified: true }),
        JSON.stringify({ id: 'abcdefghijk', title: 'Live set', uploader: 'Some DJ' }),
    ].join('\n');
    assert.deepEqual(parseYtSearchOutput(stdout), [
        {
            videoId: 'dQw4w9WgXcQ',
            url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
            title: 'Never Gonna Give You Up',
            channel: 'Rick Astley',
            duration: '3:33',
            thumbnail: 'https://i.ytimg.com/vi/dQw4w9WgXcQ/mqdefault.jpg',
            verified: true,
            official: false,
        },
        {
            videoId: 'abcdefghijk',
            url: 'https://www.youtube.com/watch?v=abcdefghijk',
            title: 'Live set',
            channel: 'Some DJ',
            duration: null,
            thumbnail: 'https://i.ytimg.com/vi/abcdefghijk/mqdefault.jpg',
            verified: false,
            official: false,
        },
    ]);
});

test('parseYtSearchOutput marks YouTube Music songs official and keeps www URLs', () => {
    const stdout = JSON.stringify({ id: 'TiebZllW8As', title: 'DtMF', url: 'https://music.youtube.com/watch?v=TiebZllW8As' });
    const [song] = parseYtSearchOutput(stdout, { official: true });
    assert.equal(song.official, true);
    assert.equal(song.url, 'https://www.youtube.com/watch?v=TiebZllW8As');
    assert.equal(song.channel, null);
});

test('artistFromOembedAuthor strips the auto-generated Topic suffix', () => {
    assert.equal(artistFromOembedAuthor('Bad Bunny - Topic'), 'Bad Bunny');
    assert.equal(artistFromOembedAuthor('Bad Bunny'), 'Bad Bunny');
    assert.equal(artistFromOembedAuthor('  AC/DC - topic '), 'AC/DC');
    assert.equal(artistFromOembedAuthor(''), null);
    assert.equal(artistFromOembedAuthor(undefined), null);
});

test('rankYouTubeResults lifts verified artist uploads over fan lyric videos', () => {
    // Real ytsearch order for "DtMF": a verified lyrics channel first, the
    // artist's own visualizer last.
    const results = [
        { videoId: 'a', title: 'Bad Bunny - DtMF (Letra)', verified: true },
        { videoId: 'b', title: 'Bad Bunny - DtMF (Video Lyrics)', verified: false },
        { videoId: 'c', title: 'Dtmf - Bad Bunny (debi tirar mas fotos)', verified: false },
        { videoId: 'd', title: 'BAD BUNNY - DtMF (Visualizer)', verified: true },
    ];
    assert.deepEqual(rankYouTubeResults(results, 'DtMF').map(r => r.videoId), ['d', 'c', 'a', 'b']);
});

test('rankYouTubeResults does not penalise markers the user asked for', () => {
    const results = [
        { videoId: 'a', title: 'DtMF', verified: false },
        { videoId: 'b', title: 'DtMF (slowed + reverb)', verified: false },
    ];
    assert.deepEqual(rankYouTubeResults(results, 'dtmf').map(r => r.videoId), ['a', 'b']);
    assert.deepEqual(rankYouTubeResults(results, 'DtMF slowed').map(r => r.videoId), ['a', 'b']);
    // "8d" must match as a word, not inside other words
    assert.deepEqual(rankYouTubeResults([{ videoId: 'x', title: 'Track 18dB master' }], 'q').length, 1);
});

test('mergeSearchResults puts official songs first, dedupes, caps totals', () => {
    const songs = [{ videoId: 's1' }, { videoId: 's2' }, { videoId: 'v1' }];
    const videos = [{ videoId: 'v1' }, { videoId: 'v2' }, { videoId: 'v3' }];
    assert.deepEqual(mergeSearchResults(songs, videos).map(r => r.videoId), ['s1', 's2', 'v1', 'v2', 'v3']);
    assert.deepEqual(mergeSearchResults(songs, videos, { maxSongs: 1, total: 3 }).map(r => r.videoId), ['s1', 'v1', 'v2']);
    assert.deepEqual(mergeSearchResults(null, videos).map(r => r.videoId), ['v1', 'v2', 'v3']);
    assert.deepEqual(mergeSearchResults([], []), []);
});

test('parseYtSearchOutput skips garbage, non-videos, and duplicates', () => {
    const stdout = [
        'WARNING: not json',
        '',
        JSON.stringify({ id: 'UCxxxxxxxxxxxxxxxxxxxxxx', title: 'A channel' }), // not an 11-char video id
        JSON.stringify({ id: 'dQw4w9WgXcQ', title: 'First' }),
        JSON.stringify({ id: 'dQw4w9WgXcQ', title: 'Duplicate' }),
        JSON.stringify({ title: 'No id' }),
    ].join('\n');
    const out = parseYtSearchOutput(stdout);
    assert.equal(out.length, 1);
    assert.equal(out[0].title, 'First');
    assert.equal(out[0].channel, null);
    assert.deepEqual(parseYtSearchOutput(''), []);
    assert.deepEqual(parseYtSearchOutput(null), []);
});

test('filterRelevantSongs drops the same-artist drift but keeps artist searches', () => {
    // Real YouTube Music Songs order for "DtMF"
    const songs = [
        { videoId: '1', title: 'DtMF', channel: 'Bad Bunny' },
        { videoId: '2', title: 'MTG DTMF', channel: 'Dj Luan Gomes' },
        { videoId: '3', title: 'NUEVAYoL', channel: 'Bad Bunny' },
        { videoId: '4', title: 'PIToRRO DE COCO', channel: 'Bad Bunny' },
    ];
    assert.deepEqual(filterRelevantSongs(songs, 'DtMF').map(s => s.videoId), ['1', '2']);
    // Searching the artist keeps all of their songs (and drops the other artist's)
    assert.deepEqual(filterRelevantSongs(songs, 'bad bunny').map(s => s.videoId), ['1', '3', '4']);
    // Accents and short words: "pitorro de coco" matches "PIToRRO DE COCO" via pitorro/coco
    assert.ok(filterRelevantSongs(songs, 'pitórro de coco').some(s => s.videoId === '4'));
    // The top match survives even when a misspelled query shares no word with it
    assert.deepEqual(filterRelevantSongs(songs, 'dtfm').map(s => s.videoId), ['1']);
    // Queries with no usable words keep everything
    assert.equal(filterRelevantSongs(songs, 'U2').length, 4);
    assert.deepEqual(filterRelevantSongs(null, 'x'), []);
});

test('buildTrackTags uses YouTube Music track metadata with the primary artist', () => {
    // Real yt-dlp output for Bad Bunny's DtMF (artists includes songwriters)
    const tags = buildTrackTags({
        title: 'DtMF', track: 'DtMF',
        artists: ['Bad Bunny', 'Benito A. Martinez Ocasio', 'Scott Dittrich'],
        artist: 'Bad Bunny, Benito A. Martinez Ocasio, Scott Dittrich',
        uploader: 'Bad Bunny', album: 'DeBÍ TiRAR MáS FOToS',
        release_year: 2024, upload_date: '20250105',
    }, 'TiebZllW8As');
    assert.deepEqual(tags, {
        title: 'DtMF', artist: 'Bad Bunny', album: 'DeBÍ TiRAR MáS FOToS',
        year: '2024', fileName: 'Bad Bunny - DtMF',
    });
});

test('buildTrackTags falls back to video title, channel, and upload year', () => {
    const tags = buildTrackTags({
        title: 'Queen – Bohemian Rhapsody (Official Video Remastered)',
        uploader: 'Queen Official', upload_date: '20080801', album: 'NA', track: null,
    }, 'fJ9rUzIMcZQ');
    assert.deepEqual(tags, {
        title: 'Queen – Bohemian Rhapsody (Official Video Remastered)',
        artist: 'Queen Official', album: '', year: '2008',
        fileName: 'Queen – Bohemian Rhapsody (Official Video Remastered)',
    });
    // Topic suffix stripped, unsafe file-name characters replaced, empty info survives
    assert.equal(buildTrackTags({ title: 'A/B: C?', uploader: 'X - Topic' }, 'id').artist, 'X');
    assert.equal(buildTrackTags({ title: 'A/B: C?' }, 'id').fileName, 'A-B- C-');
    assert.deepEqual(buildTrackTags(null, 'vid12345678'), {
        title: 'vid12345678', artist: '', album: '', year: '', fileName: 'vid12345678',
    });
});

test('coverCandidates prefers maxres then mq thumbnails', () => {
    assert.deepEqual(coverCandidates('TiebZllW8As'), [
        'https://i.ytimg.com/vi/TiebZllW8As/maxresdefault.jpg',
        'https://i.ytimg.com/vi/TiebZllW8As/mqdefault.jpg',
    ]);
});

test('buildMp3FfmpegArgs embeds the cover as attached_pic and skips empty tags', () => {
    const tags = { title: 'DtMF', artist: 'Bad Bunny', album: '', year: '2024' };
    const withCover = buildMp3FfmpegArgs(tags, '/tmp/c.jpg', '/tmp/out.mp3');
    assert.deepEqual(withCover.slice(0, 7), ['-y', '-i', 'pipe:0', '-i', '/tmp/c.jpg', '-map', '0:a']);
    assert.ok(withCover.includes('attached_pic'));
    assert.equal(withCover[withCover.indexOf('-map', 6) + 1], '1:v');
    assert.ok(withCover.includes('title=DtMF') && withCover.includes('artist=Bad Bunny') && withCover.includes('date=2024'));
    assert.ok(!withCover.some(a => a.startsWith('album=')));
    // Always a real file: the ID3 picture and duration frame need a seekable output
    assert.deepEqual(withCover.slice(-3), ['-f', 'mp3', '/tmp/out.mp3']);

    const noCover = buildMp3FfmpegArgs(tags, null, '/tmp/out.mp3');
    assert.deepEqual(noCover.slice(0, 5), ['-y', '-i', 'pipe:0', '-map', '0:a']);
    assert.ok(!noCover.includes('attached_pic') && !noCover.includes('1:v'));
});

test('sanitizeLibrarySong validates the id and cleans title/artist', () => {
    assert.deepEqual(sanitizeLibrarySong({ videoId: 'TiebZllW8As', title: ' DtMF ', artist: 'Bad Bunny - Topic' }),
        { videoId: 'TiebZllW8As', title: 'DtMF', artist: 'Bad Bunny' });
    assert.deepEqual(sanitizeLibrarySong({ videoId: 'TiebZllW8As' }), { videoId: 'TiebZllW8As', title: 'TiebZllW8As', artist: '' });
    assert.equal(sanitizeLibrarySong({ videoId: 'bad/id' }), null);
    assert.equal(sanitizeLibrarySong(null), null);
    assert.equal(sanitizeLibrarySong({ videoId: 'TiebZllW8As', title: 'x'.repeat(300) }).title.length, 200);
});

test('zipEntryNames dedupes case-insensitively and strips unsafe characters', () => {
    assert.deepEqual(zipEntryNames(['Bad Bunny - DtMF', 'bad bunny - dtmf', 'A/B: C?', '', 'Bad Bunny - DtMF']), [
        'Bad Bunny - DtMF.mp3', 'bad bunny - dtmf (2).mp3', 'A-B- C-.mp3', 'track.mp3', 'Bad Bunny - DtMF (3).mp3',
    ]);
});

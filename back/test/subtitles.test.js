import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeToVtt, subtitleLanguage, curateSubtitles, subtitlesKey } from '../lib/subtitles.js';

test('passes through WebVTT and always ends with a newline', () => {
    const vtt = 'WEBVTT\n\n00:00:01.000 --> 00:00:02.000\nHello';
    const out = normalizeToVtt(vtt);
    assert.ok(out.startsWith('WEBVTT'));
    assert.ok(out.includes('Hello'));
    assert.ok(out.endsWith('\n'));
});

test('strips an upstream X-TIMESTAMP-MAP from WebVTT input', () => {
    const vtt = 'WEBVTT\nX-TIMESTAMP-MAP=MPEGTS:900000,LOCAL:00:00:00.000\n\n00:00:01.000 --> 00:00:02.000\nHi';
    const out = normalizeToVtt(vtt);
    assert.ok(!out.includes('900000'));
});

test('converts SRT to WebVTT: drops sequence numbers, comma→dot timestamps', () => {
    const srt = '1\n00:00:01,000 --> 00:00:02,000\nFirst line\n\n2\n00:00:03,500 --> 00:00:04,000\nSecond line';
    const out = normalizeToVtt(srt);
    assert.ok(out.startsWith('WEBVTT'));
    assert.match(out, /00:00:01\.000 --> 00:00:02\.000/);
    assert.match(out, /00:00:03\.500 --> 00:00:04\.000/);
    assert.ok(out.includes('First line'));
    // The lone "1"/"2" sequence numbers should be gone as standalone lines.
    assert.ok(!/^\s*1\s*$/m.test(out));
});

test('zero-pads single-digit hours in SRT timestamps', () => {
    const srt = '1\n0:00:05,000 --> 0:00:06,000\nPadded';
    const out = normalizeToVtt(srt);
    assert.match(out, /00:00:05\.000 --> 00:00:06\.000/);
});

test('forHls emits the AVPlayer X-TIMESTAMP-MAP header', () => {
    const out = normalizeToVtt('WEBVTT\n\n00:00:01.000 --> 00:00:02.000\nHi', { forHls: true });
    assert.match(out, /^WEBVTT\nX-TIMESTAMP-MAP=MPEGTS:0,LOCAL:00:00:00\.000/);
});

test('handles a BOM and CRLF line endings', () => {
    const srt = '﻿1\r\n00:00:01,000 --> 00:00:02,000\r\nWindows line';
    const out = normalizeToVtt(srt);
    assert.ok(out.startsWith('WEBVTT'));
    assert.ok(!out.includes('\r'));
    assert.ok(!out.includes('﻿'));
    assert.ok(out.includes('Windows line'));
});

test('tolerates empty / nullish input', () => {
    assert.equal(normalizeToVtt('').trimEnd(), 'WEBVTT');
    assert.equal(normalizeToVtt(null).trimEnd(), 'WEBVTT');
    assert.equal(normalizeToVtt(undefined).trimEnd(), 'WEBVTT');
});

test('subtitleLanguage maps names, tags, regions and typos to real codes', () => {
    assert.deepEqual(subtitleLanguage('English'), { code: 'en', name: 'English' });
    assert.deepEqual(subtitleLanguage('Arabic'), { code: 'ar', name: 'Arabic' });
    assert.deepEqual(subtitleLanguage('Protuguese (BR)'), { code: 'pt-BR', name: 'Portuguese (Brazil)' });
    assert.deepEqual(subtitleLanguage('zh-tw'), { code: 'zh-TW', name: 'Chinese (Traditional)' });
    assert.deepEqual(subtitleLanguage('en'), { code: 'en', name: 'English' });
    assert.deepEqual(subtitleLanguage('ea'), { code: 'es-419', name: 'Spanish (Latin America)' });
    assert.deepEqual(subtitleLanguage('Klingon'), { code: 'und', name: 'Klingon' });
    assert.deepEqual(subtitleLanguage(''), { code: 'und', name: 'Unknown' });
});

test('curateSubtitles puts the viewer language first and never mislabels Arabic as English', () => {
    const subs = [
        { language: 'Arabic', file: '/captions/a1' },
        { language: 'Arabic', file: '/captions/a2' },
        { language: 'English', file: '/captions/e1' },
        { language: 'English', file: '/storage5/movie/subtitles/en.vtt' },
        { language: 'English', file: '/captions/e2' },
        { language: 'English', file: '/captions/e3' },
        { language: 'Spanish', file: '/captions/s1' },
        { language: 'English', file: '/captions/e1' },          // duplicate file
        { language: 'French', file: 'not-a-url' },              // unusable
    ];
    const out = curateSubtitles(subs, 'en');
    assert.deepEqual(out.map(s => [s.language, s.lang]), [
        ['English', 'en'], ['English 2', 'en'], ['English 3', 'en'],
        ['Arabic', 'ar'], ['Spanish', 'es'],
    ]);
    // The release's own track beats generic /captions/ ones
    assert.equal(out[0].file, '/storage5/movie/subtitles/en.vtt');
    // Labels are unique (HLS requires unique NAMEs; menus need them too)
    assert.equal(new Set(out.map(s => s.language)).size, out.length);
});

test('curateSubtitles honours another preferred language and its regional variants', () => {
    const subs = [
        { language: 'English', file: '/a' },
        { language: 'Portuguese', file: '/b' },
        { language: 'Protuguese (BR)', file: '/c' },
    ];
    assert.deepEqual(curateSubtitles(subs, 'pt-BR').map(s => s.lang), ['pt-BR', 'pt', 'en']);
    assert.deepEqual(curateSubtitles([], 'en'), []);
    assert.deepEqual(curateSubtitles(null), []);
});

test('subtitlesKey is short and stable for the same list', () => {
    const list = curateSubtitles([{ language: 'English', file: '/a' }]);
    assert.match(subtitlesKey(list), /^[0-9a-f]{16}$/);
    assert.equal(subtitlesKey(list), subtitlesKey(JSON.parse(JSON.stringify(list))));
});

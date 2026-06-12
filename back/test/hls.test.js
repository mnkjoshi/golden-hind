import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    slugify,
    absolutizeManifestUrl,
    proxiedHlsUrl,
    rewriteManifestUriAttributes,
    forceQuotedManifestAttribute,
    rewriteHlsManifest,
    buildSingleVariantMaster,
    hlsLanguageCode,
} from '../lib/hls.js';

test('slugify lowercases, strips punctuation, collapses + trims dashes', () => {
    assert.equal(slugify('The Lord of the Rings'), 'the-lord-of-the-rings');
    assert.equal(slugify('WALL·E!! (2008)'), 'walle-2008');
    assert.equal(slugify('  Spaced   Out  '), 'spaced-out');
    assert.equal(slugify('Already-slug'), 'already-slug');
});

test('proxiedHlsUrl url-encodes the target', () => {
    assert.equal(
        proxiedHlsUrl('https://cdn.test/a b.ts?x=1&y=2'),
        '/proxy/hls?url=https%3A%2F%2Fcdn.test%2Fa%20b.ts%3Fx%3D1%26y%3D2'
    );
});

test('absolutizeManifestUrl resolves relative against the manifest base', () => {
    assert.equal(
        absolutizeManifestUrl('https://cdn.test/dir/index.m3u8', 'seg001.ts'),
        'https://cdn.test/dir/seg001.ts'
    );
    assert.equal(
        absolutizeManifestUrl('https://cdn.test/dir/index.m3u8', '/abs/seg.ts'),
        'https://cdn.test/abs/seg.ts'
    );
    // Absolute URLs pass through unchanged.
    assert.equal(
        absolutizeManifestUrl('https://cdn.test/i.m3u8', 'https://other.test/x.ts'),
        'https://other.test/x.ts'
    );
});

test('rewriteManifestUriAttributes proxies URI= but leaves data: URIs', () => {
    const line = '#EXT-X-KEY:METHOD=AES-128,URI="key.bin"';
    assert.equal(
        rewriteManifestUriAttributes(line, 'https://cdn.test/d/i.m3u8'),
        '#EXT-X-KEY:METHOD=AES-128,URI="/proxy/hls?url=https%3A%2F%2Fcdn.test%2Fd%2Fkey.bin"'
    );
    const dataLine = '#EXT-X-KEY:URI="data:text/plain;base64,AAAA"';
    assert.equal(rewriteManifestUriAttributes(dataLine, 'https://cdn.test/d/i.m3u8'), dataLine);
});

test('forceQuotedManifestAttribute adds or replaces an attribute', () => {
    // Missing → appended, quoted
    assert.equal(
        forceQuotedManifestAttribute('#EXT-X-STREAM-INF:BANDWIDTH=100', 'SUBTITLES', 'subs'),
        '#EXT-X-STREAM-INF:BANDWIDTH=100,SUBTITLES="subs"'
    );
    // Present (bare) → replaced with quoted value
    assert.equal(
        forceQuotedManifestAttribute('#EXT-X-STREAM-INF:BANDWIDTH=100,SUBTITLES=old', 'SUBTITLES', 'subs'),
        '#EXT-X-STREAM-INF:BANDWIDTH=100,SUBTITLES="subs"'
    );
});

test('rewriteHlsManifest proxies segment lines and preserves blanks', () => {
    const manifest = [
        '#EXTM3U',
        '#EXTINF:6.0,',
        'seg1.ts',
        '',
        '#EXTINF:6.0,',
        'https://abs.test/seg2.ts',
    ].join('\n');
    const out = rewriteHlsManifest(manifest, 'https://cdn.test/d/i.m3u8').split('\n');
    assert.equal(out[0], '#EXTM3U');
    assert.equal(out[2], '/proxy/hls?url=https%3A%2F%2Fcdn.test%2Fd%2Fseg1.ts');
    assert.equal(out[3], '');
    assert.equal(out[5], '/proxy/hls?url=https%3A%2F%2Fabs.test%2Fseg2.ts');
});

test('rewriteHlsManifest injects SUBTITLES group on STREAM-INF when requested', () => {
    const manifest = '#EXT-X-STREAM-INF:BANDWIDTH=5000000\nvariant.m3u8';
    const out = rewriteHlsManifest(manifest, 'https://cdn.test/i.m3u8', { subtitleGroupId: 'subs' });
    assert.match(out, /SUBTITLES="subs"/);
    assert.match(out, /\/proxy\/hls\?url=/);
});

test('buildSingleVariantMaster assembles a valid master playlist', () => {
    const out = buildSingleVariantMaster({
        originalUrl: 'https://cdn.test/media.m3u8',
        rewrittenMediaUrl: '/proxy/hls?url=enc',
        subMediaLines: ['#EXT-X-MEDIA:TYPE=SUBTITLES,GROUP-ID="subs",NAME="English"'],
    });
    const lines = out.split('\n');
    assert.equal(lines[0], '#EXTM3U');
    assert.ok(lines.includes('#EXT-X-MEDIA:TYPE=SUBTITLES,GROUP-ID="subs",NAME="English"'));
    assert.ok(out.includes('SUBTITLES="subs"'));
    assert.equal(lines[lines.length - 1], '/proxy/hls?url=enc');
});

test('hlsLanguageCode maps names and tags, with index-based fallback', () => {
    assert.equal(hlsLanguageCode({ language: 'English' }, 0), 'en');
    assert.equal(hlsLanguageCode({ language: 'Spanish' }, 1), 'es');
    assert.equal(hlsLanguageCode({ language: 'fr' }, 2), 'fr');         // direct 2-letter tag
    assert.equal(hlsLanguageCode({ file: '/subs/portuguese.vtt' }, 3), 'pt'); // from filename
    assert.equal(hlsLanguageCode({ language: 'Klingon' }, 0), 'en');   // unknown, first track → en
    assert.equal(hlsLanguageCode({ language: 'Klingon' }, 4), 'und');  // unknown, later track → und
});

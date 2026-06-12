// Tests for the iOS app's pure helpers. They live in the web test suite on
// purpose: iosfront has no installed node_modules (its deps are the full
// React-Native/Expo tree), and these modules have zero imports, so Vitest can
// load them directly by relative path without bundling anything native.
import { describe, it, expect } from 'vitest';
import {
    getVideoUrl, buildPosKey, VIDEO_PROVIDERS,
} from '../../iosfront/src/utils/constants.js';
import { buildPlayerHtml } from '../../iosfront/src/utils/player.js';

describe('iosfront buildPosKey', () => {
    it('matches the web/back scheme so positions are shared across platforms', () => {
        expect(buildPosKey('m123', 'movie', 1, 1)).toBe('playbackPos_m123');
        expect(buildPosKey('t456', 'tv', 2, 7)).toBe('playbackPos_t456_s2_e7');
    });
});

describe('iosfront getVideoUrl', () => {
    it('LookMovie (provider 1) returns empty — resolved server-side, not an iframe', () => {
        expect(getVideoUrl(VIDEO_PROVIDERS.LOOKMOVIE, 'movie', '123')).toBe('');
    });

    it('VidLink (provider 2) builds movie + episode embed URLs', () => {
        expect(getVideoUrl(VIDEO_PROVIDERS.VIDLINK, 'movie', '123')).toContain('vidlink.pro/movie/123');
        const tv = getVideoUrl(VIDEO_PROVIDERS.VIDLINK, 'tv', '99', 2, 3, true);
        expect(tv).toContain('vidlink.pro/tv/99/2/3');
        expect(tv).toContain('autoplay=true');
    });

    it('VidSrc (provider 3) builds tmdb embed URLs', () => {
        expect(getVideoUrl(VIDEO_PROVIDERS.VIDSRC, 'movie', '55')).toContain('vidsrc.me/embed/movie?tmdb=55');
        expect(getVideoUrl(VIDEO_PROVIDERS.VIDSRC, 'tv', '55', 1, 4))
            .toContain('season=1&episode=4');
    });
});

describe('iosfront buildPlayerHtml', () => {
    const stream = 'https://goldenhind.tech/proxy/hls?url=enc';

    it('embeds the stream url and resume point', () => {
        const html = buildPlayerHtml({ streamUrl: stream, startAt: 42 });
        expect(html).toContain(stream);
        expect(html).toContain('START_AT = 42');
        expect(html).toContain('<video');
    });

    it('injects PARTY = null when no party is given (sync stays dormant)', () => {
        const html = buildPlayerHtml({ streamUrl: stream, startAt: 0 });
        expect(html).toContain('PARTY = null');
        // Sanity: the room id never appears in a non-party page.
        expect(html).not.toContain('ABC234');
    });

    it('injects the party config (room, api) when a party is given', () => {
        const html = buildPlayerHtml({
            streamUrl: stream,
            startAt: 0,
            party: { roomId: 'ABC234', user: 'u', token: 't', clientId: 'c', api: 'https://goldenhind.tech' },
        });
        expect(html).toContain('"roomId":"ABC234"');
        expect(html).toContain('"api":"https://goldenhind.tech"');
        // The SSE/update wiring is present in the template and runs when PARTY is set.
        expect(html).toContain('/party/stream');
        expect(html).toContain('/party/update');
    });

    it('escapes double quotes in the stream url to keep the JS string intact', () => {
        const html = buildPlayerHtml({ streamUrl: 'https://x/y?a="b"', startAt: 0 });
        expect(html).not.toContain('var STREAM = "https://x/y?a="b""');
        expect(html).toContain('&quot;');
    });
});

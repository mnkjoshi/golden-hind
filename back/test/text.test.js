import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanText, cleanEpisode, cleanSeason } from '../lib/text.js';

test('cleanText strips invisible and bidi characters', () => {
    assert.equal(cleanText('Mae\u200B Rides\u200E the Bus\uFEFF'), 'Mae Rides the Bus');
    assert.equal(cleanText('\u2066Mae Rides the Bus\u2069'), 'Mae Rides the Bus');
    assert.equal(cleanText('Mae Ri\u00ADdes the Bus'), 'Mae Rides the Bus');
});

test('cleanText normalizes odd spaces and trims', () => {
    assert.equal(cleanText('  Mae\u00A0Rides  the\u2009Bus\u2028'), 'Mae Rides the Bus');
});

test('cleanText keeps real text and newlines intact', () => {
    assert.equal(cleanText('Am\u00E9lie'), 'Am\u00E9lie');
    assert.equal(cleanText('Line one.\nLine two.'), 'Line one.\nLine two.');
    assert.equal(cleanText(null), null);
});

test('cleanSeason cleans every episode without touching other fields', () => {
    const season = { name: 'Season 4', episodes: [{ episode_number: 9, name: 'Mae\u200B Rides', overview: 'x\u200F', runtime: 43 }] };
    const out = cleanSeason(season);
    assert.deepEqual(out.episodes[0], { episode_number: 9, name: 'Mae Rides', overview: 'x', runtime: 43 });
    assert.equal(season.episodes[0].name, 'Mae\u200B Rides');
    assert.equal(cleanEpisode(null), null);
});

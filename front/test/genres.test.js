import { describe, it, expect } from 'vitest';
import { genreMap, getGenreNames } from '../src/utils/genres.js';

describe('getGenreNames', () => {
    it('maps known ids to names', () => {
        expect(getGenreNames([28, 35, 18])).toEqual(['Action', 'Comedy', 'Drama']);
    });

    it('drops unknown ids', () => {
        expect(getGenreNames([28, 99999])).toEqual(['Action']);
    });

    it('handles non-array / empty input', () => {
        expect(getGenreNames(null)).toEqual([]);
        expect(getGenreNames(undefined)).toEqual([]);
        expect(getGenreNames('action')).toEqual([]);
        expect(getGenreNames([])).toEqual([]);
    });

    it('includes TV-specific genres', () => {
        expect(getGenreNames([10765])).toEqual(['Sci-Fi & Fantasy']);
    });
});

describe('genreMap', () => {
    it('covers common movie + TV genres', () => {
        expect(genreMap[27]).toBe('Horror');
        expect(genreMap[10759]).toBe('Action & Adventure');
    });
});

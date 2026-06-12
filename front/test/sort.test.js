import { describe, it, expect } from 'vitest';
import { sortResults, itemYear } from '../src/utils/sort.js';

// Mid-year dates avoid year-boundary shifts from local-timezone parsing.
const items = [
    { id: 1, vote_average: 6.0, popularity: 50, release_date: '2010-05-15' },
    { id: 2, vote_average: 8.5, popularity: 10, first_air_date: '2022-06-15' },
    { id: 3, vote_average: 7.2, popularity: 99, release_date: '2001-07-15' },
];

const ids = (arr) => arr.map(r => r.id);

describe('sortResults', () => {
    it('relevance / unknown preserves original order', () => {
        expect(ids(sortResults(items, 'relevance'))).toEqual([1, 2, 3]);
        expect(ids(sortResults(items, 'whatever'))).toEqual([1, 2, 3]);
    });

    it('rating sorts high → low', () => {
        expect(ids(sortResults(items, 'rating'))).toEqual([2, 3, 1]);
    });

    it('popularity sorts high → low', () => {
        expect(ids(sortResults(items, 'popularity'))).toEqual([3, 1, 2]);
    });

    it('newest sorts by year descending', () => {
        expect(ids(sortResults(items, 'newest'))).toEqual([2, 1, 3]);
    });

    it('oldest sorts by year ascending', () => {
        expect(ids(sortResults(items, 'oldest'))).toEqual([3, 1, 2]);
    });

    it('does not mutate the input array', () => {
        const original = [...items];
        sortResults(items, 'rating');
        expect(ids(items)).toEqual(ids(original));
    });

    it('tolerates empty / missing input', () => {
        expect(sortResults([], 'rating')).toEqual([]);
        expect(sortResults(undefined, 'rating')).toEqual([]);
    });

    it('items with no date sort last under "oldest"', () => {
        const withMissing = [{ id: 9 }, { id: 3, release_date: '2001-07-15' }];
        expect(ids(sortResults(withMissing, 'oldest'))).toEqual([3, 9]);
    });
});

describe('itemYear', () => {
    it('reads release_date or first_air_date, 0 when absent', () => {
        expect(itemYear({ release_date: '2010-05-15' })).toBe(2010);
        expect(itemYear({ first_air_date: '2022-06-15' })).toBe(2022);
        expect(itemYear({})).toBe(0);
    });
});

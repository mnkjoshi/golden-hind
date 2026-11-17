import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildReviewArchiveUpdate } from '../lib/reviews.js';

const tree = {
    t1: { janyne: { username: 'janyne', rating: 4, text: 'a', timestamp: 1 }, manav: { username: 'manav', rating: 5, text: 'b', timestamp: 2 } },
    m2: { janyne: { username: 'janyne', rating: 2, text: '', timestamp: 3 } },
    m3: { manav: { username: 'manav', rating: 3, text: 'c', timestamp: 4 } },
};

test('buildReviewArchiveUpdate moves only that user\'s reviews', () => {
    const { update, count } = buildReviewArchiveUpdate(tree, 'janyne', 99);
    assert.equal(count, 2);
    assert.deepEqual(update, {
        'reviews/t1/janyne': null,
        'reviewsArchive/janyne/t1': { username: 'janyne', rating: 4, text: 'a', timestamp: 1, archivedAt: 99 },
        'reviews/m2/janyne': null,
        'reviewsArchive/janyne/m2': { username: 'janyne', rating: 2, text: '', timestamp: 3, archivedAt: 99 },
    });
});

test('buildReviewArchiveUpdate is empty for users with no reviews', () => {
    assert.deepEqual(buildReviewArchiveUpdate(tree, 'anais', 99), { update: {}, count: 0 });
    assert.deepEqual(buildReviewArchiveUpdate(null, 'janyne', 99), { update: {}, count: 0 });
});

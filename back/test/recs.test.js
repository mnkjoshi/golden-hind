import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    recSourceIds,
    recSourceKey,
    recCacheIsFresh,
    parseCachedRecItems,
} from '../lib/recs.js';

test('recSourceIds: lifetime = all favourites + last 5 continues, recent = last 5 continues', () => {
    const favs = ['m1', 'm2'];
    const conts = ['t1', 't2', 't3', 't4', 't5', 't6'];
    assert.deepEqual(recSourceIds(favs, conts, 'lifetime'), ['m1', 'm2', 't2', 't3', 't4', 't5', 't6']);
    assert.deepEqual(recSourceIds(favs, conts, 'recent'), ['t2', 't3', 't4', 't5', 't6']);
    assert.deepEqual(recSourceIds(null, undefined, 'lifetime'), []);
});

test('recSourceKey changes when and only when the inputs change', () => {
    const key = recSourceKey(['m1'], ['t1'], 'lifetime');
    assert.equal(recSourceKey(['m1'], ['t1'], 'lifetime'), key);
    assert.notEqual(recSourceKey(['m1', 'm2'], ['t1'], 'lifetime'), key);
    assert.notEqual(recSourceKey(['m1'], ['t1', 't2'], 'lifetime'), key);
    // recent ignores favourites entirely
    assert.equal(recSourceKey(['m1'], ['t1'], 'recent'), recSourceKey(['m9'], ['t1'], 'recent'));
});

test('recCacheIsFresh requires young age AND matching inputs', () => {
    const now = 1_000_000_000;
    const ttl = 1000;
    const key = '["m1"]';
    assert.ok(recCacheIsFresh({ ts: now - 500, inputKey: key }, key, now, ttl));
    assert.ok(!recCacheIsFresh({ ts: now - 1500, inputKey: key }, key, now, ttl));      // too old
    assert.ok(!recCacheIsFresh({ ts: now - 500, inputKey: '["m2"]' }, key, now, ttl));  // library changed
    assert.ok(!recCacheIsFresh({ inputKey: key }, key, now, ttl));                      // no timestamp
    assert.ok(!recCacheIsFresh(null, key, now, ttl));
});

test('parseCachedRecItems returns a non-empty array or null', () => {
    assert.deepEqual(parseCachedRecItems({ items: '[{"id":1}]' }), [{ id: 1 }]);
    assert.equal(parseCachedRecItems({ items: '[]' }), null);
    assert.equal(parseCachedRecItems({ items: 'not json' }), null);
    assert.equal(parseCachedRecItems({ items: 42 }), null);
    assert.equal(parseCachedRecItems({}), null);
    assert.equal(parseCachedRecItems(null), null);
});

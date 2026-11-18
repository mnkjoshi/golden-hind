import { test } from 'node:test';
import assert from 'node:assert/strict';
import { errorSignature, registerAlertMessage, alertsSince } from '../lib/alerts.js';

test('errorSignature groups errors that differ only by numbers or ids', () => {
    assert.equal(
        errorSignature('/watched/get', 'Timeout after 3012ms for t1399'),
        errorSignature('/watched/get', 'timeout after 4100ms for t95396'),
    );
    assert.notEqual(errorSignature('/watched/get', 'timeout'), errorSignature('/watched/update', 'timeout'));
    assert.notEqual(errorSignature('/x', 'permission denied'), errorSignature('/x', 'not found'));
});

test('registerAlertMessage describes each sign-up outcome', () => {
    assert.equal(registerAlertMessage('janet', 'j@x.com', 'UCS'), 'janet created an account · j@x.com');
    assert.match(registerAlertMessage('bob', '', 'UNT'), /^bob tried to sign up, but the username was taken$/);
    assert.match(registerAlertMessage('', '', 'Something broke'), /^Someone tried to sign up \(Something broke\)$/);
});

test('alertsSince returns newer alerts oldest-first, capped', () => {
    const val = { a: { timestamp: 5 }, b: { timestamp: 20 }, c: { timestamp: 10 }, d: { timestamp: 30 } };
    assert.deepEqual(alertsSince(val, 6).map(a => a.id), ['c', 'b', 'd']);
    assert.deepEqual(alertsSince(val, 0, 2).map(a => a.id), ['b', 'd']);
    assert.deepEqual(alertsSince(null), []);
});

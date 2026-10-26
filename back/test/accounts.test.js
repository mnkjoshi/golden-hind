import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emailKey, emailFromKey, isValidUsername, isValidEmail } from '../lib/accounts.js';

test('emailKey escapes every dot', () => {
    assert.equal(emailKey('first.last@mail.co.uk'), 'first@@@last@mail@@@co@@@uk');
    assert.ok(!emailKey('a.b.c@d.e.f').includes('.'));
});

test('emailKey matches the old first-dot escape for single-dot emails', () => {
    const email = 'foo@gmail.com';
    assert.equal(emailKey(email), email.replace('.', '@@@'));
});

test('emailFromKey round-trips', () => {
    for (const email of ['foo@gmail.com', 'first.last@mail.co.uk']) {
        assert.equal(emailFromKey(emailKey(email)), email);
    }
});

test('isValidUsername rejects Firebase-unsafe keys', () => {
    assert.ok(isValidUsername('manav'));
    assert.ok(isValidUsername('john_doe-2'));
    for (const bad of ['', ' manav', 'john.doe', 'a#b', 'a$b', 'a[b]', 'a/b', null, undefined, 'x'.repeat(65)]) {
        assert.equal(isValidUsername(bad), false, String(bad));
    }
});

test('isValidEmail accepts multi-dot emails and rejects junk', () => {
    assert.ok(isValidEmail('foo@gmail.com'));
    assert.ok(isValidEmail('first.last@mail.co.uk'));
    for (const bad of ['', 'foo', 'foo@bar', 'a b@c.com', 'a#b@c.com', 'a/b@c.com', null]) {
        assert.equal(isValidEmail(bad), false, String(bad));
    }
});

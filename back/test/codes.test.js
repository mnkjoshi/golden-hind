import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    generateToken,
    generatePartyCode,
    isValidPartyCode,
    buildPosKey,
    PARTY_CODE_ALPHABET,
} from '../lib/codes.js';

test('generateToken returns a non-empty string and is ~unique', () => {
    const a = generateToken();
    const b = generateToken();
    assert.equal(typeof a, 'string');
    assert.ok(a.length > 10);
    assert.notEqual(a, b);
});

test('generatePartyCode is 6 chars from the safe alphabet', () => {
    for (let i = 0; i < 200; i++) {
        const code = generatePartyCode();
        assert.equal(code.length, 6);
        for (const ch of code) assert.ok(PARTY_CODE_ALPHABET.includes(ch), `bad char: ${ch}`);
        assert.ok(isValidPartyCode(code));
    }
});

test('party-code alphabet omits confusable glyphs I, O, 0, 1', () => {
    for (const ch of 'IO01') assert.ok(!PARTY_CODE_ALPHABET.includes(ch));
});

test('isValidPartyCode enforces the 6-char A-Z/2-9 format', () => {
    assert.ok(isValidPartyCode('ABC234'));
    assert.ok(!isValidPartyCode('abc234'));   // lowercase
    assert.ok(!isValidPartyCode('ABC23'));     // too short
    assert.ok(!isValidPartyCode('ABC2345'));   // too long
    assert.ok(!isValidPartyCode('ABC2O1'));    // contains O and 1
    assert.ok(!isValidPartyCode(''));
    assert.ok(!isValidPartyCode(null));
});

test('buildPosKey distinguishes movies from per-episode TV', () => {
    assert.equal(buildPosKey('m123', 'movie', 1, 1), 'playbackPos_m123');
    assert.equal(buildPosKey('t456', 'tv', 2, 7), 'playbackPos_t456_s2_e7');
    // Keys must not contain characters RTDB forbids in paths.
    const key = buildPosKey('t456', 'tv', 2, 7);
    assert.ok(!/[.#$\[\]/]/.test(key));
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeToVtt } from '../lib/subtitles.js';

test('passes through WebVTT and always ends with a newline', () => {
    const vtt = 'WEBVTT\n\n00:00:01.000 --> 00:00:02.000\nHello';
    const out = normalizeToVtt(vtt);
    assert.ok(out.startsWith('WEBVTT'));
    assert.ok(out.includes('Hello'));
    assert.ok(out.endsWith('\n'));
});

test('strips an upstream X-TIMESTAMP-MAP from WebVTT input', () => {
    const vtt = 'WEBVTT\nX-TIMESTAMP-MAP=MPEGTS:900000,LOCAL:00:00:00.000\n\n00:00:01.000 --> 00:00:02.000\nHi';
    const out = normalizeToVtt(vtt);
    assert.ok(!out.includes('900000'));
});

test('converts SRT to WebVTT: drops sequence numbers, comma→dot timestamps', () => {
    const srt = '1\n00:00:01,000 --> 00:00:02,000\nFirst line\n\n2\n00:00:03,500 --> 00:00:04,000\nSecond line';
    const out = normalizeToVtt(srt);
    assert.ok(out.startsWith('WEBVTT'));
    assert.match(out, /00:00:01\.000 --> 00:00:02\.000/);
    assert.match(out, /00:00:03\.500 --> 00:00:04\.000/);
    assert.ok(out.includes('First line'));
    // The lone "1"/"2" sequence numbers should be gone as standalone lines.
    assert.ok(!/^\s*1\s*$/m.test(out));
});

test('zero-pads single-digit hours in SRT timestamps', () => {
    const srt = '1\n0:00:05,000 --> 0:00:06,000\nPadded';
    const out = normalizeToVtt(srt);
    assert.match(out, /00:00:05\.000 --> 00:00:06\.000/);
});

test('forHls emits the AVPlayer X-TIMESTAMP-MAP header', () => {
    const out = normalizeToVtt('WEBVTT\n\n00:00:01.000 --> 00:00:02.000\nHi', { forHls: true });
    assert.match(out, /^WEBVTT\nX-TIMESTAMP-MAP=MPEGTS:0,LOCAL:00:00:00\.000/);
});

test('handles a BOM and CRLF line endings', () => {
    const srt = '﻿1\r\n00:00:01,000 --> 00:00:02,000\r\nWindows line';
    const out = normalizeToVtt(srt);
    assert.ok(out.startsWith('WEBVTT'));
    assert.ok(!out.includes('\r'));
    assert.ok(!out.includes('﻿'));
    assert.ok(out.includes('Windows line'));
});

test('tolerates empty / nullish input', () => {
    assert.equal(normalizeToVtt('').trimEnd(), 'WEBVTT');
    assert.equal(normalizeToVtt(null).trimEnd(), 'WEBVTT');
    assert.equal(normalizeToVtt(undefined).trimEnd(), 'WEBVTT');
});

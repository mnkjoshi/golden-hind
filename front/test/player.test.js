import { describe, it, expect } from 'vitest';
import { nextIndex, prevAction, estimateRemotePosition, nextRepeatMode, shuffleOrder, isStaleOwnEcho } from '../src/utils/player.js';

describe('nextIndex', () => {
    it('steps forward and stops or wraps at the end', () => {
        expect(nextIndex({ length: 3, index: 0, shuffle: false, repeat: 'off' })).toBe(1);
        expect(nextIndex({ length: 3, index: 2, shuffle: false, repeat: 'off' })).toBe(null);
        expect(nextIndex({ length: 3, index: 2, shuffle: false, repeat: 'all' })).toBe(0);
    });
    it('repeats the current song in repeat-one', () => {
        expect(nextIndex({ length: 3, index: 1, shuffle: true, repeat: 'one' })).toBe(1);
    });
    it('walks the (already shuffled) queue in order', () => {
        expect(nextIndex({ length: 3, index: 1, shuffle: true, repeat: 'off' })).toBe(2);
        expect(nextIndex({ length: 1, index: 0, shuffle: true, repeat: 'off' })).toBe(null);
        expect(nextIndex({ length: 1, index: 0, shuffle: true, repeat: 'all' })).toBe(0);
    });
    it('handles an empty queue', () => {
        expect(nextIndex({ length: 0, index: 0 })).toBe(null);
    });
});

describe('prevAction', () => {
    it('restarts past 3 seconds or on the first song, else steps back', () => {
        expect(prevAction({ length: 3, index: 2, position: 10 })).toEqual({ type: 'restart' });
        expect(prevAction({ length: 3, index: 0, position: 1 })).toEqual({ type: 'restart' });
        expect(prevAction({ length: 3, index: 2, position: 1 })).toEqual({ type: 'index', index: 1 });
        expect(prevAction({ length: 0, index: 0, position: 0 })).toEqual({ type: 'none' });
    });
});

describe('estimateRemotePosition', () => {
    it('advances while playing, using the server clock offset', () => {
        // reported at server t=10_000 at 30s; local clock is 2s behind server
        expect(estimateRemotePosition({ position: 30, positionAt: 10_000, paused: false }, 13_000, 2_000)).toBe(35);
    });
    it('freezes when paused and clamps to duration', () => {
        expect(estimateRemotePosition({ position: 30, positionAt: 10_000, paused: true }, 99_000)).toBe(30);
        expect(estimateRemotePosition({ position: 30, positionAt: 10_000, paused: false }, 99_000, 0, 60)).toBe(60);
    });
});

describe('nextRepeatMode', () => {
    it('cycles off → all → one → off', () => {
        expect(nextRepeatMode('off')).toBe('all');
        expect(nextRepeatMode('all')).toBe('one');
        expect(nextRepeatMode('one')).toBe('off');
        expect(nextRepeatMode(undefined)).toBe('off');
    });
});

describe('shuffleOrder', () => {
    const q = ['a', 'b', 'c', 'd', 'e'];
    it('keeps the current song first and every song exactly once', () => {
        for (const r of [0, 0.3, 0.7, 0.999]) {
            const out = shuffleOrder(q, 2, () => r);
            expect(out[0]).toBe('c');
            expect([...out].sort()).toEqual(q);
        }
    });
    it('actually reorders the rest', () => {
        expect(shuffleOrder(q, 0, () => 0)).toEqual(['a', 'c', 'd', 'e', 'b']);
    });
    it('handles tiny and empty queues', () => {
        expect(shuffleOrder(['a'], 0)).toEqual(['a']);
        expect(shuffleOrder([], 0)).toEqual([]);
    });
});

describe('isStaleOwnEcho', () => {
    const base = { updatedBy: 'tab1', clientId: 'tab1', activeHere: true, audioLoaded: true, firstSnapshot: false };
    it('ignores our own write replayed on reconnect while we are playing', () => {
        expect(isStaleOwnEcho(base)).toBe(true);
    });
    it('applies writes from other devices', () => {
        expect(isStaleOwnEcho({ ...base, updatedBy: 'tab2' })).toBe(false);
    });
    it('applies the first snapshot of a fresh page', () => {
        expect(isStaleOwnEcho({ ...base, firstSnapshot: true })).toBe(false);
        expect(isStaleOwnEcho({ ...base, audioLoaded: false })).toBe(false);
    });
    it('applies it when another device is the player', () => {
        expect(isStaleOwnEcho({ ...base, activeHere: false })).toBe(false);
        expect(isStaleOwnEcho({ ...base, clientId: '' , updatedBy: '' })).toBe(false);
    });
});

import { describe, it, expect } from 'vitest';
import { parseLrc, activeLyricIndex } from '../src/utils/lyrics.js';

describe('parseLrc', () => {
    it('reads timestamps, keeps gaps, skips metadata', () => {
        expect(parseLrc('[ar:The Weeknd]\n[00:13.13]Yeah\n[00:16.56]\n[00:27.16]I\'ve been tryna call')).toEqual([
            { time: 13.13, text: 'Yeah' },
            { time: 16.56, text: '' },
            { time: 27.16, text: "I've been tryna call" },
        ]);
    });
    it('expands lines with several timestamps and sorts them', () => {
        expect(parseLrc('[01:30.00][00:12.5]Chorus\n[00:20:00]Verse')).toEqual([
            { time: 12.5, text: 'Chorus' },
            { time: 20, text: 'Verse' },
            { time: 90, text: 'Chorus' },
        ]);
    });
    it('handles empty input', () => {
        expect(parseLrc(null)).toEqual([]);
    });
});

describe('activeLyricIndex', () => {
    const lines = [{ time: 10 }, { time: 20 }, { time: 30 }];
    it('finds the last line that has started', () => {
        expect(activeLyricIndex(lines, 5)).toBe(-1);
        expect(activeLyricIndex(lines, 10)).toBe(0);
        expect(activeLyricIndex(lines, 25)).toBe(1);
        expect(activeLyricIndex(lines, 99)).toBe(2);
        expect(activeLyricIndex([], 5)).toBe(-1);
    });
});

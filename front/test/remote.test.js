import { describe, it, expect } from 'vitest';
import { defaultDeviceName, formatRemoteState, formatClock, estimatePosition } from '../src/utils/remote.js';

describe('defaultDeviceName', () => {
    it('prefers TV mode over any user agent', () => {
        expect(defaultDeviceName('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) Mobile', true)).toBe('TV');
    });
    it('detects TV user agents', () => {
        expect(defaultDeviceName('Mozilla/5.0 (SMART-TV; Linux; Tizen 7.0)')).toBe('TV');
        expect(defaultDeviceName('Roku/DVP-12.0')).toBe('TV');
    });
    it('detects phones and tablets', () => {
        expect(defaultDeviceName('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) Mobile/15E148')).toBe('Phone');
        expect(defaultDeviceName('Mozilla/5.0 (Linux; Android 14; Pixel 8) Mobile Safari')).toBe('Phone');
        expect(defaultDeviceName('Mozilla/5.0 (iPad; CPU OS 17_0)')).toBe('Tablet');
        expect(defaultDeviceName('Mozilla/5.0 (Linux; Android 14; SM-X910)')).toBe('Tablet');
    });
    it('detects desktops and falls back generically', () => {
        expect(defaultDeviceName('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)')).toBe('Mac');
        expect(defaultDeviceName('Mozilla/5.0 (Windows NT 10.0; Win64; x64)')).toBe('PC');
        expect(defaultDeviceName('')).toBe('Device');
    });
});

describe('formatRemoteState', () => {
    it('is Idle with no state or content', () => {
        expect(formatRemoteState(null)).toBe('Idle');
        expect(formatRemoteState({})).toBe('Idle');
    });
    it('shows title, TV episode, and play state', () => {
        expect(formatRemoteState({ contentId: 't1396', title: 'Breaking Bad', season: 2, episode: 4, paused: false }))
            .toBe('Breaking Bad · S2 E4 · Playing');
        expect(formatRemoteState({ contentId: 'm550', title: 'Fight Club', paused: true }))
            .toBe('Fight Club · Paused');
    });
    it('omits episode info for movies even if present', () => {
        expect(formatRemoteState({ contentId: 'm550', title: 'Fight Club', season: 1, episode: 1, paused: false }))
            .toBe('Fight Club · Playing');
    });
});

describe('formatClock', () => {
    it('formats minutes and hours', () => {
        expect(formatClock(0)).toBe('0:00');
        expect(formatClock(7)).toBe('0:07');
        expect(formatClock(754)).toBe('12:34');
        expect(formatClock(3725)).toBe('1:02:05');
    });
    it('tolerates junk input', () => {
        expect(formatClock(-5)).toBe('0:00');
        expect(formatClock(NaN)).toBe('0:00');
        expect(formatClock(undefined)).toBe('0:00');
    });
});

describe('estimatePosition', () => {
    const state = { position: 100, paused: false, duration: 120 };
    it('advances by elapsed time while playing', () => {
        expect(estimatePosition(state, 1000, 6000)).toBe(105);
    });
    it('freezes while paused', () => {
        expect(estimatePosition({ ...state, paused: true }, 1000, 60000)).toBe(100);
    });
    it('clamps to duration', () => {
        expect(estimatePosition(state, 0, 60_000)).toBe(120);
    });
    it('handles missing state', () => {
        expect(estimatePosition(null, 0, 0)).toBe(0);
        expect(estimatePosition({}, 0, 0)).toBe(0);
    });
});

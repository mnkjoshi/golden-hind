import { describe, it, expect, vi, afterEach } from 'vitest';
import { formatRelativeTime, formatWatchTime } from '../src/utils/format.js';

describe('formatRelativeTime', () => {
    afterEach(() => vi.useRealTimers());

    it('returns empty string for falsy input', () => {
        expect(formatRelativeTime(0)).toBe('');
        expect(formatRelativeTime(null)).toBe('');
        expect(formatRelativeTime(undefined)).toBe('');
    });

    it('buckets recent times correctly', () => {
        const now = new Date('2026-06-11T12:00:00Z').getTime();
        vi.useFakeTimers();
        vi.setSystemTime(now);
        expect(formatRelativeTime(now - 30 * 1000)).toBe('Just now');     // 30s
        expect(formatRelativeTime(now - 5 * 60000)).toBe('5m ago');       // 5 min
        expect(formatRelativeTime(now - 3 * 3600000)).toBe('3h ago');     // 3 hr
        expect(formatRelativeTime(now - 24 * 3600000)).toBe('Yesterday'); // 1 day
        expect(formatRelativeTime(now - 4 * 24 * 3600000)).toBe('4d ago'); // 4 days
    });

    it('accepts a stringified timestamp (as stored in localStorage)', () => {
        const now = Date.now();
        vi.useFakeTimers();
        vi.setSystemTime(now);
        expect(formatRelativeTime(String(now - 90 * 1000))).toBe('Just now');
    });
});

describe('formatWatchTime', () => {
    it('handles zero / sub-minute', () => {
        expect(formatWatchTime(0)).toBe('0m');
        expect(formatWatchTime(undefined)).toBe('0m');
        expect(formatWatchTime(30)).toBe('0m');
    });

    it('formats minutes and hours', () => {
        expect(formatWatchTime(60)).toBe('1m');
        expect(formatWatchTime(45 * 60)).toBe('45m');
        expect(formatWatchTime(2 * 3600)).toBe('2h');
        expect(formatWatchTime(2 * 3600 + 15 * 60)).toBe('2h 15m');
    });
});

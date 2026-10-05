import { describe, it, expect } from 'vitest';
import { squareCrop, avatarUrl } from '../src/utils/avatar.js';

describe('squareCrop', () => {
    it('takes the centre square of landscape and portrait images', () => {
        expect(squareCrop(400, 300)).toEqual({ sx: 50, sy: 0, side: 300 });
        expect(squareCrop(300, 500)).toEqual({ sx: 0, sy: 100, side: 300 });
        expect(squareCrop(256, 256)).toEqual({ sx: 0, sy: 0, side: 256 });
    });
    it('rounds odd differences to whole pixels', () => {
        expect(squareCrop(301, 200)).toEqual({ sx: 51, sy: 0, side: 200 });
    });
});

describe('avatarUrl', () => {
    it('encodes the username and adds the version when known', () => {
        expect(avatarUrl('https://api', 'manav', 123)).toBe('https://api/avatar/manav?v=123');
        expect(avatarUrl('https://api', 'a b/c', 0)).toBe('https://api/avatar/a%20b%2Fc');
    });
});

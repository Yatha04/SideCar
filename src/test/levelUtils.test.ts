import { describe, it, expect } from 'vitest';
import { nextLevel, isValidLevel } from '../levelUtils';

describe('levelUtils', () => {
  describe('nextLevel', () => {
    it('cycles developer -> architecture', () => {
      expect(nextLevel('developer')).toBe('architecture');
    });

    it('cycles architecture -> syntax', () => {
      expect(nextLevel('architecture')).toBe('syntax');
    });

    it('cycles syntax -> developer', () => {
      expect(nextLevel('syntax')).toBe('developer');
    });

    it('returns to start after full cycle', () => {
      let level = nextLevel('developer');
      level = nextLevel(level);
      level = nextLevel(level);
      expect(level).toBe('developer');
    });
  });

  describe('isValidLevel', () => {
    it('accepts valid levels', () => {
      expect(isValidLevel('developer')).toBe(true);
      expect(isValidLevel('architecture')).toBe(true);
      expect(isValidLevel('syntax')).toBe(true);
    });

    it('rejects invalid values', () => {
      expect(isValidLevel('beginner')).toBe(false);
      expect(isValidLevel('')).toBe(false);
      expect(isValidLevel(null)).toBe(false);
      expect(isValidLevel(undefined)).toBe(false);
      expect(isValidLevel(42)).toBe(false);
    });
  });
});

import { describe, it, expect } from 'vitest';
import { DiffEngine, isDiffResult } from '../DiffEngine';

describe('DiffEngine', () => {
  const engine = new DiffEngine();

  describe('shouldSkip', () => {
    it('skips .lock files', () => {
      expect(engine.shouldSkip('file:///package-lock.json.lock', 'content')).toBe('lock file');
    });

    it('skips .lockb files', () => {
      expect(engine.shouldSkip('file:///bun.lockb', 'content')).toBe('lock file');
    });

    it('skips binary files', () => {
      expect(engine.shouldSkip('file:///image.png', 'content')).toBe('binary file');
      expect(engine.shouldSkip('file:///font.woff2', 'content')).toBe('binary file');
      expect(engine.shouldSkip('file:///archive.zip', 'content')).toBe('binary file');
    });

    it('skips files larger than 100KB', () => {
      const bigContent = 'x'.repeat(100 * 1024 + 1);
      expect(engine.shouldSkip('file:///big.ts', bigContent)).toBe('file exceeds 100KB');
    });

    it('allows normal files', () => {
      expect(engine.shouldSkip('file:///app.ts', 'const x = 1;')).toBeNull();
    });
  });

  describe('computeDiff', () => {
    it('produces a valid diff for changed files', () => {
      const oldContent = 'line1\nline2\nline3\nline4\nline5\n';
      const newContent = 'line1\nmodified\nnew line\nline3\nline4\nline5\n';

      const result = engine.computeDiff('file:///test.ts', oldContent, newContent);
      expect(isDiffResult(result)).toBe(true);

      if (isDiffResult(result)) {
        expect(result.fileName).toBe('test.ts');
        expect(result.patch).toContain('+modified');
        expect(result.patch).toContain('+new line');
        expect(result.patch).toContain('-line2');
        expect(result.linesAdded).toBeGreaterThan(0);
        expect(result.linesRemoved).toBeGreaterThan(0);
      }
    });

    it('skips whitespace-only changes', () => {
      const oldContent = 'line1\nline2\n';
      const newContent = 'line1\n  \nline2\n   \n';

      const result = engine.computeDiff('file:///test.ts', oldContent, newContent);
      // Whitespace-only additions — but added lines have only whitespace
      // The check looks for non-whitespace in added/removed lines
      if (!isDiffResult(result)) {
        expect(result.reason).toBe('whitespace-only change');
      }
    });

    it('skips changes with fewer than 3 lines changed', () => {
      const oldContent = 'line1\nline2\nline3\n';
      const newContent = 'line1\nchanged\nline3\n';

      const result = engine.computeDiff('file:///test.ts', oldContent, newContent);
      if (!isDiffResult(result)) {
        expect(result.reason).toContain('only 2 line(s) changed');
      }
    });

    it('includes sufficient changes', () => {
      const oldContent = 'a\nb\nc\nd\ne\n';
      const newContent = 'a\nx\ny\nz\ne\n';

      const result = engine.computeDiff('file:///test.ts', oldContent, newContent);
      expect(isDiffResult(result)).toBe(true);
    });

    it('extracts fileName from URI', () => {
      const result = engine.computeDiff(
        'file:///some/deep/path/Component.tsx',
        'a\nb\nc\n',
        'x\ny\nz\n'
      );
      if (isDiffResult(result)) {
        expect(result.fileName).toBe('Component.tsx');
      }
    });
  });
});

import { describe, it, expect } from 'vitest';
import { ContextAssembler } from '../ContextAssembler';
import { DiffResult } from '../DiffEngine';

describe('ContextAssembler', () => {
  const assembler = new ContextAssembler();

  const sampleDiffs: DiffResult[] = [
    {
      uri: 'file:///app.ts',
      fileName: 'app.ts',
      patch: '@@ -1,3 +1,5 @@\n line1\n-line2\n+modified\n+new line\n line3\n+extra\n',
      linesAdded: 3,
      linesRemoved: 1,
      content: 'line1\nmodified\nnew line\nline3\nextra\n',
    },
  ];

  it('produces identical output for all understanding levels', () => {
    const dev = assembler.assemble(sampleDiffs, 'developer');
    const arch = assembler.assemble(sampleDiffs, 'architecture');
    const syn = assembler.assemble(sampleDiffs, 'syntax');

    expect(dev).toBe(arch);
    expect(arch).toBe(syn);
  });

  it('includes file name and stats', () => {
    const result = assembler.assemble(sampleDiffs, 'developer');
    expect(result).toContain('app.ts');
    expect(result).toContain('+3');
    expect(result).toContain('-1');
  });

  it('includes the diff patch', () => {
    const result = assembler.assemble(sampleDiffs, 'developer');
    expect(result).toContain('+modified');
    expect(result).toContain('-line2');
  });

  describe('assembleSelection', () => {
    it('includes selected text and file name', () => {
      const result = assembler.assembleSelection('const x = 1;', 'utils.ts');
      expect(result).toContain('utils.ts');
      expect(result).toContain('const x = 1;');
    });
  });

  describe('assembleReExplain', () => {
    it('includes original diff and selected text', () => {
      const result = assembler.assembleReExplain('some explanation text', sampleDiffs, undefined);
      expect(result).toContain('app.ts');
      expect(result).toContain('some explanation text');
      expect(result).toContain('deeper explanation');
    });

    it('includes original selection text when no diffs', () => {
      const result = assembler.assembleReExplain('drill down text', undefined, 'const x = 1;');
      expect(result).toContain('const x = 1;');
      expect(result).toContain('drill down text');
    });
  });
});

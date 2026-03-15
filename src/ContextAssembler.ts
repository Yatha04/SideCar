import { DiffResult } from './DiffEngine';

export type UnderstandingLevel = 'architecture' | 'developer' | 'syntax';

const CONTEXT_LINES = 50;

/**
 * Assembles the user-turn prompt payload from a batch of diffs.
 * Includes the unified patch and ~50 lines of surrounding file context.
 */
export class ContextAssembler {
  assemble(diffs: DiffResult[], _level: UnderstandingLevel): string {
    const parts: string[] = ['The following file changes were just saved:\n'];

    for (const diff of diffs) {
      parts.push(
        `**File:** \`${diff.fileName}\` (+${diff.linesAdded} / -${diff.linesRemoved})\n`,
      );
      parts.push('```diff');
      parts.push(diff.patch);
      parts.push('```\n');

      if (diff.content) {
        const context = this._extractContext(diff.patch, diff.content);
        if (context) {
          parts.push('**Surrounding context:**');
          parts.push('```');
          parts.push(context);
          parts.push('```\n');
        }
      }
    }

    return parts.join('\n');
  }

  assembleSelection(selectedText: string, fileName: string): string {
    return [
      `**File:** \`${fileName}\`\n`,
      '**Selected code:**',
      '```',
      selectedText,
      '```',
    ].join('\n');
  }

  assembleReExplain(
    selectedText: string,
    diffs?: DiffResult[],
    originalSelectionText?: string,
  ): string {
    const parts: string[] = [];

    if (diffs && diffs.length > 0) {
      parts.push('**Original changes for context:**\n');
      for (const diff of diffs) {
        parts.push(`**File:** \`${diff.fileName}\`\n`);
        parts.push('```diff');
        parts.push(diff.patch);
        parts.push('```\n');
      }
    } else if (originalSelectionText) {
      parts.push('**Original code for context:**\n');
      parts.push('```');
      parts.push(originalSelectionText);
      parts.push('```\n');
    }

    parts.push('**The user wants a deeper explanation of this part:**\n');
    parts.push('```');
    parts.push(selectedText);
    parts.push('```');

    return parts.join('\n');
  }

  /** Extract ~CONTEXT_LINES lines centred on the first hunk. */
  private _extractContext(patch: string, content: string): string | null {
    const match = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/m.exec(patch);
    if (!match) { return null; }

    const centerLine = parseInt(match[1], 10) - 1; // 0-indexed
    const allLines = content.split('\n');
    const half = Math.floor(CONTEXT_LINES / 2);
    const start = Math.max(0, centerLine - half);
    const end = Math.min(allLines.length, centerLine + half);

    return allLines
      .slice(start, end)
      .map((line, i) => `${start + i + 1} | ${line}`)
      .join('\n');
  }
}

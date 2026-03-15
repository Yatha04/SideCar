import { createTwoFilesPatch } from 'diff';

export interface DiffResult {
  uri: string;
  fileName: string;
  patch: string;
  linesAdded: number;
  linesRemoved: number;
  /** Full file content after save — used by ContextAssembler for surrounding context. */
  content?: string;
}

export interface SkipReason {
  uri: string;
  reason: string;
}

const LOCK_EXTENSIONS = ['.lock', '.lockb'];
const BINARY_EXTENSIONS = [
  '.png', '.jpg', '.jpeg', '.gif', '.bmp', '.ico', '.webp',
  '.woff', '.woff2', '.ttf', '.eot', '.otf',
  '.zip', '.tar', '.gz', '.7z', '.rar',
  '.pdf', '.exe', '.dll', '.so', '.dylib',
  '.mp3', '.mp4', '.wav', '.avi', '.mov',
];
const MAX_FILE_SIZE = 100 * 1024; // 100KB

/**
 * DiffEngine computes unified diffs and applies skip filters
 * per the project spec.
 */
export class DiffEngine {
  /**
   * Check whether a file should be skipped.
   * Returns a reason string if skipped, or null if it should be processed.
   */
  shouldSkip(uri: string, content: string): string | null {
    const lower = uri.toLowerCase();

    // Skip lock files
    if (LOCK_EXTENSIONS.some(ext => lower.endsWith(ext))) {
      return 'lock file';
    }

    // Skip binary files
    if (BINARY_EXTENSIONS.some(ext => lower.endsWith(ext))) {
      return 'binary file';
    }

    // Skip large files
    if (Buffer.byteLength(content, 'utf-8') > MAX_FILE_SIZE) {
      return 'file exceeds 100KB';
    }

    return null;
  }

  /**
   * Compute a unified diff between old and new content.
   * Returns null if the diff should be skipped (whitespace-only or <3 lines changed).
   */
  computeDiff(uri: string, oldContent: string, newContent: string): DiffResult | SkipReason {
    const fileName = uri.split('/').pop() ?? uri;

    // Compute the unified patch
    const patch = createTwoFilesPatch(
      `a/${fileName}`,
      `b/${fileName}`,
      oldContent,
      newContent,
      '', '',
      { context: 3 }
    );

    // Count added/removed lines (lines starting with + or - but not +++ or ---)
    const lines = patch.split('\n');
    let linesAdded = 0;
    let linesRemoved = 0;
    let hasNonWhitespaceChange = false;

    for (const line of lines) {
      if (line.startsWith('+') && !line.startsWith('+++')) {
        linesAdded++;
        if (line.substring(1).trim().length > 0) {
          hasNonWhitespaceChange = true;
        }
      } else if (line.startsWith('-') && !line.startsWith('---')) {
        linesRemoved++;
        if (line.substring(1).trim().length > 0) {
          hasNonWhitespaceChange = true;
        }
      }
    }

    const totalChanged = linesAdded + linesRemoved;

    // Skip whitespace-only diffs
    if (!hasNonWhitespaceChange) {
      return { uri, reason: 'whitespace-only change' };
    }

    // Skip diffs with fewer than 3 lines changed
    if (totalChanged < 3) {
      return { uri, reason: `only ${totalChanged} line(s) changed (minimum 3)` };
    }

    return { uri, fileName, patch, linesAdded, linesRemoved };
  }
}

/** Type guard to check if a result is a DiffResult (not a SkipReason). */
export function isDiffResult(result: DiffResult | SkipReason): result is DiffResult {
  return 'patch' in result;
}

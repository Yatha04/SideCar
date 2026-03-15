import * as vscode from 'vscode';
import * as path from 'path';
import { execFile } from 'child_process';
import { ContentCache } from './ContentCache';
import { DebounceController } from './DebounceController';
import { DiffEngine, DiffResult, isDiffResult } from './DiffEngine';

export interface FileWatcherEvents {
  onDiffs: (diffs: DiffResult[]) => void;
  onSkipped: (uri: string, reason: string) => void;
}

/**
 * FileWatcher listens for file saves, computes diffs via the DiffEngine,
 * and notifies the extension when batched diffs are ready.
 *
 * On first encounter with a file, seeds the ContentCache from
 * `git show HEAD:<file>` so the diff is correct even for files
 * never opened before activation.
 */
export class FileWatcher implements vscode.Disposable {
  private readonly _contentCache: ContentCache;
  private readonly _debounce: DebounceController;
  private readonly _diffEngine: DiffEngine;
  private readonly _events: FileWatcherEvents;
  private readonly _disposables: vscode.Disposable[] = [];
  private readonly _workspaceRoot: string | undefined;

  // Store "after" content for each URI until the debounce fires
  private readonly _pendingContent = new Map<string, string>();

  // User-configurable ignore patterns (glob-style)
  private _ignorePatterns: string[] = [];

  constructor(events: FileWatcherEvents, workspaceRoot?: string) {
    this._contentCache = new ContentCache();
    this._diffEngine = new DiffEngine();
    this._events = events;
    this._workspaceRoot = workspaceRoot;

    const config = vscode.workspace.getConfiguration('lumen');
    const debounceMs = config.get<number>('debounceMs', 3000);
    this._ignorePatterns = config.get<string[]>('ignorePatterns', []);

    this._debounce = new DebounceController(debounceMs, (uris) => {
      void this._processBatch(uris);
    });

    // Pre-populate cache with all currently open documents
    for (const doc of vscode.workspace.textDocuments) {
      if (doc.uri.scheme === 'file') {
        this._contentCache.set(doc.uri.toString(), doc.getText());
      }
    }

    // Cache files when they are first opened (before they're ever saved)
    this._disposables.push(
      vscode.workspace.onDidOpenTextDocument((doc) => {
        if (doc.uri.scheme === 'file' && !this._contentCache.has(doc.uri.toString())) {
          this._contentCache.set(doc.uri.toString(), doc.getText());
        }
      })
    );

    // Listen for document saves
    this._disposables.push(
      vscode.workspace.onDidSaveTextDocument((doc) => {
        this._onDocumentSaved(doc);
      })
    );

    // React to config changes (debounce delay + ignore patterns)
    this._disposables.push(
      vscode.workspace.onDidChangeConfiguration((e) => {
        if (e.affectsConfiguration('lumen.debounceMs')) {
          const newDelay = vscode.workspace
            .getConfiguration('lumen')
            .get<number>('debounceMs', 3000);
          this._debounce.setDelay(newDelay);
        }
        if (e.affectsConfiguration('lumen.ignorePatterns')) {
          this._ignorePatterns = vscode.workspace
            .getConfiguration('lumen')
            .get<string[]>('ignorePatterns', []);
        }
      })
    );
  }

  /**
   * Update the cache for a file after its explanation is complete.
   * Called by extension.ts in the streamDone callback so the next
   * diff is scoped to "since last explanation," not "since last save."
   */
  updateCacheAfterExplain(uris: string[]): void {
    for (const uri of uris) {
      const content = this._pendingExplained.get(uri);
      if (content !== undefined) {
        this._contentCache.set(uri, content);
        this._pendingExplained.delete(uri);
      }
    }
  }

  // Content to commit to cache after explanation completes
  private readonly _pendingExplained = new Map<string, string>();

  private _onDocumentSaved(doc: vscode.TextDocument): void {
    // Only process file:// scheme documents
    if (doc.uri.scheme !== 'file') {
      return;
    }

    const uri = doc.uri.toString();
    const newContent = doc.getText();

    // Check user-configured ignore patterns
    if (this._matchesIgnorePattern(uri)) {
      this._events.onSkipped(uri, 'matched ignore pattern');
      return;
    }

    // Check skip filters on the new content
    const skipReason = this._diffEngine.shouldSkip(uri, newContent);
    if (skipReason) {
      this._events.onSkipped(uri, skipReason);
      return;
    }

    // Store the new content for when debounce fires
    this._pendingContent.set(uri, newContent);
    this._debounce.push(uri);
  }

  /** Check if a URI matches any user-configured ignore pattern. */
  private _matchesIgnorePattern(uri: string): boolean {
    if (this._ignorePatterns.length === 0) { return false; }

    // Normalize: extract file path from URI, use forward slashes
    const filePath = decodeURIComponent(uri.replace('file:///', '').replace('file://', ''));

    for (const pattern of this._ignorePatterns) {
      if (this._globMatch(filePath, pattern)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Simple glob matcher supporting:
   * - `*` matches any characters except /
   * - `**` matches any characters including /
   * - `?` matches a single character
   * - Exact substring match as fallback
   */
  private _globMatch(filePath: string, pattern: string): boolean {
    const normPath = filePath.replace(/\\/g, '/').toLowerCase();
    const normPattern = pattern.replace(/\\/g, '/').toLowerCase();

    if (!normPattern.includes('*') && !normPattern.includes('?')) {
      return normPath.includes(normPattern);
    }

    let regex = '';
    let i = 0;
    while (i < normPattern.length) {
      const c = normPattern[i];
      if (c === '*') {
        if (normPattern[i + 1] === '*') {
          regex += '.*';
          i += 2;
          if (normPattern[i] === '/') { i++; }
          continue;
        }
        regex += '[^/]*';
      } else if (c === '?') {
        regex += '[^/]';
      } else if ('.+^${}()|[]\\'.includes(c)) {
        regex += '\\' + c;
      } else {
        regex += c;
      }
      i++;
    }

    try {
      return new RegExp(regex).test(normPath);
    } catch {
      return normPath.includes(normPattern);
    }
  }

  /**
   * Get the committed version of a file from git.
   * Returns null if not in a git repo, file is untracked, or no commits exist.
   */
  private async _gitShowHead(uri: string): Promise<string | null> {
    if (!this._workspaceRoot) { return null; }

    // Convert file URI to absolute path
    const absolutePath = decodeURIComponent(
      uri.replace('file:///', '').replace('file://', '')
    );
    // On Windows, URI starts with file:///C: — decoding gives C:...
    const relativePath = path.relative(this._workspaceRoot, absolutePath)
      .replace(/\\/g, '/'); // git needs forward slashes

    return new Promise((resolve) => {
      execFile(
        'git',
        ['show', `HEAD:${relativePath}`],
        { cwd: this._workspaceRoot, maxBuffer: 1024 * 1024, timeout: 5000 },
        (err, stdout) => {
          if (err) {
            // File not in git, no commits, or git not installed — all fine
            resolve(null);
          } else {
            resolve(stdout);
          }
        }
      );
    });
  }

  private async _processBatch(uris: string[]): Promise<void> {
    const diffs: DiffResult[] = [];

    for (const uri of uris) {
      const newContent = this._pendingContent.get(uri);
      if (newContent === undefined) {
        continue;
      }
      this._pendingContent.delete(uri);

      // If this file has never been seen, try to seed from git
      if (!this._contentCache.has(uri)) {
        const gitContent = await this._gitShowHead(uri);
        // gitContent is null if not in git (untracked/new file) — seed as empty
        this._contentCache.set(uri, gitContent ?? '');
      }

      const oldContent = this._contentCache.get(uri) ?? '';

      // Skip if content hasn't actually changed
      if (oldContent === newContent) {
        continue;
      }

      const result = this._diffEngine.computeDiff(uri, oldContent, newContent);

      if (isDiffResult(result)) {
        result.content = newContent;
        diffs.push(result);
        // Stage content to be committed to cache AFTER explanation completes
        this._pendingExplained.set(uri, newContent);
      } else {
        this._events.onSkipped(uri, result.reason);
        // For skipped files (whitespace-only, <3 lines), still update cache
        // so they don't re-trigger on next save
        this._contentCache.set(uri, newContent);
      }
    }

    if (diffs.length > 0) {
      this._events.onDiffs(diffs);
    }
  }

  dispose(): void {
    this._debounce.cancel();
    this._contentCache.clear();
    this._pendingContent.clear();
    this._pendingExplained.clear();
    for (const d of this._disposables) {
      d.dispose();
    }
  }
}

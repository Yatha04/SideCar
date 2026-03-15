import * as vscode from 'vscode';
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
 */
export class FileWatcher implements vscode.Disposable {
  private readonly _contentCache: ContentCache;
  private readonly _debounce: DebounceController;
  private readonly _diffEngine: DiffEngine;
  private readonly _events: FileWatcherEvents;
  private readonly _disposables: vscode.Disposable[] = [];

  // Store "after" content for each URI until the debounce fires
  private readonly _pendingContent = new Map<string, string>();

  constructor(events: FileWatcherEvents) {
    this._contentCache = new ContentCache();
    this._diffEngine = new DiffEngine();
    this._events = events;

    const debounceMs = vscode.workspace
      .getConfiguration('sidecar')
      .get<number>('debounceMs', 3000);

    this._debounce = new DebounceController(debounceMs, (uris) => {
      this._processBatch(uris);
    });

    // Listen for document saves
    this._disposables.push(
      vscode.workspace.onDidSaveTextDocument((doc) => {
        this._onDocumentSaved(doc);
      })
    );
  }

  private _onDocumentSaved(doc: vscode.TextDocument): void {
    // Only process file:// scheme documents
    if (doc.uri.scheme !== 'file') {
      return;
    }

    const uri = doc.uri.toString();
    const newContent = doc.getText();

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

  private _processBatch(uris: string[]): void {
    const diffs: DiffResult[] = [];

    for (const uri of uris) {
      const newContent = this._pendingContent.get(uri);
      if (newContent === undefined) {
        continue;
      }
      this._pendingContent.delete(uri);

      const oldContent = this._contentCache.get(uri) ?? '';

      // Skip if content hasn't actually changed
      if (oldContent === newContent) {
        continue;
      }

      const result = this._diffEngine.computeDiff(uri, oldContent, newContent);

      if (isDiffResult(result)) {
        diffs.push(result);
      } else {
        this._events.onSkipped(uri, result.reason);
      }

      // Always update cache to the latest content
      this._contentCache.set(uri, newContent);
    }

    if (diffs.length > 0) {
      this._events.onDiffs(diffs);
    }
  }

  dispose(): void {
    this._debounce.cancel();
    this._contentCache.clear();
    this._pendingContent.clear();
    for (const d of this._disposables) {
      d.dispose();
    }
  }
}

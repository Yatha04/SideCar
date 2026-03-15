import { DiffResult } from './DiffEngine';

export type EntryType = 'auto' | 'on-demand' | 're-explain';

export interface HistoryEntry {
  groupId: string;
  timestamp: number;
  type: EntryType;
  fileNames: string[];
  linesAdded: number;
  linesRemoved: number;
  diffs?: DiffResult[];
  selectionText?: string;
  selectionFileName?: string;
  /** Rendered markdown per level, filled as streams complete. */
  content: Map<string, string>;
}

const MAX_ENTRIES = 100;

export class HistoryManager {
  private _entries: HistoryEntry[] = [];
  private _currentIndex = -1;

  get length(): number {
    return this._entries.length;
  }

  push(entry: HistoryEntry): void {
    this._entries.push(entry);
    if (this._entries.length > MAX_ENTRIES) {
      this._entries.shift();
    }
    this._currentIndex = this._entries.length - 1;
  }

  current(): HistoryEntry | undefined {
    return this._entries[this._currentIndex];
  }

  canGoBack(): boolean {
    return this._currentIndex > 0;
  }

  canGoForward(): boolean {
    return this._currentIndex < this._entries.length - 1;
  }

  goBack(): HistoryEntry | undefined {
    if (this.canGoBack()) {
      this._currentIndex--;
    }
    return this.current();
  }

  goForward(): HistoryEntry | undefined {
    if (this.canGoForward()) {
      this._currentIndex++;
    }
    return this.current();
  }

  isAtLatest(): boolean {
    return this._currentIndex === this._entries.length - 1;
  }

  getByGroupId(groupId: string): HistoryEntry | undefined {
    return this._entries.find(e => e.groupId === groupId);
  }

  updateContent(groupId: string, level: string, markdown: string): void {
    const entry = this.getByGroupId(groupId);
    if (entry) {
      entry.content.set(level, markdown);
    }
  }

  positionLabel(): string {
    if (this._entries.length === 0) { return '0 / 0'; }
    return `${this._currentIndex + 1} / ${this._entries.length}`;
  }
}

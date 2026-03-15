/**
 * DebounceController accumulates file save events and fires
 * a callback with the batch of changed URIs after a configurable delay.
 */
export class DebounceController {
  private _timer: ReturnType<typeof setTimeout> | null = null;
  private _pending = new Set<string>();

  constructor(
    private readonly _delayMs: number,
    private readonly _onFlush: (uris: string[]) => void
  ) {}

  /** Record a file save. Resets the debounce timer. */
  push(uri: string): void {
    this._pending.add(uri);

    if (this._timer !== null) {
      clearTimeout(this._timer);
    }

    this._timer = setTimeout(() => {
      this._flush();
    }, this._delayMs);
  }

  /** Immediately flush any pending saves. */
  flush(): void {
    if (this._timer !== null) {
      clearTimeout(this._timer);
      this._timer = null;
    }
    if (this._pending.size > 0) {
      this._flush();
    }
  }

  /** Cancel any pending debounce without firing. */
  cancel(): void {
    if (this._timer !== null) {
      clearTimeout(this._timer);
      this._timer = null;
    }
    this._pending.clear();
  }

  /** Number of files pending in the current batch. */
  get pendingCount(): number {
    return this._pending.size;
  }

  private _flush(): void {
    const uris = Array.from(this._pending);
    this._pending.clear();
    this._timer = null;
    this._onFlush(uris);
  }
}

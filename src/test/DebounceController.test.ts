import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DebounceController } from '../DebounceController';

describe('DebounceController', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('fires callback after delay with accumulated URIs', () => {
    const onFlush = vi.fn();
    const ctrl = new DebounceController(100, onFlush);

    ctrl.push('file:///a.ts');
    ctrl.push('file:///b.ts');

    expect(onFlush).not.toHaveBeenCalled();
    vi.advanceTimersByTime(100);
    expect(onFlush).toHaveBeenCalledOnce();
    expect(onFlush).toHaveBeenCalledWith(['file:///a.ts', 'file:///b.ts']);
  });

  it('resets timer on each push', () => {
    const onFlush = vi.fn();
    const ctrl = new DebounceController(100, onFlush);

    ctrl.push('file:///a.ts');
    vi.advanceTimersByTime(80);
    ctrl.push('file:///b.ts');
    vi.advanceTimersByTime(80);
    expect(onFlush).not.toHaveBeenCalled();

    vi.advanceTimersByTime(20);
    expect(onFlush).toHaveBeenCalledOnce();
  });

  it('deduplicates URIs in a batch', () => {
    const onFlush = vi.fn();
    const ctrl = new DebounceController(100, onFlush);

    ctrl.push('file:///a.ts');
    ctrl.push('file:///a.ts');
    ctrl.push('file:///a.ts');

    vi.advanceTimersByTime(100);
    expect(onFlush).toHaveBeenCalledWith(['file:///a.ts']);
  });

  it('flush() fires immediately', () => {
    const onFlush = vi.fn();
    const ctrl = new DebounceController(100, onFlush);

    ctrl.push('file:///a.ts');
    ctrl.flush();
    expect(onFlush).toHaveBeenCalledOnce();
  });

  it('flush() is a no-op when nothing pending', () => {
    const onFlush = vi.fn();
    const ctrl = new DebounceController(100, onFlush);
    ctrl.flush();
    expect(onFlush).not.toHaveBeenCalled();
  });

  it('cancel() clears pending without firing', () => {
    const onFlush = vi.fn();
    const ctrl = new DebounceController(100, onFlush);

    ctrl.push('file:///a.ts');
    ctrl.cancel();
    vi.advanceTimersByTime(200);
    expect(onFlush).not.toHaveBeenCalled();
  });

  it('tracks pendingCount', () => {
    const onFlush = vi.fn();
    const ctrl = new DebounceController(100, onFlush);

    expect(ctrl.pendingCount).toBe(0);
    ctrl.push('file:///a.ts');
    ctrl.push('file:///b.ts');
    expect(ctrl.pendingCount).toBe(2);

    vi.advanceTimersByTime(100);
    expect(ctrl.pendingCount).toBe(0);
  });
});

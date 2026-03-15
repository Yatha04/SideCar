import { describe, it, expect } from 'vitest';
import { HistoryManager, HistoryEntry } from '../HistoryManager';

function makeEntry(groupId: string, type: 'auto' | 'on-demand' | 're-explain' = 'auto'): HistoryEntry {
  return {
    groupId,
    timestamp: Date.now(),
    type,
    fileNames: ['test.ts'],
    linesAdded: 5,
    linesRemoved: 2,
    content: new Map(),
  };
}

describe('HistoryManager', () => {
  it('starts empty', () => {
    const hm = new HistoryManager();
    expect(hm.length).toBe(0);
    expect(hm.current()).toBeUndefined();
    expect(hm.positionLabel()).toBe('0 / 0');
  });

  it('push adds entries and sets index to latest', () => {
    const hm = new HistoryManager();
    hm.push(makeEntry('1'));
    expect(hm.length).toBe(1);
    expect(hm.current()?.groupId).toBe('1');
    expect(hm.positionLabel()).toBe('1 / 1');

    hm.push(makeEntry('2'));
    expect(hm.length).toBe(2);
    expect(hm.current()?.groupId).toBe('2');
    expect(hm.positionLabel()).toBe('2 / 2');
  });

  it('caps at 100 entries', () => {
    const hm = new HistoryManager();
    for (let i = 0; i < 105; i++) {
      hm.push(makeEntry(`e${i}`));
    }
    expect(hm.length).toBe(100);
    // Oldest entries were trimmed
    expect(hm.getByGroupId('e0')).toBeUndefined();
    expect(hm.getByGroupId('e4')).toBeUndefined();
    expect(hm.getByGroupId('e5')).toBeDefined();
  });

  it('goBack and goForward navigate correctly', () => {
    const hm = new HistoryManager();
    hm.push(makeEntry('a'));
    hm.push(makeEntry('b'));
    hm.push(makeEntry('c'));

    expect(hm.current()?.groupId).toBe('c');
    expect(hm.canGoBack()).toBe(true);
    expect(hm.canGoForward()).toBe(false);

    hm.goBack();
    expect(hm.current()?.groupId).toBe('b');
    expect(hm.canGoBack()).toBe(true);
    expect(hm.canGoForward()).toBe(true);
    expect(hm.positionLabel()).toBe('2 / 3');

    hm.goBack();
    expect(hm.current()?.groupId).toBe('a');
    expect(hm.canGoBack()).toBe(false);
    expect(hm.canGoForward()).toBe(true);

    // Can't go further back
    hm.goBack();
    expect(hm.current()?.groupId).toBe('a');

    hm.goForward();
    expect(hm.current()?.groupId).toBe('b');

    hm.goForward();
    expect(hm.current()?.groupId).toBe('c');

    // Can't go further forward
    hm.goForward();
    expect(hm.current()?.groupId).toBe('c');
  });

  it('isAtLatest returns correct value', () => {
    const hm = new HistoryManager();
    hm.push(makeEntry('a'));
    hm.push(makeEntry('b'));
    expect(hm.isAtLatest()).toBe(true);

    hm.goBack();
    expect(hm.isAtLatest()).toBe(false);

    hm.goForward();
    expect(hm.isAtLatest()).toBe(true);
  });

  it('push resets index to latest', () => {
    const hm = new HistoryManager();
    hm.push(makeEntry('a'));
    hm.push(makeEntry('b'));
    hm.goBack();
    expect(hm.current()?.groupId).toBe('a');

    hm.push(makeEntry('c'));
    expect(hm.current()?.groupId).toBe('c');
    expect(hm.isAtLatest()).toBe(true);
  });

  it('getByGroupId finds entries', () => {
    const hm = new HistoryManager();
    hm.push(makeEntry('x'));
    hm.push(makeEntry('y'));

    expect(hm.getByGroupId('x')?.groupId).toBe('x');
    expect(hm.getByGroupId('y')?.groupId).toBe('y');
    expect(hm.getByGroupId('z')).toBeUndefined();
  });

  it('updateContent stores markdown per level', () => {
    const hm = new HistoryManager();
    hm.push(makeEntry('g1'));

    hm.updateContent('g1', 'developer', '# Hello');
    hm.updateContent('g1', 'syntax', '## Line by line');

    const entry = hm.getByGroupId('g1')!;
    expect(entry.content.get('developer')).toBe('# Hello');
    expect(entry.content.get('syntax')).toBe('## Line by line');
    expect(entry.content.get('architecture')).toBeUndefined();
  });

  it('updateContent ignores unknown groupId', () => {
    const hm = new HistoryManager();
    // Should not throw
    hm.updateContent('nonexistent', 'developer', 'data');
    expect(hm.length).toBe(0);
  });
});

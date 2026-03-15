import { marked } from 'marked';

declare function acquireVsCodeApi(): { postMessage(msg: unknown): void };
const vscode = acquireVsCodeApi();

const LEVELS = ['architecture', 'developer', 'syntax'] as const;

type IncomingMessage =
  | { type: 'streamStart'; groupId: string; level: string; fileNames: string[]; linesAdded: number; linesRemoved: number; entryType: string }
  | { type: 'streamChunk'; groupId: string; level: string; text: string }
  | { type: 'streamDone'; groupId: string; level: string }
  | { type: 'streamError'; groupId: string; level: string; message: string }
  | { type: 'setLevel'; level: string }
  | { type: 'historyPosition'; label: string; canBack: boolean; canForward: boolean }
  | { type: 'showEntry'; groupId: string; fileNames: string[]; linesAdded: number; linesRemoved: number; entryType: string; selectionFileName?: string; content: Record<string, string>; level: string; positionLabel: string; canBack: boolean; canForward: boolean };

const output = document.getElementById('output') as HTMLElement;
const statusText = document.getElementById('status-text') as HTMLElement;
const historyBackBtn = document.getElementById('history-back') as HTMLButtonElement;
const historyForwardBtn = document.getElementById('history-forward') as HTMLButtonElement;
const historyLabel = document.getElementById('history-label') as HTMLElement;
const reexplainBtn = document.getElementById('reexplain-btn') as HTMLButtonElement;

// Buffer per groupId per level
const buffers = new Map<string, Map<string, string>>();
let activeLevel = 'developer';
let viewingLatest = true;

function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// --- Level toggle ---

function setActiveLevel(level: string): void {
  activeLevel = level;

  document.querySelectorAll('.level-btn').forEach((btn) => {
    const el = btn as HTMLElement;
    el.classList.toggle('active', el.dataset.level === level);
  });

  document.querySelectorAll('.entry-body').forEach((el) => {
    const body = el as HTMLElement;
    body.classList.toggle('visible', body.dataset.level === level);
  });
}

// Initialize from injected value
const initialLevel = (window as unknown as Record<string, unknown>).__sidecarInitialLevel as string | undefined;
if (initialLevel) {
  setActiveLevel(initialLevel);
}

// Click handlers for toggle buttons
document.querySelectorAll('.level-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    const level = (btn as HTMLElement).dataset.level;
    if (level) {
      setActiveLevel(level);
      vscode.postMessage({ type: 'setLevel', level });
    }
  });
});

// --- History nav ---

historyBackBtn.addEventListener('click', () => {
  vscode.postMessage({ type: 'historyBack' });
});

historyForwardBtn.addEventListener('click', () => {
  vscode.postMessage({ type: 'historyForward' });
});

function updateHistoryNav(label: string, canBack: boolean, canForward: boolean): void {
  historyLabel.textContent = label;
  historyBackBtn.disabled = !canBack;
  historyForwardBtn.disabled = !canForward;
}

// --- Re-explain ---

let reexplainGroupId = '';

document.addEventListener('mouseup', () => {
  const sel = window.getSelection();
  if (!sel || sel.isCollapsed || !sel.toString().trim()) {
    reexplainBtn.style.display = 'none';
    return;
  }

  // Find the parent entry
  const anchor = sel.anchorNode;
  if (!anchor) { return; }
  const entryEl = (anchor instanceof HTMLElement ? anchor : anchor.parentElement)?.closest('.entry');
  if (!entryEl) {
    reexplainBtn.style.display = 'none';
    return;
  }

  // Extract groupId from element id (format: entry-g{groupId})
  const id = entryEl.id;
  const gid = id.replace('entry-g', '');
  reexplainGroupId = gid;

  // Position the button near the selection
  const range = sel.getRangeAt(0);
  const rect = range.getBoundingClientRect();
  reexplainBtn.style.left = `${rect.left}px`;
  reexplainBtn.style.top = `${rect.bottom + 4}px`;
  reexplainBtn.style.display = 'block';
});

reexplainBtn.addEventListener('click', () => {
  const sel = window.getSelection();
  const text = sel?.toString().trim() ?? '';
  if (text && reexplainGroupId) {
    vscode.postMessage({ type: 'reExplain', text, groupId: reexplainGroupId });
    reexplainBtn.style.display = 'none';
    sel?.removeAllRanges();
  }
});

// Hide re-explain button on click elsewhere
document.addEventListener('mousedown', (e) => {
  if (e.target !== reexplainBtn) {
    reexplainBtn.style.display = 'none';
  }
});

// --- Helpers ---

function entryId(groupId: string): string {
  return `entry-g${groupId}`;
}

function buildEntryHeader(fileNames: string[], linesAdded: number, linesRemoved: number, entryType: string): string {
  const filesHtml = fileNames.map(escapeHtml).join(', ');
  const badge = entryType !== 'auto'
    ? `<span class="entry-type-badge">${escapeHtml(entryType)}</span>`
    : '';

  if (entryType === 'on-demand' || entryType === 're-explain') {
    return `<span class="entry-files">${filesHtml}${badge}</span>`;
  }

  return (
    `<span class="entry-files">${filesHtml}${badge}</span>` +
    `<span class="entry-stats">` +
      `<span class="added">+${linesAdded}</span> ` +
      `<span class="removed">-${linesRemoved}</span>` +
    `</span>`
  );
}

function getOrCreateEntry(groupId: string, fileNames: string[], linesAdded: number, linesRemoved: number, entryType: string): HTMLElement {
  let container = document.getElementById(entryId(groupId));
  if (container) { return container; }

  container = document.createElement('div');
  container.id = entryId(groupId);
  container.className = 'entry';

  const header = document.createElement('div');
  header.className = 'entry-header';
  header.innerHTML = buildEntryHeader(fileNames, linesAdded, linesRemoved, entryType);
  container.appendChild(header);

  for (const lvl of LEVELS) {
    const body = document.createElement('div');
    body.className = 'entry-body pending' + (lvl === activeLevel ? ' visible' : '');
    body.dataset.level = lvl;
    body.innerHTML = '<span class="pending-text">Switch to this level to generate\u2026</span>';
    container.appendChild(body);
  }

  const timestamp = document.createElement('div');
  timestamp.className = 'entry-timestamp';
  timestamp.textContent = new Date().toLocaleTimeString();
  container.appendChild(timestamp);

  output.insertBefore(container, output.firstChild);
  return container;
}

function getBody(groupId: string, level: string): HTMLElement | null {
  return document.querySelector<HTMLElement>(
    `#${entryId(groupId)} .entry-body[data-level="${level}"]`,
  );
}

function getGroupBuffer(groupId: string): Map<string, string> {
  let group = buffers.get(groupId);
  if (!group) {
    group = new Map();
    buffers.set(groupId, group);
  }
  return group;
}

// --- Message handler ---

window.addEventListener('message', (event: MessageEvent<IncomingMessage>) => {
  const msg = event.data;

  switch (msg.type) {
    case 'streamStart': {
      // If we were viewing history, jump to latest
      viewingLatest = true;

      const group = getGroupBuffer(msg.groupId);
      group.set(msg.level, '');
      getOrCreateEntry(msg.groupId, msg.fileNames, msg.linesAdded, msg.linesRemoved, msg.entryType);

      const body = getBody(msg.groupId, msg.level);
      if (body) {
        body.className = 'entry-body loading' + (msg.level === activeLevel ? ' visible' : '');
        body.innerHTML =
          '<span class="dots">Thinking<span>.</span><span>.</span><span>.</span></span>';
      }
      statusText.textContent = 'Explaining changes\u2026';
      break;
    }

    case 'streamChunk': {
      if (!viewingLatest) { break; }

      const group = getGroupBuffer(msg.groupId);
      const prev = group.get(msg.level) ?? '';
      group.set(msg.level, prev + msg.text);

      const body = getBody(msg.groupId, msg.level);
      if (body) {
        body.className = 'entry-body streaming' + (msg.level === activeLevel ? ' visible' : '');
        body.textContent = group.get(msg.level)!;
      }
      break;
    }

    case 'streamDone': {
      const group = getGroupBuffer(msg.groupId);
      const text = group.get(msg.level) ?? '';

      const body = getBody(msg.groupId, msg.level);
      if (body) {
        body.className = 'entry-body' + (msg.level === activeLevel ? ' visible' : '');
        body.innerHTML = marked.parse(text) as string;
      }

      if (msg.level === activeLevel) {
        statusText.textContent = 'Last update: ' + new Date().toLocaleTimeString();
      }
      break;
    }

    case 'streamError': {
      const group = getGroupBuffer(msg.groupId);
      group.delete(msg.level);

      const body = getBody(msg.groupId, msg.level);
      if (body) {
        body.className = 'entry-body error' + (msg.level === activeLevel ? ' visible' : '');
        body.textContent = `\u26a0 ${msg.message}`;
      }

      if (msg.level === activeLevel) {
        statusText.textContent = 'Error';
      }
      break;
    }

    case 'setLevel': {
      setActiveLevel(msg.level);
      break;
    }

    case 'historyPosition': {
      updateHistoryNav(msg.label, msg.canBack, msg.canForward);
      break;
    }

    case 'showEntry': {
      viewingLatest = false;
      output.innerHTML = '';

      const container = document.createElement('div');
      container.id = entryId(msg.groupId);
      container.className = 'entry';

      const header = document.createElement('div');
      header.className = 'entry-header';
      header.innerHTML = buildEntryHeader(msg.fileNames, msg.linesAdded, msg.linesRemoved, msg.entryType);
      container.appendChild(header);

      for (const lvl of LEVELS) {
        const body = document.createElement('div');
        const content = msg.content[lvl];
        if (content) {
          body.className = 'entry-body' + (lvl === msg.level ? ' visible' : '');
          body.dataset.level = lvl;
          body.innerHTML = marked.parse(content) as string;
        } else {
          body.className = 'entry-body pending' + (lvl === msg.level ? ' visible' : '');
          body.dataset.level = lvl;
          body.innerHTML = '<span class="pending-text">Not generated for this entry</span>';
        }
        container.appendChild(body);
      }

      output.appendChild(container);
      updateHistoryNav(msg.positionLabel, msg.canBack, msg.canForward);
      statusText.textContent = 'Viewing history';
      break;
    }
  }
});

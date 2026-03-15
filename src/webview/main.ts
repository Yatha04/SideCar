import { marked } from 'marked';

declare function acquireVsCodeApi(): { postMessage(msg: unknown): void };
const vscode = acquireVsCodeApi();

const LEVELS = ['architecture', 'developer', 'syntax'] as const;

type IncomingMessage =
  | { type: 'streamStart'; groupId: string; level: string; fileNames: string[]; linesAdded: number; linesRemoved: number }
  | { type: 'streamChunk'; groupId: string; level: string; text: string }
  | { type: 'streamDone'; groupId: string; level: string }
  | { type: 'streamError'; groupId: string; level: string; message: string }
  | { type: 'setLevel'; level: string };

const output = document.getElementById('output') as HTMLElement;
const statusText = document.getElementById('status-text') as HTMLElement;

// Buffer per groupId per level
const buffers = new Map<string, Map<string, string>>();
let activeLevel = 'developer';

function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// --- Level toggle ---

function setActiveLevel(level: string): void {
  activeLevel = level;

  // Update toggle buttons
  document.querySelectorAll('.level-btn').forEach((btn) => {
    const el = btn as HTMLElement;
    el.classList.toggle('active', el.dataset.level === level);
  });

  // Show/hide bodies across all entries
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

// --- Helpers ---

function entryId(groupId: string): string {
  return `entry-g${groupId}`;
}

function getOrCreateEntry(groupId: string, fileNames: string[], linesAdded: number, linesRemoved: number): HTMLElement {
  let container = document.getElementById(entryId(groupId));
  if (container) { return container; }

  container = document.createElement('div');
  container.id = entryId(groupId);
  container.className = 'entry';

  const header = document.createElement('div');
  header.className = 'entry-header';
  header.innerHTML =
    `<span class="entry-files">${fileNames.map(escapeHtml).join(', ')}</span>` +
    `<span class="entry-stats">` +
      `<span class="added">+${linesAdded}</span> ` +
      `<span class="removed">-${linesRemoved}</span>` +
    `</span>`;
  container.appendChild(header);

  // Create a placeholder body for each level (not-yet-generated state)
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
      const group = getGroupBuffer(msg.groupId);
      group.set(msg.level, '');
      getOrCreateEntry(msg.groupId, msg.fileNames, msg.linesAdded, msg.linesRemoved);

      // Switch the body from pending/placeholder to loading
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
  }
});

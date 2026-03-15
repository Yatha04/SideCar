import { marked } from 'marked';

type IncomingMessage =
  | { type: 'streamStart'; id: string; fileNames: string[]; linesAdded: number; linesRemoved: number }
  | { type: 'streamChunk'; id: string; text: string }
  | { type: 'streamDone'; id: string }
  | { type: 'streamError'; id: string; message: string };

const output = document.getElementById('output') as HTMLElement;
const statusText = document.getElementById('status-text') as HTMLElement;
const buffers = new Map<string, string>();

function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

window.addEventListener('message', (event: MessageEvent<IncomingMessage>) => {
  const msg = event.data;

  switch (msg.type) {
    case 'streamStart': {
      buffers.set(msg.id, '');

      const container = document.createElement('div');
      container.id = `entry-${msg.id}`;
      container.className = 'entry';

      const header = document.createElement('div');
      header.className = 'entry-header';
      header.innerHTML =
        `<span class="entry-files">${msg.fileNames.map(escapeHtml).join(', ')}</span>` +
        `<span class="entry-stats">` +
          `<span class="added">+${msg.linesAdded}</span> ` +
          `<span class="removed">-${msg.linesRemoved}</span>` +
        `</span>`;
      container.appendChild(header);

      const body = document.createElement('div');
      body.className = 'entry-body loading';
      body.innerHTML =
        '<span class="dots">Thinking<span>.</span><span>.</span><span>.</span></span>';
      container.appendChild(body);

      const timestamp = document.createElement('div');
      timestamp.className = 'entry-timestamp';
      timestamp.textContent = new Date().toLocaleTimeString();
      container.appendChild(timestamp);

      output.insertBefore(container, output.firstChild);
      statusText.textContent = 'Explaining changes\u2026';
      break;
    }

    case 'streamChunk': {
      const prev = buffers.get(msg.id) ?? '';
      buffers.set(msg.id, prev + msg.text);

      const body = document.querySelector<HTMLElement>(`#entry-${msg.id} .entry-body`);
      if (body) {
        body.className = 'entry-body streaming';
        body.textContent = buffers.get(msg.id)!;
      }
      break;
    }

    case 'streamDone': {
      const text = buffers.get(msg.id) ?? '';
      buffers.delete(msg.id);

      const body = document.querySelector<HTMLElement>(`#entry-${msg.id} .entry-body`);
      if (body) {
        body.className = 'entry-body';
        body.innerHTML = marked.parse(text) as string;
      }
      statusText.textContent = 'Last update: ' + new Date().toLocaleTimeString();
      break;
    }

    case 'streamError': {
      buffers.delete(msg.id);

      const body = document.querySelector<HTMLElement>(`#entry-${msg.id} .entry-body`);
      if (body) {
        body.className = 'entry-body error';
        body.textContent = `\u26a0 ${msg.message}`;
      }
      statusText.textContent = 'Error';
      break;
    }
  }
});

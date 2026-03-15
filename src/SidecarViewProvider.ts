import * as vscode from 'vscode';
import { DiffResult } from './DiffEngine';

export class SidecarViewProvider implements vscode.WebviewViewProvider {
  static readonly viewId = 'sidecar.panel';

  private _webviewView?: vscode.WebviewView;

  constructor(private readonly _extensionUri: vscode.Uri) {}

  resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ): void {
    this._webviewView = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this._extensionUri],
    };

    webviewView.webview.html = this._getHtml();
  }

  /** Send diff results to the webview for rendering. */
  showDiffs(diffs: DiffResult[]): void {
    if (this._webviewView) {
      this._webviewView.webview.postMessage({
        type: 'showDiffs',
        diffs: diffs.map(d => ({
          fileName: d.fileName,
          patch: d.patch,
          linesAdded: d.linesAdded,
          linesRemoved: d.linesRemoved,
        })),
      });

      // Reveal the panel when new diffs arrive
      this._webviewView.show?.(true);
    }
  }

  private _getHtml(): string {
    return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline';">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body {
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      color: var(--vscode-foreground);
      background-color: var(--vscode-sideBar-background);
      padding: 16px;
      margin: 0;
    }
    .status {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-top: 12px;
    }
    .dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background-color: var(--vscode-testing-iconPassed);
    }
    .diff-container {
      margin-top: 16px;
    }
    .diff-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 6px 10px;
      background-color: var(--vscode-editor-background);
      border: 1px solid var(--vscode-panel-border);
      border-bottom: none;
      border-radius: 4px 4px 0 0;
      font-weight: bold;
      font-size: 0.9em;
    }
    .diff-stats {
      font-weight: normal;
      font-size: 0.85em;
      opacity: 0.8;
    }
    .diff-stats .added { color: var(--vscode-gitDecoration-addedResourceForeground, #2ea043); }
    .diff-stats .removed { color: var(--vscode-gitDecoration-deletedResourceForeground, #f85149); }
    .diff-block {
      background-color: var(--vscode-editor-background);
      border: 1px solid var(--vscode-panel-border);
      border-radius: 0 0 4px 4px;
      overflow-x: auto;
      margin-bottom: 16px;
    }
    .diff-block pre {
      margin: 0;
      padding: 8px 10px;
      font-family: var(--vscode-editor-font-family, monospace);
      font-size: var(--vscode-editor-font-size, 13px);
      line-height: 1.5;
      white-space: pre;
    }
    .line-added {
      background-color: rgba(46, 160, 67, 0.15);
      color: var(--vscode-gitDecoration-addedResourceForeground, #2ea043);
    }
    .line-removed {
      background-color: rgba(248, 81, 73, 0.15);
      color: var(--vscode-gitDecoration-deletedResourceForeground, #f85149);
    }
    .line-hunk {
      color: var(--vscode-descriptionForeground);
      opacity: 0.7;
    }
    .line-context {
      opacity: 0.8;
    }
    .timestamp {
      font-size: 0.8em;
      opacity: 0.6;
      margin-bottom: 8px;
    }
  </style>
</head>
<body>
  <h3>Sidecar</h3>
  <div class="status">
    <span class="dot"></span>
    <span id="status-text">Watching for file saves...</span>
  </div>
  <div id="diff-output"></div>

  <script>
    const vscode = acquireVsCodeApi();
    const output = document.getElementById('diff-output');
    const statusText = document.getElementById('status-text');

    window.addEventListener('message', (event) => {
      const message = event.data;
      if (message.type === 'showDiffs') {
        renderDiffs(message.diffs);
      }
    });

    function renderDiffs(diffs) {
      // Prepend new diffs at the top
      const fragment = document.createDocumentFragment();

      const timestamp = document.createElement('div');
      timestamp.className = 'timestamp';
      timestamp.textContent = new Date().toLocaleTimeString();
      fragment.appendChild(timestamp);

      for (const diff of diffs) {
        const container = document.createElement('div');
        container.className = 'diff-container';

        const header = document.createElement('div');
        header.className = 'diff-header';
        header.innerHTML =
          '<span>' + escapeHtml(diff.fileName) + '</span>' +
          '<span class="diff-stats">' +
            '<span class="added">+' + diff.linesAdded + '</span> ' +
            '<span class="removed">-' + diff.linesRemoved + '</span>' +
          '</span>';
        container.appendChild(header);

        const block = document.createElement('div');
        block.className = 'diff-block';
        const pre = document.createElement('pre');
        pre.innerHTML = colorizeDiff(diff.patch);
        block.appendChild(pre);
        container.appendChild(block);

        fragment.appendChild(container);
      }

      output.insertBefore(fragment, output.firstChild);
      statusText.textContent = 'Last diff: ' + new Date().toLocaleTimeString();
    }

    function colorizeDiff(patch) {
      return patch.split('\\n').map(line => {
        if (line.startsWith('+++') || line.startsWith('---')) {
          return ''; // skip file headers
        }
        if (line.startsWith('@@')) {
          return '<span class="line-hunk">' + escapeHtml(line) + '</span>';
        }
        if (line.startsWith('+')) {
          return '<span class="line-added">' + escapeHtml(line) + '</span>';
        }
        if (line.startsWith('-')) {
          return '<span class="line-removed">' + escapeHtml(line) + '</span>';
        }
        return '<span class="line-context">' + escapeHtml(line) + '</span>';
      }).filter(l => l !== '').join('\\n');
    }

    function escapeHtml(text) {
      const div = document.createElement('div');
      div.textContent = text;
      return div.innerHTML;
    }
  </script>
</body>
</html>`;
  }
}

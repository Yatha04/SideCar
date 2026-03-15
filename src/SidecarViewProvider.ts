import * as vscode from 'vscode';

export class SidecarViewProvider implements vscode.WebviewViewProvider {
  static readonly viewId = 'sidecar.panel';

  private _webviewView?: vscode.WebviewView;

  constructor(private readonly _extensionUri: vscode.Uri) {}

  resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken,
  ): void {
    this._webviewView = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this._extensionUri],
    };

    webviewView.webview.html = this._getHtml(webviewView.webview);
  }

  startStream(
    id: string,
    fileNames: string[],
    linesAdded: number,
    linesRemoved: number,
  ): void {
    this._post({ type: 'streamStart', id, fileNames, linesAdded, linesRemoved });
    this._webviewView?.show?.(true);
  }

  streamChunk(id: string, text: string): void {
    this._post({ type: 'streamChunk', id, text });
  }

  streamDone(id: string): void {
    this._post({ type: 'streamDone', id });
  }

  streamError(id: string, message: string): void {
    this._post({ type: 'streamError', id, message });
  }

  private _post(message: unknown): void {
    this._webviewView?.webview.postMessage(message);
  }

  private _getHtml(webview: vscode.Webview): string {
    const webviewJsUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, 'dist', 'webview.js'),
    );

    return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src ${webview.cspSource};">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    * { box-sizing: border-box; }
    body {
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      color: var(--vscode-foreground);
      background-color: var(--vscode-sideBar-background);
      padding: 12px 16px;
      margin: 0;
    }
    h3 { margin: 0 0 6px; }
    .status {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 12px;
    }
    .dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background-color: var(--vscode-testing-iconPassed);
      flex-shrink: 0;
    }
    #status-text { font-size: 0.85em; opacity: 0.8; }

    /* Entry card */
    .entry {
      margin-bottom: 16px;
      border: 1px solid var(--vscode-panel-border);
      border-radius: 6px;
      overflow: hidden;
    }
    .entry-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 6px 10px;
      background-color: var(--vscode-editor-background);
      border-bottom: 1px solid var(--vscode-panel-border);
      font-size: 0.85em;
    }
    .entry-files { font-weight: 600; }
    .entry-stats { opacity: 0.8; }
    .entry-stats .added  { color: var(--vscode-gitDecoration-addedResourceForeground,   #2ea043); }
    .entry-stats .removed{ color: var(--vscode-gitDecoration-deletedResourceForeground, #f85149); }
    .entry-timestamp {
      padding: 4px 10px;
      font-size: 0.75em;
      opacity: 0.5;
      border-top: 1px solid var(--vscode-panel-border);
    }

    /* Entry body */
    .entry-body { padding: 10px 12px; min-height: 40px; }
    .entry-body.loading, .entry-body.streaming { opacity: 0.7; }
    .entry-body.streaming {
      white-space: pre-wrap;
      font-family: var(--vscode-editor-font-family, monospace);
      font-size: 0.9em;
    }
    .entry-body.error { color: var(--vscode-errorForeground, #f85149); font-size: 0.9em; }

    /* Loading dots */
    .dots span { animation: blink 1.2s infinite; opacity: 0; }
    .dots span:nth-child(2) { animation-delay: 0.2s; }
    .dots span:nth-child(3) { animation-delay: 0.4s; }
    @keyframes blink { 0%,100%{opacity:0} 50%{opacity:1} }

    /* Markdown */
    .entry-body h1,.entry-body h2,.entry-body h3 { margin:.8em 0 .4em; font-weight:600; }
    .entry-body h1 { font-size:1.1em; }
    .entry-body h2,.entry-body h3 { font-size:1em; }
    .entry-body p { margin:.5em 0; }
    .entry-body ul,.entry-body ol { margin:.5em 0; padding-left:1.5em; }
    .entry-body li { margin:.2em 0; }
    .entry-body code {
      font-family: var(--vscode-editor-font-family, monospace);
      font-size: 0.9em;
      background-color: var(--vscode-textBlockQuote-background, rgba(127,127,127,.1));
      padding: .1em .4em;
      border-radius: 3px;
    }
    .entry-body pre {
      background-color: var(--vscode-editor-background);
      border: 1px solid var(--vscode-panel-border);
      border-radius: 4px;
      padding: 8px 10px;
      overflow-x: auto;
      margin: .5em 0;
    }
    .entry-body pre code { background:none; padding:0; font-size:.9em; }
    .entry-body blockquote {
      border-left: 3px solid var(--vscode-panel-border);
      margin: .5em 0;
      padding: 0 0 0 1em;
      opacity: .8;
    }
    .entry-body a    { color: var(--vscode-textLink-foreground); }
    .entry-body strong { font-weight: 600; }
    .entry-body hr   { border:none; border-top:1px solid var(--vscode-panel-border); }
  </style>
</head>
<body>
  <h3>Sidecar</h3>
  <div class="status">
    <span class="dot"></span>
    <span id="status-text">Watching for file saves\u2026</span>
  </div>
  <div id="output"></div>
  <script src="${webviewJsUri}"></script>
</body>
</html>`;
  }
}

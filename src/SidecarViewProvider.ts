import * as vscode from 'vscode';
import { UnderstandingLevel } from './ContextAssembler';
import { isValidLevel } from './levelUtils';
import { HistoryEntry } from './HistoryManager';

export interface ReExplainRequest {
  text: string;
  groupId: string;
}

export class SidecarViewProvider implements vscode.WebviewViewProvider {
  static readonly viewId = 'sidecar.panel';

  private _webviewView?: vscode.WebviewView;

  private readonly _onDidChangeLevel = new vscode.EventEmitter<UnderstandingLevel>();
  readonly onDidChangeLevel = this._onDidChangeLevel.event;

  private readonly _onReExplain = new vscode.EventEmitter<ReExplainRequest>();
  readonly onReExplain = this._onReExplain.event;

  private readonly _onHistoryBack = new vscode.EventEmitter<void>();
  readonly onHistoryBack = this._onHistoryBack.event;

  private readonly _onHistoryForward = new vscode.EventEmitter<void>();
  readonly onHistoryForward = this._onHistoryForward.event;

  constructor(
    private readonly _extensionUri: vscode.Uri,
    private _currentLevel: UnderstandingLevel = 'developer',
  ) {}

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

    webviewView.webview.onDidReceiveMessage((msg: unknown) => {
      if (typeof msg !== 'object' || msg === null) { return; }
      const m = msg as Record<string, unknown>;

      switch (m.type) {
        case 'setLevel': {
          const level = m.level;
          if (isValidLevel(level)) {
            this._currentLevel = level;
            this._onDidChangeLevel.fire(level);
          }
          break;
        }
        case 'reExplain': {
          if (typeof m.text === 'string' && typeof m.groupId === 'string') {
            this._onReExplain.fire({ text: m.text, groupId: m.groupId });
          }
          break;
        }
        case 'historyBack':
          this._onHistoryBack.fire();
          break;
        case 'historyForward':
          this._onHistoryForward.fire();
          break;
      }
    });
  }

  setLevel(level: UnderstandingLevel): void {
    this._currentLevel = level;
    this._post({ type: 'setLevel', level });
  }

  startStream(
    groupId: string,
    level: UnderstandingLevel,
    fileNames: string[],
    linesAdded: number,
    linesRemoved: number,
    entryType: string = 'auto',
  ): void {
    this._post({ type: 'streamStart', groupId, level, fileNames, linesAdded, linesRemoved, entryType });
    this._webviewView?.show?.(true);
  }

  streamChunk(groupId: string, level: UnderstandingLevel, text: string): void {
    this._post({ type: 'streamChunk', groupId, level, text });
  }

  streamDone(groupId: string, level: UnderstandingLevel): void {
    this._post({ type: 'streamDone', groupId, level });
  }

  streamError(groupId: string, level: UnderstandingLevel, message: string): void {
    this._post({ type: 'streamError', groupId, level, message });
  }

  updateHistoryPosition(label: string, canBack: boolean, canForward: boolean): void {
    this._post({ type: 'historyPosition', label, canBack, canForward });
  }

  showHistoryEntry(entry: HistoryEntry, level: UnderstandingLevel, positionLabel: string, canBack: boolean, canForward: boolean): void {
    // Serialize the content Map to a plain object
    const contentObj: Record<string, string> = {};
    for (const [k, v] of entry.content) {
      contentObj[k] = v;
    }
    this._post({
      type: 'showEntry',
      groupId: entry.groupId,
      fileNames: entry.fileNames,
      linesAdded: entry.linesAdded,
      linesRemoved: entry.linesRemoved,
      entryType: entry.type,
      selectionFileName: entry.selectionFileName,
      content: contentObj,
      level,
      positionLabel,
      canBack,
      canForward,
    });
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
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src ${webview.cspSource} 'unsafe-inline';">
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

    /* Level toggle */
    .level-toggle {
      display: flex;
      margin-bottom: 8px;
      border: 1px solid var(--vscode-panel-border);
      border-radius: 4px;
      overflow: hidden;
    }
    .level-btn {
      flex: 1;
      padding: 4px 8px;
      font-size: 0.8em;
      font-family: var(--vscode-font-family);
      border: none;
      border-right: 1px solid var(--vscode-panel-border);
      background: transparent;
      color: var(--vscode-foreground);
      cursor: pointer;
      opacity: 0.7;
      transition: opacity 0.15s, background-color 0.15s;
    }
    .level-btn:last-child { border-right: none; }
    .level-btn:hover { opacity: 1; background: var(--vscode-list-hoverBackground); }
    .level-btn.active {
      opacity: 1;
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
    }

    /* History nav */
    .history-nav {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      margin-bottom: 12px;
      font-size: 0.8em;
    }
    .history-nav button {
      background: transparent;
      border: 1px solid var(--vscode-panel-border);
      border-radius: 3px;
      color: var(--vscode-foreground);
      cursor: pointer;
      padding: 2px 8px;
      font-family: var(--vscode-font-family);
      font-size: 1em;
    }
    .history-nav button:hover:not(:disabled) {
      background: var(--vscode-list-hoverBackground);
    }
    .history-nav button:disabled {
      opacity: 0.3;
      cursor: default;
    }
    #history-label { opacity: 0.7; min-width: 40px; text-align: center; }

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
    .entry-type-badge {
      font-size: 0.75em;
      opacity: 0.6;
      padding: 1px 5px;
      border: 1px solid var(--vscode-panel-border);
      border-radius: 3px;
      margin-left: 6px;
    }
    .entry-timestamp {
      padding: 4px 10px;
      font-size: 0.75em;
      opacity: 0.5;
      border-top: 1px solid var(--vscode-panel-border);
    }

    /* Entry body */
    .entry-body { padding: 10px 12px; min-height: 40px; display: none; }
    .entry-body.visible { display: block; }
    .entry-body.loading, .entry-body.streaming { opacity: 0.7; }
    .entry-body.streaming {
      white-space: pre-wrap;
      font-family: var(--vscode-editor-font-family, monospace);
      font-size: 0.9em;
    }
    .entry-body.error { color: var(--vscode-errorForeground, #f85149); font-size: 0.9em; }
    .entry-body.pending { opacity: 0.5; font-size: 0.85em; font-style: italic; }

    /* Re-explain button */
    #reexplain-btn {
      display: none;
      position: fixed;
      z-index: 100;
      padding: 4px 10px;
      font-size: 0.8em;
      font-family: var(--vscode-font-family);
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      border: none;
      border-radius: 4px;
      cursor: pointer;
      box-shadow: 0 2px 6px rgba(0,0,0,0.3);
    }
    #reexplain-btn:hover {
      background: var(--vscode-button-hoverBackground);
    }

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
    .entry-body a:hover { color: var(--vscode-textLink-activeForeground, var(--vscode-textLink-foreground)); }
    .entry-body strong { font-weight: 600; }
    .entry-body hr   { border:none; border-top:1px solid var(--vscode-panel-border); }

    /* Tables */
    .entry-body table {
      border-collapse: collapse;
      width: 100%;
      margin: .5em 0;
      font-size: 0.9em;
    }
    .entry-body th, .entry-body td {
      border: 1px solid var(--vscode-panel-border);
      padding: 4px 8px;
      text-align: left;
    }
    .entry-body th {
      background-color: var(--vscode-editor-background);
      font-weight: 600;
    }
    .entry-body tr:hover {
      background-color: var(--vscode-list-hoverBackground);
    }

    /* Scrollbar */
    ::-webkit-scrollbar { width: 6px; height: 6px; }
    ::-webkit-scrollbar-track { background: transparent; }
    ::-webkit-scrollbar-thumb {
      background: var(--vscode-scrollbarSlider-background, rgba(100,100,100,0.4));
      border-radius: 3px;
    }
    ::-webkit-scrollbar-thumb:hover {
      background: var(--vscode-scrollbarSlider-hoverBackground, rgba(100,100,100,0.7));
    }
    ::-webkit-scrollbar-thumb:active {
      background: var(--vscode-scrollbarSlider-activeBackground, rgba(100,100,100,0.9));
    }

    /* Focus outlines for accessibility */
    button:focus-visible {
      outline: 1px solid var(--vscode-focusBorder);
      outline-offset: -1px;
    }

    /* Selection highlight */
    ::selection {
      background-color: var(--vscode-editor-selectionBackground, rgba(38,79,120,0.5));
    }
  </style>
</head>
<body>
  <h3>Sidecar</h3>
  <div class="status">
    <span class="dot"></span>
    <span id="status-text">Watching for file saves\u2026</span>
  </div>
  <div class="level-toggle" id="level-toggle">
    <button class="level-btn" data-level="architecture">Architecture</button>
    <button class="level-btn" data-level="developer">Developer</button>
    <button class="level-btn" data-level="syntax">Syntax</button>
  </div>
  <div class="history-nav">
    <button id="history-back" disabled>&larr;</button>
    <span id="history-label">0 / 0</span>
    <button id="history-forward" disabled>&rarr;</button>
  </div>
  <div id="output"></div>
  <button id="reexplain-btn">Re-explain this</button>
  <script>window.__sidecarInitialLevel = "${this._currentLevel}";</script>
  <script src="${webviewJsUri}"></script>
</body>
</html>`;
  }
}

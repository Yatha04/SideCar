import * as vscode from 'vscode';
import { UnderstandingLevel } from './ContextAssembler';
import { isValidLevel } from './levelUtils';
import { HistoryEntry } from './HistoryManager';

export interface ReExplainRequest {
  text: string;
  groupId: string;
}

export class LumenViewProvider implements vscode.WebviewViewProvider {
  static readonly viewId = 'lumen.panel';

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
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; script-src ${webview.cspSource} 'unsafe-inline';">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
  <style>
    :root {
      --lumen-accent: #6d28d9; /* Deep glowing purple/blue */
      --lumen-accent-hover: #8b5cf6;
      --lumen-accent-glow: rgba(139, 92, 246, 0.4);
      --lumen-bg-glass: rgba(30, 30, 36, 0.6);
      --lumen-border-glass: rgba(255, 255, 255, 0.08);
      --lumen-text: #e2e8f0;
      --lumen-text-muted: #94a3b8;
    }
    * { box-sizing: border-box; }
    body {
      font-family: 'Inter', var(--vscode-font-family), sans-serif;
      font-size: var(--vscode-font-size);
      color: var(--lumen-text);
      background-color: var(--vscode-sideBar-background);
      background-image: radial-gradient(circle at top right, rgba(139, 92, 246, 0.1), transparent 300px);
      background-attachment: fixed;
      padding: 16px;
      margin: 0;
      line-height: 1.5;
    }
    h3 {
      margin: 0 0 16px;
      font-weight: 600;
      font-size: 1.25em;
      letter-spacing: -0.02em;
      background: linear-gradient(135deg, #fff, #a78bfa);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      display: inline-block;
    }
    .status {
      display: flex;
      align-items: center;
      gap: 10px;
      margin-bottom: 20px;
      padding: 10px 14px;
      background: var(--lumen-bg-glass);
      backdrop-filter: blur(12px);
      border: 1px solid var(--lumen-border-glass);
      border-radius: 8px;
      box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1);
    }
    .dot {
      width: 10px;
      height: 10px;
      border-radius: 50%;
      background-color: #10b981;
      box-shadow: 0 0 8px rgba(16, 185, 129, 0.6);
      flex-shrink: 0;
    }
    #status-text { font-size: 0.9em; font-weight: 500; color: var(--lumen-text); }

    /* Level toggle */
    .level-toggle {
      display: flex;
      margin-bottom: 16px;
      background: var(--lumen-bg-glass);
      backdrop-filter: blur(8px);
      border: 1px solid var(--lumen-border-glass);
      border-radius: 8px;
      padding: 4px;
      gap: 4px;
    }
    .level-btn {
      flex: 1;
      padding: 6px 12px;
      font-size: 0.85em;
      font-family: inherit;
      font-weight: 500;
      border: none;
      border-radius: 6px;
      background: transparent;
      color: var(--lumen-text-muted);
      cursor: pointer;
      transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    }
    .level-btn:hover {
      color: var(--lumen-text);
      background: rgba(255, 255, 255, 0.05);
    }
    .level-btn.active {
      color: #fff;
      background: var(--lumen-accent);
      box-shadow: 0 0 12px var(--lumen-accent-glow);
    }

    /* History nav */
    .history-nav {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 16px;
      padding: 8px 12px;
      background: var(--lumen-bg-glass);
      backdrop-filter: blur(8px);
      border: 1px solid var(--lumen-border-glass);
      border-radius: 8px;
      font-size: 0.85em;
      font-weight: 500;
    }
    .history-nav button {
      background: rgba(255,255,255,0.05);
      border: 1px solid var(--lumen-border-glass);
      border-radius: 6px;
      color: var(--lumen-text);
      cursor: pointer;
      padding: 4px 12px;
      font-family: inherit;
      transition: all 0.2s;
    }
    .history-nav button:hover:not(:disabled) {
      background: rgba(255,255,255,0.1);
      border-color: rgba(255,255,255,0.2);
    }
    .history-nav button:disabled {
      opacity: 0.3;
      cursor: not-allowed;
    }
    #history-label { color: var(--lumen-text-muted); }

    /* Entry card */
    .entry {
      margin-bottom: 20px;
      background: var(--lumen-bg-glass);
      backdrop-filter: blur(12px);
      border: 1px solid var(--lumen-border-glass);
      border-radius: 12px;
      box-shadow: 0 8px 16px -4px rgba(0,0,0,0.2);
      overflow: hidden;
      animation: slideIn 0.4s cubic-bezier(0.16, 1, 0.3, 1);
    }
    @keyframes slideIn {
      from { opacity: 0; transform: translateY(10px); }
      to { opacity: 1; transform: translateY(0); }
    }
    .entry-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 10px 14px;
      background: rgba(0,0,0,0.2);
      border-bottom: 1px solid var(--lumen-border-glass);
      font-size: 0.85em;
    }
    .entry-files { font-weight: 600; color: #fff; }
    .entry-stats { display: flex; gap: 8px; font-weight: 500; }
    .entry-stats .added  { color: #34d399; }
    .entry-stats .removed{ color: #f87171; }
    .entry-type-badge {
      font-size: 0.75em;
      font-weight: 600;
      color: var(--lumen-accent-hover);
      background: rgba(139, 92, 246, 0.15);
      padding: 2px 6px;
      border-radius: 4px;
      margin-left: 8px;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    .entry-timestamp {
      padding: 8px 14px;
      font-size: 0.75em;
      color: var(--lumen-text-muted);
      border-top: 1px solid var(--lumen-border-glass);
      background: rgba(0,0,0,0.1);
    }

    /* Entry body */
    .entry-body { padding: 16px 14px; display: none; }
    .entry-body.visible { display: block; animation: fadeIn 0.3s ease; }
    @keyframes fadeIn {
      from { opacity: 0; }
      to { opacity: 1; }
    }
    .entry-body.loading, .entry-body.streaming { opacity: 0.9; }
    .entry-body.streaming {
      white-space: pre-wrap;
      font-family: var(--vscode-editor-font-family, monospace);
      font-size: 0.9em;
      line-height: 1.6;
    }
    .entry-body.error { color: #f87171; background: rgba(248, 113, 113, 0.1); border-radius: 6px; padding: 12px; }
    .entry-body.pending { color: var(--lumen-text-muted); font-style: italic; text-align: center; padding: 20px 0; }

    /* Re-explain button */
    #reexplain-btn {
      display: none;
      position: fixed;
      z-index: 100;
      padding: 6px 12px;
      font-size: 0.85em;
      font-weight: 500;
      font-family: inherit;
      background: var(--lumen-accent);
      color: #fff;
      border: 1px solid rgba(255,255,255,0.1);
      border-radius: 6px;
      cursor: pointer;
      box-shadow: 0 4px 12px rgba(0,0,0,0.3), 0 0 0 1px var(--lumen-border-glass) inset;
      transition: all 0.2s;
    }
    #reexplain-btn:hover {
      background: var(--lumen-accent-hover);
      box-shadow: 0 4px 16px var(--lumen-accent-glow);
    }

    /* Loading dots */
    .dots span { animation: blink 1.4s infinite both; font-weight: bold; font-size: 1.2em; color: var(--lumen-accent-hover); margin: 0 1px; }
    .dots span:nth-child(2) { animation-delay: 0.2s; }
    .dots span:nth-child(3) { animation-delay: 0.4s; }
    @keyframes blink { 0%, 100% { opacity: 0.2; transform: scale(0.8); } 50% { opacity: 1; transform: scale(1.1); } }

    /* Markdown modern styling */
    .entry-body h1, .entry-body h2, .entry-body h3 {
      margin: 1em 0 0.5em;
      color: #fff;
      font-weight: 600;
      line-height: 1.3;
    }
    .entry-body h1 { font-size: 1.25em; border-bottom: 1px solid var(--lumen-border-glass); padding-bottom: 0.3em; }
    .entry-body h2 { font-size: 1.1em; }
    .entry-body h3 { font-size: 1em; }
    .entry-body p { margin: 0.7em 0; }
    .entry-body ul, .entry-body ol { margin: 0.7em 0; padding-left: 1.5em; }
    .entry-body li { margin: 0.3em 0; }
    .entry-body code {
      font-family: var(--vscode-editor-font-family, monospace);
      font-size: 0.85em;
      color: #a78bfa;
      background-color: rgba(139, 92, 246, 0.1);
      padding: 0.2em 0.4em;
      border-radius: 4px;
      border: 1px solid rgba(139, 92, 246, 0.2);
    }
    .entry-body pre {
      background-color: rgba(0, 0, 0, 0.3);
      border: 1px solid var(--lumen-border-glass);
      border-radius: 8px;
      padding: 12px;
      overflow-x: auto;
      margin: 1em 0;
      box-shadow: inset 0 2px 4px rgba(0,0,0,0.2);
    }
    .entry-body pre code { background: none; padding: 0; color: #e2e8f0; border: none; font-size: 0.85em; }
    .entry-body blockquote {
      border-left: 3px solid var(--lumen-accent);
      margin: 1em 0;
      padding: 0.5em 0 0.5em 1em;
      color: var(--lumen-text-muted);
      background: linear-gradient(90deg, rgba(139,92,246,0.1) 0%, transparent 100%);
      border-radius: 0 6px 6px 0;
    }
    .entry-body a { color: #60a5fa; text-decoration: none; border-bottom: 1px solid transparent; transition: border-color 0.2s; }
    .entry-body a:hover { color: #93c5fd; border-bottom-color: #93c5fd; }
    .entry-body strong { color: #fff; font-weight: 600; }
    .entry-body hr { border: none; border-top: 1px solid var(--lumen-border-glass); margin: 1.5em 0; }

    /* Tables */
    .entry-body table {
      border-collapse: separate;
      border-spacing: 0;
      width: 100%;
      margin: 1em 0;
      border-radius: 8px;
      overflow: hidden;
      border: 1px solid var(--lumen-border-glass);
    }
    .entry-body th, .entry-body td {
      border-bottom: 1px solid var(--lumen-border-glass);
      border-right: 1px solid var(--lumen-border-glass);
      padding: 8px 12px;
      text-align: left;
    }
    .entry-body th:last-child, .entry-body td:last-child { border-right: none; }
    .entry-body tr:last-child td { border-bottom: none; }
    .entry-body th {
      background-color: rgba(255,255,255,0.05);
      font-weight: 600;
      color: #fff;
    }
    .entry-body tr:hover td { background-color: rgba(255,255,255,0.02); }

    /* Custom Scrollbar */
    ::-webkit-scrollbar { width: 8px; height: 8px; }
    ::-webkit-scrollbar-track { background: transparent; }
    ::-webkit-scrollbar-thumb {
      background: rgba(255,255,255,0.1);
      border-radius: 4px;
      border: 2px solid var(--vscode-sideBar-background);
    }
    ::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.2); }

    ::selection { background-color: rgba(139, 92, 246, 0.4); color: #fff; }
  </style>
</head>
<body>
  <h3>Lumen</h3>
  <div class="status">
    <span class="dot"></span>
    <span id="status-text">Watching for file saves&hellip;</span>
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
  <script>window.__lumenInitialLevel = "${this._currentLevel}";</script>
  <script src="${webviewJsUri}"></script>
</body>
</html>`;
  }
}

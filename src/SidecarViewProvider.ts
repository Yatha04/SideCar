import * as vscode from 'vscode';

export class SidecarViewProvider implements vscode.WebviewViewProvider {
  static readonly viewId = 'sidecar.panel';

  constructor(private readonly _extensionUri: vscode.Uri) {}

  resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ): void {
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this._extensionUri],
    };

    webviewView.webview.html = this._getHtml();
  }

  private _getHtml(): string {
    return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline';">
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
  </style>
</head>
<body>
  <h3>Sidecar</h3>
  <div class="status">
    <span class="dot"></span>
    <span>Sidecar is ready.</span>
  </div>
</body>
</html>`;
  }
}

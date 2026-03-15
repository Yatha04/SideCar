import * as vscode from 'vscode';
import { SidecarViewProvider } from './SidecarViewProvider';
import { FileWatcher } from './FileWatcher';

export function activate(context: vscode.ExtensionContext) {
  const provider = new SidecarViewProvider(context.extensionUri);

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(SidecarViewProvider.viewId, provider)
  );

  // Phase 1: File Watcher + Diff
  const fileWatcher = new FileWatcher({
    onDiffs: (diffs) => {
      provider.showDiffs(diffs);
    },
    onSkipped: (uri, reason) => {
      const fileName = uri.split('/').pop() ?? uri;
      console.log(`[Sidecar] Skipped ${fileName}: ${reason}`);
    },
  });

  context.subscriptions.push(fileWatcher);

  // Stub commands for future phases
  context.subscriptions.push(
    vscode.commands.registerCommand('sidecar.explainSelection', () => {
      vscode.window.showInformationMessage('Sidecar: Explain Selection coming in Phase 4.');
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('sidecar.explainLastDiff', () => {
      vscode.window.showInformationMessage('Sidecar: Explain Last Diff coming in Phase 2.');
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('sidecar.toggleLevel', () => {
      vscode.window.showInformationMessage('Sidecar: Toggle Understanding Level coming in Phase 3.');
    })
  );
}

export function deactivate() {}

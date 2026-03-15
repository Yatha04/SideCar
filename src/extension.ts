import * as vscode from 'vscode';
import { SidecarViewProvider } from './SidecarViewProvider';

export function activate(context: vscode.ExtensionContext) {
  const provider = new SidecarViewProvider(context.extensionUri);

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(SidecarViewProvider.viewId, provider)
  );

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

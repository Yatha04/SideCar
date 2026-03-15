import * as vscode from 'vscode';
import { SidecarViewProvider } from './SidecarViewProvider';
import { FileWatcher } from './FileWatcher';
import { LLMClient } from './LLMClient';
import { DiffResult } from './DiffEngine';
import { UnderstandingLevel } from './ContextAssembler';

export function activate(context: vscode.ExtensionContext) {
  const provider = new SidecarViewProvider(context.extensionUri);
  const llmClient = new LLMClient();
  let lastDiffs: DiffResult[] = [];

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(SidecarViewProvider.viewId, provider),
  );

  async function runExplain(diffs: DiffResult[]): Promise<void> {
    const level = context.globalState.get<UnderstandingLevel>('sidecar.level', 'developer');
    const id = Date.now().toString();
    const totalAdded = diffs.reduce((s, d) => s + d.linesAdded, 0);
    const totalRemoved = diffs.reduce((s, d) => s + d.linesRemoved, 0);
    const fileNames = diffs.map(d => d.fileName);

    provider.startStream(id, fileNames, totalAdded, totalRemoved);

    await llmClient.explainDiffs(
      diffs,
      level,
      (chunk) => provider.streamChunk(id, chunk),
      () => provider.streamDone(id),
      (err) => provider.streamError(id, err.message),
    );
  }

  const fileWatcher = new FileWatcher({
    onDiffs: (diffs) => {
      lastDiffs = diffs;
      void runExplain(diffs);
    },
    onSkipped: (uri, reason) => {
      const fileName = uri.split('/').pop() ?? uri;
      console.log(`[Sidecar] Skipped ${fileName}: ${reason}`);
    },
  });

  context.subscriptions.push(fileWatcher);

  context.subscriptions.push(
    vscode.commands.registerCommand('sidecar.explainSelection', () => {
      vscode.window.showInformationMessage('Sidecar: Explain Selection coming in Phase 4.');
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('sidecar.explainLastDiff', () => {
      if (lastDiffs.length === 0) {
        vscode.window.showInformationMessage('Sidecar: No diff yet. Save a file first.');
        return;
      }
      void runExplain(lastDiffs);
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('sidecar.toggleLevel', () => {
      vscode.window.showInformationMessage('Sidecar: Toggle Level coming in Phase 3.');
    }),
  );
}

export function deactivate() {}

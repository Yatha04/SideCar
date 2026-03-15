import * as vscode from 'vscode';
import { SidecarViewProvider } from './SidecarViewProvider';
import { FileWatcher } from './FileWatcher';
import { LLMClient } from './LLMClient';
import { DiffResult } from './DiffEngine';
import { UnderstandingLevel } from './ContextAssembler';
import { nextLevel } from './levelUtils';

function getDefaultLevel(): UnderstandingLevel {
  return vscode.workspace
    .getConfiguration('sidecar')
    .get<UnderstandingLevel>('defaultLevel', 'developer');
}

export function activate(context: vscode.ExtensionContext) {
  const initialLevel = context.globalState.get<UnderstandingLevel>(
    'sidecar.level',
    getDefaultLevel(),
  );
  const provider = new SidecarViewProvider(context.extensionUri, initialLevel);
  const llmClient = new LLMClient();
  let lastDiffs: DiffResult[] = [];

  // Track which groupId+level combos have been generated or are in-flight
  const generated = new Set<string>();

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(SidecarViewProvider.viewId, provider),
  );

  async function runExplainForLevel(
    groupId: string,
    diffs: DiffResult[],
    level: UnderstandingLevel,
  ): Promise<void> {
    const key = `${groupId}:${level}`;
    if (generated.has(key)) { return; }
    generated.add(key);

    const totalAdded = diffs.reduce((s, d) => s + d.linesAdded, 0);
    const totalRemoved = diffs.reduce((s, d) => s + d.linesRemoved, 0);
    const fileNames = diffs.map(d => d.fileName);

    provider.startStream(groupId, level, fileNames, totalAdded, totalRemoved);

    await llmClient.explainDiffs(
      diffs,
      level,
      (chunk) => provider.streamChunk(groupId, level, chunk),
      () => provider.streamDone(groupId, level),
      (err) => provider.streamError(groupId, level, err.message),
    );
  }

  // Track the most recent groupId so level toggles know what to generate
  let latestGroupId = '';
  let latestGroupDiffs: DiffResult[] = [];

  function getCurrentLevel(): UnderstandingLevel {
    return context.globalState.get<UnderstandingLevel>('sidecar.level', getDefaultLevel());
  }

  async function runExplain(diffs: DiffResult[]): Promise<void> {
    const groupId = Date.now().toString();
    latestGroupId = groupId;
    latestGroupDiffs = diffs;
    const level = getCurrentLevel();
    await runExplainForLevel(groupId, diffs, level);
  }

  // When level changes (from webview or command), generate if not already done
  function onLevelChanged(level: UnderstandingLevel): void {
    context.globalState.update('sidecar.level', level);
    if (latestGroupId && latestGroupDiffs.length > 0) {
      void runExplainForLevel(latestGroupId, latestGroupDiffs, level);
    }
  }

  context.subscriptions.push(
    provider.onDidChangeLevel((level) => {
      onLevelChanged(level);
    }),
  );

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
      const current = getCurrentLevel();
      const next = nextLevel(current);
      provider.setLevel(next);
      onLevelChanged(next);
      vscode.window.showInformationMessage(`Sidecar: Level set to ${next}`);
    }),
  );
}

export function deactivate() {}

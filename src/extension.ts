import * as vscode from 'vscode';
import { SidecarViewProvider } from './SidecarViewProvider';
import { FileWatcher } from './FileWatcher';
import { LLMClient } from './LLMClient';
import { DiffResult } from './DiffEngine';
import { UnderstandingLevel } from './ContextAssembler';
import { nextLevel } from './levelUtils';
import { HistoryManager, EntryType } from './HistoryManager';

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
  const history = new HistoryManager();
  const output = vscode.window.createOutputChannel('Sidecar');
  let lastDiffs: DiffResult[] = [];

  // Track which groupId+level combos have been generated or are in-flight
  const generated = new Set<string>();
  // Track accumulated text per groupId+level for storing in history
  const streamBuffers = new Map<string, string>();

  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;

  const fileWatcher = new FileWatcher({
    onDiffs: (diffs) => {
      lastDiffs = diffs;
      void runExplain(diffs).catch((err) => {
        output.appendLine(`[Error] Unhandled error in runExplain: ${err}`);
      });
    },
    onSkipped: (uri, reason) => {
      const fileName = uri.split('/').pop() ?? uri;
      output.appendLine(`[Skip] ${fileName}: ${reason}`);
    },
  }, workspaceRoot);

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(SidecarViewProvider.viewId, provider),
    fileWatcher,
    output,
  );

  function getCurrentLevel(): UnderstandingLevel {
    return context.globalState.get<UnderstandingLevel>('sidecar.level', getDefaultLevel());
  }

  function sendHistoryPosition(): void {
    provider.updateHistoryPosition(
      history.positionLabel(),
      history.canGoBack(),
      history.canGoForward(),
    );
  }

  async function runExplainForLevel(
    groupId: string,
    diffs: DiffResult[],
    level: UnderstandingLevel,
    entryType: EntryType,
  ): Promise<void> {
    const key = `${groupId}:${level}`;
    if (generated.has(key)) { return; }
    generated.add(key);
    streamBuffers.set(key, '');

    const totalAdded = diffs.reduce((s, d) => s + d.linesAdded, 0);
    const totalRemoved = diffs.reduce((s, d) => s + d.linesRemoved, 0);
    const fileNames = diffs.map(d => d.fileName);

    provider.startStream(groupId, level, fileNames, totalAdded, totalRemoved, entryType);

    await llmClient.explainDiffs(
      diffs,
      level,
      (chunk) => {
        streamBuffers.set(key, (streamBuffers.get(key) ?? '') + chunk);
        provider.streamChunk(groupId, level, chunk);
      },
      () => {
        history.updateContent(groupId, level, streamBuffers.get(key) ?? '');
        streamBuffers.delete(key);
        provider.streamDone(groupId, level);
        // Update cache AFTER explanation so next diff is scoped to "since last explanation"
        fileWatcher.updateCacheAfterExplain(diffs.map(d => d.uri));
      },
      (err) => {
        streamBuffers.delete(key);
        provider.streamError(groupId, level, err.message);
      },
    );
  }

  async function runSelectionForLevel(
    groupId: string,
    selectedText: string,
    fileName: string,
    level: UnderstandingLevel,
  ): Promise<void> {
    const key = `${groupId}:${level}`;
    if (generated.has(key)) { return; }
    generated.add(key);
    streamBuffers.set(key, '');

    provider.startStream(groupId, level, [fileName], 0, 0, 'on-demand');

    await llmClient.explainSelection(
      selectedText,
      fileName,
      level,
      (chunk) => {
        streamBuffers.set(key, (streamBuffers.get(key) ?? '') + chunk);
        provider.streamChunk(groupId, level, chunk);
      },
      () => {
        history.updateContent(groupId, level, streamBuffers.get(key) ?? '');
        streamBuffers.delete(key);
        provider.streamDone(groupId, level);
      },
      (err) => {
        streamBuffers.delete(key);
        provider.streamError(groupId, level, err.message);
      },
    );
  }

  async function runReExplainForLevel(
    groupId: string,
    selectedText: string,
    originalDiffs: DiffResult[] | undefined,
    originalSelectionText: string | undefined,
    level: UnderstandingLevel,
  ): Promise<void> {
    const key = `${groupId}:${level}`;
    if (generated.has(key)) { return; }
    generated.add(key);
    streamBuffers.set(key, '');

    const fileNames = originalDiffs?.map(d => d.fileName) ?? ['re-explain'];
    provider.startStream(groupId, level, fileNames, 0, 0, 're-explain');

    await llmClient.reExplain(
      selectedText,
      originalDiffs,
      originalSelectionText,
      level,
      (chunk) => {
        streamBuffers.set(key, (streamBuffers.get(key) ?? '') + chunk);
        provider.streamChunk(groupId, level, chunk);
      },
      () => {
        history.updateContent(groupId, level, streamBuffers.get(key) ?? '');
        streamBuffers.delete(key);
        provider.streamDone(groupId, level);
      },
      (err) => {
        streamBuffers.delete(key);
        provider.streamError(groupId, level, err.message);
      },
    );
  }

  // Track the most recent group for lazy level generation
  let latestGroupId = '';
  let latestGroupDiffs: DiffResult[] | undefined;
  let latestGroupSelectionText: string | undefined;
  let latestGroupFileName: string | undefined;
  let latestGroupType: EntryType = 'auto';
  let latestGroupOriginalDiffs: DiffResult[] | undefined;
  let latestGroupOriginalSelectionText: string | undefined;

  async function runExplain(diffs: DiffResult[], entryType: EntryType = 'auto'): Promise<void> {
    const groupId = Date.now().toString();
    const level = getCurrentLevel();
    const totalAdded = diffs.reduce((s, d) => s + d.linesAdded, 0);
    const totalRemoved = diffs.reduce((s, d) => s + d.linesRemoved, 0);
    const fileNames = diffs.map(d => d.fileName);

    latestGroupId = groupId;
    latestGroupDiffs = diffs;
    latestGroupSelectionText = undefined;
    latestGroupFileName = undefined;
    latestGroupType = entryType;
    latestGroupOriginalDiffs = undefined;
    latestGroupOriginalSelectionText = undefined;

    history.push({
      groupId,
      timestamp: Date.now(),
      type: entryType,
      fileNames,
      linesAdded: totalAdded,
      linesRemoved: totalRemoved,
      diffs,
      content: new Map(),
    });
    sendHistoryPosition();

    await runExplainForLevel(groupId, diffs, level, entryType);
  }

  function onLevelChanged(level: UnderstandingLevel): void {
    context.globalState.update('sidecar.level', level);
    if (!latestGroupId) { return; }

    if (latestGroupDiffs) {
      void runExplainForLevel(latestGroupId, latestGroupDiffs, level, latestGroupType);
    } else if (latestGroupSelectionText && latestGroupFileName) {
      void runSelectionForLevel(latestGroupId, latestGroupSelectionText, latestGroupFileName, level);
    } else if (latestGroupType === 're-explain' && latestGroupSelectionText) {
      void runReExplainForLevel(
        latestGroupId,
        latestGroupSelectionText,
        latestGroupOriginalDiffs,
        latestGroupOriginalSelectionText,
        level,
      );
    }
  }

  // --- Event subscriptions ---

  context.subscriptions.push(
    provider.onDidChangeLevel((level) => {
      onLevelChanged(level);
    }),
  );

  context.subscriptions.push(
    provider.onHistoryBack(() => {
      const entry = history.goBack();
      if (entry) {
        provider.showHistoryEntry(
          entry, getCurrentLevel(), history.positionLabel(),
          history.canGoBack(), history.canGoForward(),
        );
      }
    }),
  );

  context.subscriptions.push(
    provider.onHistoryForward(() => {
      const entry = history.goForward();
      if (entry) {
        provider.showHistoryEntry(
          entry, getCurrentLevel(), history.positionLabel(),
          history.canGoBack(), history.canGoForward(),
        );
      }
    }),
  );

  context.subscriptions.push(
    provider.onReExplain(({ text, groupId: originalGroupId }) => {
      const originalEntry = history.getByGroupId(originalGroupId);
      const groupId = Date.now().toString();
      const level = getCurrentLevel();
      const fileNames = originalEntry?.fileNames ?? ['re-explain'];

      latestGroupId = groupId;
      latestGroupDiffs = undefined;
      latestGroupSelectionText = text;
      latestGroupFileName = undefined;
      latestGroupType = 're-explain';
      latestGroupOriginalDiffs = originalEntry?.diffs;
      latestGroupOriginalSelectionText = originalEntry?.selectionText;

      history.push({
        groupId,
        timestamp: Date.now(),
        type: 're-explain',
        fileNames,
        linesAdded: 0,
        linesRemoved: 0,
        diffs: originalEntry?.diffs,
        selectionText: text,
        content: new Map(),
      });
      sendHistoryPosition();

      void runReExplainForLevel(
        groupId, text,
        originalEntry?.diffs, originalEntry?.selectionText,
        level,
      );
    }),
  );

  // --- Commands ---

  context.subscriptions.push(
    vscode.commands.registerCommand('sidecar.explainSelection', () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor || editor.selection.isEmpty) {
        vscode.window.showInformationMessage('Sidecar: Select some code first.');
        return;
      }

      const selectedText = editor.document.getText(editor.selection);
      const fileName = editor.document.fileName.split(/[/\\]/).pop() ?? 'unknown';
      const groupId = Date.now().toString();
      const level = getCurrentLevel();

      latestGroupId = groupId;
      latestGroupDiffs = undefined;
      latestGroupSelectionText = selectedText;
      latestGroupFileName = fileName;
      latestGroupType = 'on-demand';
      latestGroupOriginalDiffs = undefined;
      latestGroupOriginalSelectionText = undefined;

      history.push({
        groupId,
        timestamp: Date.now(),
        type: 'on-demand',
        fileNames: [fileName],
        linesAdded: 0,
        linesRemoved: 0,
        selectionText: selectedText,
        selectionFileName: fileName,
        content: new Map(),
      });
      sendHistoryPosition();

      void runSelectionForLevel(groupId, selectedText, fileName, level);
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('sidecar.explainLastDiff', () => {
      if (lastDiffs.length === 0) {
        vscode.window.showInformationMessage('Sidecar: No diff yet. Save a file first.');
        return;
      }
      void runExplain(lastDiffs, 'on-demand');
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

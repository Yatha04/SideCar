import Anthropic from '@anthropic-ai/sdk';
import * as vscode from 'vscode';
import { ContextAssembler, UnderstandingLevel } from './ContextAssembler';
import { DiffResult } from './DiffEngine';

const SYSTEM_PROMPTS: Record<UnderstandingLevel, string> = {
  developer:
    'You are Sidecar, a code explanation assistant embedded in VS Code. ' +
    'An AI coding agent just saved the changes shown. Explain concisely what changed ' +
    'and why, focusing on technical implementation details. Be direct. Use markdown.',

  architecture:
    'You are Sidecar, a code explanation assistant embedded in VS Code. ' +
    'An AI coding agent just saved the changes shown. Explain the architectural ' +
    'significance: what patterns are used, how this fits into the broader system, ' +
    'and what the long-term implications are. Use markdown.',

  syntax:
    'You are Sidecar, a code explanation assistant embedded in VS Code. ' +
    'An AI coding agent just saved the changes shown. Explain each change line by line ' +
    'in plain language, as if teaching a beginner. Define any technical terms. Use markdown.',
};

export class LLMClient {
  private readonly _assembler = new ContextAssembler();

  async explainDiffs(
    diffs: DiffResult[],
    level: UnderstandingLevel,
    onChunk: (text: string) => void,
    onDone: () => void,
    onError: (err: Error) => void,
  ): Promise<void> {
    const config = vscode.workspace.getConfiguration('sidecar');
    const apiKey = config.get<string>('anthropicApiKey', '');

    if (!apiKey) {
      onError(
        new Error(
          'No Anthropic API key configured. Set sidecar.anthropicApiKey in VS Code settings.',
        ),
      );
      return;
    }

    const model = config.get<string>('model', 'claude-opus-4-6');
    const client = new Anthropic({ apiKey });
    const userContent = this._assembler.assemble(diffs, level);

    try {
      const stream = client.messages.stream({
        model,
        max_tokens: 1024,
        system: SYSTEM_PROMPTS[level],
        messages: [{ role: 'user', content: userContent }],
      });

      for await (const event of stream) {
        if (
          event.type === 'content_block_delta' &&
          event.delta.type === 'text_delta'
        ) {
          onChunk(event.delta.text);
        }
      }

      onDone();
    } catch (err) {
      onError(err instanceof Error ? err : new Error(String(err)));
    }
  }
}

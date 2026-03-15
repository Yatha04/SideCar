import Anthropic from '@anthropic-ai/sdk';
import * as vscode from 'vscode';
import { ContextAssembler, UnderstandingLevel } from './ContextAssembler';
import { DiffResult } from './DiffEngine';

const PREAMBLE =
  'You are Lumen, a code explanation assistant embedded in a VS Code side panel. ' +
  'An AI coding agent just saved changes. Your job is to help the developer understand what happened.\n\n' +
  'Formatting rules:\n' +
  '- Use markdown. Keep it scannable: short paragraphs, bullet lists, inline `code` for identifiers.\n' +
  '- Start with a bold one-line **Summary**, then a **Changes** section, then a **Why** section.\n' +
  '- For multi-file diffs, group changes by file.\n' +
  '- Never repeat the raw diff back. Interpret it.';

const SYSTEM_PROMPTS: Record<UnderstandingLevel, string> = {
  developer:
    PREAMBLE + '\n\n' +
    'Level: Developer — focus on implementation details. Mention specific functions, types, ' +
    'and control flow. Call out potential bugs, edge cases, or performance implications. ' +
    'Be direct and concise.',

  architecture:
    PREAMBLE + '\n\n' +
    'Level: Architecture — focus on the big picture. Explain which design patterns are used, ' +
    'how this change fits into the broader system, what boundaries or contracts changed, and ' +
    'any long-term implications (scalability, coupling, tech debt). Skip line-level details.',

  syntax:
    PREAMBLE + '\n\n' +
    'Level: Syntax — explain as if teaching a beginner. Walk through each meaningful change ' +
    'in plain language. Define technical terms on first use. Use analogies where helpful. ' +
    'Group trivial changes (imports, formatting) into a single note.',
};

const SELECTION_SYSTEM =
  'You are Lumen, a code explanation assistant embedded in VS Code. ' +
  'The user selected a portion of code and wants it explained.\n\n' +
  'Structure your response as:\n' +
  '- **What it does** — one-sentence purpose\n' +
  '- **How it works** — walk through the logic\n' +
  '- **Notable patterns** — any design patterns, idioms, or potential issues\n\n' +
  'Use markdown. Be concise. Use inline `code` for identifiers.';

const RE_EXPLAIN_SYSTEM =
  'You are Lumen, a code explanation assistant embedded in VS Code. ' +
  'The user read your previous explanation and selected a specific part they want ' +
  'understood more deeply.\n\n' +
  'Provide a thorough explanation of the selected text in context of the original changes. ' +
  'Go deeper than the original explanation — cover edge cases, alternatives, and implications. ' +
  'Use markdown.';

export class LLMClient {
  private readonly _assembler = new ContextAssembler();

  async explainDiffs(
    diffs: DiffResult[],
    level: UnderstandingLevel,
    onChunk: (text: string) => void,
    onDone: () => void,
    onError: (err: Error) => void,
  ): Promise<void> {
    const userContent = this._assembler.assemble(diffs, level);
    await this._stream(SYSTEM_PROMPTS[level], userContent, onChunk, onDone, onError);
  }

  async explainSelection(
    selectedText: string,
    fileName: string,
    _level: UnderstandingLevel,
    onChunk: (text: string) => void,
    onDone: () => void,
    onError: (err: Error) => void,
  ): Promise<void> {
    const userContent = this._assembler.assembleSelection(selectedText, fileName);
    await this._stream(SELECTION_SYSTEM, userContent, onChunk, onDone, onError);
  }

  async reExplain(
    selectedText: string,
    diffs: DiffResult[] | undefined,
    originalSelectionText: string | undefined,
    _level: UnderstandingLevel,
    onChunk: (text: string) => void,
    onDone: () => void,
    onError: (err: Error) => void,
  ): Promise<void> {
    const userContent = this._assembler.assembleReExplain(selectedText, diffs, originalSelectionText);
    await this._stream(RE_EXPLAIN_SYSTEM, userContent, onChunk, onDone, onError);
  }

  private async _stream(
    system: string,
    userContent: string,
    onChunk: (text: string) => void,
    onDone: () => void,
    onError: (err: Error) => void,
  ): Promise<void> {
    const config = vscode.workspace.getConfiguration('lumen');
    const apiKey = config.get<string>('anthropicApiKey', '');

    if (!apiKey) {
      onError(
        new Error(
          'No Anthropic API key configured. Set lumen.anthropicApiKey in VS Code settings.',
        ),
      );
      return;
    }

    const model = config.get<string>('model', 'claude-haiku-4-5-20251001');
    const maxTokens = config.get<number>('maxTokens', 1024);
    const client = new Anthropic({ apiKey });

    try {
      const stream = client.messages.stream({
        model,
        max_tokens: maxTokens,
        system,
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
      const error = err instanceof Error ? err : new Error(String(err));
      const msg = error.message;

      // Provide user-friendly error messages for common API errors
      if (msg.includes('credit balance is too low')) {
        onError(new Error('Anthropic API credits exhausted. Add credits at console.anthropic.com → Plans & Billing.'));
      } else if (msg.includes('invalid x-api-key') || msg.includes('Invalid API Key')) {
        onError(new Error('Invalid Anthropic API key. Check lumen.anthropicApiKey in settings.'));
      } else if (msg.includes('rate_limit') || msg.includes('429')) {
        onError(new Error('Rate limited by Anthropic API. Wait a moment and save again.'));
      } else if (msg.includes('overloaded') || msg.includes('529')) {
        onError(new Error('Anthropic API is temporarily overloaded. Try again in a few seconds.'));
      } else if (msg.includes('ENOTFOUND') || msg.includes('ECONNREFUSED') || msg.includes('fetch failed')) {
        onError(new Error('Cannot reach Anthropic API. Check your internet connection.'));
      } else {
        onError(error);
      }
    }
  }
}

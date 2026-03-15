# Lumen

Lumen is a VS Code extension that automatically explains code changes in a side panel using an LLM. Designed to run independently, Lumen ensures it never interferes with your primary AI coding assistant.

## Features

- **Auto-Explain:** Automatically watches for file saves, computes diffs, and generates explanations in the background without interrupting your workflow.
- **On-Demand Explanations:** Select any code snippet and use "Lumen: Explain Selection", or trigger "Explain Last Diff" to understand recent changes.
- **Adjustable Detail Levels:** Choose how deep you want the explanations to go:
  - **Architecture:** System-level flow and component integration.
  - **Developer:** Design patterns, libraries, and API decisions.
  - **Syntax:** Line-by-line breakdowns for learning.
- **Drill-Down Re-explain:** Highlight any confusing part of an explanation and get a simplified, more detailed breakdown.
- **History Navigation:** Easily browse through up to 100 past explanations using back and forward arrows.

## Setup

Configure the extension by adding your Anthropic API key to your VS Code settings:

```json
{
  "lumen.anthropicApiKey": "your-api-key-here"
}
```

### Additional Configuration 
- `lumen.model`: The LLM model to use (default: `claude-sonnet-4-20250514`).
- `lumen.defaultLevel`: Default explanation level (`architecture`, `developer`, or `syntax`).
- `lumen.debounceMs`: Delay before auto-explaining changes (default: `3000`).
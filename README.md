# PromptPack

Right-click files or folders in VS Code and copy their contents, with a project tree, as one block you can paste into ChatGPT, Claude, Gemini, or any other LLM.

By default, dot files, `.gitignore` matches and `node_modules` stay out, and binary files and files over 1 MB appear only as a one-line note. Everything else is copied exactly as it is on disk.

## Copy files for a prompt

1. Select one or more files or folders in the Explorer.
2. Right-click and choose **Copy to Clipboard (PromptPack)**.
3. Paste into your chat.

Copying the `src` folder of a small project gives:

````markdown
# Project Structure

```
src/
├── utils
│   └── math.ts
└── index.ts
```

# File Contents

## src/index.ts

```typescript
import { add } from './utils/math';

console.log(add(2, 3));
```

## src/utils/math.ts

```typescript
export const add = (a: number, b: number) => a + b;
```
````

File paths are relative to the workspace folder. If a file itself contains Markdown code fences, PromptPack uses a longer fence so the output stays valid Markdown. Set `promptpack.outputFormat` to `xml` or `plaintext` if your prompt works better with those formats.

## Commands

| Command | Where | What it copies |
| --- | --- | --- |
| Copy to Clipboard (PromptPack) | Explorer and editor context menus | Selected files and folders, with a project tree |
| Copy Selected Tabs (PromptPack) | Editor tab context menu | Selected file tabs, read from disk |
| Copy Project Structure (PromptPack) | Explorer and editor context menus | Only the tree (the folder you clicked, or the whole workspace folder for a file) |
| Copy Source Control File Contents (PromptPack) | Source Control view | Full contents of the selected changed files |
| Copy Changes (PromptPack) | Source Control view (Git) | Unified diff against HEAD; untracked files appear as new-file diffs |
| PromptPack: Repeat Last Copy | Command Palette | Same selection again, read fresh from disk |
| PromptPack: Force Copy Without Exclusions… | Command Palette | The current selection without ignore rules, after confirmation (cancellable) |
| PromptPack: Toggle Project Tree | Command Palette | Switches `promptpack.includeProjectTree` in user settings |
| PromptPack: Toggle Dot Files Inclusion | Command Palette | Switches `promptpack.ignoreDotFiles` in user settings |

There are no default keyboard shortcuts. Bind `promptpack.copyToClipboard` (or `promptpack.repeatLastCopy`) in Keyboard Shortcuts; without arguments it copies the focused Explorer selection, or the active editor's file if nothing is selected.

## What stays out

- Files and folders whose names start with a dot (`ignoreDotFiles`).
- Paths matched by the `.gitignore` in the workspace root (`ignoreGitIgnore`). Nested `.gitignore` files are not read.
- Paths matched by `promptpack.exclude` (default: `node_modules`, `*.log`). `paths` are exact files/folders; `patterns` use `.gitignore` syntax and are case-sensitive.

Some files stay in the tree but their contents are replaced with a note: binary files, files over `promptpack.maxFileSize`, files matching `promptpack.excludeContentPatterns`, and files that are not valid UTF-8.

PromptPack does **not** scan file contents for secrets. Check what you paste and add sensitive files to `promptpack.exclude`.

## Tokens

Set `promptpack.enableTokenCounting` to see the token count of every copy in the status bar; `promptpack.llmModel` selects the tokenizer. OpenAI models (`gpt-*`, `o1`, `o3`, `o4`) get exact counts. There is no offline tokenizer for Claude or Gemini, so those counts are estimates and are shown with a `~`. Above `promptpack.maxTokens` (default 100,000) a warning offers to open the exclusion settings.

## Privacy

PromptPack makes no network requests and collects no telemetry. Nothing leaves your machine until you paste.

## Remote and untrusted workspaces

Files are read through the VS Code file system API, so Remote SSH, WSL, Dev Containers and virtual workspaces work. In Restricted Mode, workspace-level PromptPack settings are ignored until you trust the workspace; user settings still apply.

## Known limitations

- Only one workspace folder per copy in a multi-root workspace.
- Copy to Clipboard is not shown on a workspace root folder; use Copy Project Structure, or select items inside it.
- For keyboard shortcuts and multi-selected tabs, PromptPack briefly puts file paths on the clipboard through VS Code's *Copy Path* command, then restores your clipboard. A clipboard manager may record those paths.
- Tab copies read the saved files; save your edits first (you get a warning for unsaved tabs).

## Development

```
npm install
npm run compile     # typecheck + bundle
npm test            # unit tests for the core
npm run package     # produces promptpack-<version>.vsix
```

Press F5 to start an Extension Development Host. Before publishing, change `publisher` in `package.json`.

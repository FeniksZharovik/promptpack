import * as vscode from 'vscode';
import { normalizeFsPath, toPosix } from '../core/paths';
import { CopyError } from '../core/types';

/** Collects URIs from command arguments: Uris, arrays, SCM resource states and groups. */
export function flattenUris(...args: unknown[]): vscode.Uri[] {
  const out: vscode.Uri[] = [];
  const seen = new Set<string>();
  const add = (u: vscode.Uri) => {
    const key = u.toString();
    if (!seen.has(key)) {
      seen.add(key);
      out.push(u);
    }
  };
  const visit = (a: unknown): void => {
    if (!a) return;
    if (Array.isArray(a)) return a.forEach(visit);
    if (a instanceof vscode.Uri) return add(a);
    const obj = a as { resourceUri?: unknown; resourceStates?: unknown };
    if (Array.isArray(obj.resourceStates)) return obj.resourceStates.forEach(visit);
    if (obj.resourceUri instanceof vscode.Uri) add(obj.resourceUri);
  };
  args.forEach(visit);
  return out;
}

/**
 * Asks VS Code's own "Copy Path" command for the selected paths. It already
 * knows about the focused Explorer selection and multi-selected tabs. The
 * clipboard is restored afterwards; a sentinel tells "nothing copied" apart.
 */
export async function readSelectedPaths(arg?: vscode.Uri): Promise<string[]> {
  const previous = await vscode.env.clipboard.readText();
  const sentinel = `promptpack-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  try {
    await vscode.env.clipboard.writeText(sentinel);
    if (arg) await vscode.commands.executeCommand('copyFilePath', arg);
    else await vscode.commands.executeCommand('copyFilePath');
    const text = await vscode.env.clipboard.readText();
    if (text === sentinel) return [];
    return text.split(/\r?\n/).map((l) => l.trim()).filter((l) => l !== '');
  } finally {
    await vscode.env.clipboard.writeText(previous);
  }
}

/** Longest-prefix match of an absolute path against the workspace folders. */
export function pathToUri(fsPath: string): vscode.Uri | undefined {
  const target = normalizeFsPath(fsPath);
  let best: { folder: vscode.WorkspaceFolder; len: number } | undefined;
  for (const f of vscode.workspace.workspaceFolders ?? []) {
    const root = normalizeFsPath(f.uri.fsPath);
    const inside = target === root || target.startsWith(root === '/' ? '/' : root + '/');
    if (inside && (!best || root.length > best.len)) best = { folder: f, len: root.length };
  }
  if (!best) return undefined;
  const rest = toPosix(fsPath.trim()).replace(/\/+$/, '').slice(best.len);
  const segs = rest.split('/').filter(Boolean);
  return segs.length ? vscode.Uri.joinPath(best.folder.uri, ...segs) : best.folder.uri;
}

export function activeEditorUri(): vscode.Uri | undefined {
  const uri = vscode.window.activeTextEditor?.document.uri;
  return uri && vscode.workspace.getWorkspaceFolder(uri) ? uri : undefined;
}

/**
 * Selection for the Explorer command. Arguments from the context menu win;
 * without them (shortcut, Command Palette) the current selection is read, and
 * the active editor is the last resort.
 */
export async function resolveExplorerSelection(clicked?: unknown, selected?: unknown): Promise<vscode.Uri[]> {
  const fromArgs = flattenUris(selected, clicked);
  if (fromArgs.length > 0) return fromArgs;

  const lines = await readSelectedPaths();
  const mapped: vscode.Uri[] = [];
  for (const line of lines) {
    const uri = pathToUri(line);
    if (!uri) {
      throw new CopyError(`Could not map "${line}" to a workspace folder; nothing was copied.`);
    }
    mapped.push(uri);
  }
  if (mapped.length > 0) return mapped;

  const active = activeEditorUri();
  return active ? [active] : [];
}

export interface TabSelection {
  uris: vscode.Uri[];
  /** Selected tabs with unsaved changes; their saved content on disk is what gets copied. */
  dirty: string[];
}

/** The multi-selected editor tabs (or the clicked one). Stops instead of guessing when paths do not match. */
export async function resolveSelectedTabs(clicked?: unknown): Promise<TabSelection> {
  const open = new Map<string, { uri: vscode.Uri; dirty: boolean }>();
  for (const group of vscode.window.tabGroups.all) {
    for (const tab of group.tabs) {
      if (!(tab.input instanceof vscode.TabInputText)) continue;
      const uri = tab.input.uri;
      if (!vscode.workspace.getWorkspaceFolder(uri)) continue;
      const key = normalizeFsPath(uri.fsPath);
      const prev = open.get(key);
      open.set(key, { uri, dirty: tab.isDirty || (prev?.dirty ?? false) });
    }
  }

  const clickedUri = flattenUris(clicked)[0];
  const lines = await readSelectedPaths(clickedUri);
  let keys: string[];
  if (lines.length === 0) {
    if (!clickedUri) throw new CopyError('Select one or more file tabs first.');
    keys = [normalizeFsPath(clickedUri.fsPath)];
  } else {
    keys = lines.map(normalizeFsPath);
  }

  const uris: vscode.Uri[] = [];
  const dirty: string[] = [];
  for (const key of keys) {
    const hit = open.get(key);
    if (!hit) {
      throw new CopyError(
        'Could not match the selected tabs to open files, so nothing was copied. Select text file tabs and try again.',
      );
    }
    if (!uris.some((u) => u.toString() === hit.uri.toString())) {
      uris.push(hit.uri);
      if (hit.dirty) dirty.push(vscode.workspace.asRelativePath(hit.uri, false));
    }
  }
  return { uris, dirty };
}

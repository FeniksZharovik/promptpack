import * as path from 'node:path';
import * as vscode from 'vscode';
import { normalizeRel } from '../core/paths';
import { CopyError } from '../core/types';

export interface ResolvedTargets {
  folder: vscode.WorkspaceFolder;
  /** Root-relative POSIX paths; "" is the folder itself. */
  targets: string[];
}

export function relativeFromFolder(folder: vscode.WorkspaceFolder, uri: vscode.Uri): string | null {
  if (uri.scheme !== folder.uri.scheme) return null;
  const rel = path.posix.relative(folder.uri.path, uri.path);
  return normalizeRel(rel);
}

/** Maps URIs to one workspace folder. Mixing folders of a multi-root workspace is refused. */
export function resolveTargets(uris: vscode.Uri[]): ResolvedTargets {
  if (uris.length === 0) throw new CopyError('Nothing is selected.');
  let folder: vscode.WorkspaceFolder | undefined;
  const targets: string[] = [];
  for (const uri of uris) {
    const f = vscode.workspace.getWorkspaceFolder(uri);
    if (!f) {
      throw new CopyError(`${uri.fsPath || uri.toString()} is not inside a workspace folder.`);
    }
    if (folder && folder.uri.toString() !== f.uri.toString()) {
      throw new CopyError(
        'The selection spans several workspace folders. Select items from one workspace folder at a time.',
      );
    }
    folder = f;
    const rel = relativeFromFolder(f, uri);
    if (rel === null) throw new CopyError(`${uri.fsPath || uri.toString()} is outside its workspace folder.`);
    if (!targets.includes(rel)) targets.push(rel);
  }
  return { folder: folder as vscode.WorkspaceFolder, targets };
}

/** Folder to use when no file is selected: the active editor's folder, or ask when there are several. */
export async function pickWorkspaceFolder(): Promise<vscode.WorkspaceFolder | undefined> {
  const folders = vscode.workspace.workspaceFolders ?? [];
  if (folders.length === 0) {
    throw new CopyError('Open a folder or workspace first.');
  }
  const active = vscode.window.activeTextEditor?.document.uri;
  if (active) {
    const f = vscode.workspace.getWorkspaceFolder(active);
    if (f) return f;
  }
  if (folders.length === 1) return folders[0];
  const pick = await vscode.window.showQuickPick(
    folders.map((f) => ({ label: f.name, description: f.uri.fsPath, folder: f })),
    { placeHolder: 'Which workspace folder?' },
  );
  return pick?.folder;
}

import * as vscode from 'vscode';
import { badEncodingNote, decodeFileBytes, NOTE_BINARY, tooLargeNote } from '../core/collector';
import { makeNewFileDiff, makeNewFileNote } from '../core/diff';
import type { Matcher } from '../core/matcher';
import {
  type CancelSignal,
  type DiffEntry,
  type Settings,
  CopyError,
  throwIfCancelled,
} from '../core/types';
import { relativeFromFolder } from './roots';

// Minimal typings of the built-in Git extension API (version 1).
interface GitChange {
  uri: vscode.Uri;
  status: number;
}
interface GitRepository {
  rootUri: vscode.Uri;
  state: { workingTreeChanges: GitChange[]; indexChanges: GitChange[] };
  diffWithHEAD(path: string): Promise<string>;
}
interface GitApi {
  getRepository(uri: vscode.Uri): GitRepository | null;
}
interface GitExtension {
  enabled: boolean;
  getAPI(version: 1): GitApi;
}

/** Status.UNTRACKED in the Git extension's API enum. */
const UNTRACKED = 7;

async function getGitApi(): Promise<GitApi> {
  const ext = vscode.extensions.getExtension<GitExtension>('vscode.git');
  if (!ext) throw new CopyError('The built-in Git extension is not available.');
  const exports = ext.isActive ? ext.exports : await ext.activate();
  if (!exports.enabled) throw new CopyError('The built-in Git extension is disabled.');
  return exports.getAPI(1);
}

export interface DiffCollection {
  entries: DiffEntry[];
  warnings: string[];
}

/** Unified diff against HEAD for each file; untracked files become new-file diffs. */
export async function collectDiffs(
  uris: vscode.Uri[],
  folder: vscode.WorkspaceFolder,
  settings: Settings,
  matcher: Matcher,
  signal?: CancelSignal,
): Promise<DiffCollection> {
  const api = await getGitApi();
  const entries: DiffEntry[] = [];
  const warnings: string[] = [];
  const excluded: string[] = [];
  const noRepo: string[] = [];

  for (const uri of uris) {
    throwIfCancelled(signal);
    const rel = relativeFromFolder(folder, uri);
    if (!rel) continue;
    if (matcher.isExcluded(rel, false)) {
      excluded.push(rel);
      continue;
    }
    const repo = api.getRepository(uri);
    if (!repo) {
      noRepo.push(rel);
      continue;
    }
    try {
      const key = uri.toString();
      const untracked = repo.state.workingTreeChanges.some(
        (c) => c.uri.toString() === key && c.status === UNTRACKED,
      );
      if (untracked) {
        entries.push({ path: rel, diff: await untrackedDiff(uri, rel, settings) });
      } else {
        entries.push({ path: rel, diff: await repo.diffWithHEAD(uri.fsPath) });
      }
    } catch (err) {
      warnings.push(`Could not diff ${rel}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  if (excluded.length > 0) warnings.push(`Left out by the exclusion rules: ${excluded.join(', ')}`);
  if (noRepo.length > 0) warnings.push(`Not in a Git repository: ${noRepo.join(', ')}`);
  return { entries, warnings };
}

async function untrackedDiff(uri: vscode.Uri, rel: string, settings: Settings): Promise<string> {
  const stat = await vscode.workspace.fs.stat(uri);
  if (settings.maxFileSize > 0 && stat.size > settings.maxFileSize) {
    return makeNewFileNote(rel, tooLargeNote(stat.size, settings.maxFileSize));
  }
  const decoded = decodeFileBytes(await vscode.workspace.fs.readFile(uri));
  if (decoded.kind === 'ok') return makeNewFileDiff(rel, decoded.text);
  if (decoded.kind === 'binary') return makeNewFileNote(rel, NOTE_BINARY);
  return makeNewFileNote(rel, badEncodingNote(decoded.detail));
}

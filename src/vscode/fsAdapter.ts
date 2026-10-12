import * as vscode from 'vscode';
import {
  type FileSystemLike,
  type FsEntry,
  type FsEntryType,
  type FsStat,
  FsError,
} from '../core/types';

function mapType(t: vscode.FileType): FsEntryType {
  if (t & vscode.FileType.Directory) return 'dir';
  if (t & vscode.FileType.File) return 'file';
  return 'other';
}

function wrap(err: unknown): never {
  if (err instanceof vscode.FileSystemError && err.code === 'FileNotFound') {
    throw new FsError('ENOENT', err.message);
  }
  const msg = err instanceof Error ? err.message : String(err);
  if (/ENOENT|not found|does not exist/i.test(msg)) throw new FsError('ENOENT', msg);
  throw new FsError('OTHER', msg);
}

/** File system of one workspace folder, backed by vscode.workspace.fs (works for remote and virtual folders). */
export class WorkspaceFolderFs implements FileSystemLike {
  constructor(private readonly root: vscode.Uri) {}

  private uri(rel: string): vscode.Uri {
    return rel === '' ? this.root : vscode.Uri.joinPath(this.root, ...rel.split('/'));
  }

  async readDirectory(rel: string): Promise<FsEntry[]> {
    try {
      const entries = await vscode.workspace.fs.readDirectory(this.uri(rel));
      return entries.map(([name, type]) => ({
        name,
        type: mapType(type),
        symlink: (type & vscode.FileType.SymbolicLink) !== 0,
      }));
    } catch (err) {
      return wrap(err);
    }
  }

  async readFile(rel: string): Promise<Uint8Array> {
    try {
      return await vscode.workspace.fs.readFile(this.uri(rel));
    } catch (err) {
      return wrap(err);
    }
  }

  async stat(rel: string): Promise<FsStat> {
    try {
      const s = await vscode.workspace.fs.stat(this.uri(rel));
      return { type: mapType(s.type), size: s.size };
    } catch (err) {
      return wrap(err);
    }
  }
}

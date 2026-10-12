/** Shared types for the pure (vscode-free) core of PromptPack. */

export type OutputFormat = 'markdown' | 'xml' | 'plaintext';

export interface Settings {
  outputFormat: OutputFormat;
  includeProjectTree: boolean;
  maxDepth: number;
  ignoreDotFiles: boolean;
  ignoreGitIgnore: boolean;
  excludePaths: string[];
  excludePatterns: string[];
  excludeContentPatterns: string[];
  maxFileSize: number;
  enableTokenCounting: boolean;
  llmModel: string;
  maxTokens: number;
}

export type FileStatus =
  | 'ok'
  | 'binary'
  | 'tooLarge'
  | 'contentExcluded'
  | 'badEncoding'
  | 'unreadable';

export interface CollectedFile {
  /** Path relative to the workspace folder, POSIX separators. */
  path: string;
  status: FileStatus;
  /** Present only when status is "ok". */
  content?: string;
  /** Placeholder text shown instead of the content when status is not "ok". */
  note?: string;
}

export interface DiffEntry {
  path: string;
  diff: string;
}

export type FsEntryType = 'file' | 'dir' | 'other';

export interface FsEntry {
  name: string;
  type: FsEntryType;
  /** True when the entry is a symbolic link (type is the resolved type). */
  symlink?: boolean;
}

export interface FsStat {
  type: FsEntryType;
  size: number;
}

/**
 * File system rooted at one workspace folder. All paths are relative to that
 * folder, use "/" as separator, and the empty string means the root itself.
 */
export interface FileSystemLike {
  readDirectory(rel: string): Promise<FsEntry[]>;
  readFile(rel: string): Promise<Uint8Array>;
  stat(rel: string): Promise<FsStat>;
}

export type FsErrorCode = 'ENOENT' | 'OTHER';

export class FsError extends Error {
  constructor(
    public readonly code: FsErrorCode,
    message?: string,
  ) {
    super(message ?? code);
    this.name = 'FsError';
  }
}

/** Anything with an "aborted" flag; adapts VS Code's CancellationToken. */
export interface CancelSignal {
  readonly aborted: boolean;
}

export class CancelledError extends Error {
  constructor() {
    super('Copy cancelled');
    this.name = 'CancelledError';
  }
}

/** An error whose message is meant to be shown to the user as is. */
export class CopyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CopyError';
  }
}

export function throwIfCancelled(signal?: CancelSignal): void {
  if (signal?.aborted) throw new CancelledError();
}

export interface Progress {
  phase: 'scan' | 'read';
  done: number;
  total?: number;
}

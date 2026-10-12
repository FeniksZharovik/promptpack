import { collect } from './collector';
import { formatContents, formatDiffs, formatStructure } from './formatter';
import { type Matcher, createMatcher, noExclusions } from './matcher';
import { basename } from './paths';
import { renderTree } from './tree';
import {
  type CancelSignal,
  type DiffEntry,
  type FileSystemLike,
  type Progress,
  type Settings,
  CopyError,
  throwIfCancelled,
} from './types';

export type CopyMode = 'contents' | 'structure';

export interface CopyRequest {
  fs: FileSystemLike;
  /** Name of the workspace folder, used as the tree's first line. */
  rootName: string;
  /** Root-relative targets; "" is the whole workspace folder. */
  targets: string[];
  mode: CopyMode;
  settings: Settings;
  /** Ignore every exclusion rule (binary, size and encoding placeholders still apply). */
  force?: boolean;
  /** Absolute path of the workspace folder, for absolute entries in exclude.paths. */
  rootAbs?: string;
  signal?: CancelSignal;
  onProgress?: (p: Progress) => void;
}

export interface CopyResult {
  text: string;
  /** Number of files that appear in the output. */
  fileCount: number;
  warnings: string[];
}

async function readGitignore(fs: FileSystemLike): Promise<string | null> {
  try {
    return new TextDecoder('utf-8').decode(await fs.readFile('.gitignore'));
  } catch {
    return null;
  }
}

export async function buildMatcher(
  fs: FileSystemLike,
  settings: Settings,
  force: boolean,
  rootAbs?: string,
): Promise<Matcher> {
  if (force) return noExclusions;
  return createMatcher({
    ignoreDotFiles: settings.ignoreDotFiles,
    gitignoreText: settings.ignoreGitIgnore ? await readGitignore(fs) : null,
    excludePaths: settings.excludePaths,
    excludePatterns: settings.excludePatterns,
    excludeContentPatterns: settings.excludeContentPatterns,
    rootAbs,
  });
}

export async function runCopy(req: CopyRequest): Promise<CopyResult> {
  const { fs, settings, signal } = req;
  throwIfCancelled(signal);
  const matcher = await buildMatcher(fs, settings, req.force === true, req.rootAbs);
  throwIfCancelled(signal);

  const structureOnly = req.mode === 'structure';
  const collected = await collect({
    fs,
    targets: req.targets,
    matcher,
    maxFileSize: settings.maxFileSize,
    readContents: !structureOnly,
    signal,
    onProgress: req.onProgress,
  });

  if (collected.files.length === 0 && (!structureOnly || collected.dirs.length === 0)) {
    const why = collected.warnings.length > 0 ? ` ${collected.warnings.join(' ')}` : '';
    throw new CopyError(`Nothing to copy.${why}`);
  }

  // A single selected folder becomes the root of the tree; otherwise the workspace folder is.
  const only = collected.targets.length === 1 ? collected.targets[0] : undefined;
  const base = only && only.kind === 'dir' ? only.path : '';
  const label = (base ? basename(base) : req.rootName) + '/';
  const tree = () =>
    renderTree(
      collected.files.map((f) => f.path),
      { rootLabel: label, maxDepth: settings.maxDepth, dirs: collected.dirs, stripBase: base },
    );

  if (structureOnly) {
    return {
      text: formatStructure(tree(), settings.outputFormat),
      fileCount: collected.files.length,
      warnings: collected.warnings,
    };
  }

  const text = formatContents({
    files: collected.files,
    tree: settings.includeProjectTree ? tree() : undefined,
    format: settings.outputFormat,
  });
  return { text, fileCount: collected.files.length, warnings: collected.warnings };
}

/** Formats git diffs; fails when there is nothing to show. */
export function buildDiffResult(
  entries: DiffEntry[],
  settings: Settings,
  warnings: string[] = [],
): CopyResult {
  const withChanges = entries.filter((e) => e.diff.trim() !== '');
  if (withChanges.length === 0) {
    const why = warnings.length > 0 ? ` ${warnings.join(' ')}` : '';
    throw new CopyError(`None of the selected files has changes.${why}`);
  }
  return {
    text: formatDiffs(withChanges, settings.outputFormat),
    fileCount: withChanges.length,
    warnings,
  };
}

import type { Matcher } from './matcher';
import { compareNames, formatBytes, isInside, joinRel, normalizeRel } from './paths';
import {
  type CancelSignal,
  type CollectedFile,
  type FileSystemLike,
  type FsStat,
  type Progress,
  FsError,
  throwIfCancelled,
} from './types';

export const NOTE_BINARY = '[Binary file content not included]';
export const NOTE_CONTENT_EXCLUDED = '[File content not included]';

export interface CollectOptions {
  fs: FileSystemLike;
  /** Root-relative paths (files or folders); "" is the whole root. */
  targets: string[];
  matcher: Matcher;
  /** Largest file, in bytes, whose contents are read. 0 or less means no limit. */
  maxFileSize: number;
  /** False for structure-only copies: files are listed but never read. */
  readContents: boolean;
  signal?: CancelSignal;
  onProgress?: (p: Progress) => void;
  concurrency?: number;
}

export interface CollectedTarget {
  path: string;
  kind: 'file' | 'dir';
}

export interface CollectResult {
  files: CollectedFile[];
  /** Every folder that was walked, including empty ones (root excluded). */
  dirs: string[];
  /** Targets that were actually used (valid, deduplicated, not excluded). */
  targets: CollectedTarget[];
  warnings: string[];
}

export type Decoded =
  | { kind: 'ok'; text: string }
  | { kind: 'binary' }
  | { kind: 'badEncoding'; detail: string };

/** Detects binary data and non-UTF-8 text, and strips a UTF-8 byte order mark. */
export function decodeFileBytes(bytes: Uint8Array): Decoded {
  const b = bytes;
  if (b.length >= 4 && b[0] === 0xff && b[1] === 0xfe && b[2] === 0 && b[3] === 0) {
    return { kind: 'badEncoding', detail: 'UTF-32' };
  }
  if (b.length >= 4 && b[0] === 0 && b[1] === 0 && b[2] === 0xfe && b[3] === 0xff) {
    return { kind: 'badEncoding', detail: 'UTF-32' };
  }
  if (b.length >= 2 && ((b[0] === 0xff && b[1] === 0xfe) || (b[0] === 0xfe && b[1] === 0xff))) {
    return { kind: 'badEncoding', detail: 'UTF-16' };
  }
  const probe = Math.min(b.length, 8000);
  for (let i = 0; i < probe; i++) {
    if (b[i] === 0) return { kind: 'binary' };
  }
  const start = b.length >= 3 && b[0] === 0xef && b[1] === 0xbb && b[2] === 0xbf ? 3 : 0;
  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(b.subarray(start));
    return { kind: 'ok', text };
  } catch {
    return { kind: 'badEncoding', detail: 'not valid UTF-8' };
  }
}

export function badEncodingNote(detail: string): string {
  return detail === 'not valid UTF-8'
    ? '[File is not valid UTF-8. Convert it to UTF-8 to include its contents.]'
    : `[File is encoded as ${detail}, not UTF-8. Convert it to UTF-8 to include its contents.]`;
}

export function tooLargeNote(size: number, max: number): string {
  return `[File too large: ${formatBytes(size)} > ${formatBytes(max)}]`;
}

/** Runs fn over items with at most `limit` in flight and returns results in order. */
export async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i], i);
    }
  };
  const count = Math.max(1, Math.min(limit, items.length));
  await Promise.all(Array.from({ length: count }, worker));
  return results;
}

async function tryStat(fs: FileSystemLike, rel: string): Promise<FsStat | 'missing'> {
  try {
    return await fs.stat(rel);
  } catch (err) {
    if (err instanceof FsError && err.code === 'ENOENT') return 'missing';
    throw err;
  }
}

export async function collect(opts: CollectOptions): Promise<CollectResult> {
  const { fs, matcher, signal } = opts;
  const warnings: string[] = [];
  const dirs = new Set<string>();
  const candidates = new Map<string, number | undefined>(); // path -> known size
  const missing: string[] = [];
  const excludedTargets: string[] = [];
  const used: CollectedTarget[] = [];
  let scanned = 0;
  const bump = () => opts.onProgress?.({ phase: 'scan', done: ++scanned });

  // 1. Normalize and deduplicate the targets.
  const normalized: string[] = [];
  for (const t of opts.targets) {
    const rel = normalizeRel(t);
    if (rel === null) {
      warnings.push(`Skipped a path outside the workspace folder: ${t}`);
    } else if (!normalized.includes(rel)) {
      normalized.push(rel);
    }
  }

  // 2. Stat every target to learn whether it is a file or a folder.
  const stats = new Map<string, FsStat | 'missing'>();
  for (const rel of normalized) {
    throwIfCancelled(signal);
    stats.set(rel, await tryStat(fs, rel));
  }

  // 3. Drop targets that lie inside another selected folder.
  const dirTargets = normalized.filter((p) => {
    const s = stats.get(p);
    return s !== undefined && s !== 'missing' && s.type === 'dir';
  });
  const effective = normalized.filter(
    (p) => !dirTargets.some((d) => d !== p && isInside(p, d)),
  );

  const walk = async (dir: string): Promise<void> => {
    throwIfCancelled(signal);
    const entries = (await fs.readDirectory(dir)).slice().sort((a, b) => compareNames(a.name, b.name));
    for (const entry of entries) {
      throwIfCancelled(signal);
      const rel = joinRel(dir, entry.name);
      if (entry.type === 'dir') {
        if (matcher.isExcluded(rel, true)) continue;
        // Symlinked folders could loop forever or leave the workspace; skip them.
        if (entry.symlink) continue;
        dirs.add(rel);
        bump();
        await walk(rel);
      } else if (entry.type === 'file') {
        if (matcher.isExcluded(rel, false)) continue;
        candidates.set(rel, undefined);
        bump();
      }
    }
  };

  for (const rel of effective) {
    throwIfCancelled(signal);
    const st = stats.get(rel);
    if (st === undefined) continue;
    if (st === 'missing') {
      missing.push(rel);
      continue;
    }
    if (st.type === 'other') {
      warnings.push(`Skipped (not a regular file or folder): ${rel}`);
      continue;
    }
    if (rel !== '' && matcher.isExcluded(rel, st.type === 'dir')) {
      excludedTargets.push(rel);
      continue;
    }
    if (st.type === 'dir') {
      used.push({ path: rel, kind: 'dir' });
      if (rel !== '') dirs.add(rel);
      await walk(rel);
    } else {
      used.push({ path: rel, kind: 'file' });
      candidates.set(rel, st.size);
      bump();
    }
  }

  if (missing.length > 0) {
    warnings.push(`Skipped deleted file${missing.length > 1 ? 's' : ''}: ${missing.join(', ')}`);
  }
  if (excludedTargets.length > 0) {
    warnings.push(
      `Left out by the exclusion rules: ${excludedTargets.join(', ')} (use "PromptPack: Force Copy Without Exclusions…" to include)`,
    );
  }

  // 4. Read the contents.
  const paths = [...candidates.keys()].sort(compareNames);
  const gone = new Set<string>();
  let read = 0;

  const readOne = async (path: string): Promise<CollectedFile> => {
    throwIfCancelled(signal);
    if (!opts.readContents) return { path, status: 'ok' };
    try {
      if (matcher.isContentExcluded(path)) {
        return { path, status: 'contentExcluded', note: NOTE_CONTENT_EXCLUDED };
      }
      let size = candidates.get(path);
      if (size === undefined) {
        const st = await tryStat(fs, path);
        if (st === 'missing') {
          gone.add(path);
          return { path, status: 'unreadable' };
        }
        size = st.size;
      }
      if (opts.maxFileSize > 0 && size > opts.maxFileSize) {
        return { path, status: 'tooLarge', note: tooLargeNote(size, opts.maxFileSize) };
      }
      const decoded = decodeFileBytes(await fs.readFile(path));
      if (decoded.kind === 'ok') return { path, status: 'ok', content: decoded.text };
      if (decoded.kind === 'binary') return { path, status: 'binary', note: NOTE_BINARY };
      return { path, status: 'badEncoding', note: badEncodingNote(decoded.detail) };
    } catch (err) {
      if (err instanceof FsError && err.code === 'ENOENT') {
        gone.add(path);
        return { path, status: 'unreadable' };
      }
      const reason = err instanceof Error ? err.message : String(err);
      warnings.push(`Could not read ${path}: ${reason}`);
      return { path, status: 'unreadable', note: `[File could not be read: ${reason}]` };
    } finally {
      opts.onProgress?.({ phase: 'read', done: ++read, total: paths.length });
    }
  };

  const all = await mapLimit(paths, opts.concurrency ?? 16, readOne);
  if (gone.size > 0) {
    warnings.push(`Skipped deleted file${gone.size > 1 ? 's' : ''}: ${[...gone].join(', ')}`);
  }

  return {
    files: all.filter((f) => !gone.has(f.path)),
    dirs: [...dirs].sort(compareNames),
    targets: used,
    warnings,
  };
}

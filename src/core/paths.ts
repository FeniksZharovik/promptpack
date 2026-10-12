/** Small POSIX-style path helpers. Relative paths use "/" and "" is the root. */

export function toPosix(p: string): string {
  return p.replace(/\\/g, '/');
}

/**
 * Normalizes a relative path: POSIX separators, no "./", no duplicate or
 * trailing slashes, ".." resolved. Returns null when the path escapes the root.
 */
export function normalizeRel(p: string): string | null {
  const out: string[] = [];
  for (const seg of toPosix(p).split('/')) {
    if (seg === '' || seg === '.') continue;
    if (seg === '..') {
      if (out.length === 0) return null;
      out.pop();
    } else {
      out.push(seg);
    }
  }
  return out.join('/');
}

export function joinRel(a: string, b: string): string {
  if (!a) return b;
  if (!b) return a;
  return `${a}/${b}`;
}

export function basename(rel: string): string {
  const i = rel.lastIndexOf('/');
  return i < 0 ? rel : rel.slice(i + 1);
}

export function segments(rel: string): string[] {
  return rel === '' ? [] : rel.split('/');
}

/** True when rel equals parent or lies inside it. The empty parent is the root. */
export function isInside(rel: string, parent: string): boolean {
  if (parent === '') return true;
  return rel === parent || rel.startsWith(parent + '/');
}

/** Case-insensitive first, then raw comparison, so the order is deterministic. */
export function compareNames(a: string, b: string): number {
  const la = a.toLowerCase();
  const lb = b.toLowerCase();
  if (la < lb) return -1;
  if (la > lb) return 1;
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * Normalizes an absolute file system path for comparison: POSIX separators,
 * no trailing slash, and lower case for Windows drive paths (case-insensitive).
 */
export function normalizeFsPath(p: string): string {
  let n = toPosix(p.trim()).replace(/\/+$/, '');
  if (n === '') n = '/';
  if (/^[a-zA-Z]:(\/|$)/.test(n)) n = n.toLowerCase();
  return n;
}

/**
 * Turns an absolute path into a path relative to rootAbs, or null when it is
 * outside. Both are compared with normalizeFsPath rules.
 */
export function relativeToRoot(rootAbs: string, abs: string): string | null {
  const root = normalizeFsPath(rootAbs);
  const target = normalizeFsPath(abs);
  if (target === root) return '';
  const prefix = root === '/' ? '/' : root + '/';
  if (!target.startsWith(prefix)) return null;
  return target.slice(prefix.length);
}

/**
 * Converts an entry of the "exclude.paths" setting to a root-relative path.
 * Absolute paths are accepted when they lie inside the root. Returns null for
 * anything unusable (empty, outside the root).
 */
export function normalizeExcludePath(entry: string, rootAbs?: string): string | null {
  const trimmed = entry.trim();
  if (trimmed === '') return null;
  const posix = toPosix(trimmed);
  const isAbsolute = posix.startsWith('/') || /^[a-zA-Z]:\//.test(posix);
  if (isAbsolute) {
    if (!rootAbs) return null;
    const rel = relativeToRoot(rootAbs, posix);
    return rel === null || rel === '' ? null : rel;
  }
  const rel = normalizeRel(posix);
  return rel === null || rel === '' ? null : rel;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

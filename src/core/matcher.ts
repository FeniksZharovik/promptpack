import ignore, { type Ignore } from 'ignore';
import { isInside, normalizeExcludePath, segments } from './paths';

export interface MatcherOptions {
  ignoreDotFiles: boolean;
  /** Text of the root .gitignore, or null/undefined when it is not used. */
  gitignoreText?: string | null;
  excludePaths: string[];
  excludePatterns: string[];
  excludeContentPatterns: string[];
  /** Absolute path of the root, used to accept absolute entries in excludePaths. */
  rootAbs?: string;
}

export interface Matcher {
  /** True when the path must be left out completely (tree and contents). */
  isExcluded(rel: string, isDir: boolean): boolean;
  /** True when the file stays in the tree but its contents are replaced by a note. */
  isContentExcluded(rel: string): boolean;
}

/** A matcher that excludes nothing; used by "Force Copy Without Exclusions". */
export const noExclusions: Matcher = {
  isExcluded: () => false,
  isContentExcluded: () => false,
};

function buildIgnore(patterns: string[]): Ignore | null {
  const cleaned = patterns.filter((p) => typeof p === 'string' && p.trim() !== '');
  if (cleaned.length === 0) return null;
  // ignorecase:false keeps matching case-sensitive on every platform.
  return ignore({ ignorecase: false }).add(cleaned);
}

function safeIgnores(ig: Ignore | null, rel: string, isDir: boolean): boolean {
  if (!ig || rel === '' || rel.startsWith('../')) return false;
  try {
    return ig.ignores(isDir ? rel + '/' : rel);
  } catch {
    // The "ignore" package throws for paths it considers invalid; never exclude on error.
    return false;
  }
}

export function createMatcher(opts: MatcherOptions): Matcher {
  const gitIgnore = opts.gitignoreText ? buildIgnore(opts.gitignoreText.split(/\r?\n/)) : null;
  const patternIgnore = buildIgnore(opts.excludePatterns);
  const contentIgnore = buildIgnore(opts.excludeContentPatterns);
  const excludedPaths = opts.excludePaths
    .map((p) => normalizeExcludePath(p, opts.rootAbs))
    .filter((p): p is string => p !== null);

  return {
    isExcluded(rel, isDir) {
      if (rel === '') return false;
      if (opts.ignoreDotFiles && segments(rel).some((s) => s.startsWith('.'))) return true;
      if (excludedPaths.some((p) => isInside(rel, p))) return true;
      if (safeIgnores(patternIgnore, rel, isDir)) return true;
      if (safeIgnores(gitIgnore, rel, isDir)) return true;
      return false;
    },
    isContentExcluded(rel) {
      return safeIgnores(contentIgnore, rel, false);
    },
  };
}

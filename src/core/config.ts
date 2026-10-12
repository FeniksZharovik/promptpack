import type { OutputFormat, Settings } from './types';

export const DEFAULT_SETTINGS: Settings = {
  outputFormat: 'markdown',
  includeProjectTree: true,
  maxDepth: 5,
  ignoreDotFiles: true,
  ignoreGitIgnore: true,
  excludePaths: [],
  excludePatterns: ['node_modules', '*.log'],
  excludeContentPatterns: [],
  maxFileSize: 1048576,
  enableTokenCounting: false,
  llmModel: 'claude-sonnet-5',
  maxTokens: 100000,
};

/**
 * Unvalidated values as read from the editor configuration. The "...IsSet"
 * flags and the legacy fields are only filled in when the user set them
 * explicitly (not when they are defaults).
 */
export interface RawSettings {
  outputFormat?: unknown;
  includeProjectTree?: unknown;
  maxDepth?: unknown;
  ignoreDotFiles?: unknown;
  ignoreGitIgnore?: unknown;
  exclude?: unknown;
  excludeIsSet?: boolean;
  excludeContentPatterns?: unknown;
  maxFileSize?: unknown;
  enableTokenCounting?: unknown;
  llmModel?: unknown;
  maxTokens?: unknown;
  maxTokensIsSet?: boolean;
  legacyExcludePaths?: unknown;
  legacyExcludePatterns?: unknown;
  legacyEnableTokenWarning?: unknown;
}

const FORMATS: OutputFormat[] = ['markdown', 'xml', 'plaintext'];

function bool(v: unknown, fallback: boolean): boolean {
  return typeof v === 'boolean' ? v : fallback;
}

function int(v: unknown, fallback: number, min: number, max = Number.MAX_SAFE_INTEGER): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(v)));
}

function strings(v: unknown): string[] | undefined {
  if (!Array.isArray(v)) return undefined;
  return v.filter((x): x is string => typeof x === 'string' && x.trim() !== '');
}

export function resolveSettings(raw: RawSettings): Settings {
  const d = DEFAULT_SETTINGS;

  // "exclude" is an object that VS Code merges key by key with its default.
  const exclude = (typeof raw.exclude === 'object' && raw.exclude !== null ? raw.exclude : {}) as {
    paths?: unknown;
    patterns?: unknown;
  };
  let excludePaths = strings(exclude.paths) ?? d.excludePaths;
  let excludePatterns = strings(exclude.patterns) ?? d.excludePatterns;

  // The deprecated settings still work until "exclude" is set; then "exclude" wins.
  if (!raw.excludeIsSet) {
    excludePaths = strings(raw.legacyExcludePaths) ?? excludePaths;
    excludePatterns = strings(raw.legacyExcludePatterns) ?? excludePatterns;
  }

  let maxTokens = int(raw.maxTokens, d.maxTokens, 0);
  if (!raw.maxTokensIsSet && raw.legacyEnableTokenWarning === false) maxTokens = 0;

  return {
    outputFormat: FORMATS.includes(raw.outputFormat as OutputFormat)
      ? (raw.outputFormat as OutputFormat)
      : d.outputFormat,
    includeProjectTree: bool(raw.includeProjectTree, d.includeProjectTree),
    maxDepth: int(raw.maxDepth, d.maxDepth, 1, 100),
    ignoreDotFiles: bool(raw.ignoreDotFiles, d.ignoreDotFiles),
    ignoreGitIgnore: bool(raw.ignoreGitIgnore, d.ignoreGitIgnore),
    excludePaths,
    excludePatterns,
    excludeContentPatterns: strings(raw.excludeContentPatterns) ?? d.excludeContentPatterns,
    maxFileSize: int(raw.maxFileSize, d.maxFileSize, 0),
    enableTokenCounting: bool(raw.enableTokenCounting, d.enableTokenCounting),
    llmModel:
      typeof raw.llmModel === 'string' && raw.llmModel.trim() !== '' ? raw.llmModel.trim() : d.llmModel,
    maxTokens,
  };
}

export interface MigrationInput {
  /** Values stored at one settings level (user or workspace); undefined when absent. */
  exclude: unknown;
  excludePaths: unknown;
  excludePatterns: unknown;
}

export interface MigrationPlan {
  /** New value for "exclude"; absent when "exclude" already exists and must stay untouched. */
  setExclude?: { paths: string[]; patterns: string[] };
  clearExcludePaths: boolean;
  clearExcludePatterns: boolean;
}

/**
 * Plans the one-time move of the deprecated excludePaths/excludePatterns into
 * "exclude". A value already present in "exclude" is never overwritten.
 */
export function planMigration(input: MigrationInput): MigrationPlan | null {
  const hasPaths = input.excludePaths !== undefined;
  const hasPatterns = input.excludePatterns !== undefined;
  if (!hasPaths && !hasPatterns) return null;
  const plan: MigrationPlan = { clearExcludePaths: hasPaths, clearExcludePatterns: hasPatterns };
  if (input.exclude === undefined) {
    plan.setExclude = {
      paths: strings(input.excludePaths) ?? [],
      patterns: strings(input.excludePatterns) ?? [...DEFAULT_SETTINGS.excludePatterns],
    };
  }
  return plan;
}

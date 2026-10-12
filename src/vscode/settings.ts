import * as vscode from 'vscode';
import { type RawSettings, planMigration, resolveSettings } from '../core/config';
import type { Settings } from '../core/types';

export const SECTION = 'promptpack';

/**
 * Reads the settings. In an untrusted workspace only user-level (and default)
 * values count; workspace values are ignored until the workspace is trusted.
 */
export function readSettings(scope?: vscode.Uri): Settings {
  const cfg = vscode.workspace.getConfiguration(SECTION, scope);
  const trusted = vscode.workspace.isTrusted;

  const value = (key: string): unknown => {
    if (trusted) return cfg.get(key);
    const i = cfg.inspect(key);
    return i?.globalValue ?? i?.defaultValue;
  };
  const explicit = (key: string): boolean => {
    const i = cfg.inspect(key);
    if (!i) return false;
    if (i.globalValue !== undefined) return true;
    return trusted && (i.workspaceValue !== undefined || i.workspaceFolderValue !== undefined);
  };
  const ifSet = (key: string): unknown => (explicit(key) ? value(key) : undefined);

  const raw: RawSettings = {
    outputFormat: value('outputFormat'),
    includeProjectTree: value('includeProjectTree'),
    maxDepth: value('maxDepth'),
    ignoreDotFiles: value('ignoreDotFiles'),
    ignoreGitIgnore: value('ignoreGitIgnore'),
    exclude: value('exclude'),
    excludeIsSet: explicit('exclude'),
    excludeContentPatterns: value('excludeContentPatterns'),
    maxFileSize: value('maxFileSize'),
    enableTokenCounting: value('enableTokenCounting'),
    llmModel: value('llmModel'),
    maxTokens: value('maxTokens'),
    maxTokensIsSet: explicit('maxTokens'),
    legacyExcludePaths: ifSet('excludePaths'),
    legacyExcludePatterns: ifSet('excludePatterns'),
    legacyEnableTokenWarning: ifSet('enableTokenWarning'),
  };
  return resolveSettings(raw);
}

/**
 * Moves the deprecated excludePaths/excludePatterns into "exclude" and deletes
 * the old entries. Runs at startup; in an untrusted workspace only user
 * settings are touched.
 */
export async function migrateDeprecatedSettings(log: (msg: string) => void): Promise<void> {
  const cfg = vscode.workspace.getConfiguration(SECTION);
  const levels: Array<{
    target: vscode.ConfigurationTarget;
    pick: (i: NonNullable<ReturnType<typeof cfg.inspect>>) => unknown;
  }> = [{ target: vscode.ConfigurationTarget.Global, pick: (i) => i.globalValue }];
  if (vscode.workspace.isTrusted && (vscode.workspace.workspaceFolders?.length ?? 0) > 0) {
    levels.push({ target: vscode.ConfigurationTarget.Workspace, pick: (i) => i.workspaceValue });
  }

  for (const { target, pick } of levels) {
    const at = (key: string): unknown => {
      const i = cfg.inspect(key);
      return i ? pick(i) : undefined;
    };
    const plan = planMigration({
      exclude: at('exclude'),
      excludePaths: at('excludePaths'),
      excludePatterns: at('excludePatterns'),
    });
    if (!plan) continue;
    try {
      if (plan.setExclude) await cfg.update('exclude', plan.setExclude, target);
      if (plan.clearExcludePaths) await cfg.update('excludePaths', undefined, target);
      if (plan.clearExcludePatterns) await cfg.update('excludePatterns', undefined, target);
      log(`Migrated deprecated exclude settings (${vscode.ConfigurationTarget[target]}).`);
    } catch (err) {
      log(`Could not migrate deprecated settings: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
}

/** Flips a boolean setting in the user settings and returns the new value. */
export async function toggleUserSetting(key: 'includeProjectTree' | 'ignoreDotFiles'): Promise<boolean> {
  const cfg = vscode.workspace.getConfiguration(SECTION);
  const i = cfg.inspect<boolean>(key);
  const current = i?.globalValue ?? i?.defaultValue ?? true;
  const next = !current;
  await cfg.update(key, next, vscode.ConfigurationTarget.Global);
  return next;
}

import * as vscode from 'vscode';
import { buildDiffResult, buildMatcher, runCopy, type CopyResult } from '../core/pipeline';
import { countTokens, formatTokenCount } from '../core/tokens';
import { CancelledError, CopyError } from '../core/types';
import { WorkspaceFolderFs } from './fsAdapter';
import { collectDiffs } from './gitDiff';
import { pickWorkspaceFolder, relativeFromFolder, resolveTargets } from './roots';
import {
  flattenUris,
  resolveExplorerSelection,
  resolveSelectedTabs,
} from './selection';
import { readSettings, toggleUserSetting } from './settings';
import type { Ui } from './ui';

type Kind = 'contents' | 'structure' | 'diff';

interface Job {
  kind: Kind;
  folder: vscode.WorkspaceFolder;
  /** Root-relative targets (contents and structure copies). */
  targets: string[];
  /** Original URIs (diff copies need them for the Git API). */
  uris: vscode.Uri[];
}

interface RunOptions {
  /** Ignore every exclusion rule. */
  force?: boolean;
  /** Remember the job for "Repeat Last Copy". */
  remember?: boolean;
  /** Warnings known before the copy runs (for example unsaved tabs). */
  extraWarnings?: string[];
}

export class Actions {
  private last: Job | undefined;

  constructor(private readonly ui: Ui) {}

  // ---- commands -----------------------------------------------------------

  async copyToClipboard(clicked?: unknown, selected?: unknown): Promise<void> {
    const uris = await resolveExplorerSelection(clicked, selected);
    if (uris.length === 0) {
      throw new CopyError('Select files or folders in the Explorer, or open a file, then try again.');
    }
    const { folder, targets } = resolveTargets(uris);
    await this.execute({ kind: 'contents', folder, targets, uris });
  }

  async copySelectedTabs(clicked?: unknown): Promise<void> {
    const { uris, dirty } = await resolveSelectedTabs(clicked);
    const { folder, targets } = resolveTargets(uris);
    const extraWarnings =
      dirty.length > 0
        ? [`Copied the saved version of ${dirty.join(', ')}; unsaved edits are not included.`]
        : [];
    await this.execute({ kind: 'contents', folder, targets, uris }, { extraWarnings });
  }

  async copyProjectStructure(clicked?: unknown, selected?: unknown): Promise<void> {
    const uris = flattenUris(selected, clicked);
    let folder: vscode.WorkspaceFolder | undefined;
    let target = '';
    if (uris.length === 0) {
      folder = await pickWorkspaceFolder();
    } else {
      folder = vscode.workspace.getWorkspaceFolder(uris[0]);
      if (folder) {
        // A folder gives its own tree; a file gives the tree of the whole workspace folder.
        const stat = await vscode.workspace.fs.stat(uris[0]);
        if (stat.type & vscode.FileType.Directory) target = relativeFromFolder(folder, uris[0]) ?? '';
      }
    }
    if (!folder) return;
    await this.execute({ kind: 'structure', folder, targets: [target], uris: [] });
  }

  async copySourceControlContents(...args: unknown[]): Promise<void> {
    const uris = flattenUris(...args);
    if (uris.length === 0) throw new CopyError('Select changed files in the Source Control view first.');
    const { folder, targets } = resolveTargets(uris);
    await this.execute({ kind: 'contents', folder, targets, uris });
  }

  async copyChanges(...args: unknown[]): Promise<void> {
    const uris = flattenUris(...args);
    if (uris.length === 0) throw new CopyError('Select changed files in the Source Control view first.');
    const { folder, targets } = resolveTargets(uris);
    await this.execute({ kind: 'diff', folder, targets, uris });
  }

  async repeatLastCopy(): Promise<void> {
    if (!this.last) throw new CopyError('There is no previous copy to repeat in this window yet.');
    await this.execute(this.last);
  }

  async forceCopy(): Promise<void> {
    const uris = await resolveExplorerSelection();
    if (uris.length === 0) {
      throw new CopyError('Select files or folders in the Explorer, or open the file you want to copy.');
    }
    const { folder, targets } = resolveTargets(uris);
    const shown = targets.map((t) => (t === '' ? `${folder.name}/ (whole folder)` : t));
    const detail =
      shown.slice(0, 10).join('\n') +
      (shown.length > 10 ? `\n… and ${shown.length - 10} more` : '') +
      '\n\nThis copy includes dot files, .gitignore matches and files excluded by your settings. ' +
      'Selected folders include everything inside them, which can contain secrets and large dependency folders. ' +
      'Binary files, unsupported encodings and the file size limit still produce placeholders.';
    const answer = await vscode.window.showWarningMessage(
      'Copy the selection without any exclusions?',
      { modal: true, detail },
      'Force Copy',
    );
    if (answer !== 'Force Copy') return;
    await this.execute({ kind: 'contents', folder, targets, uris }, { force: true, remember: false });
  }

  async toggleProjectTree(): Promise<void> {
    const on = await toggleUserSetting('includeProjectTree');
    this.ui.flash(`Project tree ${on ? 'on' : 'off'}`);
  }

  async toggleDotFiles(): Promise<void> {
    const ignored = await toggleUserSetting('ignoreDotFiles');
    this.ui.flash(`Dot files ${ignored ? 'ignored' : 'included'}`);
  }

  // ---- shared flow --------------------------------------------------------

  private async execute(job: Job, opts: RunOptions = {}): Promise<void> {
    const force = opts.force === true;
    const settings = readSettings(job.folder.uri);
    const fs = new WorkspaceFolderFs(job.folder.uri);
    const title = force ? 'PromptPack: copying without exclusions…' : 'PromptPack: collecting files…';

    let result: CopyResult;
    try {
      result = await this.ui.withProgress({ title, cancellable: force }, async (signal, report) => {
        if (job.kind === 'diff') {
          const matcher = await buildMatcher(fs, settings, false, job.folder.uri.fsPath);
          const diffs = await collectDiffs(job.uris, job.folder, settings, matcher, signal);
          return buildDiffResult(diffs.entries, settings, diffs.warnings);
        }
        return runCopy({
          fs,
          rootName: job.folder.name,
          targets: job.targets,
          mode: job.kind,
          settings,
          force,
          rootAbs: job.folder.uri.fsPath,
          signal,
          onProgress: (p) =>
            report(p.phase === 'scan' ? `${p.done} found` : `${p.done} of ${p.total ?? '?'} read`),
        });
      });
    } catch (err) {
      if (err instanceof CancelledError) {
        vscode.window.setStatusBarMessage('PromptPack: copy cancelled, clipboard unchanged', 4000);
        return;
      }
      this.ui.error(err instanceof Error ? err.message : String(err));
      return;
    }

    await vscode.env.clipboard.writeText(result.text);

    if (opts.remember !== false) {
      this.last = job;
      void vscode.commands.executeCommand('setContext', 'promptpack.hasLastCopy', true);
    }

    let summary: string;
    if (job.kind === 'structure') summary = 'Copied project structure';
    else if (job.kind === 'diff') summary = `Copied changes of ${result.fileCount} file${result.fileCount === 1 ? '' : 's'}`;
    else summary = `Copied ${result.fileCount} file${result.fileCount === 1 ? '' : 's'}`;

    let tokensText: string | undefined;
    let overLimit = false;
    if (settings.enableTokenCounting) {
      const count = countTokens(result.text, settings.llmModel);
      tokensText = formatTokenCount(count);
      overLimit = settings.maxTokens > 0 && count.tokens > settings.maxTokens;
      summary += ` · ${tokensText}`;
    }
    this.ui.flash(summary);
    this.ui.log.appendLine(`${summary} (${force ? 'forced, ' : ''}${job.kind}, ${job.folder.name})`);

    const warnings = [...(opts.extraWarnings ?? []), ...result.warnings];
    if (overLimit && tokensText) await this.ui.warnTokens(tokensText, settings.maxTokens);
    await this.ui.warnAll(warnings);
  }
}

import * as vscode from 'vscode';
import type { CancelSignal } from '../core/types';

export class Ui {
  constructor(readonly log: vscode.OutputChannel) {}

  /** Quiet success message in the status bar; copying is not a decision, so no notification. */
  flash(message: string, ms = 4000): void {
    vscode.window.setStatusBarMessage(`$(check) ${message}`, ms);
  }

  /**
   * Runs a task with progress. Normal copies show a spinner in the status bar;
   * force copies use a notification with a Cancel button.
   */
  async withProgress<T>(
    opts: { title: string; cancellable: boolean },
    task: (signal: CancelSignal, report: (message: string) => void) => Promise<T>,
  ): Promise<T> {
    return vscode.window.withProgress(
      {
        location: opts.cancellable ? vscode.ProgressLocation.Notification : vscode.ProgressLocation.Window,
        title: opts.title,
        cancellable: opts.cancellable,
      },
      (progress, token) => {
        const signal: CancelSignal = {
          get aborted() {
            return token.isCancellationRequested;
          },
        };
        return task(signal, (message) => progress.report({ message }));
      },
    );
  }

  /** Shows one notification for all warnings; details go to the output channel. */
  async warnAll(warnings: string[]): Promise<void> {
    if (warnings.length === 0) return;
    for (const w of warnings) this.log.appendLine(`warning: ${w}`);
    const extra = warnings.length > 1 ? ` (+${warnings.length - 1} more)` : '';
    const choice = await vscode.window.showWarningMessage(
      `PromptPack: ${warnings[0]}${extra}`,
      ...(warnings.length > 1 ? ['Show Details'] : []),
    );
    if (choice === 'Show Details') this.log.show(true);
  }

  async warnTokens(tokensText: string, maxTokens: number): Promise<void> {
    const choice = await vscode.window.showWarningMessage(
      `PromptPack: the copy is ${tokensText}, above your limit of ${maxTokens.toLocaleString('en-US')} tokens.`,
      'Configure Exclusions',
    );
    if (choice === 'Configure Exclusions') {
      await vscode.commands.executeCommand('workbench.action.openSettings', 'promptpack.exclude');
    }
  }

  error(message: string): void {
    this.log.appendLine(`error: ${message}`);
    void vscode.window.showErrorMessage(`PromptPack: ${message}`);
  }
}

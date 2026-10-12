import * as vscode from 'vscode';
import { CancelledError, CopyError } from './core/types';
import { Actions } from './vscode/actions';
import { migrateDeprecatedSettings } from './vscode/settings';
import { Ui } from './vscode/ui';

export function activate(context: vscode.ExtensionContext): void {
  const log = vscode.window.createOutputChannel('PromptPack');
  const ui = new Ui(log);
  const actions = new Actions(ui);
  context.subscriptions.push(log);

  void vscode.commands.executeCommand('setContext', 'promptpack.hasLastCopy', false);
  void migrateDeprecatedSettings((m) => log.appendLine(m));

  // Every command goes through the same guard so errors reach the user as messages.
  const register = (id: string, fn: (...args: unknown[]) => Promise<void>) =>
    context.subscriptions.push(
      vscode.commands.registerCommand(id, async (...args: unknown[]) => {
        try {
          await fn(...args);
        } catch (err) {
          if (err instanceof CancelledError) return;
          ui.error(err instanceof CopyError || err instanceof Error ? err.message : String(err));
        }
      }),
    );

  register('promptpack.copyToClipboard', (a, b) => actions.copyToClipboard(a, b));
  register('promptpack.copySelectedTabs', (a) => actions.copySelectedTabs(a));
  register('promptpack.copyProjectStructure', (a, b) => actions.copyProjectStructure(a, b));
  register('promptpack.copySourceControlContents', (...a) => actions.copySourceControlContents(...a));
  register('promptpack.copyChanges', (...a) => actions.copyChanges(...a));
  register('promptpack.repeatLastCopy', () => actions.repeatLastCopy());
  register('promptpack.forceCopy', () => actions.forceCopy());
  register('promptpack.toggleProjectTree', () => actions.toggleProjectTree());
  register('promptpack.toggleDotFiles', () => actions.toggleDotFiles());
}

export function deactivate(): void {
  // Nothing to clean up: all disposables are registered on the extension context.
}

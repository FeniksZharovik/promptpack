/** Helpers for turning untracked files into "new file" unified diffs. */

function header(path: string): string[] {
  return [`diff --git a/${path} b/${path}`, 'new file mode 100644'];
}

/** Unified diff that adds a whole text file, like `git diff` shows for a new file. */
export function makeNewFileDiff(path: string, content: string): string {
  const lines = header(path);
  if (content.length === 0) return lines.join('\n') + '\n';
  const endsWithNewline = content.endsWith('\n');
  const body = (endsWithNewline ? content.slice(0, -1) : content).split('\n');
  lines.push('--- /dev/null', `+++ b/${path}`, `@@ -0,0 +1,${body.length} @@`);
  for (const l of body) lines.push('+' + l);
  if (!endsWithNewline) lines.push('\\ No newline at end of file');
  return lines.join('\n') + '\n';
}

/** New-file entry for content that cannot be shown (binary, too large, wrong encoding). */
export function makeNewFileNote(path: string, note: string): string {
  return [...header(path), `# ${note}`].join('\n') + '\n';
}

export function isEmptyDiff(diff: string | undefined | null): boolean {
  return !diff || diff.trim() === '';
}

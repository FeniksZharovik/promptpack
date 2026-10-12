import { languageFor } from './languages';
import type { CollectedFile, DiffEntry, OutputFormat } from './types';

/** A backtick fence longer than any run of backticks inside the content (minimum 3). */
export function chooseFence(content: string): string {
  let longest = 0;
  for (const run of content.match(/`+/g) ?? []) longest = Math.max(longest, run.length);
  return '`'.repeat(Math.max(3, longest + 1));
}

function withTrailingNewline(s: string): string {
  return s.endsWith('\n') ? s : s + '\n';
}

function escapeAttr(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function cdata(s: string): string {
  return `<![CDATA[${s.replace(/\]\]>/g, ']]]]><![CDATA[>')}]]>`;
}

const RULE = '='.repeat(80);

export interface ContentsInput {
  files: CollectedFile[];
  /** Rendered tree, or undefined to leave the tree out. */
  tree?: string;
  format: OutputFormat;
}

function markdownFile(f: CollectedFile): string {
  if (f.status !== 'ok') return `## ${f.path}\n\n${f.note ?? ''}\n`;
  const content = f.content ?? '';
  const fence = chooseFence(content);
  return `## ${f.path}\n\n${fence}${languageFor(f.path)}\n${withTrailingNewline(content)}${fence}\n`;
}

function xmlFile(f: CollectedFile): string {
  const lang = languageFor(f.path);
  const attrs = `path="${escapeAttr(f.path)}"${lang ? ` language="${lang}"` : ''}`;
  if (f.status !== 'ok') {
    return `<file path="${escapeAttr(f.path)}" status="${f.status}">\n${f.note ?? ''}\n</file>`;
  }
  const content = f.content ?? '';
  const body = content.includes('</file>') ? cdata(content) : content;
  return `<file ${attrs}>\n${withTrailingNewline(body)}</file>`;
}

function plainFile(f: CollectedFile): string {
  const head = `${RULE}\nFile: ${f.path}\n${RULE}\n`;
  if (f.status !== 'ok') return `${head}${f.note ?? ''}\n`;
  return head + withTrailingNewline(f.content ?? '');
}

export function formatContents(input: ContentsInput): string {
  const { files, tree, format } = input;
  if (format === 'xml') {
    const parts: string[] = [];
    if (tree !== undefined) parts.push(`<project_structure>\n${tree}\n</project_structure>`);
    parts.push(`<file_contents>\n${files.map(xmlFile).join('\n')}\n</file_contents>`);
    return parts.join('\n\n') + '\n';
  }
  if (format === 'plaintext') {
    const parts: string[] = [];
    if (tree !== undefined) parts.push(`Project Structure:\n\n${tree}`);
    parts.push(`File Contents:\n\n${files.map(plainFile).join('\n')}`);
    return parts.join('\n\n') + '\n';
  }
  const parts: string[] = [];
  if (tree !== undefined) {
    const fence = chooseFence(tree);
    parts.push(`# Project Structure\n\n${fence}\n${tree}\n${fence}`);
  }
  parts.push(`# File Contents\n\n${files.map(markdownFile).join('\n')}`);
  return parts.join('\n\n').replace(/\n+$/, '') + '\n';
}

export function formatStructure(tree: string, format: OutputFormat): string {
  if (format === 'xml') return `<project_structure>\n${tree}\n</project_structure>\n`;
  if (format === 'plaintext') return `Project Structure:\n\n${tree}\n`;
  const fence = chooseFence(tree);
  return `# Project Structure\n\n${fence}\n${tree}\n${fence}\n`;
}

export function formatDiffs(entries: DiffEntry[], format: OutputFormat): string {
  if (format === 'xml') {
    const body = entries
      .map((e) => {
        const text = withTrailingNewline(e.diff);
        const safe = text.includes('</diff>') ? cdata(text) : text;
        return `<diff path="${escapeAttr(e.path)}">\n${safe}</diff>`;
      })
      .join('\n');
    return `<changes>\n${body}\n</changes>\n`;
  }
  if (format === 'plaintext') {
    const body = entries
      .map((e) => `${RULE}\nChanges: ${e.path}\n${RULE}\n${withTrailingNewline(e.diff)}`)
      .join('\n');
    return `Changes:\n\n${body}`;
  }
  const body = entries
    .map((e) => {
      const fence = chooseFence(e.diff);
      return `## ${e.path}\n\n${fence}diff\n${withTrailingNewline(e.diff)}${fence}\n`;
    })
    .join('\n');
  return `# Changes\n\n${body}`;
}

import { compareNames, isInside, segments } from './paths';

export interface TreeOptions {
  /** First line of the tree, for example "src/". */
  rootLabel: string;
  /** Deepest level shown. Level 1 is the direct children of the root. */
  maxDepth: number;
  /** Directories to show even when they hold no file (empty folders). */
  dirs?: string[];
  /** Folder that becomes the root: paths are made relative to it, others are dropped. */
  stripBase?: string;
}

interface Node {
  name: string;
  isDir: boolean;
  children: Map<string, Node>;
}

function newNode(name: string, isDir: boolean): Node {
  return { name, isDir, children: new Map() };
}

function strip(path: string, base: string | undefined): string | null {
  if (!base) return path;
  if (path === base) return '';
  return isInside(path, base) ? path.slice(base.length + 1) : null;
}

function insert(root: Node, path: string, asDir: boolean): void {
  const segs = segments(path);
  let node = root;
  segs.forEach((seg, i) => {
    const last = i === segs.length - 1;
    const wantDir = !last || asDir;
    let child = node.children.get(seg);
    if (!child) {
      child = newNode(seg, wantDir);
      node.children.set(seg, child);
    } else if (wantDir) {
      child.isDir = true;
    }
    node = child;
  });
}

function sortedChildren(node: Node): Node[] {
  return [...node.children.values()].sort((a, b) => {
    if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
    return compareNames(a.name, b.name);
  });
}

function render(node: Node, prefix: string, level: number, maxDepth: number, out: string[]): void {
  const kids = sortedChildren(node);
  kids.forEach((child, i) => {
    const last = i === kids.length - 1;
    const cut = child.isDir && child.children.size > 0 && level >= maxDepth;
    out.push(`${prefix}${last ? '└── ' : '├── '}${child.name}${cut ? ' (…)' : ''}`);
    if (child.children.size > 0 && level < maxDepth) {
      render(child, prefix + (last ? '    ' : '│   '), level + 1, maxDepth, out);
    }
  });
}

export function renderTree(paths: string[], opts: TreeOptions): string {
  const maxDepth = Math.max(1, Math.floor(opts.maxDepth));
  const root = newNode('', true);
  for (const p of paths) {
    const rel = strip(p, opts.stripBase);
    if (rel) insert(root, rel, false);
  }
  for (const d of opts.dirs ?? []) {
    const rel = strip(d, opts.stripBase);
    if (rel) insert(root, rel, true);
  }
  const lines = [opts.rootLabel];
  render(root, '', 1, maxDepth, lines);
  return lines.join('\n');
}

import { DEFAULT_SETTINGS } from '../src/core/config';
import {
  type FileSystemLike,
  type FsEntry,
  type FsStat,
  type Settings,
  FsError,
} from '../src/core/types';

/** In-memory file system. Keys are root-relative paths; values are text or bytes. */
export function memFs(files: Record<string, string | Uint8Array>, emptyDirs: string[] = []): FileSystemLike {
  const dirs = new Set<string>(['']);
  for (const p of [...Object.keys(files), ...emptyDirs.map((d) => d + '/x')]) {
    const parts = p.split('/');
    for (let i = 1; i < parts.length; i++) dirs.add(parts.slice(0, i).join('/'));
  }
  const bytes = (v: string | Uint8Array) => (typeof v === 'string' ? new TextEncoder().encode(v) : v);

  return {
    async readDirectory(rel: string): Promise<FsEntry[]> {
      if (!dirs.has(rel)) throw new FsError('ENOENT', rel);
      const prefix = rel === '' ? '' : rel + '/';
      const out = new Map<string, FsEntry>();
      for (const d of dirs) {
        if (d.startsWith(prefix) && d !== rel) {
          const name = d.slice(prefix.length).split('/')[0];
          out.set(name, { name, type: 'dir' });
        }
      }
      for (const f of Object.keys(files)) {
        if (f.startsWith(prefix)) {
          const rest = f.slice(prefix.length);
          if (!rest.includes('/')) out.set(rest, { name: rest, type: 'file' });
        }
      }
      return [...out.values()];
    },
    async readFile(rel: string): Promise<Uint8Array> {
      if (!(rel in files)) throw new FsError('ENOENT', rel);
      return bytes(files[rel]);
    },
    async stat(rel: string): Promise<FsStat> {
      if (rel in files) return { type: 'file', size: bytes(files[rel]).length };
      if (dirs.has(rel)) return { type: 'dir', size: 0 };
      throw new FsError('ENOENT', rel);
    },
  };
}

export function settings(over: Partial<Settings> = {}): Settings {
  return { ...DEFAULT_SETTINGS, ...over };
}

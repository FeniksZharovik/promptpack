import assert from 'node:assert/strict';
import test from 'node:test';
import { collect, decodeFileBytes, mapLimit } from '../src/core/collector';
import { createMatcher, noExclusions } from '../src/core/matcher';
import { CancelledError } from '../src/core/types';
import { memFs } from './helpers';

const rules = {
  ignoreDotFiles: true,
  gitignoreText: null,
  excludePaths: [],
  excludePatterns: ['node_modules'],
  excludeContentPatterns: [],
};

test('walks a folder, applies exclusions, sorts results', async () => {
  const fs = memFs({
    'src/b.ts': 'b',
    'src/a.ts': 'a',
    'src/.hidden': 'h',
    'src/node_modules/x.js': 'x',
    'README.md': 'r',
  });
  const r = await collect({ fs, targets: ['src'], matcher: createMatcher(rules), maxFileSize: 1000, readContents: true });
  assert.deepEqual(r.files.map((f) => f.path), ['src/a.ts', 'src/b.ts']);
  assert.deepEqual(r.targets, [{ path: 'src', kind: 'dir' }]);
});

test('targets inside a selected folder are not collected twice', async () => {
  const fs = memFs({ 'src/a.ts': 'a', 'src/sub/b.ts': 'b' });
  const r = await collect({ fs, targets: ['src', 'src/sub/b.ts', 'src/a.ts'], matcher: noExclusions, maxFileSize: 1000, readContents: true });
  assert.deepEqual(r.files.map((f) => f.path), ['src/a.ts', 'src/sub/b.ts']);
  assert.equal(r.targets.length, 1);
});

test('placeholders for binary, large, content-excluded and bad encodings', async () => {
  const fs = memFs({
    'bin.dat': new Uint8Array([1, 2, 0, 3]),
    'big.txt': 'x'.repeat(2000),
    'logo.svg': '<svg/>',
    'utf16.txt': new Uint8Array([0xff, 0xfe, 0x61, 0x00]),
    'latin1.txt': new Uint8Array([0x63, 0x61, 0x66, 0xe9]),
    'ok.txt': 'fine',
  });
  const matcher = createMatcher({ ...rules, excludeContentPatterns: ['*.svg'] });
  const r = await collect({ fs, targets: [''], matcher, maxFileSize: 1000, readContents: true });
  const by = Object.fromEntries(r.files.map((f) => [f.path, f]));
  assert.equal(by['bin.dat'].note, '[Binary file content not included]');
  assert.match(by['big.txt'].note ?? '', /^\[File too large: 2\.0 KB > 1000 B\]$/);
  assert.equal(by['logo.svg'].note, '[File content not included]');
  assert.equal(by['utf16.txt'].status, 'badEncoding');
  assert.match(by['utf16.txt'].note ?? '', /UTF-16/);
  assert.equal(by['latin1.txt'].status, 'badEncoding');
  assert.equal(by['ok.txt'].content, 'fine');
});

test('deleted targets are skipped with a warning', async () => {
  const fs = memFs({ 'a.ts': 'a' });
  const r = await collect({ fs, targets: ['a.ts', 'gone.ts'], matcher: noExclusions, maxFileSize: 1000, readContents: true });
  assert.deepEqual(r.files.map((f) => f.path), ['a.ts']);
  assert.match(r.warnings.join(' '), /deleted file: gone\.ts/);
});

test('an explicitly selected file that is excluded is reported, not copied', async () => {
  const fs = memFs({ '.env': 'SECRET=1' });
  const r = await collect({ fs, targets: ['.env'], matcher: createMatcher(rules), maxFileSize: 1000, readContents: true });
  assert.equal(r.files.length, 0);
  assert.match(r.warnings.join(' '), /exclusion rules: \.env/);
});

test('structure mode does not read file contents', async () => {
  const fs = memFs({ 'a.ts': 'a', 'dir/b.ts': 'b' }, ['empty']);
  const r = await collect({ fs, targets: [''], matcher: noExclusions, maxFileSize: 1000, readContents: false });
  assert.deepEqual(r.files.map((f) => f.path), ['a.ts', 'dir/b.ts']);
  assert.ok(r.files.every((f) => f.content === undefined));
  assert.ok(r.dirs.includes('empty'));
});

test('cancellation stops the walk', async () => {
  const fs = memFs({ 'a.ts': 'a' });
  await assert.rejects(
    collect({ fs, targets: [''], matcher: noExclusions, maxFileSize: 1000, readContents: true, signal: { aborted: true } }),
    CancelledError,
  );
});

test('decodeFileBytes strips a UTF-8 BOM', () => {
  const d = decodeFileBytes(new Uint8Array([0xef, 0xbb, 0xbf, 0x68, 0x69]));
  assert.deepEqual(d, { kind: 'ok', text: 'hi' });
});

test('mapLimit keeps order and respects the limit', async () => {
  let inFlight = 0;
  let peak = 0;
  const out = await mapLimit([1, 2, 3, 4, 5, 6], 2, async (n) => {
    inFlight++;
    peak = Math.max(peak, inFlight);
    await new Promise((r) => setTimeout(r, 5));
    inFlight--;
    return n * 2;
  });
  assert.deepEqual(out, [2, 4, 6, 8, 10, 12]);
  assert.ok(peak <= 2);
});

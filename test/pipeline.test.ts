import assert from 'node:assert/strict';
import test from 'node:test';
import { buildDiffResult, runCopy } from '../src/core/pipeline';
import { CopyError } from '../src/core/types';
import { memFs, settings } from './helpers';

const project = {
  'src/index.ts': "import { add } from './utils/math';\n\nconsole.log(add(2, 3));\n",
  'src/utils/math.ts': 'export const add = (a: number, b: number) => a + b;\n',
  '.gitignore': 'dist/\n',
  '.env': 'KEY=1',
  'dist/out.js': 'x',
  'node_modules/p/i.js': 'x',
  'README.md': '# Hi\n',
};

test('copying a folder reproduces the documented example', async () => {
  const r = await runCopy({ fs: memFs(project), rootName: 'demo', targets: ['src'], mode: 'contents', settings: settings() });
  assert.equal(
    r.text,
    [
      '# Project Structure',
      '',
      '```',
      'src/',
      '├── utils',
      '│   └── math.ts',
      '└── index.ts',
      '```',
      '',
      '# File Contents',
      '',
      '## src/index.ts',
      '',
      '```typescript',
      "import { add } from './utils/math';",
      '',
      'console.log(add(2, 3));',
      '```',
      '',
      '## src/utils/math.ts',
      '',
      '```typescript',
      'export const add = (a: number, b: number) => a + b;',
      '```',
      '',
    ].join('\n'),
  );
  assert.equal(r.fileCount, 2);
});

test('several items start the tree at the workspace folder', async () => {
  const r = await runCopy({ fs: memFs(project), rootName: 'demo', targets: ['src/index.ts', 'README.md'], mode: 'contents', settings: settings() });
  assert.ok(r.text.includes('```\ndemo/\n├── src\n│   └── index.ts\n└── README.md\n```'));
});

test('whole workspace honours dot files, .gitignore and default patterns', async () => {
  const r = await runCopy({ fs: memFs(project), rootName: 'demo', targets: [''], mode: 'contents', settings: settings() });
  assert.ok(!r.text.includes('.env'));
  assert.ok(!r.text.includes('dist/out.js'));
  assert.ok(!r.text.includes('node_modules'));
  assert.ok(r.text.includes('## README.md'));
});

test('force copy includes everything that was excluded', async () => {
  const r = await runCopy({ fs: memFs(project), rootName: 'demo', targets: [''], mode: 'contents', settings: settings(), force: true });
  for (const p of ['.env', 'dist/out.js', 'node_modules/p/i.js', '.gitignore']) assert.ok(r.text.includes(`## ${p}`), p);
});

test('includeProjectTree=false drops the tree', async () => {
  const r = await runCopy({ fs: memFs(project), rootName: 'demo', targets: ['src'], mode: 'contents', settings: settings({ includeProjectTree: false }) });
  assert.ok(!r.text.includes('Project Structure'));
});

test('xml and plaintext formats go through the whole pipeline', async () => {
  const xml = await runCopy({ fs: memFs(project), rootName: 'demo', targets: ['src'], mode: 'contents', settings: settings({ outputFormat: 'xml' }) });
  assert.ok(xml.text.includes('<file path="src/utils/math.ts" language="typescript">'));
  const txt = await runCopy({ fs: memFs(project), rootName: 'demo', targets: ['src'], mode: 'contents', settings: settings({ outputFormat: 'plaintext' }) });
  assert.ok(txt.text.includes('File: src/utils/math.ts'));
});

test('structure copy shows the whole folder, contents left out', async () => {
  const r = await runCopy({ fs: memFs(project), rootName: 'demo', targets: [''], mode: 'structure', settings: settings() });
  assert.ok(r.text.startsWith('# Project Structure'));
  assert.ok(!r.text.includes('File Contents'));
  assert.ok(r.text.includes('README.md'));
});

test('maxDepth limits the tree but not the copied files', async () => {
  const fs = memFs({ 'a/b/c/d.ts': 'deep' });
  const r = await runCopy({ fs, rootName: 'demo', targets: [''], mode: 'contents', settings: settings({ maxDepth: 1 }) });
  assert.ok(r.text.includes('└── a (…)'));
  assert.ok(r.text.includes('## a/b/c/d.ts'));
});

test('fails when every selected file was deleted, warns when only some were', async () => {
  const fs = memFs({ 'a.ts': 'a' });
  await assert.rejects(runCopy({ fs, rootName: 'd', targets: ['x.ts', 'y.ts'], mode: 'contents', settings: settings() }), CopyError);
  const r = await runCopy({ fs, rootName: 'd', targets: ['a.ts', 'x.ts'], mode: 'contents', settings: settings() });
  assert.equal(r.fileCount, 1);
  assert.match(r.warnings.join(' '), /deleted file: x\.ts/);
});

test('diff results fail when nothing changed', () => {
  assert.throws(() => buildDiffResult([{ path: 'a.ts', diff: '  \n' }], settings()), CopyError);
  const ok = buildDiffResult([{ path: 'a.ts', diff: '+x\n' }, { path: 'b.ts', diff: '' }], settings());
  assert.equal(ok.fileCount, 1);
});

import assert from 'node:assert/strict';
import test from 'node:test';
import { chooseFence, formatContents, formatDiffs, formatStructure } from '../src/core/formatter';
import type { CollectedFile } from '../src/core/types';

const files: CollectedFile[] = [
  { path: 'src/index.ts', status: 'ok', content: "import { add } from './utils/math';\n" },
  { path: 'logo.png', status: 'binary', note: '[Binary file content not included]' },
];

test('markdown output matches the documented layout', () => {
  const out = formatContents({ files, tree: 'src/\n└── index.ts', format: 'markdown' });
  assert.equal(
    out,
    [
      '# Project Structure',
      '',
      '```',
      'src/',
      '└── index.ts',
      '```',
      '',
      '# File Contents',
      '',
      '## src/index.ts',
      '',
      '```typescript',
      "import { add } from './utils/math';",
      '```',
      '',
      '## logo.png',
      '',
      '[Binary file content not included]',
      '',
    ].join('\n'),
  );
});

test('uses a longer fence when the content has code fences', () => {
  assert.equal(chooseFence('no fences'), '```');
  assert.equal(chooseFence('a\n```js\nb\n```\n'), '````');
  const out = formatContents({
    files: [{ path: 'README.md', status: 'ok', content: '```js\nx\n```' }],
    format: 'markdown',
  });
  assert.ok(out.includes('````markdown\n```js\nx\n```\n````'));
});

test('tree can be left out', () => {
  const out = formatContents({ files, format: 'markdown' });
  assert.ok(!out.includes('# Project Structure'));
  assert.ok(out.startsWith('# File Contents'));
});

test('xml output escapes attributes and guards closing tags', () => {
  const out = formatContents({
    files: [
      { path: 'a&b.ts', status: 'ok', content: 'const x = 1;' },
      { path: 'weird.txt', status: 'ok', content: 'oops </file> here' },
    ],
    tree: 'r/',
    format: 'xml',
  });
  assert.ok(out.includes('<project_structure>\nr/\n</project_structure>'));
  assert.ok(out.includes('<file path="a&amp;b.ts" language="typescript">\nconst x = 1;\n</file>'));
  assert.ok(out.includes('<![CDATA[oops </file> here]]>'));
});

test('plaintext output uses separator lines', () => {
  const out = formatContents({ files: [files[0]], tree: 'src/', format: 'plaintext' });
  assert.ok(out.startsWith('Project Structure:\n\nsrc/'));
  assert.ok(out.includes('='.repeat(80) + '\nFile: src/index.ts\n'));
});

test('structure and diff formats', () => {
  assert.equal(formatStructure('r/', 'markdown'), '# Project Structure\n\n```\nr/\n```\n');
  assert.equal(formatStructure('r/', 'xml'), '<project_structure>\nr/\n</project_structure>\n');
  const md = formatDiffs([{ path: 'a.ts', diff: '+x\n' }], 'markdown');
  assert.equal(md, '# Changes\n\n## a.ts\n\n```diff\n+x\n```\n');
  assert.ok(formatDiffs([{ path: 'a.ts', diff: '+x\n' }], 'xml').startsWith('<changes>\n<diff path="a.ts">'));
});

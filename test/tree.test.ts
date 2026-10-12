import assert from 'node:assert/strict';
import test from 'node:test';
import { renderTree } from '../src/core/tree';

test('renders folders first, then files, with box-drawing connectors', () => {
  const out = renderTree(['src/index.ts', 'src/utils/math.ts'], { rootLabel: 'src/', maxDepth: 5, stripBase: 'src' });
  assert.equal(out, ['src/', '├── utils', '│   └── math.ts', '└── index.ts'].join('\n'));
});

test('sorts names case-insensitively', () => {
  const out = renderTree(['b.ts', 'A.ts', 'c.ts'], { rootLabel: 'r/', maxDepth: 5 });
  assert.equal(out, ['r/', '├── A.ts', '├── b.ts', '└── c.ts'].join('\n'));
});

test('maxDepth hides deeper levels and marks the cut folder', () => {
  const out = renderTree(['a/b/c/d.ts'], { rootLabel: 'r/', maxDepth: 2 });
  assert.equal(out, ['r/', '└── a', '    └── b (…)'].join('\n'));
});

test('empty folders show only when passed as dirs', () => {
  assert.equal(renderTree(['a.ts'], { rootLabel: 'r/', maxDepth: 5 }), 'r/\n└── a.ts');
  const out = renderTree(['a.ts'], { rootLabel: 'r/', maxDepth: 5, dirs: ['empty'] });
  assert.equal(out, ['r/', '├── empty', '└── a.ts'].join('\n'));
});

test('stripBase drops paths outside the base', () => {
  const out = renderTree(['x/a.ts', 'y/b.ts'], { rootLabel: 'x/', maxDepth: 5, stripBase: 'x' });
  assert.equal(out, 'x/\n└── a.ts');
});

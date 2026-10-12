import assert from 'node:assert/strict';
import test from 'node:test';
import { createMatcher, noExclusions } from '../src/core/matcher';

const base = {
  ignoreDotFiles: true,
  gitignoreText: null,
  excludePaths: [] as string[],
  excludePatterns: ['node_modules', '*.log'],
  excludeContentPatterns: [] as string[],
};

test('skips dot files and dot folders at any depth', () => {
  const m = createMatcher(base);
  assert.equal(m.isExcluded('.env', false), true);
  assert.equal(m.isExcluded('src/.cache/x.ts', false), true);
  assert.equal(m.isExcluded('src/app.ts', false), false);
  assert.equal(createMatcher({ ...base, ignoreDotFiles: false }).isExcluded('.env', false), false);
});

test('default patterns exclude node_modules and logs', () => {
  const m = createMatcher(base);
  assert.equal(m.isExcluded('node_modules', true), true);
  assert.equal(m.isExcluded('a/node_modules/b.js', false), true);
  assert.equal(m.isExcluded('debug.log', false), true);
  assert.equal(m.isExcluded('a/b/c.log', false), true);
});

test('gitignore rules apply', () => {
  const m = createMatcher({ ...base, gitignoreText: 'dist/\n*.tmp\n' });
  assert.equal(m.isExcluded('dist', true), true);
  assert.equal(m.isExcluded('dist/x.js', false), true);
  assert.equal(m.isExcluded('a.tmp', false), true);
  assert.equal(m.isExcluded('dist', false), false); // "dist/" only matches folders
});

test('exclude paths cover the folder and everything inside', () => {
  const m = createMatcher({ ...base, excludePaths: ['src/config', 'vendor\\pkg'] });
  assert.equal(m.isExcluded('src/config', true), true);
  assert.equal(m.isExcluded('src/config/a.ts', false), true);
  assert.equal(m.isExcluded('src/configuration.ts', false), false);
  assert.equal(m.isExcluded('vendor/pkg/x.js', false), true);
});

test('absolute exclude paths inside the root are accepted', () => {
  const m = createMatcher({ ...base, excludePaths: ['/work/app/secrets'], rootAbs: '/work/app' });
  assert.equal(m.isExcluded('secrets/key.txt', false), true);
  const outside = createMatcher({ ...base, excludePaths: ['/other/secrets'], rootAbs: '/work/app' });
  assert.equal(outside.isExcluded('secrets/key.txt', false), false);
});

test('patterns are case-sensitive', () => {
  const m = createMatcher({ ...base, excludePatterns: ['*.BASE.*'] });
  assert.equal(m.isExcluded('tsconfig.BASE.json', false), true);
  assert.equal(m.isExcluded('tsconfig.base.json', false), false);
});

test('content patterns keep a file but flag its content', () => {
  const m = createMatcher({ ...base, excludeContentPatterns: ['**/*.svg', 'assets/**'] });
  assert.equal(m.isContentExcluded('img/logo.svg'), true);
  assert.equal(m.isContentExcluded('assets/a/b.txt'), true);
  assert.equal(m.isContentExcluded('src/a.ts'), false);
  assert.equal(m.isExcluded('img/logo.svg', false), false);
});

test('noExclusions excludes nothing', () => {
  assert.equal(noExclusions.isExcluded('.env', false), false);
  assert.equal(noExclusions.isContentExcluded('a.svg'), false);
});

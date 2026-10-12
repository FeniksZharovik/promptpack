import assert from 'node:assert/strict';
import test from 'node:test';
import { DEFAULT_SETTINGS, planMigration, resolveSettings } from '../src/core/config';
import { isEmptyDiff, makeNewFileDiff, makeNewFileNote } from '../src/core/diff';
import { languageFor } from '../src/core/languages';
import {
  formatBytes,
  isInside,
  normalizeExcludePath,
  normalizeFsPath,
  normalizeRel,
  relativeToRoot,
} from '../src/core/paths';
import { countTokens, formatTokenCount, pickTokenizer } from '../src/core/tokens';

test('paths: normalization', () => {
  assert.equal(normalizeRel('./a//b/../c/'), 'a/c');
  assert.equal(normalizeRel('a\\b'), 'a/b');
  assert.equal(normalizeRel('../x'), null);
  assert.equal(normalizeRel(''), '');
  assert.equal(isInside('a/b', 'a'), true);
  assert.equal(isInside('ab', 'a'), false);
  assert.equal(normalizeFsPath('C:\\Work\\App\\'), 'c:/work/app');
  assert.equal(relativeToRoot('C:\\Work\\App', 'c:/work/app/src/a.ts'), 'src/a.ts');
  assert.equal(relativeToRoot('/a/b', '/a/bc/x'), null);
  assert.equal(normalizeExcludePath('/a/b/c', '/a/b'), 'c');
  assert.equal(normalizeExcludePath('  ', '/a'), null);
  assert.equal(formatBytes(1048576), '1.0 MB');
  assert.equal(formatBytes(2.3 * 1048576), '2.3 MB');
});

test('languages', () => {
  assert.equal(languageFor('src/a.ts'), 'typescript');
  assert.equal(languageFor('resources/views/a.blade.php'), 'blade');
  assert.equal(languageFor('Dockerfile'), 'dockerfile');
  assert.equal(languageFor('weird.unknownext'), '');
  assert.equal(languageFor('LICENSE'), '');
});

test('config: defaults, validation and the exclude merge', () => {
  assert.deepEqual(resolveSettings({}), DEFAULT_SETTINGS);
  const s = resolveSettings({ outputFormat: 'nope', maxDepth: 0, exclude: { paths: ['x'] } });
  assert.equal(s.outputFormat, 'markdown');
  assert.equal(s.maxDepth, 1);
  assert.deepEqual(s.excludePaths, ['x']);
  assert.deepEqual(s.excludePatterns, ['node_modules', '*.log']); // key missing -> default kept
  assert.deepEqual(resolveSettings({ exclude: { patterns: [] } }).excludePatterns, []);
});

test('config: deprecated settings work until "exclude" is set', () => {
  const legacy = { legacyExcludePaths: ['old'], legacyExcludePatterns: ['*.tmp'] };
  const s = resolveSettings({ ...legacy });
  assert.deepEqual([s.excludePaths, s.excludePatterns], [['old'], ['*.tmp']]);
  const wins = resolveSettings({ ...legacy, exclude: { paths: ['new'], patterns: [] }, excludeIsSet: true });
  assert.deepEqual([wins.excludePaths, wins.excludePatterns], [['new'], []]);
  assert.equal(resolveSettings({ legacyEnableTokenWarning: false }).maxTokens, 0);
  assert.equal(resolveSettings({ legacyEnableTokenWarning: false, maxTokens: 5, maxTokensIsSet: true }).maxTokens, 5);
});

test('config: migration plan never overwrites "exclude"', () => {
  assert.equal(planMigration({ exclude: undefined, excludePaths: undefined, excludePatterns: undefined }), null);
  assert.deepEqual(planMigration({ exclude: undefined, excludePaths: ['a'], excludePatterns: undefined }), {
    setExclude: { paths: ['a'], patterns: ['node_modules', '*.log'] },
    clearExcludePaths: true,
    clearExcludePatterns: false,
  });
  const keep = planMigration({ exclude: { paths: ['mine'] }, excludePaths: ['a'], excludePatterns: ['b'] });
  assert.equal(keep?.setExclude, undefined);
  assert.equal(keep?.clearExcludePaths && keep?.clearExcludePatterns, true);
});

test('diff: new-file diffs', () => {
  assert.equal(
    makeNewFileDiff('a.txt', 'one\ntwo\n'),
    'diff --git a/a.txt b/a.txt\nnew file mode 100644\n--- /dev/null\n+++ b/a.txt\n@@ -0,0 +1,2 @@\n+one\n+two\n',
  );
  assert.ok(makeNewFileDiff('a.txt', 'no newline').endsWith('+no newline\n\\ No newline at end of file\n'));
  assert.equal(makeNewFileDiff('e.txt', ''), 'diff --git a/e.txt b/e.txt\nnew file mode 100644\n');
  assert.ok(makeNewFileNote('b.bin', '[Binary file content not included]').includes('# [Binary'));
  assert.equal(isEmptyDiff('  \n'), true);
});

test('tokens: tokenizer choice and counting (bundler-safe lazy require)', () => {
  assert.deepEqual(pickTokenizer('gpt-5.5'), { kind: 'o200k', exact: true });
  assert.deepEqual(pickTokenizer('o3-mini'), { kind: 'o200k', exact: true });
  assert.deepEqual(pickTokenizer('gpt-4-turbo'), { kind: 'cl100k', exact: true });
  assert.equal(pickTokenizer('claude-opus-5-20260416').exact, false);
  assert.equal(pickTokenizer('gemini-3-pro').kind, 'estimate');

  const gpt = countTokens('hello world', 'gpt-4o');
  assert.equal(gpt.approximate, false);
  assert.equal(gpt.tokens, 2);
  // special-token look-alikes in source code must not throw
  assert.ok(countTokens('x <|endoftext|> y', 'gpt-4o').tokens > 0);
  const claude = countTokens('hello world', 'claude-sonnet-5');
  assert.equal(claude.approximate, true);
  assert.equal(countTokens('12345678', 'gemini-3-pro').tokens, 2);
  assert.equal(formatTokenCount({ tokens: 12345, tokenizer: 'o200k', approximate: true }), '~12,345 tokens');
});

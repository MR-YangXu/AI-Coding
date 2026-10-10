import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, copyFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { inspectQuality } from '../src/quality.mjs';

const cli = resolve('bin/ai-code.mjs');
const fakeEslint = resolve('fixtures/fake-eslint.cjs');

function git(dir, ...args) {
  const result = spawnSync('git', args, { cwd: dir, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout;
}

function setup(files) {
  const dir = mkdtempSync(join(tmpdir(), 'ai-code-quality-'));
  git(dir, 'init', '-q');
  git(dir, 'config', 'user.email', 'test@example.com');
  git(dir, 'config', 'user.name', 'Test');
  mkdirSync(join(dir, 'node_modules/eslint'), { recursive: true });
  writeFileSync(join(dir, 'node_modules/eslint/package.json'), JSON.stringify({ name: 'eslint', version: '1.0.0', bin: 'bin/eslint.js' }));
  mkdirSync(join(dir, 'node_modules/eslint/bin'));
  copyFileSync(fakeEslint, join(dir, 'node_modules/eslint/bin/eslint.js'));
  writeFileSync(join(dir, '.gitignore'), 'node_modules/\n');
  for (const [name, source] of Object.entries(files)) writeFileSync(join(dir, name), source);
  git(dir, 'add', '.');
  git(dir, 'commit', '-qm', 'baseline');
  return dir;
}

function inspect(dir) {
  const result = spawnSync(process.execPath, [cli, 'quality', 'inspect', '--project', dir, '--json'], { cwd: dir, encoding: 'utf8' });
  return { ...result, report: JSON.parse(result.stdout) };
}

test('inspect reports only new errors in changed worktree files, including untracked files, without writes', () => {
  const dir = setup({ 'A.vue': 'BAD\n', 'B.vue': 'ok\n' });
  try {
    writeFileSync(join(dir, 'A.vue'), 'BAD\n// changed\n');
    writeFileSync(join(dir, 'B.vue'), 'BAD\n');
    writeFileSync(join(dir, 'New.vue'), 'BAD\n');
    const before = git(dir, 'status', '--porcelain=v1', '-uall');
    const { status, report } = inspect(dir);
    assert.equal(status, 1);
    assert.equal(report.status, 'failed');
    assert.equal(report.total, 2);
    assert.deepEqual(report.diagnostics.map(d => d.filePath), ['B.vue', 'New.vue']);
    assert.equal(git(dir, 'status', '--porcelain=v1', '-uall'), before);
    assert.equal(existsSync(join(dir, '.ai-code/runs/latest.json')), false);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('inspect ignores line shifts in historical diagnostics', () => {
  const dir = setup({ 'A.vue': 'BAD\n' });
  try {
    writeFileSync(join(dir, 'A.vue'), '// one\n// two\nBAD\n');
    const { status, report } = inspect(dir);
    assert.equal(status, 0);
    assert.equal(report.status, 'passed');
    assert.equal(report.baselineCount, 1);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('inspect reports an identical new error that replaces an old error in the same file', () => {
  const dir = setup({ 'A.vue': 'before\nBAD\nmiddle\nend\n' });
  try {
    writeFileSync(join(dir, 'A.vue'), 'before\nfixed\nmiddle\nBAD\nend\n');
    const { status, report } = inspect(dir);
    assert.equal(status, 1);
    assert.equal(report.status, 'failed');
    assert.equal(report.total, 1);
    assert.equal(report.diagnostics[0].line, 4);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('inspect maps renamed file diagnostics back to its baseline path', () => {
  const dir = setup({ 'OrderList.vue': 'BAD\n' });
  try {
    git(dir, 'mv', 'OrderList.vue', 'OrderTable.vue');
    const { status, report } = inspect(dir);
    assert.equal(status, 0);
    assert.equal(report.status, 'passed');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('inspect checks worktree contents when a staged file has additional unstaged edits', () => {
  const dir = setup({ 'A.vue': 'ok\n' });
  try {
    writeFileSync(join(dir, 'A.vue'), 'staged\n');
    git(dir, 'add', 'A.vue');
    writeFileSync(join(dir, 'A.vue'), 'staged\nBAD\n');
    const stagedBefore = git(dir, 'show', ':A.vue');
    const { status, report } = inspect(dir);
    assert.equal(status, 1);
    assert.equal(report.diagnostics[0].filePath, 'A.vue');
    assert.equal(git(dir, 'show', ':A.vue'), stagedBefore);
    assert.equal(readFileSync(join(dir, 'A.vue'), 'utf8'), 'staged\nBAD\n');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('inspect does not pass when baseline lint output cannot be parsed', () => {
  const dir = setup({ 'A.vue': 'BROKEN_LINT_JSON\n' });
  try {
    writeFileSync(join(dir, 'A.vue'), 'ok\n');
    const { status, report } = inspect(dir);
    assert.notEqual(status, 0);
    assert.equal(report.status, 'incomplete');
    assert.match(report.issues.join(' '), /基线|ESLint/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('inspect returns incomplete when an ESLint subprocess times out', () => {
  const dir = setup({ 'A.vue': 'ok\n' });
  try {
    writeFileSync(join(dir, 'A.vue'), 'SLOW_LINT\n');
    const report = inspectQuality(dir, { timeoutMs: 500 });
    assert.equal(report.status, 'incomplete');
    assert.match(report.issues.join(' '), /超时/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('inspect refuses to treat a missing project ESLint as a passing check', () => {
  const dir = setup({ 'A.vue': 'ok\n' });
  try {
    rmSync(join(dir, 'node_modules/eslint'), { recursive: true });
    writeFileSync(join(dir, 'A.vue'), 'BAD\n');
    const { status, report } = inspect(dir);
    assert.notEqual(status, 0);
    assert.equal(report.status, 'incomplete');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('inspect reports no-change as skipped instead of passed', () => {
  const dir = setup({ 'A.vue': 'ok\n' });
  try {
    const { status, report } = inspect(dir);
    assert.equal(status, 0);
    assert.equal(report.status, 'skipped');
    assert.equal(report.total, 0);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('inspect rejects unsupported options instead of silently ignoring them', () => {
  const dir = setup({ 'A.vue': 'ok\n' });
  try {
    for (const option of ['--fix', '--base']) {
      const result = spawnSync(process.execPath, [cli, 'quality', 'inspect', option, '--project', dir, '--json'], { cwd: dir, encoding: 'utf8' });
      assert.equal(result.status, 1);
      assert.match(JSON.parse(result.stdout).issues[0], /用法/);
    }
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

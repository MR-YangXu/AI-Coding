import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { PassThrough } from 'node:stream';
import { initProject, syncProject, readConfig } from '../src/project.mjs';
import { checkProject } from '../src/check.mjs';
import { promptStack } from '../src/stack.mjs';
import { promptProfile } from '../src/profile.mjs';
import { addAdmin } from '../src/admin.mjs';

const stacks = [{ framework: 'vue2', language: 'js' }, { framework: 'vue3', language: 'ts' }, { framework: 'react', language: 'ts' }];
const cli = resolve('bin/ai-code.mjs');
function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'ai-code-stack-'));
  writeFileSync(join(root, 'package.json'), JSON.stringify({ name: 'stack-fixture', version: '1.0.0', scripts: { lint: 'node -e "process.exit(0)"', build: 'node -e "process.exit(0)"' } }));
  return root;
}
const run = (root, ...args) => spawnSync(process.execPath, [cli, ...args, '--project', root, '--json'], { encoding: 'utf8' });
for (const stack of stacks) {
  test(`${stack.framework}/${stack.language}: explicit installation, language checks and profile`, () => {
    const root = fixture();
    try {
      const { config } = initProject(root, { install: false, framework: stack.framework, profile: 'base', scenarios: ['admin', 'mobile-h5'] });
      assert.deepEqual(config.stack, stack);
      assert.equal(config.schemaVersion, 2);
      const dirs = readdirSync(join(root, '.cursor/skills'));
      assert.equal(dirs.includes('ai-code-type'), stack.language === 'ts');
      assert.equal(dirs.includes('ai-code-hook'), stack.framework !== 'vue2');
      assert.equal(dirs.includes('ai-code-logic'), stack.framework === 'vue2');
      const rule = readFileSync(join(root, '.cursor/rules/ai-code.mdc'), 'utf8');
      assert.match(rule, /修改将在同步时覆盖/);
      assert.equal(rule.includes('ai-code-type'), stack.language === 'ts');
      const profile = readFileSync(join(root, '.ai-code/profile.md'), 'utf8');
      assert.ok(profile.includes(stack.framework === 'react' ? `.${stack.language}x` : '.vue'));
      if (stack.language === 'js') {
        for (const dir of dirs) assert.doesNotMatch(readFileSync(join(root, '.cursor/skills', dir, 'SKILL.md'), 'utf8'), /lang="ts"|types\.ts|mock\.ts|as const|import type/);
        assert.doesNotMatch(profile, /\.ts\b|\.tsx\b|\{\{/);
      }
      config.mode = 'enforce';
      writeFileSync(join(root, '.ai-code/config.json'), JSON.stringify(config));
      const report = checkProject(root);
      assert.equal(report.ok, stack.language === 'js', JSON.stringify(report));
      assert.equal(report.checks.typecheck.status, stack.language === 'js' ? 'not_applicable' : 'missing');
      assert.equal(report.checks.constants.status, 'not_configured');
      assert.deepEqual(JSON.parse(run(root, 'status').stdout).stack, stack);
      assert.equal(initProject(root, { install: false }).unchanged, true);
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
}

test('noninteractive new projects require a supported framework and reject language flags', () => {
  for (const flags of [[], ['--language', 'ts'], ['--framework', 'vue2', '--language', 'js'], ['--framework', 'vue3', '--language', 'ts'], ['--framework', 'react', '--language=ts'], ['--framework', '__proto__']]) {
    const root = fixture();
    try {
      const before = readFileSync(join(root, 'package.json'), 'utf8');
      const result = run(root, 'init', '--no-install', ...flags);
      assert.equal(result.status, 1, result.stdout);
      assert.equal(existsSync(join(root, '.cursor')), false);
      assert.equal(readFileSync(join(root, 'package.json'), 'utf8'), before);
    } finally { rmSync(root, { recursive: true, force: true }); }
  }
  for (const stack of stacks) {
    const root = fixture();
    try {
      assert.equal(run(root, 'init', '--no-install', '--framework', stack.framework).status, 0);
      assert.deepEqual(readConfig(root).stack, stack);
    } finally { rmSync(root, { recursive: true, force: true }); }
  }
});

test('framework switching selects its fixed language and preserves project content', () => {
  const root = fixture();
  try {
    initProject(root, { install: false, framework: 'vue3', profile: 'base' });
    const type = join(root, '.cursor/skills/ai-code-type/SKILL.md');
    const hook = join(root, '.cursor/skills/ai-code-hook/SKILL.md');
    const note = join(root, '.cursor/skills/ai-code-type/notes.md');
    const profile = join(root, '.ai-code/profile.md');
    writeFileSync(type, 'modified type');
    writeFileSync(hook, 'modified hook');
    writeFileSync(note, 'user note');
    writeFileSync(profile, 'project conventions');
    assert.equal(checkProject(root, { execute: false }).ok, false);
    syncProject(root, { framework: 'vue2' });
    assert.equal(existsSync(type), false);
    assert.equal(existsSync(hook), false);
    assert.equal(readFileSync(note, 'utf8'), 'user note');
    assert.equal(readFileSync(profile, 'utf8'), 'project conventions');
    const before = readFileSync(join(root, '.ai-code/config.json'), 'utf8');
    syncProject(root);
    assert.equal(readFileSync(join(root, '.ai-code/config.json'), 'utf8'), before);
    assert.equal(checkProject(root, { execute: false }).ok, true);
    syncProject(root, { framework: 'react' });
    assert.deepEqual(readConfig(root).stack, { framework: 'react', language: 'ts' });
    assert.equal(existsSync(type), true);
    assert.equal(existsSync(hook), true);
    assert.equal(existsSync(join(root, '.cursor/skills/ai-code-logic/SKILL.md')), false);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('v1 migrates on sync without overwriting script mappings, constants or profile', () => {
  const root = fixture();
  try {
    const { config } = initProject(root, { install: false, framework: 'vue3', profile: 'base' });
    config.schemaVersion = 1; delete config.stack;
    config.scripts.lint = 'lint:custom';
    config.constants = { projectValue: 'preserved even before it is configured fully' };
    writeFileSync(join(root, '.ai-code/config.json'), JSON.stringify(config));
    const profile = readFileSync(join(root, '.ai-code/profile.md'), 'utf8');
    const before = readFileSync(join(root, '.ai-code/config.json'), 'utf8');
    assert.deepEqual(readConfig(root).stack, { framework: 'vue3', language: 'ts' });
    assert.equal(readFileSync(join(root, '.ai-code/config.json'), 'utf8'), before);
    const next = syncProject(root);
    assert.equal(next.schemaVersion, 2);
    assert.equal(next.scripts.lint, 'lint:custom');
    assert.deepEqual(next.constants, config.constants);
    assert.equal(readFileSync(join(root, '.ai-code/profile.md'), 'utf8'), profile);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('JS still executes an explicitly configured failing typecheck', () => {
  const root = fixture();
  try {
    const pkg = JSON.parse(readFileSync(join(root, 'package.json')));
    pkg.scripts.typecheck = 'node -e "process.exit(3)"';
    writeFileSync(join(root, 'package.json'), JSON.stringify(pkg));
    initProject(root, { install: false, framework: 'vue2' });
    const report = checkProject(root);
    assert.equal(report.ok, false);
    assert.equal(report.checks.typecheck.exitCode, 3);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

const key = { enter: '\r', down: '\u001b[B', cancel: '\u0003' };
async function interact(keys, operation) {
  const input = new PassThrough(); const output = new PassThrough();
  let displayed = ''; output.on('data', data => { displayed += data; });
  const answer = operation({ input, output });
  const caught = answer.then(value => ({ value }), error => ({ error }));
  for (const value of keys) { await new Promise(resolve => setTimeout(resolve, 25)); input.write(value); }
  return { ...await caught, displayed, listeners: input.listenerCount('end') };
}
test('prompt chooses only a framework and exposes its fixed language', async () => {
  const vue2 = await interact([key.enter], streams => promptStack({}, streams));
  assert.deepEqual(vue2.value, { framework: 'vue2', language: 'js' });
  assert.doesNotMatch(vue2.displayed, /选择开发语言规则/);
  const vue3 = await interact([key.down, key.enter], streams => promptStack({}, streams));
  assert.deepEqual(vue3.value, { framework: 'vue3', language: 'ts' });
  const react = await interact([key.down, key.down, key.enter], streams => promptStack({}, streams));
  assert.deepEqual(react.value, { framework: 'react', language: 'ts' });
  assert.doesNotMatch(vue3.displayed + react.displayed, /选择开发语言规则/);
  const cancelled = await interact([key.down, key.cancel], streams => promptStack({}, streams));
  assert.match(cancelled.error.message, /已取消/);
  const base = await interact([key.enter], streams => promptProfile([], streams));
  assert.equal(base.value, 'base');
});

test('repeat init detects a directly edited stack selection and sync checks all paths before writing', () => {
  const root = fixture();
  try {
    const { config } = initProject(root, { install: false, framework: 'vue3' });
    config.stack = {framework:'react',language:'ts'};
    writeFileSync(join(root, '.ai-code/config.json'), JSON.stringify(config));
    assert.throws(()=>initProject(root,{install:false}), /ai-code sync/);
    const rule = readFileSync(join(root,'.cursor/rules/ai-code.mdc'),'utf8');
    const component = join(root,'.cursor/skills/ai-code-component/SKILL.md');
    rmSync(component); mkdirSync(component);
    assert.throws(()=>syncProject(root),/不是普通文件/);
    assert.equal(readFileSync(join(root,'.cursor/rules/ai-code.mdc'),'utf8'),rule);
  } finally {rmSync(root,{recursive:true,force:true});}
});

const snapshot = root => Object.fromEntries(readdirSync(root, { withFileTypes: true }).flatMap(entry => {
  const path = join(root, entry.name);
  return entry.isDirectory() ? Object.entries(snapshot(path)) : [[path, readFileSync(path, 'utf8')]];
}));

test('sync rejects the removed language argument before changing any files', () => {
  const root = fixture();
  try {
    initProject(root, { install: false, framework: 'vue2' });
    const before = snapshot(root);
    for (const flags of [['--language', 'ts'], ['--framework', 'react', '--language=ts']]) {
      const result = run(root, 'sync', ...flags);
      assert.equal(result.status, 1);
      assert.match(result.stdout, /不支持的参数：--language/);
      assert.deepEqual(snapshot(root), before);
    }
    assert.equal(run(root, 'sync', '--framework', 'react').status, 0);
    assert.deepEqual(readConfig(root).stack, { framework: 'react', language: 'ts' });
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('unsupported saved language combinations fail before init, sync, checks or admin export write', async () => {
  for (const stack of [{ framework: 'vue2', language: 'ts' }, { framework: 'vue3', language: 'js' }, { framework: 'react', language: 'js' }]) {
    const root = fixture();
    try {
      const { config } = initProject(root, { install: false, framework: stack.framework, profile: 'base' });
      config.stack = stack;
      writeFileSync(join(root, '.ai-code/config.json'), JSON.stringify(config));
      const before = snapshot(root);
      assert.throws(() => initProject(root, { install: false }), /固定使用/);
      assert.throws(() => syncProject(root), /固定使用/);
      assert.throws(() => checkProject(root), /固定使用/);
      assert.throws(() => checkProject(root, { execute: false }), /固定使用/);
      await assert.rejects(addAdmin(root), /固定使用/);
      assert.deepEqual(snapshot(root), before);
    } finally { rmSync(root, { recursive: true, force: true }); }
  }
});

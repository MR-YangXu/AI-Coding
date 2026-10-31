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

const stacks = [{ framework: 'vue2', language: 'js' }, ...['vue3', 'react'].flatMap(framework => ['js', 'ts'].map(language => ({ framework, language })))];
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
      const { config } = initProject(root, { install: false, ...stack, profile: 'base', scenarios: ['admin', 'mobile-h5'] });
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

test('noninteractive new projects must explicitly select supported framework and language', () => {
  for (const flags of [[], ['--framework', 'react'], ['--framework', 'vue3'], ['--language', 'ts'], ['--framework', 'vue2', '--language', 'ts'], ['--framework', '__proto__', '--language', 'js']]) {
    const root = fixture();
    try {
      const before = readFileSync(join(root, 'package.json'), 'utf8');
      const result = run(root, 'init', '--no-install', ...flags);
      assert.equal(result.status, 1, result.stdout);
      assert.equal(existsSync(join(root, '.cursor')), false);
      assert.equal(readFileSync(join(root, 'package.json'), 'utf8'), before);
    } finally { rmSync(root, { recursive: true, force: true }); }
  }
  const root = fixture();
  try {
    assert.equal(run(root, 'init', '--no-install', '--framework', 'vue2').status, 0);
    assert.deepEqual(readConfig(root).stack, { framework: 'vue2', language: 'js' });
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('language and framework switching overwrites/removes controlled files and keeps project content', () => {
  const root = fixture();
  try {
    initProject(root, { install: false, framework: 'vue3', language: 'ts', profile: 'base' });
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
    assert.throws(() => syncProject(root, { framework: 'react' }), /--language/);
    syncProject(root, { framework: 'react', language: 'ts' });
    assert.equal(existsSync(type), true);
    assert.equal(existsSync(hook), true);
    assert.equal(existsSync(join(root, '.cursor/skills/ai-code-logic/SKILL.md')), false);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('v1 migrates on sync without overwriting script mappings, constants or profile', () => {
  const root = fixture();
  try {
    const { config } = initProject(root, { install: false, framework: 'vue3', language: 'ts', profile: 'base' });
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
    initProject(root, { install: false, framework: 'react', language: 'js' });
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
test('prompt chooses framework first, only Vue 3/React ask for language', async () => {
  const vue2 = await interact([key.enter], streams => promptStack({}, streams));
  assert.deepEqual(vue2.value, { framework: 'vue2', language: 'js' });
  assert.doesNotMatch(vue2.displayed, /选择开发语言规则/);
  const vue3 = await interact([key.down, key.enter, key.down, key.enter], streams => promptStack({}, streams));
  assert.deepEqual(vue3.value, { framework: 'vue3', language: 'ts' });
  const react = await interact([key.down, key.down, key.enter, key.enter], streams => promptStack({}, streams));
  assert.deepEqual(react.value, { framework: 'react', language: 'js' });
  const cancelled = await interact([key.down, key.enter, key.cancel], streams => promptStack({}, streams));
  assert.match(cancelled.error.message, /已取消/);
  const base = await interact([key.enter], streams => promptProfile([], streams));
  assert.equal(base.value, 'base');
});

test('repeat init detects a directly edited stack selection and sync checks all paths before writing', () => {
  const root = fixture();
  try {
    const { config } = initProject(root, { install: false, framework: 'vue3', language: 'ts' });
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

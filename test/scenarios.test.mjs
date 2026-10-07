import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, existsSync, mkdirSync, rmSync, readdirSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { PassThrough } from 'node:stream';
import { promptScenarios } from '../src/scenarios.mjs';
import { promptProfile } from '../src/profile.mjs';

const cli = resolve('bin/ai-code.mjs');
const configPath = '.ai-code/config.json';
const rulePath = '.cursor/rules/ai-code.mdc';
const adminPath = '.cursor/skills/ai-code-admin/SKILL.md';
const mobilePath = '.cursor/skills/ai-code-mobile-h5/SKILL.md';
const commonSkills = ['api', 'component', 'constant', 'hook', 'i18n', 'route', 'state', 'view'].map(name => `ai-code-${name}`);

function fixture() {
  const dir = mkdtempSync(join(tmpdir(), 'ai-code-scenarios-'));
  writeFileSync(join(dir, 'package.json'), JSON.stringify({
    name: 'scenario-fixture', version: '1.0.0',
    dependencies: { vue: '^3.4.0', vite: '^5.0.0', typescript: '^5.0.0' },
    scripts: { lint: 'node -e "process.exit(0)"' },
  }));
  return dir;
}

function run(dir, ...args) {
  return spawnSync(process.execPath, [cli, ...args, '--project', dir], { cwd: dir, encoding: 'utf8', timeout: 15000 });
}

function readConfig(dir) {
  return JSON.parse(readFileSync(join(dir, configPath), 'utf8'));
}

for (const selected of [[], ['admin'], ['mobile-h5'], ['admin', 'mobile-h5']]) {
  test(`init installs only selected scenario skills: ${selected.join(',') || 'generic'}`, () => {
    const dir = fixture();
    try {
      const flags = selected.length ? ['--scenarios', selected.join(',')] : [];
      const initialized = run(dir, 'init', '--no-install', '--json', ...flags);
      assert.equal(initialized.status, 0, initialized.stderr || initialized.stdout);
      assert.deepEqual(JSON.parse(initialized.stdout).config.scenarios, selected);
      assert.deepEqual(readConfig(dir).scenarios, selected);
      assert.deepEqual(readdirSync(join(dir, '.cursor/skills')).sort(), [...commonSkills, ...selected.map(id => `ai-code-${id}`)].sort());
      const rule = readFileSync(join(dir, rulePath), 'utf8');
      for (const id of selected) {
        assert.ok(rule.includes(`../skills/ai-code-${id}/SKILL.md`));
        assert.equal(readFileSync(join(dir, `.cursor/skills/ai-code-${id}/SKILL.md`), 'utf8'), readFileSync(resolve(`content/scenarios/${id}/SKILL.md`), 'utf8'));
      }
      if (!selected.length) assert.equal(rule.includes('## 已启用的项目场景'), false);
      const status = run(dir, 'status', '--json');
      assert.equal(status.status, 0, status.stdout);
      assert.deepEqual(JSON.parse(status.stdout).scenarios, selected);
      assert.match(run(dir, 'status').stdout, /项目场景：通用 Vue/);
      const checked = run(dir, 'check', '--json');
      assert.equal(checked.status, 0, checked.stdout);
      assert.deepEqual(JSON.parse(checked.stdout).scenarios, selected);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
}

test('repeated init keeps saved choices and redirects explicit changes to sync', () => {
  const dir = fixture();
  try {
    assert.equal(run(dir, 'init', '--no-install', '--scenarios=mobile-h5,admin,admin').status, 0);
    const before = readFileSync(join(dir, configPath), 'utf8');
    assert.equal(run(dir, 'init', '--no-install').status, 0);
    assert.equal(run(dir, 'init', '--no-install', '--scenarios', 'admin,mobile-h5').status, 0);
    assert.equal(readFileSync(join(dir, configPath), 'utf8'), before);
    const changed = run(dir, 'init', '--no-install', '--scenarios', 'none', '--json');
    assert.equal(changed.status, 1);
    assert.match(JSON.parse(changed.stdout).issues[0], /sync --scenarios none/);
    assert.equal(readFileSync(join(dir, configPath), 'utf8'), before);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('sync preserves choices, switches scenarios and keeps user files in the same directory', () => {
  const dir = fixture();
  try {
    assert.equal(run(dir, 'init', '--no-install', '--scenarios', 'admin').status, 0);
    const note = join(dir, '.cursor/skills/ai-code-admin/notes.md');
    const ownRule = join(dir, '.cursor/rules/team.mdc');
    writeFileSync(note, 'user notes');
    writeFileSync(ownRule, 'team rule');
    assert.equal(run(dir, 'sync').status, 0);
    assert.deepEqual(readConfig(dir).scenarios, ['admin']);
    assert.equal(run(dir, 'sync', '--scenarios', 'mobile-h5').status, 0);
    assert.equal(existsSync(join(dir, adminPath)), false);
    assert.equal(existsSync(join(dir, mobilePath)), true);
    assert.deepEqual(readConfig(dir).scenarios, ['mobile-h5']);
    assert.equal(adminPath in readConfig(dir).managed, false);
    assert.equal(readFileSync(note, 'utf8'), 'user notes');
    assert.equal(readFileSync(ownRule, 'utf8'), 'team rule');
    assert.equal(run(dir, 'status', '--json').status, 0);
    assert.equal(run(dir, 'sync', '--scenarios', 'none').status, 0);
    assert.equal(existsSync(join(dir, mobilePath)), false);
    assert.deepEqual(readConfig(dir).scenarios, []);
    assert.equal(Object.keys(readConfig(dir).managed).length, 9);
    assert.equal(run(dir, 'check', '--json').status, 0);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('legacy configuration without scenarios is read without writes and upgraded on sync', () => {
  const dir = fixture();
  try {
    assert.equal(run(dir, 'init', '--no-install').status, 0);
    const config = readConfig(dir);
    delete config.scenarios;
    const legacy = JSON.stringify(config);
    writeFileSync(join(dir, configPath), legacy);
    const status = run(dir, 'status', '--json');
    assert.equal(status.status, 0, status.stdout);
    assert.deepEqual(JSON.parse(status.stdout).scenarios, []);
    assert.equal(readFileSync(join(dir, configPath), 'utf8'), legacy);
    assert.equal(run(dir, 'sync').status, 0);
    assert.deepEqual(readConfig(dir).scenarios, []);
    assert.equal(run(dir, 'sync', '--scenarios', 'admin').status, 0);
    assert.equal(existsSync(join(dir, adminPath)), true);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('status detects edited selections and sync reconciles installed skills', () => {
  const dir = fixture();
  try {
    assert.equal(run(dir, 'init', '--no-install', '--scenarios', 'admin').status, 0);
    const config = readConfig(dir);
    config.scenarios = ['mobile-h5'];
    writeFileSync(join(dir, configPath), JSON.stringify(config));
    const stale = run(dir, 'status', '--json');
    assert.equal(stale.status, 1);
    assert.match(JSON.parse(stale.stdout).issues.join('\n'), /场景选择/);
    assert.equal(run(dir, 'sync').status, 0);
    assert.equal(existsSync(join(dir, adminPath)), false);
    assert.equal(existsSync(join(dir, mobilePath)), true);
    rmSync(join(dir, mobilePath));
    assert.equal(run(dir, 'status', '--json').status, 1);
    assert.equal(run(dir, 'sync').status, 0);
    assert.equal(existsSync(join(dir, mobilePath)), true);
    assert.equal(run(dir, 'status', '--json').status, 0);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('sync refuses to remove edited scenario content before writing any new files', () => {
  const dir = fixture();
  try {
    assert.equal(run(dir, 'init', '--no-install', '--scenarios', 'admin').status, 0);
    const beforeConfig = readFileSync(join(dir, configPath), 'utf8');
    const beforeRule = readFileSync(join(dir, rulePath), 'utf8');
    writeFileSync(join(dir, adminPath), 'local scenario edit');
    for (const choice of ['mobile-h5', 'none']) {
      const result = run(dir, 'sync', '--scenarios', choice, '--json');
      assert.equal(result.status, 1);
      assert.match(JSON.parse(result.stdout).issues[0], /本地修改/);
      assert.equal(readFileSync(join(dir, configPath), 'utf8'), beforeConfig);
      assert.equal(readFileSync(join(dir, rulePath), 'utf8'), beforeRule);
      assert.equal(readFileSync(join(dir, adminPath), 'utf8'), 'local scenario edit');
      assert.equal(existsSync(join(dir, mobilePath)), false);
    }
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('sync refuses an unmanaged destination and preserves the current selection', () => {
  const dir = fixture();
  try {
    assert.equal(run(dir, 'init', '--no-install', '--scenarios', 'admin').status, 0);
    const before = readFileSync(join(dir, configPath), 'utf8');
    const beforeRule = readFileSync(join(dir, rulePath), 'utf8');
    mkdirSync(join(dir, '.cursor/skills/ai-code-mobile-h5'));
    writeFileSync(join(dir, mobilePath), 'owned by project');
    assert.equal(run(dir, 'sync', '--scenarios', 'mobile-h5').status, 1);
    assert.equal(readFileSync(join(dir, configPath), 'utf8'), before);
    assert.equal(readFileSync(join(dir, rulePath), 'utf8'), beforeRule);
    assert.equal(existsSync(join(dir, adminPath)), true);
    assert.equal(readFileSync(join(dir, mobilePath), 'utf8'), 'owned by project');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('scenario changes reject symlinked destinations and removals', () => {
  const dir = fixture();
  const outside = mkdtempSync(join(tmpdir(), 'ai-code-scene-outside-'));
  try {
    assert.equal(run(dir, 'init', '--no-install', '--scenarios', 'admin').status, 0);
    const before = readFileSync(join(dir, configPath), 'utf8');
    symlinkSync(outside, join(dir, '.cursor/skills/ai-code-mobile-h5'));
    assert.equal(run(dir, 'sync', '--scenarios', 'mobile-h5').status, 1);
    assert.equal(existsSync(join(outside, 'SKILL.md')), false);
    assert.equal(readFileSync(join(dir, configPath), 'utf8'), before);
    const original = readFileSync(join(dir, adminPath), 'utf8');
    writeFileSync(join(outside, 'admin.md'), original);
    rmSync(join(dir, adminPath));
    symlinkSync(join(outside, 'admin.md'), join(dir, adminPath));
    assert.equal(run(dir, 'sync', '--scenarios', 'none').status, 1);
    assert.equal(readFileSync(join(outside, 'admin.md'), 'utf8'), original);
    assert.equal(readFileSync(join(dir, configPath), 'utf8'), before);
  } finally {
    rmSync(dir, { recursive: true, force: true });
    rmSync(outside, { recursive: true, force: true });
  }
});

test('invalid scenario arguments fail before initialization or dependency changes', () => {
  const dir = fixture();
  try {
    const before = readFileSync(join(dir, 'package.json'), 'utf8');
    for (const flags of [
      ['--scenarios', 'unknown'], ['--scenarios', 'admin,'], ['--scenarios', 'none,admin'],
      ['--scenarios='], ['--scenarios'], ['--scenarios', 'admin', '--scenarios', 'mobile-h5'],
      ['--scenario', 'admin'],
    ]) {
      const result = run(dir, 'init', '--json', ...flags);
      assert.equal(result.status, 1);
      assert.equal(JSON.parse(result.stdout).ok, false);
      assert.equal(existsSync(join(dir, configPath)), false);
      assert.equal(existsSync(join(dir, '.cursor')), false);
      assert.equal(readFileSync(join(dir, 'package.json'), 'utf8'), before);
    }
    for (const command of ['status', 'check']) {
      assert.equal(run(dir, command, '--scenarios', 'admin', '--json').status, 1);
    }
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('invalid saved scenarios fail without modifying the project', () => {
  const dir = fixture();
  try {
    assert.equal(run(dir, 'init', '--no-install').status, 0);
    const config = readConfig(dir);
    const rule = readFileSync(join(dir, rulePath), 'utf8');
    for (const value of [null, 'admin', ['unknown'], ['admin', null]]) {
      const invalid = JSON.stringify({ ...config, scenarios: value });
      writeFileSync(join(dir, configPath), invalid);
      for (const command of ['status', 'sync']) {
        const result = run(dir, command, '--json');
        assert.equal(result.status, 1);
        assert.match(JSON.parse(result.stdout).issues[0], /场景无效/);
      }
      assert.equal(readFileSync(join(dir, configPath), 'utf8'), invalid);
      assert.equal(readFileSync(join(dir, rulePath), 'utf8'), rule);
    }
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

const KEY = { enter: '\r', space: ' ', down: '\u001B[B', ctrlC: '\u0003' };

async function type(input, keys) {
  for (const key of keys) {
    await new Promise(resolve => setTimeout(resolve, 15));
    input.write(key);
  }
}

test('interactive selection offers an explicit opt-out before any scenario', async () => {
  for (const [keys, expected] of [
    [[KEY.enter], []],
    [[KEY.down, KEY.enter], ['admin']],
    [[KEY.down, KEY.down, KEY.enter], ['mobile-h5']],
    [[KEY.down, KEY.down, KEY.down, KEY.enter], ['admin', 'mobile-h5']],
  ]) {
    const input = new PassThrough();
    const output = new PassThrough();
    let displayed = '';
    output.on('data', chunk => { displayed += chunk; });
    const selection = promptScenarios({ input, output });
    await type(input, keys);
    assert.deepEqual(await selection, expected);
    assert.match(displayed, /不接入后台或 H5/);
  }
});

test('closing input or pressing ctrl-c cancels rather than choosing a scenario', async () => {
  for (const close of [input => input.end(), input => input.write(KEY.ctrlC)]) {
    const input = new PassThrough();
    const output = new PassThrough();
    output.resume();
    const selection = promptScenarios({ input, output });
    await new Promise(resolve => setTimeout(resolve, 15));
    close(input);
    await assert.rejects(selection, /已取消/);
  }
});

test('profile prompt only offers templates for the scenarios actually selected', async () => {
  for (const [scenarios, keys, expected, hidden] of [
    [['admin'], [KEY.enter], 'admin', /移动端 H5|通用 Vue/],
    [['admin'], [KEY.down, KEY.enter], null, /移动端 H5/],
    [['mobile-h5'], [KEY.enter], 'mobile-h5', /管理后台|通用 Vue/],
    [['admin', 'mobile-h5'], [KEY.down, KEY.enter], 'mobile-h5', /通用 Vue/],
  ]) {
    const input = new PassThrough();
    const output = new PassThrough();
    let displayed = '';
    output.on('data', chunk => { displayed += chunk; });
    const selection = promptProfile(scenarios, { input, output });
    await type(input, keys);
    assert.equal(await selection, expected);
    assert.doesNotMatch(displayed, hidden);
  }
  assert.equal(await promptProfile([], { input: new PassThrough(), output: new PassThrough() }), null);
});

test('init creates the chosen profile template once and never overwrites or syncs it', () => {
  const dir = fixture();
  try {
    const created = run(dir, 'init', '--no-install', '--scenarios', 'admin', '--profile', 'admin', '--json');
    assert.equal(created.status, 0, created.stderr || created.stdout);
    assert.deepEqual(JSON.parse(created.stdout).profile, { path: '.ai-code/profile.md', template: 'admin', created: true });
    const profile = join(dir, '.ai-code/profile.md');
    assert.equal(readFileSync(profile, 'utf8'), readFileSync(resolve('content/templates/profile.admin.md'), 'utf8'));
    assert.equal('.ai-code/profile.md' in readConfig(dir).managed, false);

    writeFileSync(profile, '# 团队填写后的档案\n');
    assert.equal(run(dir, 'sync', '--scenarios', 'mobile-h5').status, 0);
    assert.equal(readFileSync(profile, 'utf8'), '# 团队填写后的档案\n');
    assert.equal(run(dir, 'check', '--json').status, 0);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('init without --profile or with none leaves the profile to the team', () => {
  for (const flags of [[], ['--profile', 'none']]) {
    const dir = fixture();
    try {
      const result = run(dir, 'init', '--no-install', '--json', ...flags);
      assert.equal(result.status, 0, result.stderr || result.stdout);
      assert.equal(JSON.parse(result.stdout).profile, null);
      assert.equal(existsSync(join(dir, '.ai-code/profile.md')), false);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  }
});

test('init keeps an existing profile when a template is requested and rejects unknown templates', () => {
  const dir = fixture();
  try {
    mkdirSync(join(dir, '.ai-code'), { recursive: true });
    writeFileSync(join(dir, '.ai-code/profile.md'), '# 已有档案\n');
    const kept = run(dir, 'init', '--no-install', '--profile', 'vue', '--json');
    assert.equal(kept.status, 0, kept.stderr || kept.stdout);
    assert.deepEqual(JSON.parse(kept.stdout).profile, { path: '.ai-code/profile.md', template: 'vue', created: false });
    assert.equal(readFileSync(join(dir, '.ai-code/profile.md'), 'utf8'), '# 已有档案\n');
  } finally { rmSync(dir, { recursive: true, force: true }); }
  const other = fixture();
  try {
    const rejected = run(other, 'init', '--no-install', '--profile', 'h5', '--json');
    assert.equal(rejected.status, 1);
    assert.match(JSON.parse(rejected.stdout).issues[0], /--profile 仅支持/);
    assert.equal(existsSync(join(other, '.ai-code')), false);
  } finally { rmSync(other, { recursive: true, force: true }); }
});

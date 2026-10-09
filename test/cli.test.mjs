import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, existsSync, mkdirSync, rmSync, symlinkSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { spawnSync } from 'node:child_process';

const cli = resolve('bin/ai-code.mjs');

function fixture(scripts = { lint: 'node -e "process.exit(0)"', 'type-check': 'node -e "process.exit(0)"', build: 'node -e "process.exit(0)"' }) {
  const dir = mkdtempSync(join(tmpdir(), 'ai-code-test-'));
  const pkg = { name: 'fixture', version: '1.0.0', dependencies: { vue: '^3.0.0' }, devDependencies: { vite: '^5.0.0', typescript: '^5.0.0' }, scripts };
  writeFileSync(join(dir, 'package.json'), JSON.stringify(pkg, null, 2));
  return dir;
}

function run(dir, ...args) {
  return spawnSync(process.execPath, [cli, ...args, '--project', dir], { cwd: dir, encoding: 'utf8' });
}

test('init detects actual scripts, creates scoped Cursor assets and is repeatable', () => {
  const dir = fixture();
  try {
    assert.equal(run(dir, 'init', '--no-install').status, 0);
    const config = JSON.parse(readFileSync(join(dir, '.ai-code/config.json'), 'utf8'));
    assert.deepEqual(config.scripts, { lint: 'lint', typecheck: 'type-check', test: null, build: 'build' });
    assert.equal(config.mode, 'observe');
    assert.ok(existsSync(join(dir, '.cursor/rules/ai-code.mdc')));
    assert.ok(existsSync(join(dir, '.cursor/skills/ai-code-api/SKILL.md')));
    const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
    assert.equal(pkg.scripts['ai:check'], 'ai-code check');
    assert.equal(run(dir, 'init', '--no-install').status, 0);
    assert.equal(run(dir, 'status', '--json').status, 0);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('team profile survives init and sync and is discoverable from generated rules', () => {
  const dir = fixture();
  try {
    mkdirSync(join(dir, '.ai-code'));
    const profile = join(dir, '.ai-code/profile.md');
    writeFileSync(profile, '# 团队意图\n\n请求统一走 src/api/modules/。\n');
    assert.equal(run(dir, 'init', '--no-install').status, 0);
    const rule = readFileSync(join(dir, '.cursor/rules/ai-code.mdc'), 'utf8');
    assert.match(rule, /\.ai-code\/profile\.md/);
    assert.equal(run(dir, 'sync').status, 0);
    assert.equal(readFileSync(profile, 'utf8'), '# 团队意图\n\n请求统一走 src/api/modules/。\n');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('invalid stack and existing user rule are not overwritten', () => {
  const dir = fixture();
  try {
    const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
    delete pkg.devDependencies.typescript;
    writeFileSync(join(dir, 'package.json'), JSON.stringify(pkg));
    assert.notEqual(run(dir, 'init', '--no-install').status, 0);
    assert.equal(existsSync(join(dir, '.ai-code/config.json')), false);
    pkg.devDependencies.typescript = '^5.0.0';
    writeFileSync(join(dir, 'package.json'), JSON.stringify(pkg));
    mkdirSync(join(dir, '.cursor/rules'), { recursive: true });
    const ownRule = join(dir, '.cursor/rules/ai-code.mdc');
    writeFileSync(ownRule, 'my rule');
    assert.notEqual(run(dir, 'init', '--no-install').status, 0);
    assert.equal(readFileSync(ownRule, 'utf8'), 'my rule');
    assert.equal(existsSync(join(dir, '.ai-code/config.json')), false);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('observe reports missing checks; enforce blocks required missing checks', () => {
  const dir = fixture({ lint: 'node -e "process.exit(0)"' });
  try {
    assert.equal(run(dir, 'init', '--no-install').status, 0);
    const observed = run(dir, 'check', '--json');
    assert.equal(observed.status, 0);
    const report = JSON.parse(observed.stdout);
    assert.equal(report.checks.typecheck.status, 'missing');
    assert.equal(report.checks.build.status, 'missing');
    const configFile = join(dir, '.ai-code/config.json');
    const config = JSON.parse(readFileSync(configFile, 'utf8'));
    config.mode = 'enforce';
    writeFileSync(configFile, JSON.stringify(config));
    const enforced = run(dir, 'check', '--json');
    assert.notEqual(enforced.status, 0);
    assert.equal(JSON.parse(enforced.stdout).checks.lint.status, 'passed');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('an existing failed check blocks even in observe and JSON contains no stray output', () => {
  const dir = fixture({ lint: 'node -e "console.log(123); process.exit(4)"' });
  try {
    assert.equal(run(dir, 'init', '--no-install').status, 0);
    const result = run(dir, 'check', '--json');
    assert.notEqual(result.status, 0);
    const report = JSON.parse(result.stdout);
    assert.equal(report.checks.lint.status, 'failed');
    assert.match(report.checks.lint.output, /123/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('sync refuses hand-edited managed files and preserves unmanaged rules', () => {
  const dir = fixture();
  try {
    assert.equal(run(dir, 'init', '--no-install').status, 0);
    const rule = join(dir, '.cursor/rules/ai-code.mdc');
    const other = join(dir, '.cursor/rules/team.mdc');
    writeFileSync(other, 'team rule');
    writeFileSync(rule, 'local edit');
    assert.notEqual(run(dir, 'sync').status, 0);
    assert.equal(readFileSync(rule, 'utf8'), 'local edit');
    assert.equal(readFileSync(other, 'utf8'), 'team rule');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('check detects generated files that no longer match the installed package and sync repairs them', () => {
  const dir = fixture();
  try {
    assert.equal(run(dir, 'init', '--no-install').status, 0);
    const file = join(dir, '.cursor/rules/ai-code.mdc');
    const configFile = join(dir, '.ai-code/config.json');
    const config = JSON.parse(readFileSync(configFile, 'utf8'));
    config.packageVersion = '0.0.1';
    writeFileSync(configFile, JSON.stringify(config));
    assert.notEqual(run(dir, 'check', '--json').status, 0);
    assert.equal(run(dir, 'sync').status, 0);
    assert.equal(run(dir, 'check', '--json').status, 0);
    assert.match(readFileSync(file, 'utf8'), /AI 编码基本规则/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('init never runs mutating lint or interactive tests in CI', () => {
  const dir = fixture({ lint: 'eslint . --fix', test: 'vitest', build: 'vite build' });
  try {
    assert.equal(run(dir, 'init', '--no-install').status, 0);
    const report = JSON.parse(run(dir, 'status', '--json').stdout);
    assert.equal(report.checks.lint.status, 'missing');
    assert.equal(report.checks.test.status, 'missing');
    const config = JSON.parse(readFileSync(join(dir, '.ai-code/config.json'), 'utf8'));
    assert.equal(config.scripts.build, 'build');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('an existing ai:check script is preserved without any generated output', () => {
  const dir = fixture({ 'ai:check': 'echo owned' });
  try {
    assert.notEqual(run(dir, 'init', '--no-install').status, 0);
    assert.equal(existsSync(join(dir, '.ai-code/config.json')), false);
    assert.equal(JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')).scripts['ai:check'], 'echo owned');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('sync installs newly added skill only if its destination is free', () => {
  const dir = fixture();
  try {
    assert.equal(run(dir, 'init', '--no-install').status, 0);
    const configFile = join(dir, '.ai-code/config.json');
    const config = JSON.parse(readFileSync(configFile, 'utf8'));
    const skillPath = '.cursor/skills/ai-code-type/SKILL.md';
    delete config.managed[skillPath];
    config.packageVersion = '0.0.1';
    writeFileSync(configFile, JSON.stringify(config));
    assert.notEqual(run(dir, 'sync').status, 0);
    rmSync(join(dir, skillPath));
    assert.equal(run(dir, 'sync').status, 0);
    assert.ok(existsSync(join(dir, skillPath)));
    assert.equal(run(dir, 'check').status, 0);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('packed npm package runs via the consumer project ai:check script', () => {
  const dir = fixture({ lint: 'node -e "process.exit(0)"', build: 'node -e "process.exit(0)"' });
  try {
    // npm install/ci primes the dependency cache; reuse it when installing the packed package offline.
    const npmEnv = { ...process.env, npm_config_offline: 'true' };
    const pkgPath = join(dir, 'package.json');
    const target = JSON.parse(readFileSync(pkgPath, 'utf8'));
    writeFileSync(pkgPath, JSON.stringify({ name: target.name, version: target.version, scripts: target.scripts }));
    const packed = spawnSync('npm', ['pack', '--pack-destination', dir, '--json'], { cwd: resolve('.'), encoding: 'utf8', env: npmEnv });
    assert.equal(packed.status, 0, packed.stderr);
    const tarballName = JSON.parse(packed.stdout)[0].filename.replace(/^@([^/]+)\//, '$1-');
    const tarball = join(dir, tarballName);
    const installed = spawnSync('npm', ['install', '--offline', '--ignore-scripts', '--no-audit', '--no-fund', '--save-dev', tarball], { cwd: dir, encoding: 'utf8', env: npmEnv, timeout: 15000 });
    assert.equal(installed.status, 0, installed.stderr);
    const withPackage = JSON.parse(readFileSync(pkgPath, 'utf8'));
    withPackage.dependencies = target.dependencies;
    withPackage.devDependencies = { ...withPackage.devDependencies, ...target.devDependencies };
    writeFileSync(pkgPath, JSON.stringify(withPackage));
    const localCli = join(dir, 'node_modules/.bin/ai-code');
    const init = spawnSync(localCli, ['init', '--scenarios', 'admin,mobile-h5'], { cwd: dir, encoding: 'utf8', env: npmEnv, timeout: 15000 });
    assert.equal(init.status, 0, init.stderr);
    assert.ok(existsSync(join(dir, '.cursor/skills/ai-code-admin/SKILL.md')));
    assert.ok(existsSync(join(dir, '.cursor/skills/ai-code-mobile-h5/SKILL.md')));
    assert.ok(existsSync(join(dir, '.cursor/skills/ai-code-constant/SKILL.md')));
    const templates = join(dir, 'node_modules/@agent-xy/ai-code/content/templates/constants');
    for (const [from, to] of [['common.ts', 'src/constants/common.ts'], ['index.ts', 'src/constants/index.ts'], ['business.constants.ts', 'src/views/orders/constants.ts'], ['usage.vue', 'src/views/orders/index.vue']]) {
      mkdirSync(dirname(join(dir, to)), { recursive: true });
      copyFileSync(join(templates, from), join(dir, to));
    }
    writeFileSync(join(dir, 'tsconfig.json'), JSON.stringify({ compilerOptions: { baseUrl: '.', paths: { '@/*': ['src/*'] } } }));
    const configPath = join(dir, '.ai-code/config.json');
    const config = JSON.parse(readFileSync(configPath));
    config.constants = JSON.parse(readFileSync(join(templates, 'config.json'))).constants;
    writeFileSync(configPath, JSON.stringify(config));
    const check = spawnSync('npm', ['run', 'ai:check', '--', '--json'], { cwd: dir, encoding: 'utf8', env: npmEnv });
    assert.equal(check.status, 0, check.stderr);
    assert.match(check.stdout, /"status": "passed"/);
    const direct = spawnSync(localCli, ['check', '--json'], { cwd: dir, encoding: 'utf8', env: npmEnv });
    assert.equal(JSON.parse(direct.stdout).checks.constants.status, 'passed', direct.stdout);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('init refuses a symlinked Cursor directory before creating external files', () => {
  const dir = fixture();
  const outside = mkdtempSync(join(tmpdir(), 'ai-code-outside-'));
  try {
    symlinkSync(outside, join(dir, '.cursor'));
    assert.notEqual(run(dir, 'init', '--no-install').status, 0);
    assert.equal(existsSync(join(outside, 'rules/ai-code.mdc')), false);
    assert.equal(existsSync(join(dir, '.ai-code/config.json')), false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
    rmSync(outside, { recursive: true, force: true });
  }
});

test('sync refuses a symlinked managed rule, even if it has expected content', () => {
  const dir = fixture();
  const outside = mkdtempSync(join(tmpdir(), 'ai-code-outside-'));
  try {
    assert.equal(run(dir, 'init', '--no-install').status, 0);
    const rule = join(dir, '.cursor/rules/ai-code.mdc');
    const target = join(outside, 'rule.mdc');
    writeFileSync(target, readFileSync(rule));
    rmSync(rule);
    symlinkSync(target, rule);
    assert.notEqual(run(dir, 'sync').status, 0);
    assert.equal(readFileSync(target, 'utf8'), readFileSync(rule, 'utf8'));
  } finally {
    rmSync(dir, { recursive: true, force: true });
    rmSync(outside, { recursive: true, force: true });
  }
});

test('init does not select a quality script that invokes ai:check recursively', () => {
  const dir = fixture({ lint: 'npm run ai:check', build: 'node -e "process.exit(0)"' });
  try {
    assert.equal(run(dir, 'init', '--no-install').status, 0);
    const config = JSON.parse(readFileSync(join(dir, '.ai-code/config.json'), 'utf8'));
    assert.equal(config.scripts.lint, null);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

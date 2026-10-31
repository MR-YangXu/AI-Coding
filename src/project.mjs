import { existsSync, lstatSync, readFileSync, writeFileSync, mkdirSync, unlinkSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { cursorFiles } from './adapters/cursor.mjs';
import { normalizeScenarios } from './scenarios.mjs';
import { writeProfile, profileTemplate } from './profile.mjs';
import { normalizeStack, resolveStack, legacyStack } from './stack.mjs';
export const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

const configPath = '.ai-code/config.json';
const aliases = { lint: ['lint', 'lint:check', 'eslint'], typecheck: ['typecheck', 'type-check', 'check-types', 'check:types'], test: ['test:run', 'test:unit', 'test'], build: ['build'] };
export const requiredFor = stack => stack.language === 'ts' ? ['lint', 'typecheck', 'build'] : ['lint', 'build'];
export const hash = value => createHash('sha256').update(value).digest('hex');

export function safeQualityScript(kind, command) {
  if (typeof command !== 'string' || !command.trim()) return false;
  if (/no test specified|not implemented|\bai:check\b|\bai-code\s+check\b/i.test(command)) return false;
  if (/(?:^|\s)(?:--fix(?:=\S+)?|--write|-w)(?:\s|$)|\bprettier\b.*\s--write(?:\s|$)|\b(?:deploy|publish)\b/.test(command)) return false;
  if (kind === 'test' && /\b(?:vitest|jest)\b/.test(command) && !/(?:^|\s)(?:run|--run|--watch=false|--watchAll=false|--ci)(?:\s|$)/.test(command)) return false;
  return true;
}

function readJson(path) {
  try { return JSON.parse(readFileSync(path, 'utf8')); }
  catch (error) { throw new Error(`无法读取有效 JSON：${path}（${error.message}）`); }
}

function guardPath(root, relativePath) {
  let current = root;
  const parts = relativePath.split('/');
  for (const [index, part] of parts.entries()) {
    current = join(current, part);
    try {
      const info = lstatSync(current);
      if (info.isSymbolicLink()) throw new Error(`受控路径包含符号链接：${relativePath}`);
      if (index === parts.length - 1 && !info.isFile()) throw new Error(`受控文件路径不是普通文件：${relativePath}`);
    } catch (error) {
      if (error.code === 'ENOENT') break;
      throw error;
    }
  }
}

export function readPackage(root) {
  const result = readJson(join(root, 'package.json'));
  if (!result || typeof result !== 'object' || Array.isArray(result) || !result.scripts || typeof result.scripts !== 'object') {
    throw new Error('package.json 必须包含 scripts 对象');
  }
  return result;
}

export function managerFor(root, project) {
  const named = project.packageManager?.split('@')[0];
  if (['npm', 'pnpm', 'yarn'].includes(named)) return named;
  if (existsSync(join(root, 'pnpm-lock.yaml'))) return 'pnpm';
  if (existsSync(join(root, 'yarn.lock'))) return 'yarn';
  return 'npm';
}

export function readConfig(root) {
  guardPath(root, configPath);
  const config = readJson(join(root, configPath));
  if (![1, 2].includes(config?.schemaVersion) || config.adapter !== 'cursor' || !['observe', 'enforce'].includes(config.mode) || !config.scripts || !config.managed || typeof config.managed !== 'object' || !['npm', 'pnpm', 'yarn'].includes(config.manager)) {
    throw new Error('无效的 .ai-code/config.json');
  }
  if (Object.keys(aliases).some(key => !(key in config.scripts) || (config.scripts[key] !== null && typeof config.scripts[key] !== 'string'))) {
    throw new Error('质量命令映射无效');
  }
  const entries = Object.entries(config.managed);
  const managedPathOk = path => path === '.ai-code/README.md' || path === '.cursor/rules/ai-code.mdc' || /^\.cursor\/skills\/ai-code-[a-z0-9-]+\/SKILL\.md$/.test(path);
  if (!entries.length || entries.some(([path, digest]) => !managedPathOk(path) || path.includes('..') || !/^[a-f0-9]{64}$/.test(digest))) throw new Error('受控文件记录不完整');
  config.scenarios = normalizeScenarios(config.scenarios);
  config.stack = config.schemaVersion === 1 ? { ...legacyStack } : normalizeStack(config.stack);
  return config;
}

export function obsoleteManagedFiles(config, files) {
  return Object.keys(config.managed).filter(path => !(path in files));
}

export function drift(root, config) {
  return Object.entries(config.managed).filter(([path, digest]) => {
    guardPath(root, path);
    const file = join(root, path);
    return !existsSync(file) || hash(readFileSync(file)) !== digest;
  }).map(([path]) => path);
}

function installPackage(root, manager) {
  const args = manager === 'yarn' ? ['add', '--dev', `${pkg.name}@${pkg.version}`] : ['add', '--save-dev', `${pkg.name}@${pkg.version}`];
  if (manager === 'npm') args[0] = 'install';
  const result = spawnSync(manager, args, { cwd: root, encoding: 'utf8', stdio: 'inherit' });
  if (result.error || result.status !== 0) throw new Error(`安装 ${pkg.name} 失败：${result.error?.message ?? result.status}`);
}

export function initProject(root, { install = true, scenarios, profile = null, framework, language } = {}) {
  const selected = scenarios === undefined ? undefined : normalizeScenarios(scenarios);
  let project = readPackage(root);
  const configFile = join(root, configPath);
  guardPath(root, configPath);
  if (existsSync(configFile)) {
    const config = readConfig(root);
    const stack = resolveStack({ framework, language }, config.stack);
    if (JSON.stringify(stack) !== JSON.stringify(config.stack)) throw new Error('项目已接入；变更技术栈请运行 ai-code sync --framework <框架> --language <语言>');
    if (selected !== undefined && JSON.stringify(selected) !== JSON.stringify(config.scenarios)) {
      throw new Error(`项目已接入；变更场景请运行 ai-code sync --scenarios ${selected.join(',') || 'none'}`);
    }
    if (drift(root, config).length) throw new Error('受控文件已修改或缺失；请运行 ai-code sync 覆盖恢复，项目约定写入 profile');
    if (project.scripts['ai:check'] !== 'ai-code check') throw new Error('现有 ai:check 与本包冲突');
    if (config.packageVersion !== pkg.version || config.schemaVersion !== 2) throw new Error('包版本或配置已更新，请运行 ai-code sync');
    const expected = cursorFiles(config.scenarios, stack);
    if (obsoleteManagedFiles(config, expected).length || Object.entries(expected).some(([path, content]) => config.managed[path] !== hash(content))) throw new Error('受控内容与当前技术栈、场景或包内容不一致，请运行 ai-code sync');
    return { unchanged: true, config };
  }
  const stack = resolveStack({ framework, language });
  if (profile) {
    guardPath(root, '.ai-code/profile.md');
    profileTemplate(profile, stack);
  }
  const files = cursorFiles(selected, stack);
  for (const path of Object.keys(files)) guardPath(root, path);
  if (project.scripts['ai:check']) throw new Error('项目已有 ai:check 脚本，不会覆盖');
  for (const path of Object.keys(files)) if (existsSync(join(root, path))) throw new Error(`项目已有 ${path}，不会覆盖`);
  const manager = managerFor(root, project);
  const scripts = Object.fromEntries(Object.entries(aliases).map(([key, names]) => [key, names.find(name => safeQualityScript(key, project.scripts[name]) && !project.scripts[name].includes('ai-code check')) ?? null]));
  const installedPath = join(root, 'node_modules', pkg.name, 'package.json');
  const locallyInstalled = existsSync(installedPath) && readJson(installedPath).version === pkg.version;
  if (install && !locallyInstalled) {
    installPackage(root, manager);
    project = readPackage(root);
    if (project.scripts['ai:check']) throw new Error('安装后发现 ai:check 冲突，未写入规则');
  }
  const config = { schemaVersion: 2, packageVersion: pkg.version, adapter: 'cursor', mode: 'observe', manager, stack, scenarios: selected ?? [], scripts, managed: Object.fromEntries(Object.entries(files).map(([path, content]) => [path, hash(content)])) };
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), content);
  }
  mkdirSync(dirname(configFile), { recursive: true });
  writeFileSync(configFile, JSON.stringify(config, null, 2) + '\n');
  project.scripts['ai:check'] = 'ai-code check';
  if (!install) project.devDependencies = { ...project.devDependencies, [pkg.name]: pkg.version };
  writeFileSync(join(root, 'package.json'), JSON.stringify(project, null, 2) + '\n');
  const profileResult = profile ? writeProfile(root, profile, stack) : null;
  return { unchanged: false, config, installed: install, profile: profileResult };
}

export function syncProject(root, { scenarios, framework, language } = {}) {
  const config = readConfig(root);
  const selected = scenarios === undefined ? config.scenarios : normalizeScenarios(scenarios);
  const stack = resolveStack({ framework, language }, config.stack);
  const files = cursorFiles(selected, stack);
  const removed = obsoleteManagedFiles(config, files);
  for (const path of Object.keys(config.managed)) guardPath(root, path);
  for (const path of Object.keys(files)) {
    guardPath(root, path);
    if (!(path in config.managed) && existsSync(join(root, path))) throw new Error(`新规则与项目文件冲突：${path}`);
  }
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), content);
    config.managed[path] = hash(content);
  }
  for (const path of removed) {
    if (existsSync(join(root, path))) unlinkSync(join(root, path));
    delete config.managed[path];
  }
  config.scenarios = selected;
  config.stack = stack;
  config.schemaVersion = 2;
  config.packageVersion = pkg.version;
  writeFileSync(join(root, configPath), JSON.stringify(config, null, 2) + '\n');
  return config;
}

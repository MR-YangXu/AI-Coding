import { spawnSync } from 'node:child_process';
import { readConfig, readPackage, drift, required, safeQualityScript, hash, pkg, unselectedScenarioFiles } from './project.mjs';
import { cursorFiles } from './adapters/cursor.mjs';

export function checkProject(root, { execute = true } = {}) {
  const config = readConfig(root);
  const project = readPackage(root);
  const issues = drift(root, config).map(path => `受控文件漂移：${path}`);
  const files = cursorFiles(config.scenarios);
  if (config.packageVersion !== pkg.version) issues.push(`规则版本不匹配：项目 ${config.packageVersion ?? '未记录'}，包 ${pkg.version}`);
  if (Object.entries(files).some(([path, content]) => config.managed[path] !== hash(content)) || unselectedScenarioFiles(config, files).length) issues.push('规则与当前包版本或场景选择不一致，请运行 ai-code sync');
  if (project.scripts['ai:check'] !== 'ai-code check') issues.push('ai:check 脚本缺失或已修改');
  const checks = {};
  for (const [kind, name] of Object.entries(config.scripts)) {
    if (!name || !safeQualityScript(kind, project.scripts[name]) || name === 'ai:check') {
      checks[kind] = { status: 'missing' };
      if (config.mode === 'enforce' && required.includes(kind)) issues.push(`必需检查缺失：${kind}`);
      continue;
    }
    if (!execute) { checks[kind] = { status: 'available', script: name }; continue; }
    const args = config.manager === 'yarn' ? [name] : ['run', name];
    const result = spawnSync(config.manager, args, { cwd: root, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
    const output = `${result.stdout ?? ''}${result.stderr ?? ''}`;
    checks[kind] = { status: result.status === 0 && !result.error ? 'passed' : 'failed', script: name, output, exitCode: result.status };
    if (checks[kind].status === 'failed') issues.push(`检查失败：${kind}（${result.error?.message ?? result.status}）`);
  }
  return { ok: issues.length === 0, mode: config.mode, scenarios: config.scenarios, checks, issues };
}

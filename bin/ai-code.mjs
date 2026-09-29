#!/usr/bin/env node
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { initProject, syncProject } from '../src/project.mjs';
import { checkProject } from '../src/check.mjs';
import { inspectQuality } from '../src/quality.mjs';
import { describeScenarios, parseScenarios, promptScenarios } from '../src/scenarios.mjs';

const [command, ...args] = process.argv.slice(2);
const json = args.includes('--json');
const usage = `用法：
  ai-code init [--scenarios admin,mobile-h5|none] [--no-install]
  ai-code sync [--scenarios admin,mobile-h5|none]
  ai-code status
  ai-code check
  ai-code quality inspect

所有命令支持 --project <目录> 和 --json；使用 --help 查看帮助。
场景：admin（管理后台）、mobile-h5（移动端 H5），逗号分隔可多选；none 仅安装通用规则。
首次 init 在交互终端中提供场景选择；非交互、CI 或 --json 默认通用。sync 未指定场景时沿用已保存选择。
`;

function parseOptions(optionArgs) {
  const allowed = new Map([['--project', 'value'], ['--json', 'flag']]);
  if (command === 'init' || command === 'sync') allowed.set('--scenarios', 'value');
  if (command === 'init') allowed.set('--no-install', 'flag');
  const options = {};
  for (let index = 0; index < optionArgs.length; index++) {
    const raw = optionArgs[index];
    const equals = raw.indexOf('=');
    const name = equals < 0 ? raw : raw.slice(0, equals);
    if (!allowed.has(name)) throw new Error(`不支持的参数：${name}\n${usage}`);
    if (name in options) throw new Error(`参数不能重复：${name}`);
    if (allowed.get(name) === 'flag') {
      if (equals >= 0) throw new Error(`${name} 不接受参数值`);
      options[name] = true;
      continue;
    }
    const value = equals < 0 ? optionArgs[++index] : raw.slice(equals + 1);
    if (!value || value.startsWith('--')) throw new Error(`${name} 需要指定参数值`);
    options[name] = value;
  }
  return options;
}

async function main() {
  if (command === '--help' || command === 'help' || args.includes('--help')) {
    process.stdout.write(usage);
    return;
  }
  if (!['init', 'sync', 'status', 'check', 'quality'].includes(command)) throw new Error(usage);
  if (command === 'quality' && args[0] !== 'inspect') throw new Error(usage);
  const options = parseOptions(command === 'quality' ? args.slice(1) : args);
  const root = resolve(options['--project'] ?? '.');
  let scenarios = options['--scenarios'] === undefined ? undefined : parseScenarios(options['--scenarios']);
  if (command === 'init' && scenarios === undefined && !json && !process.env.CI && process.stdin.isTTY && process.stdout.isTTY && !existsSync(join(root, '.ai-code/config.json'))) {
    scenarios = await promptScenarios();
  }
  let report;
  switch (command) {
    case 'init': report = initProject(root, { install: !options['--no-install'], scenarios }); break;
    case 'sync': report = syncProject(root, { scenarios }); break;
    case 'status': report = checkProject(root, { execute: false }); break;
    case 'check': report = checkProject(root); break;
    case 'quality':
      report = inspectQuality(root);
      break;
  }
  if (json) process.stdout.write(JSON.stringify(report, null, 2) + '\n');
  else if (command === 'init') {
    console.log(report.unchanged ? '已接入，无需修改' : '已接入 Cursor 规则和质量检查（观察模式）');
    console.log(`项目场景：${describeScenarios(report.config.scenarios)}`);
  }
  else if (command === 'sync') console.log(`受控规则已同步；项目场景：${describeScenarios(report.scenarios)}`);
  else if (command === 'quality') {
    console.log(`增量诊断：${report.status}；改动文件 ${report.files.length}；新增诊断 ${report.total}；历史诊断 ${report.baselineCount}`);
    for (const diagnostic of report.diagnostics) console.log(`${diagnostic.filePath}:${diagnostic.line}:${diagnostic.column} ${diagnostic.ruleId ?? 'eslint'} ${diagnostic.message}`);
    if (report.truncated) console.log(`另有 ${report.total - report.diagnostics.length} 条诊断未展示`);
    for (const issue of report.issues) console.error(issue);
  }
  else {
    console.log(`项目场景：${describeScenarios(report.scenarios)}`);
    for (const [name, result] of Object.entries(report.checks)) console.log(`${name}: ${result.status}${result.script ? ` (${result.script})` : ''}`);
    for (const result of Object.values(report.checks)) if (result.status === 'failed' && result.output) console.error(result.output);
    for (const issue of report.issues) console.error(issue);
  }
  if (report.ok === false || ['failed', 'incomplete'].includes(report.status)) process.exitCode = 1;
}

try {
  await main();
} catch (error) {
  if (json) process.stdout.write(JSON.stringify({ ok: false, issues: [error.message] }) + '\n');
  else console.error(error.message);
  process.exitCode = 1;
}

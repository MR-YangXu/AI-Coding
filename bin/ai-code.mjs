#!/usr/bin/env node
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { initProject, syncProject } from '../src/project.mjs';
import { checkProject } from '../src/check.mjs';
import { inspectQuality } from '../src/quality.mjs';
import { describeScenarios, parseScenarios, promptScenarios } from '../src/scenarios.mjs';
import { parseProfile, profilePath, promptProfile } from '../src/profile.mjs';
import { promptStack, describeStack } from '../src/stack.mjs';
import { addAdmin } from '../src/admin.mjs';

const [command, ...args] = process.argv.slice(2);
const json = args.includes('--json');
const usage = `用法：
  ai-code init [--framework vue2|vue3|react] [--scenarios admin,mobile-h5|none] [--profile base|vue|admin|mobile-h5|none] [--no-install]
  ai-code sync [--framework vue2|vue3|react] [--scenarios admin,mobile-h5|none]
  ai-code status
  ai-code check
  ai-code quality inspect
  ai-code add admin [--only BaseCard,NewTable,usePageList] [--source-dir src] [--conflict error|replace|skip|rename] [--dry-run]

所有命令支持 --project <目录> 和 --json；使用 --help 查看帮助。
场景：admin（管理后台）、mobile-h5（移动端 H5），逗号分隔可多选；none 仅安装通用规则。
档案：--profile 按模板创建 ${profilePath}，已存在时不覆盖；之后由项目维护，sync 不会改动它。
首次 init 依次选择框架、场景和档案；Vue 2 固定使用 JS，Vue 3/React 固定使用 TS。非交互、CI 或 --json 必须指定框架；默认通用场景且不创建档案。
sync 沿用未指定的选择，直接覆盖受控文件的手工修改。项目补充约定写入 profile。
add admin 沿用已保存技术栈，复制后台源码并归项目维护；sync 不覆盖源码。冲突默认交互选择，非交互需显式策略。依赖只报告，不自动安装。
`;

function parseOptions(optionArgs) {
  const allowed = new Map([['--project', 'value'], ['--json', 'flag']]);
  if (command === 'init' || command === 'sync') {
    for (const name of ['--scenarios', '--framework']) allowed.set(name, 'value');
  }
  if (command === 'init') {
    allowed.set('--no-install', 'flag');
    allowed.set('--profile', 'value');
  }
  if (command === 'add') {
    for (const name of ['--only', '--source-dir', '--conflict']) allowed.set(name, 'value');
    allowed.set('--dry-run', 'flag');
  }
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
  if (!['init', 'sync', 'status', 'check', 'quality', 'add'].includes(command)) throw new Error(usage);
  if (command === 'quality' && args[0] !== 'inspect') throw new Error(usage);
  if (command === 'add' && args[0] !== 'admin') throw new Error(usage);
  const options = parseOptions(['quality', 'add'].includes(command) ? args.slice(1) : args);
  const root = resolve(options['--project'] ?? '.');
  let scenarios = options['--scenarios'] === undefined ? undefined : parseScenarios(options['--scenarios']);
  let profile = options['--profile'] === undefined ? null : parseProfile(options['--profile']);
  let framework = options['--framework'];
  const interactive = command === 'init' && !json && !process.env.CI && process.stdin.isTTY && process.stdout.isTTY && !existsSync(join(root, '.ai-code/config.json'));
  if (interactive) ({ framework } = await promptStack({ framework }));
  if (interactive && scenarios === undefined) scenarios = await promptScenarios();
  if (interactive && options['--profile'] === undefined && !existsSync(join(root, profilePath))) profile = await promptProfile(scenarios);
  let report;
  switch (command) {
    case 'add': report = await addAdmin(root, { only: options['--only'], sourceDir: options['--source-dir'], conflict: options['--conflict'], dryRun: Boolean(options['--dry-run']), interactive: !json && !process.env.CI && Boolean(process.stdin.isTTY && process.stdout.isTTY) }); break;
    case 'init': report = initProject(root, { install: !options['--no-install'], scenarios, profile, framework }); break;
    case 'sync': report = syncProject(root, { scenarios, framework }); break;
    case 'status': report = checkProject(root, { execute: false }); break;
    case 'check': report = checkProject(root); break;
    case 'quality':
      report = inspectQuality(root);
      break;
  }
  if (json) process.stdout.write(JSON.stringify(report, null, 2) + '\n');
  else if (command === 'init') {
    console.log(report.unchanged ? '已接入，无需修改' : '已接入 Cursor 规则和质量检查（观察模式）');
    console.log(`技术栈：${describeStack(report.config.stack)}`);
    console.log(`项目场景：${describeScenarios(report.config.scenarios)}`);
    if (report.profile?.created) console.log(`项目档案：已按「${report.profile.template}」模板创建 ${report.profile.path}，请替换其中的待填项并删除示例`);
    else if (report.profile) console.log(`项目档案：${report.profile.path} 已存在，未覆盖`);
  }
  else if (command === 'add') {
    console.log(`${report.dryRun ? '预览' : '后台源码处理结果'}：${describeStack(report.stack)}`);
    const labels = { add: '新增', reuse: '内容一致，复用', replace: '替换', skip: '跳过', rename: '重命名', error: '待处理冲突' };
    for (const item of report.items) console.log(`${item.id}: ${labels[item.action]} — ${item.files.join('、')}${item.blockedBy?.length ? `（原因：${item.blockedBy.join('、')}）` : ''}`);
    for (const dependency of report.dependencies) console.log(`依赖 ${dependency.name}: ${dependency.declared ?? '缺少'}；推荐 ${dependency.recommended}`);
    if (report.installCommand) console.log(`安装缺失依赖：${report.installCommand}`);
    for (const issue of report.issues) console.error(issue);
    if (report.profileSnippet) console.log(`\n请将实际入口补充到 ${report.profilePath}，并填写用途和参考页面：\n${report.profileSnippet}\n\n接入说明：${report.readme}`);
  }
  else if (command === 'sync') console.log(`受控规则已覆盖同步；技术栈：${describeStack(report.stack)}；项目场景：${describeScenarios(report.scenarios)}`);
  else if (command === 'quality') {
    console.log(`增量诊断：${report.status}；改动文件 ${report.files.length}；新增诊断 ${report.total}；历史诊断 ${report.baselineCount}`);
    for (const diagnostic of report.diagnostics) console.log(`${diagnostic.filePath}:${diagnostic.line}:${diagnostic.column} ${diagnostic.ruleId ?? 'eslint'} ${diagnostic.message}`);
    if (report.truncated) console.log(`另有 ${report.total - report.diagnostics.length} 条诊断未展示`);
    for (const issue of report.issues) console.error(issue);
  }
  else {
    console.log(`技术栈：${describeStack(report.stack)}`);
    console.log(`项目场景：${describeScenarios(report.scenarios)}`);
    for (const [name, result] of Object.entries(report.checks)) console.log(`${name}: ${result.status}${result.script ? ` (${result.script})` : ''}`);
    const constants = report.checks.constants;
    if (constants?.total) {
      console.log(`常量诊断：${constants.total} 条；确定违规 ${constants.violations} 条；疑似重复 ${constants.warnings} 条`);
      for (const item of constants.diagnostics) console.log(`${item.filePath}:${item.line}:${item.column} ${item.ruleId} ${item.message}${item.related ? `（原定义 ${item.related.filePath}:${item.related.line}）` : ''}`);
      if (constants.truncated) console.log(`另有 ${constants.total - constants.diagnostics.length} 条诊断未展示；处理已列问题后重新检查`);
    }
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

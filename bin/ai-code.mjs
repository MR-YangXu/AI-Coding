#!/usr/bin/env node
import { resolve } from 'node:path';
import { initProject, syncProject } from '../src/project.mjs';
import { checkProject } from '../src/check.mjs';
import { inspectQuality } from '../src/quality.mjs';

const [command, ...args] = process.argv.slice(2);
const projectIndex = args.indexOf('--project');
const root = resolve(projectIndex < 0 ? '.' : args[projectIndex + 1] ?? '.');
const json = args.includes('--json');

try {
  if (projectIndex >= 0 && (!args[projectIndex + 1] || args[projectIndex + 1].startsWith('--'))) throw new Error('--project 需要指定目录');
  let report;
  switch (command) {
    case 'init': report = initProject(root, { install: !args.includes('--no-install') }); break;
    case 'sync': report = syncProject(root); break;
    case 'status': report = checkProject(root, { execute: false }); break;
    case 'check': report = checkProject(root); break;
    case 'quality':
      if (args[0] !== 'inspect') throw new Error('用法：ai-code quality inspect [--project <目录>] [--json]');
      for (let index = 1; index < args.length; index++) {
        if (args[index] === '--project') index++;
        else if (args[index] !== '--json') throw new Error('用法：ai-code quality inspect [--project <目录>] [--json]');
      }
      report = inspectQuality(root);
      break;
    default: throw new Error('用法：ai-code <init|sync|status|check|quality inspect> [--project <目录>] [--json] [--no-install（仅 init）]');
  }
  if (json) process.stdout.write(JSON.stringify(report, null, 2) + '\n');
  else if (command === 'init') console.log(report.unchanged ? '已接入，无需修改' : '已接入 Cursor 规则和质量检查（观察模式）');
  else if (command === 'sync') console.log('受控规则已同步');
  else if (command === 'quality') {
    console.log(`增量诊断：${report.status}；改动文件 ${report.files.length}；新增诊断 ${report.total}；历史诊断 ${report.baselineCount}`);
    for (const diagnostic of report.diagnostics) console.log(`${diagnostic.filePath}:${diagnostic.line}:${diagnostic.column} ${diagnostic.ruleId ?? 'eslint'} ${diagnostic.message}`);
    if (report.truncated) console.log(`另有 ${report.total - report.diagnostics.length} 条诊断未展示`);
    for (const issue of report.issues) console.error(issue);
  }
  else {
    for (const [name, result] of Object.entries(report.checks)) console.log(`${name}: ${result.status}${result.script ? ` (${result.script})` : ''}`);
    for (const result of Object.values(report.checks)) if (result.status === 'failed' && result.output) console.error(result.output);
    for (const issue of report.issues) console.error(issue);
  }
  if (report.ok === false || ['failed', 'incomplete'].includes(report.status)) process.exitCode = 1;
} catch (error) {
  if (json) process.stdout.write(JSON.stringify({ ok: false, issues: [error.message] }) + '\n');
  else console.error(error.message);
  process.exitCode = 1;
}

import { readFileSync, lstatSync } from 'node:fs';
import { join, extname, dirname } from 'node:path';
import { spawnSync } from 'node:child_process';

const sourceExtensions = new Set(['.vue', '.js', '.ts', '.jsx', '.tsx', '.cjs', '.mjs']);

function command(root, executable, args, input, timeoutMs) {
  const result = spawnSync(executable, args, { cwd: root, encoding: 'utf8', input, maxBuffer: 8 * 1024 * 1024, timeout: timeoutMs });
  if (result.error?.code === 'ETIMEDOUT') throw new Error(`${executable} 超时`);
  if (result.error) throw new Error(`${executable}: ${result.error.message}`);
  return result;
}

function git(root, args, timeoutMs) {
  const result = command(root, 'git', args, undefined, timeoutMs);
  if (result.status !== 0) throw new Error(`Git ${args[0]} 失败：${result.stderr.trim() || result.status}`);
  return result;
}

function changedFiles(root, timeoutMs) {
  const entries = new Map();
  const parts = git(root, ['diff', '--name-status', '-z', '-M', 'HEAD', '--'], timeoutMs).stdout.split('\0');
  for (let index = 0; index < parts.length - 1;) {
    const status = parts[index++];
    const source = parts[index++];
    const file = status.startsWith('R') || status.startsWith('C') ? parts[index++] : source;
    if (status.startsWith('D') || !sourceExtensions.has(extname(file))) continue;
    entries.set(file, { filePath: file, baselinePath: status.startsWith('A') ? null : source });
  }
  for (const file of git(root, ['ls-files', '--others', '--exclude-standard', '-z', '--'], timeoutMs).stdout.split('\0')) {
    if (file && sourceExtensions.has(extname(file))) entries.set(file, { filePath: file, baselinePath: null });
  }
  return [...entries.values()].sort((a, b) => a.filePath.localeCompare(b.filePath));
}

function eslintBinary(root) {
  let directory = root;
  while (true) {
    try {
      const packageFile = join(directory, 'node_modules/eslint/package.json');
      const pkg = JSON.parse(readFileSync(packageFile, 'utf8'));
      const bin = typeof pkg.bin === 'string' ? pkg.bin : pkg.bin?.eslint;
      if (!bin || bin.startsWith('/') || bin.split('/').includes('..')) throw new Error('项目 ESLint bin 无效');
      return join(dirname(packageFile), bin);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    const parent = dirname(directory);
    if (parent === directory) throw new Error('找不到项目安装的 ESLint；请先安装项目依赖');
    directory = parent;
  }
}

function lint(root, bin, file, input, timeoutMs) {
  const args = input === undefined
    ? [bin, '--format', 'json', '--', file]
    : [bin, '--stdin', '--stdin-filename', file, '--format', 'json'];
  const result = command(root, process.execPath, args, input, timeoutMs);
  let parsed;
  try { parsed = JSON.parse(result.stdout); }
  catch { throw new Error(`ESLint ${file} 未输出有效 JSON：${result.stderr.trim() || result.stdout.slice(0, 120)}`); }
  if (![0, 1].includes(result.status) || !Array.isArray(parsed) || parsed.some(item => !Array.isArray(item.messages))) {
    throw new Error(`ESLint ${file} 检查未完成：${result.stderr.trim() || result.status}`);
  }
  return parsed.flatMap(item => item.messages.filter(message => [1, 2].includes(message.severity)).map(message => ({
    filePath: file,
    line: message.line ?? 0,
    column: message.column ?? 0,
    severity: message.severity,
    ruleId: message.ruleId ?? null,
    message: message.message,
  })));
}

function fingerprint(message, baselinePath) {
  return JSON.stringify([baselinePath, message.severity, message.ruleId, message.message]);
}

function addedLines(root, file, baselinePath, timeoutMs) {
  const patch = git(root, ['diff', '--unified=0', '-M', 'HEAD', '--', baselinePath, file], timeoutMs).stdout;
  const lines = new Set();
  let currentLine = null;
  for (const line of patch.split('\n')) {
    const hunk = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(line);
    if (hunk) currentLine = Number(hunk[1]);
    else if (currentLine !== null && line.startsWith('+') && !line.startsWith('+++')) lines.add(currentLine++);
    else if (currentLine !== null && !line.startsWith('-') && !line.startsWith('\\')) currentLine++;
  }
  return lines;
}

export function inspectQuality(root, { timeoutMs = 30000 } = {}) {
  const report = { status: 'incomplete', files: [], total: 0, baselineCount: 0, diagnostics: [], truncated: false, issues: [] };
  try {
    const files = changedFiles(root, timeoutMs);
    report.files = files.map(entry => entry.filePath);
    if (!files.length) { report.status = 'skipped'; return report; }
    const bin = eslintBinary(root);
    for (const { filePath, baselinePath } of files) {
      if (!lstatSync(join(root, filePath)).isFile()) throw new Error(`不是普通文件：${filePath}`);
      const current = lint(root, bin, filePath, undefined, timeoutMs);
      const baselineSource = baselinePath ? git(root, ['show', `HEAD:${baselinePath}`], timeoutMs).stdout : null;
      const baseline = baselineSource === null ? [] : lint(root, bin, baselinePath, baselineSource, timeoutMs);
      const added = baselinePath ? addedLines(root, filePath, baselinePath, timeoutMs) : new Set();
      report.baselineCount += baseline.length;
      const counts = new Map();
      for (const message of baseline) {
        const key = fingerprint(message, baselinePath);
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
      for (const message of current) {
        const key = fingerprint(message, baselinePath ?? filePath);
        const count = counts.get(key) ?? 0;
        if (count && !added.has(message.line)) counts.set(key, count - 1);
        else {
          report.total += 1;
          if (report.diagnostics.length < 5) report.diagnostics.push(message);
        }
      }
    }
    report.truncated = report.total > report.diagnostics.length;
    report.status = report.total ? 'failed' : 'passed';
  } catch (error) {
    report.status = 'incomplete';
    report.issues.push(error.message);
  }
  return report;
}

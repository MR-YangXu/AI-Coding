import { existsSync, lstatSync, mkdirSync, readFileSync, writeFileSync, unlinkSync, rmdirSync } from 'node:fs';
import { dirname, extname, join, posix, resolve, relative } from 'node:path';
import { readConfig, readPackage, managerFor } from './project.mjs';
import { askSelect, askInput } from './prompt.mjs';

export const adminCapabilities = ['BaseCard', 'NewSearchForm', 'NewTable', 'usePageList', 'useSelectOptions', 'useAsyncListAction', 'Dialog', 'Drawer', 'formRender', 'tableRender', 'data'];
const templateRoot = new URL('../content/templates/admin/', import.meta.url);
const strategies = ['error', 'replace', 'skip', 'rename'];

function safePath(root, path, directory = false) {
  if (!path || path.includes('\\') || path.startsWith('/') || path.split('/').some(part => !part || part === '.' || part === '..')) throw new Error(`非法目标路径：${path}`);
  if (!relative(root, resolve(root, path)) || relative(root, resolve(root, path)).startsWith('..')) throw new Error(`目标路径越界：${path}`);
  let current = root;
  for (const [index, part] of path.split('/').entries()) {
    current = join(current, part);
    try {
      const stat = lstatSync(current);
      if (stat.isSymbolicLink()) throw new Error(`目标路径包含符号链接：${path}`);
      const isDirectory = directory || index < path.split('/').length - 1;
      if (isDirectory ? !stat.isDirectory() : !stat.isFile()) throw new Error(`目标路径类型冲突：${path}`);
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
}

function selectedItems(only) {
  const list = only === undefined ? adminCapabilities : only.split(',').map(value => value.trim());
  if (!list.length || list.some(value => !adminCapabilities.includes(value))) throw new Error(`--only 仅支持：${adminCapabilities.join(',')}`);
  return [...new Set(list)];
}

function rewriteImports(content, file, files, targets) {
  // 仅处理分发清单内、已知源码的相对模块引用；不修改消费者的代码。
  return content.replace(/((?:from\s*|import\s*)['"])(\.[^'"]+)(['"])/g, (match, prefix, specifier, suffix) => {
    const base = posix.normalize(posix.join(posix.dirname(file), specifier));
    const dependency = files.find(candidate => candidate === base || candidate === `${base}.ts` || candidate === `${base}.js` || candidate === `${base}.tsx` || candidate === `${base}.jsx` || candidate === `${base}/index.ts` || candidate === `${base}/index.js` || candidate === `${base}/index.tsx` || candidate === `${base}/index.jsx`);
    if (!dependency) return match;
    let next = posix.relative(posix.dirname(targets[file]), targets[dependency]);
    if (!next.startsWith('.')) next = `./${next}`;
    if (!extname(specifier)) next = next.replace(/\.(?:ts|js|tsx|jsx)$/, '');
    return `${prefix}${next}${suffix}`;
  });
}

function dependencyReport(project, manager, requirements) {
  const declared = { ...project.devDependencies, ...project.dependencies };
  const dependencies = Object.entries(requirements).map(([name, version]) => ({ name, recommended: version, declared: declared[name] ?? null, status: declared[name] ? 'declared' : 'missing' }));
  const missing = dependencies.filter(item => item.status === 'missing');
  const command = missing.length ? `${manager} ${manager === 'npm' ? 'install' : 'add'} ${missing.map(item => `${item.name}@${item.recommended}`).join(' ')}` : null;
  return { dependencies, installCommand: command, note: '已声明不代表已验证兼容；按工具集 README 核对版本与样式入口。' };
}

export async function addAdmin(root, { only, sourceDir = 'src', conflict = 'error', dryRun = false, interactive = false, streams } = {}) {
  if (!strategies.includes(conflict)) throw new Error('--conflict 仅支持 error、replace、skip、rename');
  if (!existsSync(join(root, '.ai-code/config.json'))) throw new Error('项目尚未接入，请先执行 ai-code init 并选择技术栈');
  const { stack } = readConfig(root);
  const project = readPackage(root);
  safePath(root, sourceDir, true);
  if (sourceDir.split('/').some(part => ['node_modules', '.git', '.cursor', '.ai-code'].includes(part))) throw new Error('源码目录不能位于工具或依赖目录内');
  const variant = `${stack.framework}-${stack.language}`;
  const manifest = JSON.parse(readFileSync(new URL(`${variant}/manifest.json`, templateRoot), 'utf8'));
  const requested = selectedItems(only);
  const ordered = [];
  const visit = id => {
    if (ordered.includes(id)) return;
    for (const dependency of manifest.items[id].dependencies) visit(dependency);
    ordered.push(id);
  };
  requested.forEach(visit);
  const files = ordered.flatMap(id => manifest.items[id].files);
  const targets = Object.fromEntries(files.map(file => [file, `${sourceDir}/${file}`]));
  const contents = Object.fromEntries(files.map(file => [file, readFileSync(new URL(`${variant}/${file}`, templateRoot), 'utf8')]));
  const observed = new Map();
  const items = [];
  const occupied = new Set(Object.values(targets));
  // 先完成所有决策，任何取消/冲突都发生在写入之前。
  for (const id of ordered) {
    const item = manifest.items[id];
    const blockedBy = item.dependencies.filter(dep => items.find(entry => entry.id === dep)?.action === 'skip');
    if (blockedBy.length) { items.push({ id, action: 'skip', blockedBy, files: item.files.map(file => targets[file]) }); continue; }
    for (const file of item.files) {
      safePath(root, targets[file]);
      observed.set(targets[file], existsSync(join(root, targets[file])) ? readFileSync(join(root, targets[file])) : null);
    }
    const collisions = item.files.filter(file => existsSync(join(root, targets[file])) && readFileSync(join(root, targets[file]), 'utf8') !== rewriteImports(contents[file], file, files, targets));
    let action = collisions.length ? conflict : 'add';
    if (collisions.length && interactive && !dryRun && conflict === 'error') action = await askSelect({
      message: `${id} 存在同名文件：${collisions.map(file => targets[file]).join('、')}`,
      default: 'skip', choices: [{ name: '不复制（连带跳过依赖项）', value: 'skip' }, { name: '重命名新文件', value: 'rename' }, { name: '替换列出的文件', value: 'replace' }],
    }, streams);
    if (action === 'rename') {
      const group = item.root;
      const extension = extname(group);
      const stem = posix.basename(group, extension);
      let name = `${stem}AiCode`;
      if (interactive && !dryRun) name = await askInput({ message: `${id} 新名称（不含扩展名）`, default: name, validate: value => /^[A-Za-z][\w-]*$/.test(value) || '请输入字母开头的文件/目录名' }, streams);
      if (!/^[A-Za-z][\w-]*$/.test(name)) throw new Error(`非法重命名：${name}`);
      let attempt = 1;
      while (true) {
        const nextRoot = posix.join(posix.dirname(group), `${name}${attempt === 1 ? '' : attempt}${extension}`);
        const mapping = Object.fromEntries(item.files.map(file => [file, `${sourceDir}/${file === group ? nextRoot : nextRoot + file.slice(group.length)}`]));
        const rootTarget = `${sourceDir}/${nextRoot}`;
        if (!existsSync(join(root, rootTarget)) && Object.values(mapping).every(path => !occupied.has(path) && !existsSync(join(root, path)))) {
          Object.assign(targets, mapping);
          Object.values(mapping).forEach(path => { safePath(root, path); occupied.add(path); observed.set(path, null); });
          break;
        }
        attempt++;
      }
    }
    const unchanged = !collisions.length && item.files.every(file => existsSync(join(root, targets[file])));
    items.push({ id, action: unchanged ? 'reuse' : action, files: item.files.map(file => targets[file]), conflicts: collisions.map(file => `${sourceDir}/${file}`) });
  }
  // 不复制仅被跳过能力需要的辅助依赖。
  const needed = new Set();
  const retain = id => { if (needed.has(id)) return; needed.add(id); manifest.items[id].dependencies.forEach(retain); };
  requested.filter(id => !['skip', 'error'].includes(items.find(item => item.id === id).action)).forEach(retain);
  for (const item of items) if (!needed.has(item.id) && !requested.includes(item.id) && !['skip', 'error'].includes(item.action)) { item.action = 'skip'; item.blockedBy = ['无待安装的消费者']; }
  const requirements = Object.assign({}, ...items.filter(item => !['skip', 'error'].includes(item.action)).map(item => manifest.items[item.id].requirements ?? {}));
  const issues = items.filter(item => item.action === 'error').map(item => `${item.id} 存在冲突，请交互选择或指定 --conflict`);
  const report = { ok: !issues.length, dryRun, stack, requested, items, issues, ...dependencyReport(project, managerFor(root, project), requirements), profilePath: '.ai-code/profile.md', profileSnippet: '' };
  if (dryRun || !report.ok) return report;
  const changes = items.filter(item => !['skip', 'reuse'].includes(item.action)).flatMap(item => manifest.items[item.id].files);
  for (const item of items.filter(item => item.action !== 'skip')) for (const file of manifest.items[item.id].files) {
    const path = targets[file]; safePath(root, path);
    const before = observed.get(path);
    const now = existsSync(join(root, path)) ? readFileSync(join(root, path)) : null;
    if ((before === null) !== (now === null) || (before !== null && !before.equals(now))) throw new Error(`选择期间文件已变化，请重新运行：${path}`);
  }
  const backups = new Map();
  const createdDirs = [];
  const ensureDirectory = path => {
    if (existsSync(path)) return;
    ensureDirectory(dirname(path)); mkdirSync(path); createdDirs.push(path);
  };
  try {
    for (const file of changes) {
      const path = targets[file]; safePath(root, path);
      const absolute = join(root, path);
      backups.set(absolute, existsSync(absolute) ? readFileSync(absolute) : null);
      ensureDirectory(dirname(absolute));
      try {
        writeFileSync(absolute, rewriteImports(contents[file], file, files, targets), { flag: backups.get(absolute) === null ? 'wx' : 'w' });
      } catch (error) {
        // wx 发现并发新建文件时，该文件不属于本次写入，不能在回滚时删除。
        if (error.code === 'EEXIST' && backups.get(absolute) === null) backups.delete(absolute);
        throw error;
      }
    }
  } catch (error) {
    for (const [path, bytes] of [...backups].reverse()) { if (bytes === null) { if (existsSync(path)) unlinkSync(path); } else writeFileSync(path, bytes); }
    for (const path of createdDirs.reverse()) {
      try { rmdirSync(path); } catch (cleanupError) { if (!['ENOTEMPTY', 'ENOENT'].includes(cleanupError.code)) throw cleanupError; }
    }
    throw error;
  }
  const installed = items.filter(item => !['skip', 'error'].includes(item.action) && !item.id.startsWith('_'));
  if (installed.length) report.profileSnippet = ['| 能力 | 实际源码入口 |', '| --- | --- |', ...installed.map(item => `| ${item.id} | ${item.files.map(path => `\`${path}\``).join('、')} |`)].join('\n');
  report.readme = `node_modules/@agent-xy/ai-code/content/templates/admin/${variant}/README.md`;
  return report;
}

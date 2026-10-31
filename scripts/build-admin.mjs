// 维护 Vue 3/React 的 TS 源和 Vue 2 的 JS 源；仅为 Vue 2 派生共享核心的 JS 文件。
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import ts from 'typescript';
import { frameworks } from '../src/stack.mjs';
const root = resolve('content/templates/admin');
const walk = path => readdirSync(path, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? walk(join(path, entry.name)) : [join(path, entry.name)]);
const write = (path, text) => { mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, text); };
function javascript(source, filename) {
  return ts.transpileModule(source, { fileName: filename, compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.Preserve, verbatimModuleSyntax: true } }).outputText;
}
const core = readFileSync(join(root, 'shared/adminCore.ts'), 'utf8');
for (const framework of ['vue3', 'react']) {
  write(join(root, `${framework}-ts/utils/adminCore.ts`), core);
}
write(join(root, 'vue2-js/utils/adminCore.js'), javascript(core, 'adminCore.ts'));
for (const [framework, { language }] of Object.entries(frameworks)) {
  const variant = `${framework}-${language}`;
  const isTS = language === 'ts';
  const react = framework === 'react';
  const vue2 = framework === 'vue2';
  const typeDependencies = isTS ? ['_types'] : [];
  const runtime = react ? { react: '^18.3.1', 'react-dom': '^18.3.1', '@types/react': '^18.3.0', '@types/react-dom': '^18.3.0' } : { vue: vue2 ? '^2.6.14' : '^3.3.0' };
  const ui = react ? { ...runtime, antd: '^5.0.0' } : vue2 ? { ...runtime, 'element-ui': '^2.15.0' } : { ...runtime, 'element-plus': '^2.4.0', sass: '^1.69.0' };
  const folder = join(root, variant);
  const allFiles = walk(folder).map(path => path.slice(folder.length + 1)).filter(path => !['manifest.json', 'README.md'].includes(path) && !path.startsWith('examples/'));
  const items = {};
  function item(id, path, dependencies = [], requirements = {}) {
    items[id] = { root: path, files: allFiles.filter(file => file === path || file.startsWith(`${path}/`)), dependencies, requirements };
    if (!items[id].files.length) throw new Error(`分发文件缺失：${variant}/${id}`);
  }
  item('_core', `utils/adminCore.${language}`);
  if (isTS) item('_types', 'types/admin.ts', ['_core'], react ? { '@types/react': '^18.3.0' } : runtime);
  item('BaseCard', 'components/BaseCard', [], react ? ui : vue2 ? runtime : { ...runtime, sass: '^1.69.0' });
  const listUI = { ...ui, sass: '^1.69.0' };
  item('NewSearchForm', 'components/NewSearchForm', ['_core', ...typeDependencies], react ? { ...listUI, dayjs: '^1.11.0' } : listUI);
  item('NewTable', 'components/NewTable', typeDependencies, listUI);
  item('Dialog', 'components/Dialog', [], ui);
  item('Drawer', 'components/Drawer', react ? ['Dialog'] : [], ui);
  for (const name of ['PageList', 'SelectOptions', 'AsyncListAction']) item(`use${name}`, `${vue2 ? 'logic/create' : 'hooks/use'}${name}.${language}`, ['_core', ...(name === 'SelectOptions' ? typeDependencies : [])], name === 'AsyncListAction' ? ui : runtime);
  item('formRender', `utils/formRender.${language}`, ['_core', ...typeDependencies]);
  item('tableRender', `utils/tableRender.${language}`, typeDependencies, vue2 ? {} : runtime);
  item('data', `utils/data.${language}`, ['_core']);
  write(join(folder, 'manifest.json'), JSON.stringify({ items }, null, 2) + '\n');
}

import { readdirSync, realpathSync } from 'node:fs';
import { resolve, relative, isAbsolute, extname } from 'node:path';

const extensions = new Set(['.vue', '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']);
const ignored = new Set(['node_modules', '.git', '.ai-code', '.cursor', 'dist', 'coverage']);
const identifier = /^[A-Za-z_$][\w$]*$/;

function object(value, keys, name) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(key => !keys.includes(key))) throw new Error(`${name} 配置无效或包含未知字段`);
}

function strings(value, name, required = true) {
  if (!Array.isArray(value) || (required && !value.length) || value.some(item => typeof item !== 'string' || !item.trim()) || new Set(value).size !== value.length) throw new Error(`${name} 必须是无重复的字符串数组`);
  return value;
}

export function projectPath(value) {
  if (typeof value !== 'string' || !value || isAbsolute(value) || value.includes('\\') || value.split('/').some(part => ['..', '.', ''].includes(part))) throw new Error(`常量路径必须相对项目根目录：${value}`);
  return value;
}

export function glob(pattern) {
  projectPath(pattern);
  if (/[{}[\]]/.test(pattern)) throw new Error(`文件匹配仅支持 *、**、?，请拆分匹配项：${pattern}`);
  let expression = '^';
  for (let index = 0; index < pattern.length; index++) {
    const char = pattern[index];
    if (char === '*' && pattern[index + 1] === '*') {
      index++;
      if (pattern[index + 1] === '/') { expression += '(?:.*/)?'; index++; }
      else expression += '.*';
    } else if (char === '*') expression += '[^/]*';
    else if (char === '?') expression += '[^/]';
    else expression += char.replace(/[.+^$()|\\]/g, '\\$&');
  }
  return new RegExp(expression + '$');
}

export function inModule(file, module) {
  return module.include.some(pattern => glob(pattern).test(file)) && !(module.exclude ?? []).some(pattern => glob(pattern).test(file));
}

export function validateConstants(config) {
  object(config, ['common', 'definitions', 'modules', 'tsconfig'], 'constants');
  if (config.tsconfig !== undefined) projectPath(config.tsconfig);
  if (config.common !== undefined) {
    object(config.common, ['entry', 'files'], 'constants.common');
    projectPath(config.common.entry);
    strings(config.common.files, 'constants.common.files').forEach(projectPath);
  }
  if (!Array.isArray(config.modules) || !config.modules.length || !Array.isArray(config.definitions) || !config.definitions.length) throw new Error('constants.modules 和 definitions 不能为空');
  const modules = new Set();
  for (const module of config.modules) {
    object(module, ['id', 'include', 'exclude', 'bindings'], '常量业务模块');
    if (typeof module.id !== 'string' || !module.id.trim() || module.id === 'common' || modules.has(module.id)) throw new Error(`业务模块标识重复或无效：${module.id}`);
    modules.add(module.id);
    strings(module.include, `${module.id}.include`).forEach(glob);
    if (module.exclude !== undefined) strings(module.exclude, `${module.id}.exclude`, false).forEach(glob);
    if (!Array.isArray(module.bindings)) throw new Error(`${module.id}.bindings 必须是数组`);
  }
  const definitions = new Map();
  const locations = new Set();
  for (const definition of config.definitions) {
    object(definition, ['id', 'owner', 'file', 'export', 'dictionary'], '常量定义');
    const { id, owner, file, dictionary } = definition;
    projectPath(file);
    if (typeof id !== 'string' || !id.trim() || definitions.has(id)) throw new Error(`同一业务语义只能登记一个定义：${id}`);
    if (typeof definition.export !== 'string' || !identifier.test(definition.export) || (dictionary !== undefined && (typeof dictionary !== 'string' || !identifier.test(dictionary) || dictionary === definition.export))) throw new Error(`${id} 的导出名无效`);
    if (owner === 'common') {
      if (!config.common?.files.includes(file)) throw new Error(`${id} 必须定义于已登记的公共文件`);
    } else if (!modules.has(owner) || !inModule(file, config.modules.find(item => item.id === owner))) throw new Error(`${id} 的定义必须位于所属业务模块 ${owner}`);
    for (const name of [definition.export, dictionary].filter(Boolean)) {
      const location = `${file}:${name}`;
      if (locations.has(location)) throw new Error(`定义位置不能重复登记：${location}`);
      locations.add(location);
    }
    definitions.set(id, definition);
  }
  for (const module of config.modules) {
    const keys = new Map();
    for (const binding of module.bindings) {
      object(binding, ['definition', 'fields', 'options', 'template', 'jsx'], '常量使用绑定');
      const definition = definitions.get(binding.definition);
      if (!definition || !['common', module.id].includes(definition.owner)) throw new Error(`${module.id} 只能绑定公共或本业务定义：${binding.definition}`);
      const bindings = [];
      for (const kind of ['fields', 'options']) {
        if (binding[kind] !== undefined) strings(binding[kind], `${module.id}.${kind}`, false).forEach(value => {
          if (!value.split('.').every(part => identifier.test(part)) || (kind === 'options' && value.includes('.'))) throw new Error(`无效绑定：${value}`);
          bindings.push(`${kind}:${value}`);
        });
      }
      if (binding.template !== undefined) {
        if (!Array.isArray(binding.template)) throw new Error('template 必须是数组');
        for (const item of binding.template) {
          object(item, ['component', 'prop', 'model'], '模板绑定');
          if (typeof item.component !== 'string' || !item.component || typeof item.prop !== 'string' || !item.prop || (item.model !== undefined && (typeof item.model !== 'string' || !item.model))) throw new Error('模板绑定必须声明组件、属性及可选的 v-model 表达式');
          bindings.push(`template:${item.component}:${item.prop}:${item.model ?? ''}`);
        }
      }
      if (binding.jsx !== undefined) {
        if (!Array.isArray(binding.jsx)) throw new Error('jsx 必须是数组');
        for (const item of binding.jsx) {
          object(item, ['component', 'prop'], 'JSX 属性绑定');
          if (typeof item.component !== 'string' || !item.component.trim() || typeof item.prop !== 'string' || !item.prop.trim()) throw new Error('JSX 绑定必须声明 component 和 prop');
          bindings.push(`jsx:${item.component}:${item.prop}`);
        }
      }
      if (!bindings.length) throw new Error(`${module.id} 的绑定未声明字段、选项或模板属性`);
      for (const key of bindings) {
        if (keys.has(key) && keys.get(key) !== binding.definition) throw new Error(`${module.id} 的使用绑定冲突：${key}`);
        keys.set(key, binding.definition);
      }
    }
  }
  return config;
}

export function sourceFiles(root, config) {
  const found = [];
  function walk(directory, prefix = '') {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const name = prefix + entry.name;
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) { if (!ignored.has(entry.name)) walk(resolve(directory, entry.name), name + '/'); }
      else if (extensions.has(extname(name)) && config.modules.some(module => inModule(name, module))) found.push(name);
    }
  }
  walk(root);
  for (const module of config.modules) if (!found.some(file => inModule(file, module))) throw new Error(`常量检查范围无文件：${module.id}`);
  return found.sort();
}

export function insideProject(root, file) {
  const resolved = realpathSync(file);
  const path = relative(realpathSync(root), resolved);
  if (isAbsolute(path) || path === '..' || path.startsWith('../')) throw new Error(`常量源码不在项目内：${file}`);
  return resolved;
}

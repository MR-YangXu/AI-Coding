import { existsSync, mkdirSync, writeFileSync, lstatSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { askSelect } from './prompt.mjs';
import { legacyStack, normalizeStack } from './stack.mjs';
import { renderContent } from './content.mjs';

export const profilePath = '.ai-code/profile.md';

export const profileChoices = [
  { id: 'base', label: '通用项目', file: 'profile.base.md' },
  { id: 'vue', label: '通用 Vue', file: 'profile.vue.md' },
  { id: 'admin', label: '管理后台', file: 'profile.admin.md' },
  { id: 'mobile-h5', label: '移动端 H5', file: 'profile.mobile-h5.md' },
];

export function parseProfile(value) {
  if (typeof value !== 'string' || !value.trim()) throw new Error('--profile 需要指定 base、vue、admin、mobile-h5 或 none');
  const id = value.trim();
  if (id === 'none') return null;
  if (!profileChoices.some(choice => choice.id === id)) throw new Error('--profile 仅支持 base、vue、admin、mobile-h5 或 none');
  return id;
}

export function defaultProfileFor(scenarios = []) {
  if (scenarios.includes('admin')) return 'admin';
  if (scenarios.includes('mobile-h5')) return 'mobile-h5';
  return 'base';
}

export function profileTemplate(id, stack = legacyStack) {
  normalizeStack(stack);
  if (id === 'vue' && stack.framework === 'react') throw new Error('React 项目请使用 --profile base，vue 模板仅适用于 Vue 项目');
  const choice = profileChoices.find(item => item.id === id);
  if (!choice) throw new Error(`未知的档案模板：${id}`);
  return renderContent(`templates/${id === 'vue' ? 'profile.base.md' : choice.file}`, stack);
}

// 档案由项目维护：只在不存在时按模板创建，之后 init 和 sync 都不再碰它。
export function writeProfile(root, id, stack = legacyStack) {
  const target = join(root, profilePath);
  for (const path of [join(root, '.ai-code'), target]) {
    try { if (lstatSync(path).isSymbolicLink()) throw new Error(`项目档案路径包含符号链接：${path}`); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  if (existsSync(target)) return { path: profilePath, template: id, created: false };
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, profileTemplate(id, stack), { flag: 'wx' });
  return { path: profilePath, template: id, created: true };
}

export function profileChoicesFor(scenarios = []) {
  return profileChoices.filter(choice => scenarios.length ? scenarios.includes(choice.id) : choice.id === 'base');
}

export async function promptProfile(scenarios, streams) {
  const choices = profileChoicesFor(scenarios);
  if (!choices.length) return null;
  return askSelect({
    message: `是否创建 ${profilePath}？`,
    default: defaultProfileFor(scenarios),
    choices: [
      ...choices.map(choice => ({ name: `使用${choice.label}模板`, value: choice.id })),
      { name: '暂不创建', value: null },
    ],
  }, streams);
}

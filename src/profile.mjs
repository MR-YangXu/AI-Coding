import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { askSelect } from './prompt.mjs';

export const profilePath = '.ai-code/profile.md';
const templateRoot = join(dirname(fileURLToPath(import.meta.url)), '../content/templates');

export const profileChoices = [
  { id: 'vue', label: '通用 Vue', file: 'profile.vue.md' },
  { id: 'admin', label: '管理后台', file: 'profile.admin.md' },
  { id: 'mobile-h5', label: '移动端 H5', file: 'profile.mobile-h5.md' },
];

export function parseProfile(value) {
  if (typeof value !== 'string' || !value.trim()) throw new Error('--profile 需要指定 vue、admin、mobile-h5 或 none');
  const id = value.trim();
  if (id === 'none') return null;
  if (!profileChoices.some(choice => choice.id === id)) throw new Error('--profile 仅支持 vue、admin、mobile-h5 或 none');
  return id;
}

export function defaultProfileFor(scenarios = []) {
  if (scenarios.includes('admin')) return 'admin';
  if (scenarios.includes('mobile-h5')) return 'mobile-h5';
  return 'vue';
}

export function profileTemplate(id) {
  const choice = profileChoices.find(item => item.id === id);
  if (!choice) throw new Error(`未知的档案模板：${id}`);
  return readFileSync(join(templateRoot, choice.file), 'utf8');
}

// 档案由项目维护：只在不存在时按模板创建，之后 init 和 sync 都不再碰它。
export function writeProfile(root, id) {
  const target = join(root, profilePath);
  if (existsSync(target)) return { path: profilePath, template: id, created: false };
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, profileTemplate(id));
  return { path: profilePath, template: id, created: true };
}

export function profileChoicesFor(scenarios = []) {
  return profileChoices.filter(choice => scenarios.includes(choice.id));
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

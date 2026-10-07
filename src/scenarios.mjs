import { askSelect } from './prompt.mjs';

export const scenarioChoices = [
  { id: 'admin', label: '管理后台' },
  { id: 'mobile-h5', label: '移动端 H5' },
];

export function normalizeScenarios(value = []) {
  if (!Array.isArray(value) || value.some(id => !scenarioChoices.some(choice => choice.id === id))) {
    throw new Error('项目场景无效：仅支持 admin、mobile-h5；仅通用场景使用空数组');
  }
  return scenarioChoices.filter(choice => value.includes(choice.id)).map(choice => choice.id);
}

export function parseScenarios(value) {
  if (typeof value !== 'string' || !value.trim()) throw new Error('--scenarios 需要指定 admin、mobile-h5 或 none');
  if (value.trim() === 'none') return [];
  return normalizeScenarios(value.split(',').map(id => id.trim()));
}

export function describeScenarios(value) {
  const selected = normalizeScenarios(value);
  return ['通用 Vue', ...scenarioChoices.filter(choice => selected.includes(choice.id)).map(choice => `${choice.label}（${choice.id}）`)].join(' + ');
}

const scenarioPresets = [
  { name: '不接入后台或 H5', value: [] },
  ...scenarioChoices.map(choice => ({ name: choice.label, value: [choice.id] })),
  { name: '管理后台 + 移动端 H5', value: scenarioChoices.map(choice => choice.id) },
];

export async function promptScenarios(streams) {
  const selected = await askSelect({
    message: '是否接入场景？通用规则始终安装',
    choices: scenarioPresets,
  }, streams);
  return normalizeScenarios(selected);
}

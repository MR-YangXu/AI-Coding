import { createInterface } from 'node:readline';

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

export async function promptScenarios({ input = process.stdin, output = process.stdout } = {}) {
  output.write('选择项目场景（通用规则始终安装）：\n  0. 仅通用 Vue（默认）\n');
  scenarioChoices.forEach((choice, index) => output.write(`  ${index + 1}. ${choice.label}（${choice.id}）\n`));
  output.write('请输入编号，多个用逗号分隔，例如 1,2；直接回车选择通用：');
  const reader = createInterface({ input, crlfDelay: Infinity });
  try {
    for await (const line of reader) {
      const answer = line.trim();
      if (!answer || answer === '0') return [];
      try {
        return parseScenarios(answer.split(',').map(item => {
          const value = item.trim();
          return scenarioChoices.find((_, index) => String(index + 1) === value)?.id ?? value;
        }).join(','));
      } catch (error) {
        output.write(`${error.message}\n请重新选择：`);
      }
    }
    throw new Error('场景选择已取消，未初始化项目');
  } finally {
    reader.close();
  }
}

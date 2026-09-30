import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeScenarios, scenarioChoices } from '../scenarios.mjs';

const contentRoot = join(dirname(fileURLToPath(import.meta.url)), '../../content');

export function scenarioSkillPath(id) {
  return `.cursor/skills/ai-code-${id}/SKILL.md`;
}

export function cursorFiles(scenarios = []) {
  const selected = normalizeScenarios(scenarios);
  const sceneIndex = selected.length ? `\n## 已启用的项目场景\n\n以下是可按需使用的场景补充，只读取与当前功能归属和运行环境匹配的技能；未匹配的任务使用通用技能。多个场景同时适用时可组合读取，不能把所有已安装场景视为全局约束。\n\n${selected.map(id => `- ${scenarioChoices.find(choice => choice.id === id).label}：[ai-code-${id}](../skills/ai-code-${id}/SKILL.md)`).join('\n')}\n` : '';
  const files = {
    '.cursor/rules/ai-code.mdc': `---\nalwaysApply: true\n---\n\n${readFileSync(join(contentRoot, 'core.md'), 'utf8')}${sceneIndex}`,
  };
  for (const name of readdirSync(join(contentRoot, 'skills'))) {
    files[`.cursor/skills/ai-code-${name}/SKILL.md`] = readFileSync(join(contentRoot, 'skills', name, 'SKILL.md'), 'utf8');
  }
  for (const id of selected) {
    files[scenarioSkillPath(id)] = readFileSync(join(contentRoot, 'scenarios', id, 'SKILL.md'), 'utf8');
  }
  return files;
}

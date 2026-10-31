import { normalizeScenarios, scenarioChoices } from '../scenarios.mjs';
import { legacyStack, skillSources, describeStack } from '../stack.mjs';
import { renderContent, managedContent } from '../content.mjs';

export function scenarioSkillPath(id) {
  return `.cursor/skills/ai-code-${id}/SKILL.md`;
}

export function cursorFiles(scenarios = [], stack = legacyStack) {
  const selected = normalizeScenarios(scenarios);
  const sources = skillSources(stack);
  const skills = Object.entries(sources).map(([name, source]) => `- [ai-code-${name}](../skills/ai-code-${name}/SKILL.md)：${renderContent(source, stack).match(/^description: (.+)$/m)?.[1] ?? name}`).join('\n');
  const sceneIndex = selected.length ? `\n## 已启用的项目场景\n\n以下是可按需使用的场景补充，只读取与当前功能归属和运行环境匹配的技能；未匹配的任务使用通用技能。多个场景同时适用时可组合读取，不能把所有已安装场景视为全局约束。\n\n${selected.map(id => `- ${scenarioChoices.find(choice => choice.id === id).label}：[ai-code-${id}](../skills/ai-code-${id}/SKILL.md)`).join('\n')}\n` : '';
  const files = {
    '.cursor/rules/ai-code.mdc': managedContent(`---\nalwaysApply: true\n---\n\n${renderContent('common/core.md', stack)}\n${renderContent(`frameworks/${stack.framework}/core.md`, stack)}\n${renderContent(`languages/${stack.language}/core.md`, stack)}\n## 已安装的技能\n\n技术栈：${describeStack(stack)}。仅按本次改动加载对应技能；页面使用 view，场景按功能叠加，修改路由时再加载 route。\n\n${skills}\n${sceneIndex}`),
  };
  for (const [name, source] of Object.entries(sources)) {
    files[scenarioSkillPath(name)] = managedContent(renderContent(source, stack));
  }
  for (const id of selected) {
    files[scenarioSkillPath(id)] = managedContent(renderContent(`scenarios/${id}/SKILL.md`, stack));
  }
  files['.ai-code/README.md'] = managedContent(renderContent('handbook.md', stack));
  return files;
}

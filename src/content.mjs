import { readFileSync } from 'node:fs';
import { describeStack, normalizeStack } from './stack.mjs';

export const managedNotice = '> 由工具生成，修改将在同步时覆盖；项目补充约定请写入 `.ai-code/profile.md`。';

export function renderContent(path, stack) {
  const { framework, language } = normalizeStack(stack);
  const values = {
    stack: describeStack(stack), ext: language, componentExt: framework === 'react' ? `${language}x` : 'vue',
    logic: framework === 'vue2' ? '逻辑函数或已有混入' : framework === 'react' ? 'React Hook' : '组合式函数',
  };
  return readFileSync(new URL(`../content/${path}`, import.meta.url), 'utf8').replace(/\{\{(\w+)\}\}/g, (_, key) => {
    if (!(key in values)) throw new Error(`未知内容变量：${key}（${path}）`);
    return values[key];
  });
}

export function managedContent(content) {
  // SKILL 的元信息必须仍在文件开头。
  return content.startsWith('---\n')
    ? content.replace(/^(---\n[\s\S]*?\n---\n)/, `$1\n${managedNotice}\n`)
    : `${managedNotice}\n\n${content}`;
}

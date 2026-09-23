import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const contentRoot = join(dirname(fileURLToPath(import.meta.url)), '../../content');

export function cursorFiles() {
  const files = {
    '.cursor/rules/ai-code.mdc': `---\nalwaysApply: true\n---\n\n${readFileSync(join(contentRoot, 'core.md'), 'utf8')}`,
  };
  for (const name of readdirSync(join(contentRoot, 'skills'))) {
    files[`.cursor/skills/ai-code-${name}/SKILL.md`] = readFileSync(join(contentRoot, 'skills', name, 'SKILL.md'), 'utf8');
  }
  return files;
}

import { askSelect } from './prompt.mjs';

export const legacyStack = Object.freeze({ framework: 'vue3', language: 'ts' });
const sharedSkills = ['api', 'constant'];
const componentSkills = ['view', 'component', 'state', 'route', 'i18n'];
export const frameworks = {
  vue2: { label: 'Vue 2', language: 'js', skills: [...componentSkills, 'logic'] },
  vue3: { label: 'Vue 3', language: 'ts', skills: [...componentSkills, 'hook'] },
  react: { label: 'React', language: 'ts', skills: [...componentSkills, 'hook'] },
};

export function normalizeStack(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(key => !['framework', 'language'].includes(key))) throw new Error('技术栈配置无效');
  const { framework, language } = value;
  if (!Object.hasOwn(frameworks, framework)) throw new Error('请通过 --framework 指定 vue2、vue3 或 react');
  const selected = frameworks[framework];
  if (language !== selected.language) throw new Error(`${selected.label} 固定使用 ${selected.language === 'ts' ? 'TypeScript' : 'JavaScript'}，不支持当前语言配置`);
  return { framework, language };
}

export function resolveStack({ framework } = {}, saved) {
  const selected = framework ?? saved?.framework;
  return normalizeStack({ framework: selected, language: frameworks[selected]?.language });
}

export function describeStack(stack) {
  const { framework, language } = normalizeStack(stack);
  return `${frameworks[framework].label} + ${language === 'ts' ? 'TypeScript' : 'JavaScript'}`;
}

export function skillSources(stack) {
  const { framework, language } = normalizeStack(stack);
  return {
    ...Object.fromEntries(sharedSkills.map(name => [name, `common/skills/${name}/SKILL.md`])),
    ...Object.fromEntries(frameworks[framework].skills.map(name => [name, `frameworks/${framework}/skills/${name}/SKILL.md`])),
    ...(language === 'ts' ? { type: 'languages/ts/skills/type/SKILL.md' } : {}),
  };
}

export async function promptStack({ framework } = {}, streams) {
  if (framework !== undefined) return resolveStack({ framework });
  framework = await askSelect({
    message: '选择项目框架',
    choices: Object.entries(frameworks).map(([value, item]) => ({ name: `${item.label} + ${item.language === 'ts' ? 'TypeScript' : 'JavaScript'}`, value })),
  }, streams);
  return resolveStack({ framework });
}

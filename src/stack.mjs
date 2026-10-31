import { askSelect } from './prompt.mjs';

export const legacyStack = Object.freeze({ framework: 'vue3', language: 'ts' });
const sharedSkills = ['api', 'constant'];
const componentSkills = ['view', 'component', 'state', 'route', 'i18n'];
export const frameworks = {
  vue2: { label: 'Vue 2', languages: ['js'], skills: [...componentSkills, 'logic'] },
  vue3: { label: 'Vue 3', languages: ['js', 'ts'], skills: [...componentSkills, 'hook'] },
  react: { label: 'React', languages: ['js', 'ts'], skills: [...componentSkills, 'hook'] },
};

export function normalizeStack(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(key => !['framework', 'language'].includes(key))) throw new Error('技术栈配置无效');
  const { framework, language } = value;
  if (!Object.hasOwn(frameworks, framework)) throw new Error('请通过 --framework 指定 vue2、vue3 或 react');
  if (!frameworks[framework].languages.includes(language)) throw new Error(framework === 'vue2' ? 'Vue 2 当前仅支持 JavaScript（--language js）' : '请通过 --language 指定 js 或 ts');
  return { framework, language };
}

export function resolveStack({ framework, language } = {}, saved) {
  const selected = framework ?? saved?.framework;
  return normalizeStack({ framework: selected, language: language ?? (selected === 'vue2' ? 'js' : selected === saved?.framework ? saved?.language : undefined) });
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

export async function promptStack({ framework, language } = {}, streams) {
  if (framework !== undefined && !Object.hasOwn(frameworks, framework)) return resolveStack({ framework, language });
  framework ??= await askSelect({ message: '选择项目框架', choices: Object.entries(frameworks).map(([value, item]) => ({ name: item.label, value })) }, streams);
  if (framework !== 'vue2' && language === undefined) language = await askSelect({
    message: '选择开发语言规则',
    choices: [{ name: 'JavaScript 规则', value: 'js' }, { name: 'TypeScript 规则', value: 'ts' }],
  }, streams);
  return resolveStack({ framework, language });
}

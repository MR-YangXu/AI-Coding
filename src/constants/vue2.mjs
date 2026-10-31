import { parseForESLint } from 'vue-eslint-parser';

// 保留脚本的原始偏移，模板表达式单独映射回 SFC；不把过滤器当成位运算。
export function vue2Document(file, original) {
  const { ast, services } = parseForESLint(original, { sourceType: 'module', ecmaVersion: 2022, vueFeatures: { filter: true } });
  // Vue SFC 允许原生标签自闭合，HTML 解析器对此给出的提示不是 Vue 语法错误。
  const errors = (ast.templateBody?.errors ?? []).filter(error => error.code !== 'non-void-html-element-start-tag-with-trailing-solidus');
  if (errors.length) throw new Error(`${file}：Vue 2 模板解析失败：${errors.map(error => error.message).join('；')}`);
  const blocks = services.getDocumentFragment().children.filter(node => node.type === 'VElement');
  const scripts = blocks.filter(node => node.name === 'script');
  if (scripts.length > 1) throw new Error(`${file}：Vue 2 只支持单个普通 script`);
  for (const block of blocks.filter(node => ['script', 'template'].includes(node.name))) {
    for (const attr of block.startTag.attributes) {
      const name = attr.key.name;
      if (['src', 'setup'].includes(name) || (name === 'lang' && ![block.name === 'script' ? 'js' : 'html', 'javascript'].includes(attr.value?.value))) throw new Error(`${file}：Vue 2 不支持外置块、setup 或该预处理语言`);
    }
  }
  const characters = original.split('').map(char => /[\r\n]/.test(char) ? char : ' ');
  for (const block of scripts) {
    if (!block.endTag) throw new Error(`${file}：script 未闭合`);
    for (let index = block.startTag.range[1]; index < block.endTag.range[0]; index++) characters[index] = original[index];
  }
  let text = characters.join('') + '\nexport {};\n';
  const expressions = [];
  const free = new Set();
  function collect(node) {
    if (node.type === 'VExpressionContainer') for (const ref of node.references ?? []) if (!ref.variable) free.add(ref.id.name);
    if (node.type === 'VElement') for (const attr of node.startTag.attributes) if (attr.value) collect(attr.value);
    for (const child of node.children ?? []) collect(child);
  }
  if (ast.templateBody) collect(ast.templateBody);
  text += '\n;((';
  const componentParameters = { start: text.length, end: text.length + [...free].join(',').length };
  text += [...free].join(',') + ')=>{\n';

  function decoded(node) {
    const [start, end] = node.range;
    let content = '';
    const offsets = [];
    let cursor = start;
    const append = (value, position, width = value.length) => {
      content += value;
      for (let index = 0; index < value.length; index++) offsets.push(position + Math.min(index, width - 1));
    };
    for (const token of ast.templateBody?.tokens ?? []) {
      if (token.range[0] < start || token.range[1] > end) continue;
      append(original.slice(cursor, token.range[0]), cursor);
      append(token.value, token.range[0], token.range[1] - token.range[0]);
      cursor = token.range[1];
    }
    append(original.slice(cursor, end), cursor);
    return { content, offsets };
  }

  function add(node, context, statements = false, content) {
    if (!node) return;
    if (node.type === 'VFilterSequenceExpression') {
      add(node.expression, context);
      // 过滤器参数可包含独立业务比较；转换结果仍是动态值。
      for (const filter of node.filters) for (const arg of filter.arguments) add(arg, { parameters: context.parameters });
      return;
    }
    const source = content === undefined ? decoded(node) : { content };
    const value = source.content;
    if (!value.trim()) return;
    const parameters = [...new Set([...(context.parameters ?? []), ...(statements ? ['$event'] : [])])].join(',');
    text += statements ? `\n;((${parameters})=>{` : `\n;((${parameters})=>(`;
    const start = text.length;
    text += value;
    expressions.push({ ...context, start, end: text.length, offset: node.range[0], offsets: source.offsets, statements });
    text += statements ? '});\n' : '));\n';
  }
  function visit(node, inherited = { parameters: [] }) {
    if (node.type === 'VExpressionContainer') { add(node.expression, inherited); return; }
    if (node.type !== 'VElement') return;
    const attrs = node.startTag.attributes;
    const loop = attrs.find(attr => attr.directive && attr.key.name.name === 'for');
    if (loop?.value?.expression) add(loop.value.expression.right, inherited);
    const parameters = [...inherited.parameters, ...(node.variables ?? []).map(variable => variable.id.name)];
    const model = attrs.find(attr => attr.directive && attr.key.name.name === 'model')?.value?.expression;
    const context = { parameters, model: model ? decoded(model).content : inherited.model };
    for (const attr of attrs) {
      if (attr.directive) {
        const name = attr.key.name.name;
        if (['for', 'slot', 'slot-scope', 'scope'].includes(name)) continue;
        const argument = attr.key.argument;
        add(attr.value?.expression, { ...context, component: node.rawName, prop: name === 'bind' && argument?.type === 'VIdentifier' ? argument.name : undefined }, name === 'on');
        if (argument?.type === 'VExpressionContainer') add(argument.expression, context);
      } else if (attr.value) {
        add(attr.value, { ...context, component: node.rawName, prop: attr.key.name }, false, JSON.stringify(attr.value.value));
      }
    }
    for (const child of node.children) visit(child, context);
  }
  if (ast.templateBody) visit(ast.templateBody);
  text += '\n})();\n';
  return { text, expressions, componentParameters, originalScriptEnd: original.length };
}

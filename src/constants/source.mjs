import { existsSync, readFileSync } from 'node:fs';
import { resolve, relative, dirname } from 'node:path';
import { createRequire } from 'node:module';
import { insideProject } from './config.mjs';

const require = createRequire(import.meta.url);
let ts;
let parse;
export function parserTools() {
  ts ??= require('typescript');
  parse ??= require('@vue/compiler-sfc').parse;
  return { ts };
}

export function unwrap(node) {
  while (node && (ts.isParenthesizedExpression(node) || ts.isAsExpression(node) || ts.isTypeAssertionExpression(node) || ts.isNonNullExpression(node) || ts.isSatisfiesExpression(node))) node = node.expression;
  return node;
}

export function nameOf(node) {
  if (!node) return undefined;
  if (ts.isIdentifier(node) || ts.isStringLiteralLike(node) || ts.isNumericLiteral(node)) return node.text;
  return undefined;
}

function vueDocument(file, original) {
  const { descriptor, errors } = parse(original, { filename: file });
  if (errors.length) throw new Error(`${file}：Vue 解析失败：${errors.map(error => error.message ?? error).join('；')}`);
  const blocks = [descriptor.script, descriptor.scriptSetup].filter(Boolean);
  if (blocks.some(block => block.src || (block.lang && !['js', 'ts', 'jsx', 'tsx'].includes(block.lang))) || descriptor.template?.src || (descriptor.template?.lang && descriptor.template.lang !== 'html')) throw new Error(`${file}：暂不支持外置脚本、外置模板或该预处理语言`);
  const characters = original.split('').map(char => /[\r\n]/.test(char) ? char : ' ');
  for (const block of blocks) for (let index = block.loc.start.offset; index < block.loc.end.offset; index++) characters[index] = original[index];
  // 每个 Vue SFC 都是独立模块，不能让无 import 的 setup 脚本互相污染作用域。
  let text = characters.join('') + '\nexport {};\n';
  const expressions = [];
  function add(exp, context, statements = false) {
    if (!exp?.content?.trim()) return;
    const parameters = [...new Set(context.parameters ?? [])].join(',');
    const prefix = statements ? `\n;((${parameters})=>{` : `\n;((${parameters})=>(`;
    text += prefix;
    const start = text.length;
    text += exp.content;
    expressions.push({ start, end: text.length, offset: exp.loc.start.offset, ...context, statements });
    text += statements ? '});\n' : '));\n';
  }
  function visit(node, inherited = { parameters: [] }) {
    if (node.type === 5) add(node.content, inherited);
    if (node.type === 1) {
      const parameters = [...inherited.parameters];
      const forDirective = node.props.find(prop => prop.type === 7 && prop.name === 'for');
      if (forDirective?.forParseResult) {
        const loop = forDirective.forParseResult;
        add(loop.source, inherited);
        for (const parameter of [loop.value, loop.key, loop.index]) if (parameter) parameters.push(parameter.content);
      }
      const slot = node.props.find(prop => prop.type === 7 && prop.name === 'slot');
      if (slot?.exp) parameters.push(slot.exp.content);
      const model = node.props.find(prop => prop.type === 7 && prop.name === 'model')?.exp?.content ?? inherited.model;
      const context = { parameters, model };
      for (const prop of node.props) {
        if (prop.type === 7 && !['for', 'slot'].includes(prop.name)) {
          const own = { ...context, component: node.tag, prop: prop.name === 'bind' && prop.arg?.isStatic ? prop.arg.content : undefined };
          add(prop.exp, own, prop.name === 'on');
          if (prop.arg && !prop.arg.isStatic) add(prop.arg, context);
        } else if (prop.type === 6 && prop.value) {
          add({ content: JSON.stringify(prop.value.content), loc: prop.value.loc }, { ...context, component: node.tag, prop: prop.name });
        }
      }
      for (const child of node.children) visit(child, context);
    } else for (const child of node.children ?? []) visit(child, inherited);
  }
  if (descriptor.template?.ast) visit(descriptor.template.ast);
  return { text, expressions, jsx: blocks.some(block => ['jsx', 'tsx'].includes(block.lang)) };
}

export function loadSources(root, files, config) {
  parserTools();
  root = resolve(root);
  const documents = new Map();
  const virtuals = new Map();
  const options = { allowJs: true, checkJs: false, noLib: true, types: [], target: ts.ScriptTarget.Latest, module: ts.ModuleKind.ESNext, moduleResolution: ts.ModuleResolutionKind.Bundler, jsx: ts.JsxEmit.Preserve };
  const configFile = resolve(root, config.tsconfig ?? 'tsconfig.json');
  if (config.tsconfig || existsSync(configFile)) {
    const result = ts.readConfigFile(configFile, ts.sys.readFile);
    if (result.error) throw new Error(ts.flattenDiagnosticMessageText(result.error.messageText, '\n'));
    const parsed = ts.parseJsonConfigFileContent(result.config, ts.sys, dirname(configFile));
    const errors = parsed.errors.filter(error => error.code !== 18003);
    if (errors.length) throw new Error(errors.map(error => ts.flattenDiagnosticMessageText(error.messageText, '\n')).join('；'));
    Object.assign(options, { baseUrl: parsed.options.baseUrl, paths: parsed.options.paths, pathsBasePath: parsed.options.pathsBasePath });
  }
  function load(file) {
    file = resolve(file);
    if (documents.has(file)) return documents.get(file);
    insideProject(root, file);
    const original = readFileSync(file, 'utf8');
    const parsed = file.endsWith('.vue') ? vueDocument(relative(root, file), original) : { text: original, expressions: [] };
    const virtual = file.endsWith('.vue') ? `${file}.${parsed.jsx ? 'tsx' : 'ts'}` : file;
    const document = { file, virtual, original, ...parsed };
    documents.set(file, document);
    virtuals.set(virtual, document);
    return document;
  }
  const roots = [...new Set(files.map(file => resolve(root, file)))].map(file => load(file).virtual);
  const host = ts.createCompilerHost(options, true);
  host.readFile = file => {
    if (virtuals.has(file)) return virtuals.get(file).text;
    if (!existsSync(file)) return undefined;
    return load(file).text;
  };
  host.fileExists = file => virtuals.has(file) || existsSync(file);
  function resolveImport(specifier, containingFile) {
    const result = ts.resolveModuleName(specifier, containingFile, options, ts.sys).resolvedModule;
    if (!result || result.resolvedFileName.includes('/node_modules/')) return undefined;
    insideProject(root, result.resolvedFileName);
    return result;
  }
  host.resolveModuleNames = (names, containingFile) => names.map(name => resolveImport(name, containingFile));
  const program = ts.createProgram(roots, options, host);
  const syntaxErrors = program.getSyntacticDiagnostics();
  if (syntaxErrors.length) throw new Error(syntaxErrors.slice(0, 5).map(error => `${relative(root, error.file.fileName)}：${ts.flattenDiagnosticMessageText(error.messageText, '\n')}`).join('；'));
  const checker = program.getTypeChecker();
  function symbol(node) {
    let value = checker.getSymbolAtLocation(node);
    if (value?.flags & ts.SymbolFlags.Alias) value = checker.getAliasedSymbol(value);
    return value;
  }
  function exported(file, name) {
    const source = program.getSourceFile(resolve(root, file));
    const module = source && checker.getSymbolAtLocation(source);
    let value = module && checker.getExportsOfModule(module).find(item => item.name === name);
    if (value?.flags & ts.SymbolFlags.Alias) value = checker.getAliasedSymbol(value);
    if (!value?.declarations?.length) throw new Error(`找不到常量导出：${file}#${name}`);
    return value;
  }
  function location(node) {
    const source = node.getSourceFile();
    const document = virtuals.get(source.fileName);
    let offset = node.getStart(source);
    const expression = document?.expressions.find(item => offset >= item.start && offset < item.end);
    if (expression) offset = expression.offset + offset - expression.start;
    const originalSource = document ? (document.locationSource ??= ts.createSourceFile(source.fileName, document.original, ts.ScriptTarget.Latest)) : source;
    const position = originalSource.getLineAndCharacterOfPosition(Math.min(offset, originalSource.text.length));
    return { filePath: relative(root, document?.file ?? source.fileName).replaceAll('\\', '/'), line: position.line + 1, column: position.character + 1 };
  }
  return { program, checker, documents, virtuals, symbol, exported, resolveImport, location };
}

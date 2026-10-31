import { existsSync, readFileSync } from 'node:fs';
import { resolve, relative, dirname } from 'node:path';
import { createRequire } from 'node:module';
import { insideProject } from './config.mjs';
import { vue2Document } from './vue2.mjs';
import { legacyStack, normalizeStack } from '../stack.mjs';

const require = createRequire(import.meta.url);
let ts;
let parse;
export function parserTools() {
  ts ??= require('typescript');
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
  parse ??= require('@vue/compiler-sfc').parse;
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

export function loadSources(root, files, config, stack = legacyStack) {
  normalizeStack(stack);
  parserTools();
  root = resolve(root);
  const documents = new Map();
  const virtuals = new Map();
  const options = { allowJs: true, checkJs: false, noLib: true, types: [], target: ts.ScriptTarget.Latest, module: ts.ModuleKind.ESNext, moduleResolution: ts.ModuleResolutionKind.Bundler, jsx: ts.JsxEmit.Preserve };
  const candidates = stack.language === 'js' ? ['jsconfig.json', 'tsconfig.json'] : ['tsconfig.json', 'jsconfig.json'];
  const configFile = resolve(root, config.tsconfig ?? candidates.find(path => existsSync(resolve(root, path))) ?? candidates[0]);
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
    if (file.endsWith('.vue') && stack.framework === 'react') throw new Error(`${relative(root, file)}：React 扫描范围不能包含 Vue 文件`);
    const parsed = file.endsWith('.vue') ? (stack.framework === 'vue2' ? vue2Document : vueDocument)(relative(root, file), original) : { text: original, expressions: [] };
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
  function importedName(node, moduleName) {
    node = unwrap(node);
    if (!node) return undefined;
    const target = ts.isPropertyAccessExpression(node) ? node.expression : node;
    const declarations = checker.getSymbolAtLocation(target)?.declarations ?? [];
    for (const declaration of declarations) {
      let current = declaration;
      while (current && !ts.isImportDeclaration(current)) current = current.parent;
      if (current?.moduleSpecifier.text !== moduleName) continue;
      if (ts.isIdentifier(node) && ts.isImportSpecifier(declaration)) return nameOf(declaration.propertyName ?? declaration.name);
      if (ts.isPropertyAccessExpression(node) && (ts.isNamespaceImport(declaration) || ts.isImportClause(declaration))) return node.name.text;
    }
    return undefined;
  }

  const componentCache = new Map();
  function componentInfo(source) {
    if (componentCache.has(source)) return componentCache.get(source);
    const document = virtuals.get(source.fileName);
    const members = new Map();
    let options;
    if (document?.componentParameters) {
      options = unwrap(source.statements.find(ts.isExportAssignment)?.expression);
      if (options && ts.isCallExpression(options)) options = unwrap(options.arguments[0]);
      if (options && ts.isObjectLiteralExpression(options)) {
        const bodyOf = prop => ts.isMethodDeclaration(prop) ? prop.body : unwrap(prop.initializer)?.body;
        const returned = body => body && (ts.isBlock(body) ? body.statements.find(ts.isReturnStatement)?.expression : body);
        const data = options.properties.find(prop => nameOf(prop.name) === 'data');
        const values = unwrap(returned(data && bodyOf(data)));
        if (values && ts.isObjectLiteralExpression(values)) for (const prop of values.properties) {
          if (ts.isPropertyAssignment(prop)) members.set(nameOf(prop.name), prop.initializer);
          else if (ts.isShorthandPropertyAssignment(prop)) {
            const value = checker.getShorthandAssignmentValueSymbol(prop);
            const declaration = value?.valueDeclaration ?? value?.declarations?.[0];
            members.set(prop.name.text, declaration?.name ?? prop.name);
          }
        }
        const computed = unwrap(options.properties.find(prop => nameOf(prop.name) === 'computed')?.initializer);
        if (computed && ts.isObjectLiteralExpression(computed)) for (const prop of computed.properties) {
          let body = bodyOf(prop);
          const getter = unwrap(prop.initializer);
          if (!body && getter && ts.isObjectLiteralExpression(getter)) body = bodyOf(getter.properties.find(item => nameOf(item.name) === 'get') ?? {});
          const value = returned(body);
          if (value) members.set(nameOf(prop.name), value);
        }
      }
    }
    const info = { document, members, options };
    componentCache.set(source, info);
    return info;
  }
  function componentValue(node) {
    const source = node.getSourceFile();
    const { document, members, options } = componentInfo(source);
    if (!document?.componentParameters) return undefined;
    if (ts.isIdentifier(node)) {
      const declared = checker.getSymbolAtLocation(node)?.declarations?.[0];
      const range = document.componentParameters;
      if (declared && ts.isParameter(declared) && declared.name.getStart(source) >= range.start && declared.name.end <= range.end) return members.get(node.text);
    }
    if (ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)) {
      if (node.expression.kind !== ts.SyntaxKind.ThisKeyword) return undefined;
      // 普通嵌套函数有自己的 this；箭头函数沿用最近的组件方法。
      let owner = node.parent;
      while (owner && !(ts.isFunctionLike(owner) && !ts.isArrowFunction(owner))) owner = owner.parent;
      if (!owner || (!ts.isMethodDeclaration(owner) && !ts.isFunctionExpression(owner))) return undefined;
      let container = owner.parent;
      while (container && container !== options && (ts.isObjectLiteralExpression(container) || ts.isPropertyAssignment(container))) container = container.parent;
      if (container === options) return members.get(ts.isPropertyAccessExpression(node) ? node.name.text : nameOf(node.argumentExpression));
    }
    return undefined;
  }
  function templateLocal(node) {
    if (!ts.isIdentifier(node)) return false;
    const source = node.getSourceFile();
    const document = virtuals.get(source.fileName);
    if (!document?.componentParameters) return false;
    const declared = checker.getSymbolAtLocation(node)?.declarations?.[0];
    return declared && ts.isParameter(declared) && declared.getStart(source) > document.componentParameters.end;
  }
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
    if (expression) offset = expression.offsets?.[offset - expression.start] ?? expression.offset + offset - expression.start;
    const originalSource = document ? (document.locationSource ??= ts.createSourceFile(source.fileName, document.original, ts.ScriptTarget.Latest)) : source;
    const position = originalSource.getLineAndCharacterOfPosition(Math.min(offset, originalSource.text.length));
    return { filePath: relative(root, document?.file ?? source.fileName).replaceAll('\\', '/'), line: position.line + 1, column: position.character + 1 };
  }
  return { program, checker, documents, virtuals, symbol, exported, resolveImport, location, importedName, componentValue, templateLocal };
}

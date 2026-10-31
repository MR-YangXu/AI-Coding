import { resolve } from 'node:path';
import { validateConstants, sourceFiles, inModule } from './config.mjs';
import { loadSources, unwrap, nameOf, parserTools } from './source.mjs';
import { legacyStack, normalizeStack } from '../stack.mjs';

let ts;

function literal(input) {
  const node = unwrap(input);
  if (!node) return undefined;
  if (ts.isStringLiteralLike(node)) return node.text;
  if (ts.isNumericLiteral(node)) return Number(node.text);
  if (ts.isPrefixUnaryExpression(node) && [ts.SyntaxKind.MinusToken, ts.SyntaxKind.PlusToken].includes(node.operator) && ts.isNumericLiteral(node.operand)) return (node.operator === ts.SyntaxKind.MinusToken ? -1 : 1) * Number(node.operand.text);
  return undefined;
}

function declaration(symbol) {
  return symbol?.declarations?.find(node => ts.isVariableDeclaration(node) || ts.isEnumDeclaration(node));
}

function access(node) {
  node = unwrap(node);
  if (ts.isIdentifier(node)) return node.text;
  if (node.kind === ts.SyntaxKind.ThisKeyword) return 'this';
  if (ts.isPropertyAccessExpression(node)) {
    const parent = access(node.expression);
    return parent && `${parent}.${node.name.text}`;
  }
  if (ts.isElementAccessExpression(node) && typeof literal(node.argumentExpression) === 'string') {
    const parent = access(node.expression);
    return parent && `${parent}.${literal(node.argumentExpression)}`;
  }
  return undefined;
}

export function checkConstants(root, input, { mode = 'observe', execute = true, stack = legacyStack } = {}) {
  if (input === undefined) return { status: 'not_configured', total: 0, diagnostics: [], issues: [] };
  const report = { status: 'incomplete', files: [], total: 0, violations: 0, warnings: 0, diagnostics: [], truncated: false, issues: [] };
  try {
    normalizeStack(stack);
    const config = validateConstants(input);
    if (!execute) return { ...report, status: 'available' };
    ts = parserTools().ts;
    const files = [...new Set([...sourceFiles(root, config), ...(config.common ? [config.common.entry, ...config.common.files] : [])])].sort();
    report.files = files;
    const roots = [...files, ...config.definitions.map(item => item.file), ...(config.common ? [config.common.entry, ...config.common.files] : [])];
    const sources = loadSources(root, roots, config, stack);
    const { checker, symbol, exported, location, program } = sources;
    function members(node) {
      if (ts.isEnumDeclaration(node)) return node.members;
      let value = unwrap(node.initializer);
      if (value && ts.isCallExpression(value) && ts.isPropertyAccessExpression(value.expression)
        && value.expression.expression.getText() === 'Object' && value.expression.name.text === 'freeze'
        && !checker.getSymbolAtLocation(value.expression.expression)?.declarations?.length && value.arguments.length === 1) value = unwrap(value.arguments[0]);
      return value && ts.isObjectLiteralExpression(value) ? value.properties : undefined;
    }
    const definitions = new Map();
    const bySymbol = new Map();
    const dictionaries = new Map();
    const emitted = new Set();
    function emit(ruleId, node, definition, message, severity = 'error', related) {
      const position = location(node);
      const key = JSON.stringify([position, ruleId, definition.id]);
      if (emitted.has(key)) return;
      emitted.add(key);
      report.total++;
      report[severity === 'error' ? 'violations' : 'warnings']++;
      const item = { ...position, ruleId, definition: definition.id, severity, message, ...(related ? { related } : {}) };
      if (report.diagnostics.length < 5) report.diagnostics.push(item);
      else if (severity === 'error') {
        const warning = report.diagnostics.findIndex(entry => entry.severity === 'warning');
        if (warning >= 0) report.diagnostics.splice(warning, 1, item);
      }
    }
    for (const item of config.definitions) {
      const exportedSymbol = exported(item.file, item.export);
      const node = declaration(exportedSymbol);
      if (!node || resolve(node.getSourceFile().fileName) !== resolve(root, item.file)) throw new Error(`${item.id} 必须直接定义在 ${item.file}，不能把转导出文件登记为定义位置`);
      const entries = members(node);
      const values = new Map();
      const definition = { ...item, symbol: exportedSymbol, node, values, scalar: !entries };
      if (!entries) {
        const value = literal(node.initializer);
        if (value === undefined || item.dictionary) throw new Error(`${item.id} 必须是字面量常量、静态对象或显式赋值枚举；字典只适用于枚举`);
        values.set('', value);
      } else {
        if (!entries.length) throw new Error(`${item.id} 不能是空枚举`);
        for (const member of entries) {
          const key = nameOf(member.name);
          const value = literal(member.initializer);
          if (!key || value === undefined) throw new Error(`${item.id} 含无法静态确认的成员；枚举成员必须显式赋予数字或字符串`);
          if (values.has(key) || [...values.values()].includes(value)) emit('duplicate-code', member, definition, `${item.id} 的成员名或码值重复：${key}`);
          values.set(key, value);
        }
      }
      if (item.owner === 'common' && exported(config.common.entry, item.export) !== exportedSymbol) throw new Error(`公共入口未转导出原始定义：${item.export}`);
      definitions.set(item.id, definition);
      bySymbol.set(exportedSymbol, definition);
      if (item.dictionary) {
        const dictionarySymbol = exported(item.file, item.dictionary);
        const dictionaryNode = declaration(dictionarySymbol);
        if (!dictionaryNode || resolve(dictionaryNode.getSourceFile().fileName) !== resolve(root, item.file) || !members(dictionaryNode)) throw new Error(`${item.dictionary} 必须与常量同文件定义为静态对象`);
        if (item.owner === 'common' && exported(config.common.entry, item.dictionary) !== dictionarySymbol) throw new Error(`公共入口未转导出原始字典：${item.dictionary}`);
        definition.dictionaryNode = dictionaryNode;
        definition.dictionarySymbol = dictionarySymbol;
        dictionaries.set(dictionarySymbol, definition);
      }
    }

    function referencedObject(input, registry, seen = new Set()) {
      const node = unwrap(input);
      if (!node) return undefined;
      if (seen.has(node)) return undefined;
      seen.add(node);
      const component = sources.componentValue(node);
      if (component && component !== node) return referencedObject(component, registry, seen);
      const value = symbol(node);
      if (registry.has(value)) return registry.get(value);
      if (!value || seen.has(value)) return undefined;
      seen.add(value);
      const declared = declaration(value);
      if (declared && ts.isVariableDeclaration(declared) && declared.initializer && declared.parent.flags & ts.NodeFlags.Const) return referencedObject(declared.initializer, registry, seen);
      return undefined;
    }
    const constantObject = input => referencedObject(input, bySymbol);

    function evaluate(input, seen = new Set()) {
      const node = unwrap(input);
      if (!node) return { kind: 'dynamic' };
      if (seen.has(node)) return { kind: 'dynamic' };
      seen.add(node);
      const component = sources.componentValue(node);
      if (component && component !== node) return evaluate(component, seen);
      const direct = literal(node);
      if (direct !== undefined) return { kind: 'literal', value: direct };
      if ([ts.SyntaxKind.TrueKeyword, ts.SyntaxKind.FalseKeyword].includes(node.kind)) return { kind: 'literal', value: node.kind === ts.SyntaxKind.TrueKeyword };
      if (node.kind === ts.SyntaxKind.NullKeyword || (ts.isIdentifier(node) && node.text === 'undefined' && !symbol(node)?.declarations?.length)) return { kind: 'empty' };
      const object = constantObject(node);
      if (object?.scalar) return { kind: 'member', definition: object, value: object.values.get('') };
      if (ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)) {
        const definition = constantObject(node.expression);
        const key = ts.isPropertyAccessExpression(node) ? node.name.text : literal(node.argumentExpression);
        if (definition && typeof key === 'string') return { kind: 'member', definition, value: definition.values.get(key), key };
      }
      const value = symbol(node);
      if (value && !seen.has(value)) {
        seen.add(value);
        const declared = value.valueDeclaration ?? value.declarations?.[0];
        if (declared?.initializer && (ts.isPropertyAssignment(declared) || ts.isEnumMember(declared) || (ts.isVariableDeclaration(declared) && declared.parent.flags & ts.NodeFlags.Const))) return evaluate(declared.initializer, seen);
      }
      return { kind: 'dynamic' };
    }

    function checkValue(node, definition) {
      node = unwrap(node);
      if (!node) return;
      if (ts.isConditionalExpression(node)) { checkValue(node.whenTrue, definition); checkValue(node.whenFalse, definition); return; }
      if (ts.isBinaryExpression(node) && [ts.SyntaxKind.QuestionQuestionToken, ts.SyntaxKind.BarBarToken, ts.SyntaxKind.AmpersandAmpersandToken].includes(node.operatorToken.kind)) { checkValue(node.left, definition); checkValue(node.right, definition); return; }
      if (ts.isCallExpression(node)) {
        const name = sources.importedName(node.expression, 'vue');
        if (['ref', 'shallowRef'].includes(name) && node.arguments.length) checkValue(node.arguments[0], definition);
        return;
      }
      const value = evaluate(node);
      if (value.kind === 'literal') emit('business-literal', node, definition, `${definition.id} 的业务值 ${JSON.stringify(value.value)} 必须引用 ${definition.file}#${definition.export}`);
      else if (value.kind === 'member' && (value.definition !== definition || value.value === undefined)) emit('wrong-constant', node, definition, `${definition.id} 必须使用 ${definition.export} 的有效成员，当前引用不匹配`);
    }

    for (const definition of definitions.values()) {
      if (!definition.dictionaryNode) continue;
      const used = new Set();
      for (const member of members(definition.dictionaryNode)) {
        if (!ts.isPropertyAssignment(member)) throw new Error(`${definition.dictionary} 必须直接声明键值映射，不能使用展开或方法`);
        const keyNode = ts.isComputedPropertyName(member.name) ? member.name.expression : member.name;
        const value = evaluate(keyNode);
        if (!ts.isComputedPropertyName(member.name) || value.kind !== 'member' || value.definition !== definition || value.value === undefined) {
          emit('dictionary-key', keyNode, definition, `${definition.dictionary} 的键必须引用 ${definition.export} 的成员`);
          continue;
        }
        // JS 对象键会将数字转为字符串，1 与 '1' 无法同时作为字典键。
        const key = String(value.value);
        if (used.has(key)) emit('dictionary-duplicate', keyNode, definition, `${definition.dictionary} 的键重复或发生数字/字符串键碰撞：${key}`);
        used.add(key);
      }
      const missing = [...definition.values].filter(([, value]) => !used.has(String(value))).map(([key]) => key);
      if (missing.length) emit('dictionary-missing', definition.dictionaryNode, definition, `${definition.dictionary} 缺少成员映射：${missing.join('、')}`);
      if (new Set([...definition.values.values()].map(String)).size !== definition.values.size) emit('dictionary-collision', definition.dictionaryNode, definition, `${definition.dictionary} 无法区分数字与字符串形式相同的码值`);
    }

    function fingerprint(node) {
      const entries = members(node);
      if (!entries || entries.length < 2) return undefined;
      const values = [];
      for (const entry of entries) {
        if (!entry.name || !entry.initializer) return undefined;
        const key = ts.isComputedPropertyName(entry.name) ? evaluate(entry.name.expression).value : nameOf(entry.name);
        const value = literal(entry.initializer);
        if (key === undefined || value === undefined) return undefined;
        values.push([String(key), typeof value, value]);
      }
      return JSON.stringify(values.sort((left, right) => left[0].localeCompare(right[0])));
    }
    const fingerprints = [...definitions.values()].flatMap(definition => [definition.node, definition.dictionaryNode].filter(Boolean).map(node => ({ definition, node, value: fingerprint(node) }))).filter(item => item.value);

    for (const file of files) {
      const document = sources.documents.get(resolve(root, file));
      const source = program.getSourceFile(document.virtual);
      const modules = config.modules.filter(module => inModule(file, module));
      const bindings = modules.flatMap(module => module.bindings.map(binding => ({ ...binding, definition: definitions.get(binding.definition) })));
      const stateSetters = new Map();
      function stateName(call) {
        const hook = sources.importedName(call.expression, 'react');
        if (['useState', 'useReducer'].includes(hook) && ts.isVariableDeclaration(call.parent) && ts.isArrayBindingPattern(call.parent.name)) return nameOf(call.parent.name.elements[0]?.name);
        return stateSetters.get(symbol(call.expression));
      }
      function unique(candidates, label) {
        const values = [...new Set(candidates)];
        if (values.length > 1) throw new Error(`${file} 的 ${label} 绑定到多个业务定义`);
        return values[0];
      }
      function field(node) {
        if (sources.templateLocal(node)) return undefined;
        let path = access(node) ?? nameOf(node);
        if (!path) return undefined;
        if (path.startsWith('this.')) path = path.slice(5);
        if (path.endsWith('.value')) path = path.slice(0, -6);
        const paths = new Set([path]);
        // 对象初始化中的 status 同样可匹配 query.status 等明确的字段路径。
        let owner = node.parent;
        let nested = path;
        while (owner && (ts.isPropertyAssignment(owner) || ts.isShorthandPropertyAssignment(owner)) && ts.isObjectLiteralExpression(owner.parent)) {
          owner = owner.parent.parent;
          if ((ts.isPropertyAssignment(owner) || ts.isVariableDeclaration(owner)) && nameOf(owner.name)) {
            nested = `${nameOf(owner.name)}.${nested}`;
            paths.add(nested);
          } else break;
        }
        if (stack.framework === 'react') {
          for (let parent = node.parent; parent && !ts.isSourceFile(parent); parent = parent.parent) {
            if (ts.isCallExpression(parent)) {
              const state = stateName(parent);
              if (state) { paths.add(`${state}.${nested}`); break; }
            }
          }
        }
        return unique(bindings.filter(binding => binding.fields?.some(name => [...paths].some(candidate => name === candidate || (!name.includes('.') && candidate.endsWith('.' + name))))).map(binding => binding.definition), path);
      }
      function option(node) {
        let current = node.parent;
        while (current && !ts.isSourceFile(current)) {
          if (ts.isVariableDeclaration(current)) {
            const definition = unique(bindings.filter(binding => binding.options?.includes(nameOf(current.name))).map(binding => binding.definition), nameOf(current.name));
            if (definition) return definition;
          }
          current = current.parent;
        }
        return undefined;
      }
      function arrayValues(node, definition, seen = new Set()) {
        node = unwrap(node);
        if (!node) return;
        if (ts.isArrayLiteralExpression(node)) { for (const element of node.elements) checkValue(element, definition); return; }
        const declared = declaration(symbol(node));
        if (declared?.initializer && !seen.has(declared)) { seen.add(declared); arrayValues(declared.initializer, definition, seen); }
      }
      const relevant = [...definitions.values()];
      const setters = new Map();
      if (stack.framework === 'react') {
        function collect(node) {
          if (ts.isVariableDeclaration(node) && ts.isArrayBindingPattern(node.name) && node.initializer && ts.isCallExpression(unwrap(node.initializer))) {
            const call = unwrap(node.initializer);
            if (sources.importedName(call.expression, 'react') === 'useState') {
              const [state, setter] = node.name.elements;
              if (state && ts.isBindingElement(state) && ts.isIdentifier(state.name) && setter && ts.isBindingElement(setter) && ts.isIdentifier(setter.name)) {
                stateSetters.set(symbol(setter.name), state.name.text);
                const definition = field(state.name);
                if (definition) setters.set(symbol(setter.name), definition);
              }
            }
          }
          ts.forEachChild(node, collect);
        }
        collect(source);
      }
      function checkStateValue(input, definition) {
        const node = unwrap(input);
        if (!node) return;
        if (ts.isArrowFunction(node) || ts.isFunctionExpression(node)) {
          if (!ts.isBlock(node.body)) { checkValue(node.body, definition); return; }
          function returns(child) {
            if (ts.isReturnStatement(child) && child.expression) checkValue(child.expression, definition);
            else if (!ts.isFunctionLike(child)) ts.forEachChild(child, returns);
          }
          ts.forEachChild(node.body, returns);
        } else checkValue(node, definition);
      }
      function visit(node) {
        if (stack.framework === 'react') {
          if (ts.isVariableDeclaration(node) && ts.isArrayBindingPattern(node.name) && node.initializer && ts.isCallExpression(unwrap(node.initializer))) {
            const call = unwrap(node.initializer);
            const state = node.name.elements[0];
            if (state && ts.isBindingElement(state) && sources.importedName(call.expression, 'react') === 'useState') {
              const definition = field(state.name);
              if (definition) checkStateValue(call.arguments[0], definition);
            }
          }
          if (ts.isCallExpression(node)) {
            const definition = setters.get(symbol(node.expression));
            if (definition) checkStateValue(node.arguments[0], definition);
          }
          if (ts.isJsxAttribute(node) && node.initializer) {
            const element = node.parent.parent;
            const component = element.tagName.getText(source);
            const prop = node.name.getText(source);
            const definition = unique(bindings.filter(binding => binding.jsx?.some(item => item.component === component && item.prop === prop)).map(binding => binding.definition), `${component}.${prop}`);
            if (definition) checkValue(ts.isJsxExpression(node.initializer) ? node.initializer.expression : node.initializer, definition);
          }
        }
        if (ts.isVariableDeclaration(node) || ts.isEnumDeclaration(node)) {
          const declaredSymbol = symbol(node.name);
          const registered = bySymbol.has(declaredSymbol) || dictionaries.has(declaredSymbol);
          if (!registered) {
            const value = fingerprint(node);
            const alias = ts.isVariableDeclaration(node) && (constantObject(node.initializer) || (node.initializer && dictionaries.has(symbol(unwrap(node.initializer)))));
            for (const definition of relevant) {
              const name = nameOf(node.name);
              const ownedScope = definition.owner === 'common' || modules.some(module => module.id === definition.owner) || config.common?.files.includes(file) || file === config.common?.entry;
              const namedDuplicate = ownedScope && [definition.export, definition.dictionary].includes(name) && !alias;
              if (namedDuplicate) emit('duplicate-definition', node.name, definition, `${name} 已有唯一定义：${definition.file}，此处必须导入或转导出`, 'error', location(definition.node));
              else if (value && fingerprints.some(item => item.definition === definition && item.value === value)) emit('possible-duplicate', node.name, definition, `与 ${definition.file} 的常量或字典结构相同；请核对是否复制了同一业务定义`, 'warning', location(definition.node));
            }
          }
        }
        if ((ts.isVariableDeclaration(node) || ts.isPropertyDeclaration(node) || ts.isPropertyAssignment(node) || ts.isParameter(node)) && node.initializer) {
          const definition = field(node.name) ?? (nameOf(node.name) === 'value' ? option(node) : undefined);
          if (definition) checkValue(node.initializer, definition);
        }
        if (ts.isShorthandPropertyAssignment(node)) {
          const definition = field(node.name) ?? (node.name.text === 'value' ? option(node) : undefined);
          if (definition) {
            const value = checker.getShorthandAssignmentValueSymbol(node);
            const declared = declaration(value);
            checkValue(declared?.initializer ?? node.name, definition);
          }
        }
        if (ts.isBinaryExpression(node)) {
          const kind = node.operatorToken.kind;
          const compare = [ts.SyntaxKind.EqualsEqualsEqualsToken, ts.SyntaxKind.ExclamationEqualsEqualsToken, ts.SyntaxKind.EqualsEqualsToken, ts.SyntaxKind.ExclamationEqualsToken, ts.SyntaxKind.LessThanToken, ts.SyntaxKind.GreaterThanToken, ts.SyntaxKind.LessThanEqualsToken, ts.SyntaxKind.GreaterThanEqualsToken].includes(kind);
          if (compare || kind === ts.SyntaxKind.EqualsToken) { const definition = field(node.left); if (definition) checkValue(node.right, definition); }
          if (compare) { const definition = field(node.right); if (definition) checkValue(node.left, definition); }
        }
        if (ts.isSwitchStatement(node)) {
          const definition = field(node.expression);
          if (definition) for (const clause of node.caseBlock.clauses) if (ts.isCaseClause(clause)) checkValue(clause.expression, definition);
        }
        if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === 'includes' && node.arguments[0]) {
          const definition = field(node.arguments[0]);
          if (definition) arrayValues(node.expression.expression, definition);
        }
        if (ts.isElementAccessExpression(node)) {
          const definition = referencedObject(node.expression, dictionaries);
          if (definition) checkValue(node.argumentExpression, definition);
        }
        if (ts.isImportDeclaration(node) && node.importClause) {
          const imports = node.importClause.namedBindings;
          const checkImport = (identifier, importedSymbol) => {
            const definition = bySymbol.get(importedSymbol) ?? dictionaries.get(importedSymbol) ?? constantObject(identifier);
            if (!definition) return;
            const expected = definition.owner === 'common' ? config.common.entry : definition.file;
            const resolved = sources.resolveImport(node.moduleSpecifier.text, source.fileName)?.resolvedFileName;
            if (resolve(resolved ?? '') !== resolve(root, expected) && file !== definition.file) emit('constant-import', identifier, definition, `${definition.id} 必须从 ${expected} 导入`);
            if (definition.owner !== 'common' && !modules.some(module => module.id === definition.owner)) emit('foreign-business', identifier, definition, `${definition.id} 属于 ${definition.owner}；共享需求须确认语义后提取公共定义`);
          };
          if (imports && ts.isNamedImports(imports)) for (const item of imports.elements) {
            const importedName = nameOf(item.propertyName ?? item.name);
            if (relevant.some(item => [item.export, item.dictionary].includes(importedName)) && !symbol(item.name)?.declarations?.length) throw new Error(`${file} 无法解析常量导入 ${node.moduleSpecifier.text}#${importedName}，请核对路径、导出与 tsconfig 别名`);
            checkImport(item.name, symbol(item.name));
          }
          if (imports && ts.isNamespaceImport(imports)) {
            const module = symbol(imports.name);
            if (!module?.declarations?.length) {
              const prefixes = relevant.flatMap(item => [item.export, item.dictionary].filter(Boolean).map(name => `${imports.name.text}.${name}`));
              function usesConstant(candidate) {
                const path = access(candidate);
                if (path && prefixes.some(prefix => path === prefix || path.startsWith(prefix + '.'))) return true;
                return ts.forEachChild(candidate, usesConstant);
              }
              if (usesConstant(source)) throw new Error(`${file} 无法解析常量命名空间 ${node.moduleSpecifier.text}，请核对路径与 tsconfig 别名`);
            }
            if (module) for (const item of checker.getExportsOfModule(module)) checkImport(imports.name, item.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(item) : item);
          }
        }
        if (ts.isSourceFile(node) && file === config.common?.entry) {
          const module = checker.getSymbolAtLocation(source);
          for (const item of module ? checker.getExportsOfModule(module) : []) {
            const value = item.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(item) : item;
            const definition = bySymbol.get(value) ?? dictionaries.get(value) ?? (value.valueDeclaration?.name && constantObject(value.valueDeclaration.name));
            if (definition && definition.owner !== 'common') emit('business-in-common', source.statements[0] ?? source, definition, `${definition.id} 是业务定义，不能汇总到公共导出入口`);
          }
        }
        ts.forEachChild(node, visit);
      }
      visit(source);
      for (const expression of document.expressions) {
        const matches = bindings.filter(binding => binding.template?.some(item => item.component === expression.component && item.prop === expression.prop && (item.model === undefined || item.model === expression.model))).map(binding => binding.definition);
        const definition = unique(matches, `${expression.component}.${expression.prop}`);
        if (!definition || expression.statements) continue;
        function find(node) {
          if (node.getStart(source) === expression.start && node.end === expression.end) { checkValue(node, definition); return true; }
          return ts.forEachChild(node, find);
        }
        find(source);
      }
    }
    report.truncated = report.total > report.diagnostics.length;
    report.status = report.violations ? (mode === 'enforce' ? 'failed' : 'warning') : report.warnings ? 'warning' : 'passed';
  } catch (error) {
    report.status = 'incomplete';
    report.issues.push(error.message);
  }
  return report;
}

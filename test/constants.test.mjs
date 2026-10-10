import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, copyFileSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { spawnSync } from 'node:child_process';
import ts from 'typescript';
import { checkConstants } from '../src/constants/check.mjs';
import { initProject, syncProject } from '../src/project.mjs';
import { checkProject } from '../src/check.mjs';

const template = resolve('content/templates/constants');

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'ai-code-constants-'));
  for (const [from, to] of [['common.ts', 'src/constants/common.ts'], ['index.ts', 'src/constants/index.ts'], ['business.constants.ts', 'src/views/orders/constants.ts'], ['usage.vue', 'src/views/orders/index.vue']]) {
    mkdirSync(dirname(join(root, to)), { recursive: true });
    copyFileSync(join(template, from), join(root, to));
  }
  writeFileSync(join(root, 'tsconfig.json'), JSON.stringify({ compilerOptions: { baseUrl: '.', paths: { '@/*': ['src/*'] } } }));
  const config = JSON.parse(readFileSync(join(template, 'config.json'))).constants;
  const write = (path, text) => { mkdirSync(dirname(join(root, path)), { recursive: true }); writeFileSync(join(root, path), text); };
  return { root, config, write, code: text => write('src/views/orders/check.ts', text), check: options => checkConstants(root, config, options), close: () => rmSync(root, { recursive: true, force: true }) };
}

test('copyable templates pass real Vue/TypeScript parsing and keep numeric option types', () => {
  const f = fixture();
  try {
    const report = f.check({ mode: 'enforce' });
    assert.equal(report.status, 'passed', JSON.stringify(report));
    f.code(`import { ORDER_STATUS_OPTIONS, type OrderStatus } from './constants';
const status: OrderStatus = ORDER_STATUS_OPTIONS[0].value;
// @ts-expect-error 接口码值为数字，不能改为字符串
const invalid: OrderStatus = '1';`);
    const program = ts.createProgram([join(f.root, 'src/views/orders/check.ts')], { strict: true, noEmit: true, target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.ESNext, moduleResolution: ts.ModuleResolutionKind.Bundler });
    assert.deepEqual(ts.getPreEmitDiagnostics(program).map(item => ts.flattenDiagnosticMessageText(item.messageText, '\n')), []);
  } finally { f.close(); }
});

for (const [name, code] of Object.entries({
  default: 'const status = 1;',
  quoted_property: "const query = { 'status': '1' };",
  boolean_literal: 'const query = {status: true};',
  comparison: 'if (row.status === 1) run();',
  reversed_comparison: 'if (2 === row.status) run();',
  assignment: 'row.status = 3;',
  switch_case: 'switch(row.status) { case 1: break; }',
  includes: 'const codes = [1, 2]; codes.includes(row.status);',
  local_alias: 'const pending = 1; const query = {status: pending};',
  options: "const statusOptions = [{label: '待处理', value: 1}];",
  nested_options: "const statusOptions = computed(() => { const items = [{value: 1}]; return items; });",
  reactive_ref: "import {ref as vueRef} from 'vue'; const status = vueRef(1);",
  fallback: 'const query = {status: response.status ?? 1};',
  shorthand: 'const status = 1; const query = {status};',
})) {
  test(`rejects business literals: ${name}`, () => {
    const f = fixture();
    try { f.code(code); const report = f.check({ mode: 'enforce' }); assert.equal(report.status, 'failed', JSON.stringify(report)); assert.ok(report.diagnostics.some(item => item.ruleId === 'business-literal')); }
    finally { f.close(); }
  });
}

test('checks Vue template comparisons, literal attributes and configured option bindings at original positions', () => {
  const f = fixture();
  try {
    f.write('src/views/orders/index.vue', `<script setup lang="ts">const query = { status: null };</script>
<template>
  <p v-if="query.status === 1" />
  <select v-model="query.status"><option value="2"/><option :value="3"/></select>
</template>`);
    const report = f.check({ mode: 'enforce' });
    assert.equal(report.status, 'failed', JSON.stringify(report));
    assert.equal(report.total, 3);
    assert.deepEqual(report.diagnostics.map(item => item.line), [3, 4, 4]);
    assert.ok(report.diagnostics.every(item => item.filePath.endsWith('index.vue')));
  } finally { f.close(); }
});

test('accepts named/namespace imports, local aliases, runtime values, null, and ordinary numbers', () => {
  const f = fixture();
  try {
    f.code(`import { ORDER_STATUS as STATUS } from '@/views/orders/constants';
import * as constants from './constants';
const pending = STATUS.PENDING;
const statusOptions = [{value: pending, label: '仅此选项'}];
const status = constants.ORDER_STATUS.COMPLETED;
const query = { status: null, page: 1, width: 320 };
query.status = response.status;
if (query.status === pending) run();
[STATUS.PENDING, STATUS.PROCESSING].includes(query.status);`);
    assert.equal(f.check().status, 'passed', JSON.stringify(f.check()));
  } finally { f.close(); }
});

test('does not mistake shadowed imported names for their original constant', () => {
  const f = fixture();
  try {
    f.code(`import {ORDER_STATUS as STATUS} from './constants';
function test() { const STATUS = { PENDING: 1 }; return row.status === STATUS.PENDING; }`);
    assert.ok(f.check().diagnostics.some(item => item.ruleId === 'business-literal'));
  } finally { f.close(); }
});

test('rejects wrong enum members and bypassing the public index', () => {
  const f = fixture();
  try {
    f.code(`import {SWITCH_STATE} from '@/constants/common';
const query = {status: SWITCH_STATE.ON, enabled: SWITCH_STATE.ON};`);
    const report = f.check({ mode: 'enforce' });
    assert.deepEqual(new Set(report.diagnostics.map(item => item.ruleId)), new Set(['constant-import', 'wrong-constant']));
  } finally { f.close(); }
});

test('rejects a second named definition, but accepts a re-export or import alias', () => {
  const f = fixture();
  try {
    f.code('const ORDER_STATUS = { PENDING: 1, PROCESSING: 2, COMPLETED: 3 };');
    const report = f.check({ mode: 'enforce' });
    assert.equal(report.status, 'failed');
    const diagnostic = report.diagnostics.find(item => item.ruleId === 'duplicate-definition');
    assert.equal(diagnostic.related.filePath, 'src/views/orders/constants.ts');
    f.code("export { ORDER_STATUS } from './constants'; import {ORDER_STATUS as statusCodes} from './constants'; const ORDER_STATUS = statusCodes;");
    assert.equal(f.check().status, 'passed', JSON.stringify(f.check()));
  } finally { f.close(); }
});

test('renamed copies produce a suspicion only; separately registered business domains are allowed', () => {
  const f = fixture();
  try {
    f.code('const COPIED_STATUS = { PENDING: 1, PROCESSING: 2, COMPLETED: 3 };');
    let report = f.check({ mode: 'enforce' });
    assert.equal(report.status, 'warning');
    assert.equal(report.violations, 0);
    assert.equal(report.diagnostics[0].ruleId, 'possible-duplicate');
    f.code('export const OTHER_STATUS = { PENDING: 1, PROCESSING: 2, COMPLETED: 3 };');
    f.config.definitions.push({ id: 'order.otherStatus', owner: 'orders', file: 'src/views/orders/check.ts', export: 'OTHER_STATUS' });
    report = f.check({ mode: 'enforce' });
    assert.equal(report.status, 'passed', JSON.stringify(report));
  } finally { f.close(); }
});

test('dictionary keys must use constants and cover every member without extras', () => {
  const f = fixture();
  try {
    f.write('src/views/orders/constants.ts', `export const ORDER_STATUS = {PENDING:1, PROCESSING:2, COMPLETED:3} as const;
export const ORDER_STATUS_DICT = {[ORDER_STATUS.PENDING]:'待处理', 2:'处理中', 99:'多余'};`);
    const report = f.check({ mode: 'enforce' });
    assert.equal(report.status, 'failed');
    assert.ok(report.diagnostics.some(item => item.ruleId === 'dictionary-key'));
    assert.ok(report.diagnostics.some(item => item.ruleId === 'dictionary-missing' && item.message.includes('COMPLETED')));
  } finally { f.close(); }
});

test('detects duplicate enum codes and number/string dictionary collisions', () => {
  const f = fixture();
  try {
    f.write('src/views/orders/constants.ts', `export enum ORDER_STATUS { PENDING=1, PROCESSING=1, COMPLETED='1' }
export const ORDER_STATUS_DICT = {[ORDER_STATUS.PENDING]:'a',[ORDER_STATUS.PROCESSING]:'b',[ORDER_STATUS.COMPLETED]:'c'};`);
    const report = f.check({ mode: 'enforce' });
    assert.ok(report.diagnostics.some(item => item.ruleId === 'duplicate-code'));
    assert.ok(report.diagnostics.some(item => item.ruleId === 'dictionary-collision'));
  } finally { f.close(); }
});

test('supports explicitly assigned TS enums and detects an undefined member', () => {
  const f = fixture();
  try {
    f.write('src/views/orders/constants.ts', `export enum ORDER_STATUS { PENDING=1, PROCESSING=2, COMPLETED=3 }
export const ORDER_STATUS_DICT = {[ORDER_STATUS.PENDING]:'a',[ORDER_STATUS.PROCESSING]:'b',[ORDER_STATUS.COMPLETED]:'c'};`);
    f.code("import {ORDER_STATUS} from './constants'; const status = ORDER_STATUS.UNKNOWN;");
    const report = f.check({ mode: 'enforce' });
    assert.ok(report.diagnostics.some(item => item.ruleId === 'wrong-constant'));
  } finally { f.close(); }
});

test('unconfigured, status-only, observe, enforce and incomplete states stay distinct', () => {
  const f = fixture();
  try {
    assert.equal(checkConstants(f.root, undefined).status, 'not_configured');
    f.code('const status = 1;');
    assert.equal(f.check({ execute: false }).status, 'available');
    assert.equal(f.check().status, 'warning');
    assert.equal(f.check({ mode: 'enforce' }).status, 'failed');
    f.code('const status = ;');
    assert.equal(f.check().status, 'incomplete');
    assert.equal(f.check({ execute: false }).status, 'available');
  } finally { f.close(); }
});

test('invalid registrations, conflicting bindings and empty scopes cannot appear to pass', () => {
  const f = fixture();
  try {
    for (const mutate of [
      config => config.definitions.push({ ...config.definitions[1] }),
      config => { delete config.definitions[1].export; },
      config => { config.definitions[1].dictionary = null; },
      config => { config.definitions[1].file = '../outside.ts'; },
      config => { config.modules[0].include = ['missing/**/*']; },
      config => { config.modules[0].bindings[1].fields = ['status']; },
      config => { config.modules[0].typo = true; },
    ]) {
      const config = JSON.parse(JSON.stringify(f.config)); mutate(config);
      assert.equal(checkConstants(f.root, config).status, 'incomplete');
    }
  } finally { f.close(); }
});

test('refuses definitions escaping the project through symlinks', () => {
  const f = fixture();
  const outside = mkdtempSync(join(tmpdir(), 'constant-outside-'));
  try {
    copyFileSync(join(template, 'business.constants.ts'), join(outside, 'constants.ts'));
    rmSync(join(f.root, 'src/views/orders/constants.ts'));
    symlinkSync(join(outside, 'constants.ts'), join(f.root, 'src/views/orders/constants.ts'));
    assert.equal(f.check().status, 'incomplete');
  } finally { f.close(); rmSync(outside, { recursive: true, force: true }); }
});

test('summary limits output while preserving totals and keeps source files unchanged', () => {
  const f = fixture();
  try {
    const code = Array.from({ length: 9 }, (_, i) => `const query${i} = {status: 1};`).join('\n');
    f.code(code);
    const report = f.check();
    assert.equal(report.total, 9);
    assert.equal(report.diagnostics.length, 5);
    assert.equal(report.truncated, true);
    assert.equal(readFileSync(join(f.root, 'src/views/orders/check.ts'), 'utf8'), code);
  } finally { f.close(); }
});

test('a copied business definition in a registered common file is a duplicate', () => {
  const f = fixture();
  try {
    const path = join(f.root, 'src/constants/common.ts');
    writeFileSync(path, readFileSync(path, 'utf8') + '\nconst ORDER_STATUS = { PENDING: 1, PROCESSING: 2, COMPLETED: 3 };');
    assert.ok(f.check().diagnostics.some(item => item.ruleId === 'duplicate-definition'));
  } finally { f.close(); }
});

test('business exports cannot be aggregated into the common index', () => {
  const f = fixture();
  try {
    f.write('src/constants/index.ts', "export * from './common'; export {ORDER_STATUS} from '../views/orders/constants';");
    assert.ok(f.check().diagnostics.some(item => item.ruleId === 'business-in-common'));
    f.write('src/constants/index.ts', "export * from './common'; import {ORDER_STATUS} from '../views/orders/constants'; export const ORDER_CODES = ORDER_STATUS;");
    assert.ok(f.check().diagnostics.some(item => item.ruleId === 'business-in-common'));
  } finally { f.close(); }
});

test('unresolved registered imports are incomplete, while a business barrel violates the required entry', () => {
  const f = fixture();
  try {
    f.code("import {ORDER_STATUS as STATUS} from '@/missing'; const status=STATUS.PENDING;");
    assert.equal(f.check().status, 'incomplete');
    f.code("import * as codes from '@/missing'; const status=codes.ORDER_STATUS.PENDING;");
    assert.equal(f.check().status, 'incomplete');
    f.write('src/views/orders/barrel.ts', "export {ORDER_STATUS} from './constants';");
    f.code("import {ORDER_STATUS as STATUS} from './barrel'; const status=STATUS.PENDING;");
    assert.ok(f.check().diagnostics.some(item => item.ruleId === 'constant-import'));
  } finally { f.close(); }
});

test('fixed dictionary codes can be scalar constants, while remote option IDs remain runtime values', () => {
  const f = fixture();
  try {
    const path = join(f.root, 'src/views/orders/constants.ts');
    writeFileSync(path, readFileSync(path, 'utf8') + "\nexport const COUNTRY_DICT_CODE = 'countries';");
    f.config.definitions.push({ id: 'order.countryDictionary', owner: 'orders', file: 'src/views/orders/constants.ts', export: 'COUNTRY_DICT_CODE' });
    f.config.modules[0].bindings.push({ definition: 'order.countryDictionary', fields: ['dictType'] });
    f.code("import {COUNTRY_DICT_CODE} from './constants'; const args={dictType:COUNTRY_DICT_CODE}; const query={status:response.status};");
    assert.equal(f.check().status, 'passed', JSON.stringify(f.check()));
    f.code("const args={dictType:'countries'};");
    assert.equal(f.check({ mode: 'enforce' }).status, 'failed');
  } finally { f.close(); }
});

test('Vue setup scripts without imports remain separate scopes', () => {
  const f = fixture();
  try {
    f.write('src/views/orders/a.vue', '<script setup>const code=1;</script><template><p/></template>');
    f.write('src/views/orders/b.vue', '<script setup>const code=getCode(); const query={status:code};</script><template><p/></template>');
    assert.equal(f.check().status, 'passed', JSON.stringify(f.check()));
  } finally { f.close(); }
});

test('ai:check reports observe warnings, blocks enforce violations and preserves configuration on sync', () => {
  const f = fixture();
  try {
    f.write('package.json', JSON.stringify({ name: 'constant-fixture', version: '1.0.0', dependencies: { vue: '^3.0.0', vite: '^5.0.0', typescript: '^5.0.0' }, scripts: Object.fromEntries(['lint', 'typecheck', 'build'].map(kind => [kind, 'node -e "process.exit(0)"'])) }));
    const { config } = initProject(f.root, { install: false, framework: 'vue3', language: 'ts' });
    config.constants = f.config;
    f.write('.ai-code/config.json', JSON.stringify(config));
    f.code('const status = 1;');
    const observed = checkProject(f.root);
    assert.equal(observed.ok, true);
    assert.equal(observed.checks.constants.status, 'warning');
    config.mode = 'enforce';
    f.write('.ai-code/config.json', JSON.stringify(config));
    const enforced = checkProject(f.root);
    assert.equal(enforced.ok, false);
    assert.equal(enforced.checks.constants.status, 'failed');
    const result = spawnSync(process.execPath, [resolve('bin/ai-code.mjs'), 'check', '--project', f.root, '--json'], { encoding: 'utf8' });
    assert.equal(result.status, 1);
    assert.equal(JSON.parse(result.stdout).checks.constants.violations, 1);
    assert.deepEqual(syncProject(f.root).constants, f.config);
  } finally { f.close(); }
});

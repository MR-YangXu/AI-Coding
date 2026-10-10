import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, copyFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { checkConstants } from '../src/constants/check.mjs';

const stacks = [{ framework: 'vue2', language: 'js' }, ...['vue3', 'react'].flatMap(framework => ['js', 'ts'].map(language => ({ framework, language })))];
function fixture(stack) {
  const root = mkdtempSync(join(tmpdir(), 'ai-code-scan-stack-'));
  const template = resolve(`content/templates/constants/${stack.framework}-${stack.language}`);
  const ext = stack.language;
  const componentExt = stack.framework === 'react' ? `${ext}x` : 'vue';
  const write = (path, text) => { mkdirSync(dirname(join(root, path)), { recursive: true }); writeFileSync(join(root, path), text); };
  for (const [from, to] of [[`common.${ext}`, `src/constants/common.${ext}`], [`index.${ext}`, `src/constants/index.${ext}`], [`business.constants.${ext}`, `src/views/orders/constants.${ext}`], [`usage.${componentExt}`, `src/views/orders/index.${componentExt}`]]) {
    mkdirSync(dirname(join(root, to)), { recursive: true }); copyFileSync(join(template, from), join(root, to));
  }
  write(ext === 'js' ? 'jsconfig.json' : 'tsconfig.json', JSON.stringify({ compilerOptions: { baseUrl: '.', paths: { '@/*': ['src/*'] } } }));
  const config = JSON.parse(readFileSync(join(template, 'config.json'))).constants;
  return { root, config, write, check: () => checkConstants(root, config, { stack, mode: 'enforce' }), code: code => write(`src/views/orders/check.${componentExt}`, code), close: () => rmSync(root, { recursive: true, force: true }) };
}
const summary = report => JSON.stringify(report, null, 2);
for (const stack of stacks) {
  test(`${stack.framework}/${stack.language}: copyable template parses and shared violations retain original locations`, () => {
    const f = fixture(stack);
    try {
      assert.equal(f.check().status, 'passed', summary(f.check()));
      const script = "import { ORDER_STATUS } from './constants';\nconst row = {status: ORDER_STATUS.PENDING};\nif (row.status === 1) run();";
      f.code(stack.framework === 'react' ? script : `<script>\n${script}\n</script><template><p/></template>`);
      const report = f.check();
      assert.equal(report.status, 'failed', summary(report));
      const violation = report.diagnostics.find(item => item.ruleId === 'business-literal');
      assert.equal(violation.line, stack.framework === 'react' ? 3 : 4);
      assert.equal(violation.column, 20);
    } finally { f.close(); }
  });
}

for (const stack of [{ framework: 'vue2', language: 'js' }, { framework: 'react', language: 'js' }]) {
  test(`${stack.framework}: Object.freeze constants, dictionaries and aliases are recognized`, () => {
    const f = fixture(stack);
    try {
      f.write('src/views/orders/constants.js', `export const ORDER_STATUS = Object.freeze({PENDING:1, PROCESSING:2, COMPLETED:3});
export const ORDER_STATUS_DICT = Object.freeze({[ORDER_STATUS.PENDING]:'a',[ORDER_STATUS.PROCESSING]:'b',[ORDER_STATUS.COMPLETED]:'c'});
export const ORDER_STATUS_OPTIONS = Object.values(ORDER_STATUS).map(value => ({value,label:ORDER_STATUS_DICT[value]}));`);
      assert.equal(f.check().status, 'passed', summary(f.check()));
      f.write('src/views/orders/duplicate.js', `const COPY = Object.freeze({PENDING:1, PROCESSING:2, COMPLETED:3});`);
      assert.equal(f.check().status, 'warning', summary(f.check()));
      f.write('src/views/orders/duplicate.js', `const ORDER_STATUS = Object.freeze({PENDING:1, PROCESSING:2, COMPLETED:3});`);
      assert.ok(f.check().diagnostics.some(item => item.ruleId === 'duplicate-definition'));
    } finally { f.close(); }
  });
}

test('Vue 2 binds data aliases, this, computed, filters, sync and scoped template variables', () => {
  const f = fixture({ framework: 'vue2', language: 'js' });
  try {
    f.code(`<script>
import {ORDER_STATUS as STATUS} from './constants';
import {SWITCH_STATE} from '@/constants';
export default {
  data(){ return { CODES: STATUS, OTHER: SWITCH_STATE, query: {status: STATUS.PENDING} }; },
  computed: { codes(){ return this.CODES; } },
  methods: { save(){ this.query.status = STATUS.COMPLETED; } }
};
</script>
<template><section>
<p v-if="query.status === CODES.PENDING">{{ query.status | format }}</p>
<p v-if="query.status === codes.COMPLETED"/>
<panel :status.sync="query.status"/>
<div v-for="status in values"><p v-if="status === 1"/></div>
<panel slot-scope="{ status, CODES }"><p v-if="status === 1"/><p v-if="query.status === CODES.PENDING"/></panel>
</section></template>`);
    assert.equal(f.check().status, 'passed', summary(f.check()));
    const file = 'src/views/orders/check.vue';
    let code = readFileSync(join(f.root, file), 'utf8');
    f.write(file, code.replace('this.query.status = STATUS.COMPLETED', 'this.query.status = 2').replace('query.status === CODES.PENDING', 'query.status === OTHER.ON'));
    const report = f.check();
    assert.equal(report.status, 'failed', summary(report));
    assert.equal(report.total, 2, summary(report));
    assert.deepEqual(new Set(report.diagnostics.map(item => item.ruleId)), new Set(['business-literal', 'wrong-constant']));
    assert.deepEqual(report.diagnostics.map(item => item.line), [7,11]);
    f.config.modules[0].bindings[0].fields = ['query.status'];
    assert.equal(f.check().violations, 2, summary(f.check()));
  } finally { f.close(); }
});

test('Vue 2 imported names must be exposed to the template and filter arguments keep positions', () => {
  const f = fixture({ framework: 'vue2', language: 'js' });
  try {
    f.code(`<script>
import {ORDER_STATUS} from './constants';
export default {data(){return {ORDER_STATUS, query:{status:ORDER_STATUS.PENDING}}}};
</script>
<template><p>{{ (query.status === 1) | fmt(query.status === 2) }}</p></template>`);
    const report = f.check();
    assert.equal(report.violations, 2, summary(report));
    assert.ok(report.diagnostics.every(item => item.line === 5));
    f.code(`<script>export default { data(){return {query:{status:1}}}, methods:{ go(){this.query.status = 2;} } };</script><template><p v-if="query.status === 3"/></template>`);
    assert.equal(f.check().violations, 3, summary(f.check()));
  } finally { f.close(); }
});

for (const language of ['js','ts']) {
  test(`React ${language}: real useState, lazy state, setters, JSX and scopes`, () => {
    const f = fixture({ framework: 'react', language });
    try {
      f.config.modules[0].bindings[0].jsx.push({ component: 'StatusSelect', prop: 'value' });
      f.code(`import React, {useState as useValue} from 'react';
import {ORDER_STATUS as STATUS} from './constants';
function Page() {
  const [status, setStatus] = useValue(() => STATUS.PENDING);
  const [other, setOther] = React.useState(1);
  function nested(setStatus){ setStatus(1); }
  function useState(value){return [value,()=>{}];}
  const [unused, setUnused] = useState(1);
  return <StatusSelect value={status} onChange={() => setStatus(previous => STATUS.COMPLETED)} />;
}`);
      assert.equal(f.check().status, 'passed', summary(f.check()));
      const file = `src/views/orders/check.${language}x`;
      const code = readFileSync(join(f.root, file), 'utf8');
      f.write(file, code.replace('() => STATUS.PENDING', '() => 1').replace('previous => STATUS.COMPLETED', 'previous => { if (previous) return 2; return STATUS.PENDING; }').replace('value={status}', 'value={3}'));
      const report = f.check();
      assert.equal(report.violations, 3, summary(report));
      assert.deepEqual(report.diagnostics.map(item=>item.line), [4,9,9]);
      f.code(`import * as R from 'react'; function Page(){ const [status, update] = R.useState(1); update(2); return <output data-status="3"/>; }`);
      assert.equal(f.check().violations, 3, summary(f.check()));
      f.code(`function useState(x){return [x,()=>{}]}; const [status,setStatus]=useState(1);setStatus(2);`);
      assert.equal(f.check().status, 'passed', summary(f.check()));
    } finally { f.close(); }
  });
}

test('React object state and reducer fields are checked without flagging ordinary numbers', () => {
  const f = fixture({ framework:'react', language:'js' });
  try {
    f.code(`import {useState,useReducer} from 'react';
const [query,setQuery] = useState({status:1,page:1});
setQuery(previous => ({...previous,status:2}));
function reducer(state,action){return {...state,status:3,width:320};}
const [state,dispatch] = useReducer(reducer,{status:1});`);
    assert.equal(f.check().violations, 4, summary(f.check()));
  } finally { f.close(); }
});

test('React parses JSX in .js and resolves jsconfig aliases', () => {
  const f = fixture({framework:'react',language:'js'});
  try {
    f.write('src/views/orders/plain.js', `import {ORDER_STATUS} from '@/views/orders/constants';export const node = <output data-status={ORDER_STATUS.PENDING}/>;`);
    assert.equal(f.check().status, 'passed', summary(f.check()));
    f.write('src/views/orders/plain.js', `export const node = <output data-status={1}/>;`);
    assert.equal(f.check().violations, 1, summary(f.check()));
  } finally { f.close(); }
});

test('unsupported Vue 2 inputs, invalid JSX and invalid binding configuration are incomplete', () => {
  const f = fixture({framework:'vue2',language:'js'});
  try {
    for(const code of ['<script src="./outside.js"></script><template><p/></template>', '<template lang="pug">p hello</template>', '<script setup>const status=1;</script><template><p/></template>', '<template><p v-if="status ==="/></template>']) {
      f.code(code); assert.equal(f.check().status, 'incomplete', summary(f.check()));
    }
  } finally { f.close(); }
  const react = fixture({framework:'react',language:'js'});
  try {
    react.code('export const node = <div>'); assert.equal(react.check().status, 'incomplete');
    react.code('export const node = <div/>;');
    react.config.modules[0].bindings[0].jsx = [{component:'',prop:'value'}];
    assert.equal(react.check().status, 'incomplete');
  } finally { react.close(); }
});

test('Vue 2 decodes HTML entities and reports original offsets, including attribute bindings', () => {
  const f = fixture({framework:'vue2',language:'js'});
  try {
    f.config.modules[0].bindings[0].template.push({component:'StatusSelect',prop:'value'});
    const line = '<template><section><p v-if="query.status &lt; 1 &amp;&amp; ready"/><StatusSelect :value="&quot;1&quot;"/></section></template>';
    f.code(`<script>export default {data(){return {query:{status:null}}}};</script>\n${line}`);
    const report = f.check();
    assert.equal(report.violations, 2, summary(report));
    assert.deepEqual(report.diagnostics.map(item=>[item.line,item.column]), [[2,line.indexOf('1 &amp;')+1],[2,line.indexOf('&quot;')+1]]);
  } finally { f.close(); }
});

test('Vue 2 resolves exposed dictionary aliases and qualified initial state fields', () => {
  const f = fixture({framework:'vue2',language:'js'});
  try {
    f.config.modules[0].bindings[0].fields = ['query.status'];
    f.code(`<script>
import {ORDER_STATUS_DICT as DICT} from './constants';
export default {data(){return {labels:DICT,query:{status:1}}},methods:{go(){return this.labels[2]}}};
</script><template><p>{{ labels[3] }}</p></template>`);
    const report = f.check();
    assert.equal(report.violations,3,summary(report));
  } finally { f.close(); }
});

test('qualified React state paths cover object initialization and functional updates', () => {
  const f = fixture({framework:'react',language:'js'});
  try {
    f.config.modules[0].bindings[0].fields = ['query.status'];
    f.code(`import {useState} from 'react';
const [query,change] = useState(() => ({status:1,page:1}));
change(previous => ({...previous,status:2}));
const unrelated = {status:1};`);
    const report = f.check();
    assert.equal(report.violations,2,summary(report));
  } finally { f.close(); }
});

test('Vue 2 computed getters preserve constant provenance and nested functions do not inherit this', () => {
  const f = fixture({framework:'vue2',language:'js'});
  try {
    f.code(`<script>
import {SWITCH_STATE} from '@/constants';
export default { data(){return {other:SWITCH_STATE,query:{status:null}}},computed:{codes:{get(){return this.other}}}, methods:{go(){ function external(){return this.other}; return external; }} };
</script><template><p v-if="query.status === codes.ON"/></template>`);
    assert.ok(f.check().diagnostics.some(item=>item.ruleId==='wrong-constant'),summary(f.check()));
  } finally { f.close(); }
});

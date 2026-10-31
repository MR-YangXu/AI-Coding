import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, existsSync, mkdirSync, rmSync, readdirSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { PassThrough } from 'node:stream';
import { initProject, syncProject } from '../src/project.mjs';
import { addAdmin } from '../src/admin.mjs';
import ts from 'typescript';

const stacks = [{ framework: 'vue2', language: 'js' }, { framework: 'vue3', language: 'ts' }, { framework: 'react', language: 'ts' }];
function fixture(stack = stacks[1]) {
  const root = mkdtempSync(join(tmpdir(), 'ai-code-admin-'));
  writeFileSync(join(root, 'package.json'), JSON.stringify({ name: 'admin-fixture', scripts: {} }));
  initProject(root, { install: false, framework: stack.framework, scenarios: ['admin'], profile: 'admin' });
  return root;
}
const walk = root => readdirSync(root, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? walk(join(root, entry.name)) : [join(root, entry.name)]);
const snapshot = root => Object.fromEntries(walk(root).map(path => [path.slice(root.length), readFileSync(path, 'utf8')]));
for (const stack of stacks) test(`admin ${stack.framework}/${stack.language}: complete install, repeat, source ownership`, async () => {
  const root = fixture(stack);
  try {
    const before = snapshot(root);
    const preview = await addAdmin(root, { dryRun: true });
    assert.equal(preview.ok, true); assert.deepEqual(snapshot(root), before);
    const report = await addAdmin(root);
    assert.equal(report.ok, true);
    assert.ok(report.items.some(item => item.id === 'Dialog'));
    assert.match(report.profileSnippet, /src\/components\/NewTable/);
    assert.equal(readFileSync(join(root, '.ai-code/profile.md'), 'utf8'), before['/.ai-code/profile.md']);
    assert.equal(readFileSync(join(root, 'package.json'), 'utf8'), before['/package.json']);
    const source = snapshot(join(root, 'src'));
    if (stack.language === 'js') {
      assert.equal(existsSync(join(root, 'src/types')), false);
      for (const [path, text] of Object.entries(source)) {
        assert.doesNotMatch(path, /\.tsx?$/);
        assert.doesNotMatch(text, /lang="ts"|import type /);
      }
    }
    assert.ok((await addAdmin(root)).items.every(item => item.action === 'reuse'));
    syncProject(root, { framework: 'vue2', scenarios: [] });
    assert.deepEqual(snapshot(join(root, 'src')), source);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
test('single capability, custom source directory and CLI JSON do not install unrelated content', async () => {
  const root = fixture();
  try {
    const result = spawnSync(process.execPath, [resolve('bin/ai-code.mjs'), 'add', 'admin', '--only', 'BaseCard', '--source-dir', 'app/shared', '--project', root, '--json'], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stdout || result.stderr);
    const report = JSON.parse(result.stdout);
    assert.deepEqual(report.requested, ['BaseCard']);
    assert.equal(existsSync(join(root, 'app/shared/components/BaseCard/index.vue')), true);
    assert.equal(existsSync(join(root, 'src/hooks')), false);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
test('conflicts never partially write, skip propagates, replacement is scoped, rename rewrites imports', async () => {
  const root = fixture();
  try {
    mkdirSync(join(root, 'src/utils'), { recursive: true });
    writeFileSync(join(root, 'src/utils/adminCore.ts'), '// project owned');
    const before = snapshot(root);
    const blocked = await addAdmin(root, { only: 'BaseCard,usePageList' });
    assert.equal(blocked.ok, false); assert.deepEqual(snapshot(root), before);
    const skipped = await addAdmin(root, { only: 'BaseCard,usePageList', conflict: 'skip' });
    assert.equal(skipped.items.find(item => item.id === 'usePageList').action, 'skip');
    assert.equal(existsSync(join(root, 'src/hooks/usePageList.ts')), false);
    const renamed = await addAdmin(root, { only: 'usePageList', conflict: 'rename' });
    assert.equal(renamed.ok, true);
    assert.match(readFileSync(join(root, 'src/hooks/usePageList.ts'), 'utf8'), /from '\.\.\/utils\/adminCoreAiCode'/);
    assert.equal(readFileSync(join(root, 'src/utils/adminCore.ts'), 'utf8'), '// project owned');
    assert.ok(existsSync(join(root, 'src/utils/adminCoreAiCode.ts')));
    writeFileSync(join(root, 'src/components/BaseCard/notes.md'), 'owned note');
    writeFileSync(join(root, 'src/components/BaseCard/index.vue'), 'modified component');
    await addAdmin(root, { only: 'BaseCard', conflict: 'replace' });
    assert.match(readFileSync(join(root, 'src/components/BaseCard/index.vue'), 'utf8'), /base-card/);
    assert.equal(readFileSync(join(root, 'src/components/BaseCard/notes.md'), 'utf8'), 'owned note');
  } finally { rmSync(root, { recursive: true, force: true }); }
});
test('rename chooses a free path and changes only generated consumers', async () => {
  const root = fixture({ framework: 'react', language: 'ts' });
  try {
    await addAdmin(root, { only: 'Dialog' });
    writeFileSync(join(root, 'src/components/Dialog/index.tsx'), '// custom');
    mkdirSync(join(root, 'src/components/DialogAiCode'));
    const report = await addAdmin(root, { only: 'Drawer', conflict: 'rename' });
    assert.match(report.items.find(item => item.id === 'Dialog').files[0], /DialogAiCode2/);
    assert.match(readFileSync(join(root, 'src/components/Drawer/index.tsx'), 'utf8'), /\.\.\/DialogAiCode2\/BaseDialog/);
    assert.equal(readFileSync(join(root, 'src/components/Dialog/index.tsx'), 'utf8'), '// custom');
  } finally { rmSync(root, { recursive: true, force: true }); }
});
test('invalid paths, symlinks and invalid selections fail before writes', async () => {
  const root = fixture();
  try {
    const before = snapshot(root);
    for (const options of [{ only: 'unknown' }, { sourceDir: '../escape' }, { sourceDir: '.git/src' }, { conflict: 'overwrite' }]) await assert.rejects(addAdmin(root, options));
    assert.deepEqual(snapshot(root), before);
    symlinkSync(tmpdir(), join(root, 'src'));
    await assert.rejects(addAdmin(root), /符号链接/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
test('interactive cancellation during conflict resolution leaves all files unchanged', async () => {
  const root = fixture(); const input = new PassThrough(); const output = new PassThrough();
  try {
    mkdirSync(join(root, 'src/components/BaseCard'), { recursive: true });
    writeFileSync(join(root, 'src/components/BaseCard/index.vue'), 'mine');
    const before = snapshot(root);
    const operation = addAdmin(root, { only: 'BaseCard', interactive: true, streams: { input, output } });
    const rejected = assert.rejects(operation, /已取消/);
    setTimeout(() => input.write('\u0003'), 30);
    await rejected; assert.deepEqual(snapshot(root), before);
  } finally { input.destroy(); output.destroy(); rmSync(root, { recursive: true, force: true }); }
});

const source = readFileSync(new URL('../content/templates/admin/shared/adminCore.ts', import.meta.url), 'utf8');
const emitted = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.ESNext } }).outputText;
const { createListController, createOptionsController, createActionController, getFiltedOptions, clone } = await import(`data:text/javascript;base64,${Buffer.from(emitted).toString('base64')}`);
function deferred() { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
test('list ignores stale successes, failures and finalizers, and reports current failure', async () => {
  const requests = []; const errors = [];
  const list = createListController({ page: 1, page_size: 10, term: '' }, { initialQuery: { page: 1, page_size: 10, term: '' }, fetchList: () => { const request = deferred(); requests.push(request); return request.promise; }, onError: error => errors.push(error) });
  const old = list.getData(); const current = list.onSubmit({ term: 'new' });
  requests[0].reject(new Error('old')); await old;
  assert.equal(list.getSnapshot().loading, true); assert.deepEqual(errors, []);
  requests[1].resolve({ list: ['new'], total: 1 }); await current;
  assert.deepEqual(list.getSnapshot().tableData, ['new']);
  const first = list.getData(); const second = list.getData();
  requests[3].resolve({ list: ['latest'], total: 1 }); await second;
  requests[2].resolve({ list: ['stale'], total: 1 }); await first;
  assert.deepEqual(list.getSnapshot().tableData, ['latest']);
  const failing = list.getData(); requests[4].reject(new Error('current')); await failing;
  assert.equal(errors.length, 1); assert.equal(list.getSnapshot().error.message, 'current');
});
test('reset restores nested values and removes added fields; page bounds are recovered', async () => {
  const initial = { page: 1, page_size: 10, tags: [], date: new Date(0) }; const queries = [];
  const list = createListController(initial, { initialQuery: initial, fetchList: async query => { queries.push(query); return { list: [query.page], total: 11 }; } });
  await list.onSubmit({ tags: ['x'], extra: 'new' }); await list.handlePageChange({ pageNum: 5 });
  assert.equal(list.getSnapshot().query.page, 2); assert.equal(queries.at(-1).page, 2);
  await list.reset(); assert.deepEqual(list.getSnapshot().query, initial); assert.deepEqual(initial.tags, []);
  assert.ok(list.getSnapshot().query.date instanceof Date);
  const request = deferred(); list.setOptions({ initialQuery: initial, fetchList: () => request.promise });
  const late = list.getData(); const before = list.getSnapshot(); list.dispose(); request.resolve({ list: ['late'], total: 1 }); await late;
  assert.equal(list.getSnapshot(), before);
});
test('option loads isolate fields and invalidate previous loads, including errors', async () => {
  const writes = []; const options = createOptionsController((field, value) => writes.push({ field, value }));
  const map = { key: 'name', value: 'id' }; const old = deferred(); const latest = deferred();
  const a = options.loadFieldOptions('country', () => old.promise, map);
  const b = options.loadFieldOptions('country', () => latest.promise, map);
  latest.resolve([{ id: 0, name: 'Zero' }]); await b; old.reject(new Error('stale')); await a;
  assert.deepEqual(writes, [{ field: 'country', value: [{ label: 'Zero', value: 0 }] }]);
  assert.deepEqual(getFiltedOptions([{ id: false, name: 'No' }], map), [{ label: 'No', value: false }]);
  await assert.rejects(options.loadFieldOptions('country', async () => { throw new Error('current'); }, map), /current/);
});
test('actions deduplicate by key, expose errors, refresh once, and silence unmounted side effects', async () => {
  const task = deferred(); const messages = []; let refreshed = 0;
  const actions = createActionController(() => { refreshed++; }, text => messages.push(text));
  const first = actions.exec(() => task.promise, '成功', 'row-1');
  const duplicate = actions.exec(() => { throw new Error('must not execute'); }, '重复', 'row-1');
  assert.equal(first, duplicate); task.resolve(42); assert.equal(await first, 42); assert.equal(refreshed, 1); assert.deepEqual(messages, ['成功']);
  await assert.rejects(actions.exec(async () => { throw new Error('failure'); }), /failure/);
  const late = deferred(); const result = actions.exec(() => late.promise, 'late'); actions.dispose(); late.resolve(1); await result;
  assert.equal(refreshed, 1); assert.deepEqual(messages, ['成功']);
  const callback = () => 1; assert.equal(clone({ callback }).callback, callback);
});


for (const stack of stacks) test(`admin ${stack.framework}: split components and styles survive independent export and rename`, async () => {
  const root = fixture(stack);
  try {
    await addAdmin(root, { only: 'NewSearchForm,NewTable', sourceDir: 'app/shared' });
    const ext = stack.framework === 'react' ? 'tsx' : 'vue';
    for (const name of ['NewSearchForm', 'NewTable']) {
      const folder = join(root, 'app/shared/components', name);
      assert.ok(existsSync(join(folder, 'style.scss')));
      writeFileSync(join(folder, `index.${ext}`), '// 项目自有实现');
      writeFileSync(join(folder, 'notes.md'), '项目笔记');
    }
    const result = await addAdmin(root, { only: 'NewSearchForm,NewTable', sourceDir: 'app/shared', conflict: 'rename' });
    assert.equal(result.ok, true);
    assert.ok(result.dependencies.some(dependency => dependency.name === 'sass' && dependency.status === 'missing'));
    for (const name of ['NewSearchForm', 'NewTable']) {
      const original = join(root, 'app/shared/components', name);
      const renamed = `${original}AiCode`;
      assert.ok(existsSync(join(renamed, 'style.scss')));
      assert.equal(existsSync(join(renamed, 'style.css')), false);
      assert.match(readFileSync(join(renamed, `index.${ext}`), 'utf8'), /(?:import ['"]|src=['"])\.\/style\.scss/);
      assert.equal(readFileSync(join(original, `index.${ext}`), 'utf8'), '// 项目自有实现');
      assert.equal(readFileSync(join(original, 'notes.md'), 'utf8'), '项目笔记');
      for (const file of walk(renamed)) {
        const text = readFileSync(file, 'utf8');
        for (const match of text.matchAll(/(?:from\s*|import\s*|src=)['"](\.[^'"]+)['"]/g)) {
          const base = resolve(file, '..', match[1]);
          assert.ok(['', '.ts', '.tsx', '.js', '.vue'].some(ext => existsSync(base + ext)), `引用可解析：${file}: ${match[1]}`);
        }
      }
    }
    assert.equal(existsSync(join(root, 'app/shared/components/Dialog')), false);
    assert.equal(existsSync(join(root, 'app/shared/hooks')), false);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

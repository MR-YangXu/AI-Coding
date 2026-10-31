// 独立夹具只用于开发验证，不作为 ai-code 的运行依赖发布。
import { mkdtempSync, writeFileSync, readFileSync, symlinkSync, rmSync, existsSync, cpSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { initProject } from '../src/project.mjs';
import { addAdmin } from '../src/admin.mjs';
import { verifyComponents } from './verify-admin-components.mjs';

const variants = ['vue3-ts', 'react-ts', 'vue2-js'];
if (!process.argv[2]) {
  for (const variant of variants) {
    const run = spawnSync(process.execPath, [resolve('scripts/verify-admin.mjs'), variant], { stdio: 'inherit' });
    if (run.status !== 0) process.exit(run.status ?? 1);
  }
  process.exit(0);
}
const variant = process.argv[2];
if (!variants.includes(variant)) throw new Error(`不支持的后台模板：${variant}`);
const [framework, language] = variant.split('-');
const fixture = resolve(`test/fixtures/admin-runtime/${framework === 'vue2' ? 'vue2' : 'vue3-react'}`);
if (!existsSync(join(fixture, 'node_modules'))) throw new Error(`请先在 ${fixture} 执行 npm ci --ignore-scripts`);
const require = createRequire(join(fixture, 'package.json'));
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!doctype html><html><body><div id="app"></div></body></html>', { url: 'https://example.test', pretendToBeVisual: true });
for (const name of ['window', 'document', 'navigator', 'Element', 'HTMLElement', 'HTMLInputElement', 'HTMLSelectElement', 'HTMLTextAreaElement', 'SVGElement', 'Node', 'DocumentFragment', 'ShadowRoot', 'MutationObserver', 'MouseEvent', 'Event', 'CustomEvent', 'localStorage']) globalThis[name] = dom.window[name];
// jsdom 不实现伪元素测量；UI 库测滚动条时只需要元素样式。
const computedStyle = dom.window.getComputedStyle.bind(dom.window);
window.getComputedStyle = element => computedStyle(element);
globalThis.getComputedStyle = window.getComputedStyle;
globalThis.requestAnimationFrame = dom.window.requestAnimationFrame.bind(dom.window);
globalThis.cancelAnimationFrame = dom.window.cancelAnimationFrame.bind(dom.window);
globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
window.ResizeObserver = globalThis.ResizeObserver;
window.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
window.scrollTo = () => {};
const root = mkdtempSync(join(tmpdir(), `ai-code-ui-${variant}-`));
try {
  writeFileSync(join(root, 'package.json'), JSON.stringify({ name: `admin-${variant}`, type: 'module', scripts: {} }));
  initProject(root, { install: false, framework, scenarios: ['admin'] });
  await addAdmin(root);
  cpSync(resolve(`content/templates/admin/${variant}/examples`), join(root, 'src/examples'), { recursive: true });
  symlinkSync(join(fixture, 'node_modules'), join(root, 'node_modules'), 'dir');
  const component = name => `./src/components/${name}/${framework === 'react' ? `index.${language}x` : 'index.vue'}`;
  const entry = [
    `export { default as AdminListExample } from './src/examples/AdminList.${framework === 'react' ? `${language}x` : 'vue'}';`,
    ...['BaseCard', 'NewSearchForm', 'NewTable'].map(name => `export { default as ${name} } from '${component(name)}';`),
    `export * from './src/components/Dialog/index.${language}${framework === 'react' ? 'x' : ''}';`,
    `export * from './src/components/Drawer/index.${language}${framework === 'react' ? 'x' : ''}';`,
    ...['PageList', 'SelectOptions', 'AsyncListAction'].map(name => `export * from './src/${framework === 'vue2' ? 'logic/create' : 'hooks/use'}${name}.${language}';`),
    ...['formRender', 'tableRender', 'data'].map(name => `export * from './src/utils/${name}.${language}';`),
  ].join('\n');
  writeFileSync(join(root, 'entry.ts'), entry);
  if (language === 'ts') {
    writeFileSync(join(root, 'tsconfig.json'), JSON.stringify({ compilerOptions: { target: 'ES2020', module: 'ESNext', moduleResolution: 'Bundler', strict: true, skipLibCheck: true, jsx: 'react-jsx', esModuleInterop: true, lib: ['ES2020', 'DOM'], noEmit: true, allowImportingTsExtensions: true }, vueCompilerOptions: { strictTemplates: true }, include: ['src/**/*', 'entry.ts'] }));
    const checker = framework === 'vue3' ? 'vue-tsc/bin/vue-tsc.js' : 'typescript/bin/tsc';
    const checked = spawnSync(process.execPath, [require.resolve(checker), '-p', join(root, 'tsconfig.json')], { encoding: 'utf8' });
    if (checked.status !== 0) throw new Error(`${variant} 类型检查失败\n${checked.stdout}\n${checked.stderr}`);
  }
  const { build } = await import(pathToFileURL(join(fixture, 'node_modules/vite/dist/node/index.js')));
  const plugins = framework === 'react' ? [] : [(await import(pathToFileURL(join(fixture, 'node_modules', framework === 'vue2' ? '@vitejs/plugin-vue2' : '@vitejs/plugin-vue', 'dist/index.mjs')))).default()];
  const result = await build({ root, configFile: false, logLevel: 'error', plugins, esbuild: { jsx: 'automatic' }, define: { 'process.env.NODE_ENV': '"test"' },
    build: { write: false, minify: false, lib: { entry: join(root, 'entry.ts'), formats: ['es'] }, rollupOptions: { onwarn(warning, warn) { if (warning.code !== 'MODULE_LEVEL_DIRECTIVE') warn(warning); }, external: ['vue', 'react', 'react-dom', 'react-dom/client', 'react/jsx-runtime'] } } });
  const output = (Array.isArray(result) ? result[0] : result).output;
  const css = output.filter(item => item.type === 'asset' && item.fileName.endsWith('.css')).map(item => String(item.source)).join('\n');
  assert.match(css, /ai-code-search-form__control/, '搜索外部样式随构建输出');
  assert.match(css, /ai-code-table__toolbar/, '表格外部样式随构建输出');
  const chunk = output.find(item => item.type === 'chunk' && item.isEntry);
  writeFileSync(join(root, 'bundle.mjs'), chunk.code);
  process.env.NODE_ENV = 'test';
  const kit = await import(pathToFileURL(join(root, 'bundle.mjs')));
  const flush = () => new Promise(resolve => setTimeout(resolve, 40));
  const visible = node => {
    for (let parent = node; parent; parent = parent.parentElement) {
      if (parent.hidden || parent.getAttribute('aria-hidden') === 'true' || parent.style.display === 'none' || parent.style.visibility === 'hidden') return false;
    }
    return true;
  };
  const button = text => [...document.querySelectorAll('button')].find(node => visible(node) && node.textContent.replace(/\s+/g, '') === text);
  const inputValue = (node, value) => { Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(node, value); node.dispatchEvent(new window.Event('input', { bubbles: true })); };
  if (framework === 'react') {
    const React = require('react'); const { createRoot } = require('react-dom/client'); const { act } = React;
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    let submitted; let reset; let service; let confirms = 0; let closes = 0; let pageList;
    const Context = React.createContext('missing');
    const drawer = { open: false, onOpenChange: open => { drawer.open = open; render(); }, title: '抽屉测试', showConfirm: true, showCancel: true, onConfirm: async () => { throw new Error('抽屉失败'); } };
    const props = { formHeader: [{ propName: 'name', labelName: '名称', itemType: 'text' }], formModel: { name: '', page: 1 }, onSubmitForm: value => { submitted = value; }, onResetForm: value => { reset = value; } };
    const host = createRoot(document.querySelector('#app'));
    function Probe() { service = kit.useDialog(); pageList = kit.usePageList({ page: 1, page_size: 10 }, { initialQuery: { page: 1, page_size: 10 }, fetchList: async () => ({ list: [], total: 0 }) }); return null; }
    const render = () => host.render(React.createElement(React.StrictMode, null, React.createElement(Context.Provider, { value: '继承上下文' }, React.createElement(kit.DialogProvider, null,
      React.createElement(kit.NewSearchForm, props), React.createElement(Probe),
      React.createElement(kit.BaseDrawer, drawer),
      React.createElement(kit.NewTable, { rowKey: 'id', tableData: [{ id: 1, value: 0 }], tableColumns: kit.buildColumns([{ prop: 'value', label: '数值' }]) })))));
    await act(async () => { render(); });
    await act(async () => { inputValue(document.querySelector('input'), '草稿'); });
    await act(async () => { props.formModel = { name: '', page: 2 }; render(); });
    assert.equal(document.querySelector('input').value, '草稿');
    await act(async () => { button('搜索').click(); await flush(); }); assert.equal(submitted.name, '草稿');
    await act(async () => { button('重置').click(); }); assert.equal(reset.name, '');
    assert.match(document.body.textContent, /数值.*0/s);
    let instance;
    await act(async () => { instance = service.showDialog({ title: '测试弹窗', content: '内容', onConfirm: async () => { confirms++; throw new Error('保存失败'); }, onClose: () => { closes++; } }); });
    await act(async () => { button('确定').click(); await flush(); });
    assert.equal(confirms, 1); assert.match(document.body.textContent, /保存失败/); assert.equal(closes, 0);
    await act(async () => { instance.update({ onConfirm: async () => { confirms++; } }); });
    await act(async () => { button('确定').click(); await flush(); }); assert.equal(confirms, 2); assert.equal(closes, 1);
    await act(async () => { await pageList.getData(); }); assert.equal(pageList.loading, false);
    let contextPanel;
    await act(async () => { contextPanel = service.Dialog.component(() => React.createElement('p', null, React.useContext(Context)), {}); });
    assert.match(document.body.textContent, /继承上下文/);
    await act(async () => { contextPanel.close(); await flush(); });
    let instantClosed = 0;
    await act(async () => { service.showDialog({ content: '即时关闭', onClose: () => { instantClosed++; } }).close(); });
    assert.equal(instantClosed, 1); assert.doesNotMatch(document.body.textContent, /即时关闭/);
    await act(async () => { drawer.open = true; render(); });
    await act(async () => { button('确定').click(); await flush(); }); assert.match(document.body.textContent, /抽屉失败/); assert.equal(drawer.open, true);
    await act(async () => { button('取消').click(); await flush(); }); assert.equal(drawer.open, false);
    let confirmation;
    await act(async () => { confirmation = service.Dialog.confirm('卸载测试'); });
    await act(async () => { host.unmount(); }); assert.equal(await confirmation, false);
  } else if (framework === 'vue3') {
    const { createApp, h, reactive, nextTick, inject } = await import(pathToFileURL(require.resolve('vue/dist/vue.cjs.js')));
    const props = reactive({ name: '', page: 1 }); let submitted; let reset; let confirms = 0; let closes = 0;
    const drawer = reactive({ open: false });
    const app = createApp({ setup() { return () => h('div', [h(kit.NewSearchForm, { formHeader: [{ propName: 'name', labelName: '名称', itemType: 'text' }], formModel: props, onSubmitForm: value => { submitted = value; }, onResetForm: value => { reset = value; } }),
      h(kit.BaseDrawer, { modelValue: drawer.open, 'onUpdate:modelValue': value => { drawer.open = value; }, title: '抽屉测试', showConfirm: true, showCancel: true, onConfirm: async () => { throw new Error('抽屉失败'); }, onError: () => {} }),
      h(kit.NewTable, { tableData: [{ id: 1, value: 0 }], tableColumns: kit.buildColumns([{ prop: 'value', label: '数值' }]) })]); } });
    app.provide('test-context', '继承上下文');
    app.mount('#app'); await nextTick(); inputValue(document.querySelector('input'), '草稿'); await nextTick(); props.page = 2; await nextTick();
    assert.equal(document.querySelector('input').value, '草稿'); button('搜索').click(); await flush(); assert.equal(submitted.name, '草稿');
    button('重置').click(); await nextTick(); assert.equal(reset.name, '');
    assert.match(document.body.textContent, /数值.*0/s);
    const service = kit.createDialogService(app._context);
    const instance = service.showDialog({ title: '测试弹窗', content: '内容', onConfirm: async () => { confirms++; throw new Error('保存失败'); }, onError: () => {}, onClose: () => { closes++; } });
    await flush(); button('确定').click(); await flush(); assert.equal(confirms, 1); assert.equal(closes, 0); assert.ok(button('确定'));
    instance.update({ onConfirm: async () => { confirms++; } }); await nextTick(); button('确定').click(); await flush(); assert.equal(confirms, 2); assert.equal(closes, 1);
    const contextPanel = service.Dialog.component({ setup() { const value = inject('test-context'); return () => h('p', value); } });
    await flush(); assert.match(document.body.textContent, /继承上下文/); contextPanel.close(); await flush();
    let instantClosed = 0; const beforeChildren = document.body.children.length;
    service.showDialog({ content: '即时关闭', onClose: () => { instantClosed++; } }).close(); await flush();
    assert.equal(instantClosed, 1); assert.equal(document.body.children.length, beforeChildren);
    drawer.open = true; await flush(); button('确定').click(); await flush(); assert.match(document.body.textContent, /抽屉失败/); assert.equal(drawer.open, true);
    button('取消').click(); await flush(); assert.equal(drawer.open, false);
    const pending = service.Dialog.confirm('卸载测试'); await nextTick(); service.dispose(); assert.equal(await pending, false); app.unmount();
  } else {
    const Vue = require('vue'); Vue.config.productionTip = false; Vue.config.devtools = false;
    let submitted; let reset; let confirms = 0; let closes = 0;
    const app = new Vue({ provide: { 'test-context': '继承上下文' }, data: () => ({ query: { name: '', page: 1 }, drawerOpen: false }), render(h) { return h('div', [h(kit.NewSearchForm, { props: { formHeader: [{ propName: 'name', labelName: '名称', itemType: 'text' }], formModel: this.query }, on: { submitForm: value => { submitted = value; }, resetForm: value => { reset = value; } } }),
      h(kit.BaseDrawer, { props: { value: this.drawerOpen, title: '抽屉测试', showConfirm: true, showCancel: true, onConfirm: async () => { throw new Error('抽屉失败'); } }, on: { input: value => { this.drawerOpen = value; } } }),
      h(kit.NewTable, { props: { tableData: [{ id: 1, value: 0 }], tableColumns: kit.buildColumns([{ prop: 'value', label: '数值' }]) } })]); } });
    app.$mount('#app'); inputValue(document.querySelector('input'), '草稿'); await Vue.nextTick(); app.query.page = 2; await Vue.nextTick(); assert.equal(document.querySelector('input').value, '草稿');
    button('搜索').click(); await flush(); assert.equal(submitted.name, '草稿'); button('重置').click(); await Vue.nextTick(); assert.equal(reset.name, '');
    assert.match(document.body.textContent, /数值.*0/s);
    const service = kit.createDialogService(app);
    const instance = service.showDialog({ title: '测试弹窗', content: '内容', onConfirm: async () => { confirms++; throw new Error('保存失败'); }, onClose: () => { closes++; } });
    await flush(); button('确定').click(); await flush(); assert.equal(confirms, 1); assert.equal(closes, 0); assert.match(document.body.textContent, /保存失败/);
    instance.update({ onConfirm: async () => { confirms++; } }); await Vue.nextTick(); button('确定').click(); await flush(); assert.equal(confirms, 2); assert.equal(closes, 1);
    const contextPanel = service.Dialog.component({ inject: ['test-context'], render(h) { return h('p', this['test-context']); } });
    await flush(); assert.match(document.body.textContent, /继承上下文/); contextPanel.close(); await flush();
    let instantClosed = 0; const beforeChildren = document.body.children.length;
    service.showDialog({ content: '即时关闭', onClose: () => { instantClosed++; } }).close(); await flush();
    assert.equal(instantClosed, 1); assert.equal(document.body.children.length, beforeChildren);
    app.drawerOpen = true; await flush(); button('确定').click(); await flush(); assert.match(document.body.textContent, /抽屉失败/); assert.equal(app.drawerOpen, true);
    button('取消').click(); await flush(); assert.equal(app.drawerOpen, false);
    const pending = service.Dialog.confirm('卸载测试'); app.$destroy(); assert.equal(await pending, false);
  }
  await verifyComponents({ framework, kit, require });
  console.log(`${variant}: 编译与接入示例${language === 'ts' ? '、严格类型检查' : ''}、搜索草稿/提交/重置、表格渲染、弹窗/抽屉失败与关闭、上下文与资源释放通过`);
} finally { dom.window.close(); rmSync(root, { recursive: true, force: true }); }

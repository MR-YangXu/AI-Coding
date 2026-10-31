import assert from 'node:assert/strict';

// 用实际 UI 库验证组件的公开输入/输出；不读取组件私有状态。
export async function verifyComponents({ framework, kit, require }) {
  const react = framework === 'react';
  const vue3 = framework === 'vue3';
  const runtime = require(react ? 'react' : 'vue');
  const h = react ? runtime.createElement : vue3 ? runtime.h : (...args) => app.$createElement(...args);
  const initial = {
    name: '',
    page: 1,
    status: false,
    count: 0,
    date: '2026-10-30',
    range: ['2026-10-01', '2026-10-30'],
    code: '初始',
    gone: undefined,
  };
  const fields = [
    { propName: 'name', labelName: '名称', placeholder: '名称关键字', itemType: 'text', isRequired: true },
    {
      propName: 'status',
      labelName: '状态',
      optionsArr: [
        { label: '禁用', value: false },
        { label: '零', value: 0 },
        { label: '字符串零', value: '0' },
      ],
    },
    { propName: 'date', labelName: '日期', itemType: 'date' },
    { propName: 'range', labelName: '范围', itemType: 'dateRange' },
    { propName: 'code', labelName: '自定义', itemType: 'custom' },
  ];
  let submitted = [];
  let reset;
  let changed;
  const pages = [];
  const sizes = [];
  const selections = [];
  const rowClicks = [];
  const columns = [
    { prop: 'value', label: '数字' },
    { prop: 'boolean', label: '布尔' },
    { prop: 'empty', label: '空串' },
    { prop: 'missing', label: '缺失' },
    { prop: 'html', label: '安全文本' },
    { prop: 'formatted', label: '格式', formatter: () => '格式值' },
    {
      prop: 'rendered',
      label: '渲染',
      render: react ? () => h('b', null, '渲染值') : (create) => create('b', '渲染值'),
    },
    {
      prop: 'slot',
      label: '插槽',
      render: react ? () => h('span', null, '插槽值') : (create) => create('span', '错误优先级'),
    },
    { prop: 'hidden', label: '隐藏列', showColumn: false },
  ];
  let state = {
    model: structuredClone(initial),
    columns,
    page: { currentPage: 1, pageSize: 10, total: 25 },
    controlledKeys: undefined,
  };
  if (vue3) state = runtime.reactive(state);
  const container = document.createElement('div');
  document.body.append(container);
  let host;
  let app;
  const callbacks = {
    submitForm: (value) => submitted.push(value),
    resetForm: (value) => {
      reset = value;
    },
    formChange: (value) => {
      changed = value;
    },
  };
  function customVue(scope) {
    const attrs = { 'data-testid': 'custom', 'aria-label': '自定义' };
    return vue3
      ? h('input', {
          ...attrs,
          value: scope.model.code ?? '',
          onInput: (event) => scope.change('code', event.target.value),
        })
      : h('input', {
          attrs,
          domProps: { value: scope.model.code ?? '' },
          on: { input: (event) => scope.change('code', event.target.value) },
        });
  }
  function CustomReact({ value, onChange }) {
    return h('input', { 'data-testid': 'custom', 'aria-label': '自定义', value: value ?? '', onChange });
  }
  const tableCallbacks = {
    handleCurrentChange: (value) => pages.push(value),
    handleSizeChange: (value) => sizes.push(value),
    handleSelectionChange: (value) => selections.push(value),
    rowClick: (value) => rowClicks.push(value),
  };
  function content(current) {
    const formProps = { formHeader: fields, formModel: current.model };
    const tableProps = {
      rowKey: 'id',
      tableData: [{ id: 1, value: 0, boolean: false, empty: '', missing: null, html: '<b>文本</b>' }],
      tableColumns: current.columns,
      pageParams: current.page,
      selection: true,
      showColumnSettings: true,
      showSerialNumber: false,
    };
    if (react)
      return h(
        runtime.StrictMode,
        null,
        h(kit.NewSearchForm, {
          ...formProps,
          onSubmitForm: callbacks.submitForm,
          onResetForm: callbacks.resetForm,
          onFormChange: callbacks.formChange,
          renderField: () => h(CustomReact),
        }),
        h(kit.NewTable, {
          ...tableProps,
          selectedRowKeys: current.controlledKeys,
          onSelectionChange: (keys, rows) => selections.push({ keys, rows }),
          onCurrentChange: tableCallbacks.handleCurrentChange,
          onSizeChange: tableCallbacks.handleSizeChange,
          onRowClick: tableCallbacks.rowClick,
        }),
      );
    if (vue3)
      return h('div', [
        h(
          kit.NewSearchForm,
          {
            ...formProps,
            onSubmitForm: callbacks.submitForm,
            onResetForm: callbacks.resetForm,
            onFormChange: callbacks.formChange,
          },
          { code: customVue, rightSlotBtn: () => h('span', '扩展操作') },
        ),
        h(
          kit.NewTable,
          {
            ...tableProps,
            onHandleCurrentChange: tableCallbacks.handleCurrentChange,
            onHandleSizeChange: tableCallbacks.handleSizeChange,
            onHandleSelectionChange: tableCallbacks.handleSelectionChange,
            onRowClick: tableCallbacks.rowClick,
          },
          {
            slot: () => h('span', '插槽值'),
            'multiple-operation': ({ selectionData }) => h('span', `批量:${selectionData.length}`),
            'pagination-summary': () => h('span', '分页摘要'),
          },
        ),
      ]);
    return h('div', [
      h(kit.NewSearchForm, {
        props: formProps,
        on: callbacks,
        scopedSlots: { code: customVue, rightSlotBtn: () => h('span', '扩展操作') },
      }),
      h(kit.NewTable, {
        props: tableProps,
        on: tableCallbacks,
        scopedSlots: {
          slot: () => h('span', '插槽值'),
          'multiple-operation': ({ selectionData }) => h('span', `批量:${selectionData.length}`),
        },
      }),
    ]);
  }
  const flush = () => new Promise((resolve) => setTimeout(resolve, 50));
  async function step(action) {
    if (react)
      await runtime.act(async () => {
        await action();
        await flush();
      });
    else {
      await action();
      await runtime.nextTick();
      await flush();
    }
  }
  async function update(values) {
    await step(() => {
      if (react) {
        state = { ...state, ...values };
        host.render(content(state));
      } else if (vue3) Object.assign(state, values);
      else {
        app.state = { ...app.state, ...values };
        state = app.state;
      }
    });
  }
  const input = (node, value) => {
    assert.ok(node, '输入控件存在');
    Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(node, value);
    node.dispatchEvent(new window.Event('input', { bubbles: true }));
  };
  try {
    await step(() => {
      if (react) {
        host = require('react-dom/client').createRoot(container);
        host.render(content(state));
      } else if (vue3) {
        app = runtime.createApp({ setup: () => () => content(state) });
        app.mount(container);
      } else {
        app = new runtime({
          data: () => ({ state }),
          render() {
            return content(this.state);
          },
        });
        app.$mount(container);
      }
    });
    // Vue 2 替换挂载容器，取实际根节点。
    const surface = () => (react || vue3 ? container : app.$el);
    const findButton = (label) =>
      [...surface().querySelectorAll('button')].find((node) => node.textContent.replace(/\s/g, '') === label);
    const formInput = () => surface().querySelector('input[placeholder="名称关键字"]');
    await step(() => findButton('搜索').click());
    assert.equal(submitted.length, 0, '必填校验阻止空提交');
    await step(() => input(formInput(), '草稿'));
    await step(() => input(surface().querySelector('[data-testid="custom"]'), '自定义草稿'));
    assert.equal(state.model.name, '', '输入不修改父模型');
    assert.equal(state.model.code, '初始');
    assert.equal(changed.code, '自定义草稿');
    assert.equal(changed.page, 1, '变更事件包含未注册字段');
    await update({ model: { ...initial, page: 2 } });
    assert.equal(formInput().value, '草稿', '分页更新保留未提交字段');
    assert.equal(surface().querySelector('[data-testid="custom"]').value, '自定义草稿');
    await update({
      model: { ...initial, name: '外部更新', page: 2, status: 0, date: '2026-11-01', added: '临时' },
    });
    assert.equal(formInput().value, '外部更新', '显式外部变化覆盖对应字段');
    const next = { ...state.model };
    delete next.gone;
    delete next.added;
    await update({ model: next });
    await step(() => findButton('搜索').click());
    assert.equal(submitted.length, 1, '搜索只发一次提交');
    assert.equal(submitted[0].page, 2, '提交保留未注册分页字段');
    assert.equal(submitted[0].code, '自定义草稿');
    assert.equal(submitted[0].status, 0);
    assert.equal(submitted[0].count, 0);
    assert.equal(submitted[0].date, '2026-11-01');
    assert.deepEqual(submitted[0].range, structuredClone(initial.range));
    assert.equal(Object.hasOwn(submitted[0], 'gone'), false, '删除值为 undefined 的外部字段');
    assert.equal(Object.hasOwn(submitted[0], 'added'), false);
    submitted[0].range[0] = '事件载荷被调用方修改';
    await step(() => findButton('搜索').click());
    assert.deepEqual(submitted[1].range, structuredClone(initial.range), '提交快照不暴露内部引用');
    await step(() => findButton('重置').click());
    assert.deepEqual(reset, structuredClone(initial), '重置恢复初值和原有键集合');
    assert.equal(formInput().value, '');
    assert.equal(surface().querySelector('[data-testid="custom"]').value, '初始');
    await step(() => input(formInput(), '再次提交'));
    await step(() => findButton('搜索').click());
    assert.deepEqual(submitted.at(-1), { ...structuredClone(initial), name: '再次提交' });

    // 实际操作 UI 下拉选项，确认 false / 0 / '0' 在控件边界往返不串值。
    for (const [label, value] of [
      ['禁用', false],
      ['零', 0],
      ['字符串零', '0'],
    ]) {
      await step(() => {
        const select = surface().querySelector(
          react ? '.ant-select-selector' : vue3 ? '.el-select__wrapper' : '.el-select input',
        );
        if (react) select.dispatchEvent(new window.MouseEvent('mousedown', { bubbles: true }));
        else select.click();
      });
      const option = [
        ...document.querySelectorAll(react ? '.ant-select-item-option' : '.el-select-dropdown__item'),
      ].find((node) => node.textContent.trim() === label);
      assert.ok(option, `可选择 ${label}`);
      await step(() => option.click());
      await step(() => findButton('搜索').click());
      assert.equal(submitted.at(-1).status, value, `保留 ${label} 的原始业务类型`);
    }

    const table = surface().querySelector('.ai-code-table');
    assert.match(table.textContent, /0/);
    assert.match(table.textContent, /false/);
    assert.match(table.textContent, /--/);
    assert.match(table.textContent, /格式值/);
    assert.match(table.textContent, /渲染值/);
    assert.match(table.textContent, /插槽值/);
    assert.doesNotMatch(table.textContent, /错误优先级/);
    assert.match(table.textContent, /<b>文本<\/b>/);
    assert.ok(![...table.querySelectorAll('b')].some((node) => node.textContent === '文本'));
    assert.ok(![...table.querySelectorAll('th')].some((node) => node.textContent.includes('隐藏列')));
    const row = table.querySelector(react ? '.ant-table-tbody tr[data-row-key]' : '.el-table__body tbody tr');
    await step(() => row.click());
    assert.equal(rowClicks.at(-1).id, 1);
    await step(() => row.querySelector('input[type="checkbox"]').click());
    assert.equal(react ? selections.at(-1).rows[0].id : selections.at(-1)[0].id, 1);
    assert.match(table.textContent, /已选\s*1/);
    await step(() => table.querySelector(react ? '.ant-pagination-next button' : '.btn-next').click());
    assert.deepEqual(pages, [{ pageNum: 2 }]);
    assert.equal(sizes.length, 0);
    if (react) {
      await update({ controlledKeys: [] });
      assert.equal(row.querySelector('input[type="checkbox"]').checked, false);
      await step(() => row.querySelector('input[type="checkbox"]').click());
      assert.equal(row.querySelector('input[type="checkbox"]').checked, false, '受控选择等待父级确认');
      await update({ controlledKeys: [1] });
      assert.equal(row.querySelector('input[type="checkbox"]').checked, true);
    }
    if (vue3) {
      await step(() => findButton('显示列').click());
      const checkbox = [...document.querySelectorAll('.el-checkbox')].find(
        (node) => node.textContent.trim() === '数字',
      );
      assert.ok(checkbox);
      await step(() => checkbox.querySelector('input').click());
      const hasNumber = () =>
        [...table.querySelectorAll('th')].some((node) => node.textContent.trim() === '数字');
      assert.equal(hasNumber(), false);
      await update({ columns: columns.map((column) => ({ ...column })) });
      assert.equal(hasNumber(), false, '同内容的新数组保留用户选择');
      await update({
        columns: columns.map((column) => ({
          ...column,
          ...(column.prop === 'value' ? { showColumn: false } : {}),
        })),
      });
      await update({
        columns: columns.map((column) => ({
          ...column,
          ...(column.prop === 'value' ? { showColumn: true } : {}),
        })),
      });
      assert.equal(hasNumber(), true, '显式显隐变化重新应用');
    }
    console.log(
      `${framework}: 字段拆分、必填/自定义字段、草稿同步/删除/重置、完整提交快照、单元格优先级、选择与分页${
        vue3 ? '、列显隐保留' : ''
      }通过`,
    );
  } finally {
    await step(() => {
      if (react) host?.unmount();
      else if (vue3) app?.unmount();
      else app?.$destroy();
    });
    if (!react && !vue3) app?.$el.remove();
    container.remove();
  }
}

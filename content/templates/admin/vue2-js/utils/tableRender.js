/** feedback 可接入项目自己的复制成功/失败提示。 */
export function createRender(column, feedback = {}) {
  if (column.render) return column.render;
  return (h, { row }) => {
    const path = column.type === 'nested' ? column.path || column.prop : column.prop;
    const value = path.split('.').reduce((value, key) => (value == null ? undefined : value[key]), row);
    const mapped = column.type === 'enum' ? (column.enumList || []).find((option) => option.value === value) : null;
    const text = column.type === 'enum' ? (mapped ? mapped.label : '--') : value == null ? '--' : String(value);
    if (column.type !== 'clip') return h('span', text);
    return h(
      'button',
      {
        attrs: { type: 'button' },
        on: {
          click: async () => {
            try {
              if (!navigator.clipboard) throw new Error('当前环境不支持剪贴板，请使用 HTTPS 或手动复制');
              await navigator.clipboard.writeText(String(value == null ? '' : value));
              if (feedback.onCopied) feedback.onCopied();
            } catch (error) {
              if (feedback.onCopyError) feedback.onCopyError(error);
              else window.alert(error.message || '复制失败');
            }
          },
        },
      },
      text,
    );
  };
}
export function buildColumns(columns, feedback) {
  return columns.map((column) => ({
    ...column,
    showColumn: column.showColumn !== false,
    render: createRender(column, feedback),
  }));
}

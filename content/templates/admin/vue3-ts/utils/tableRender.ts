import { h } from 'vue';
import type { TableColumn } from '../types/admin';
export interface CopyFeedback {
  onCopied?: () => void;
  onCopyError?: (error: unknown) => void;
}
function cell<Row>(row: Row, column: TableColumn<Row>, feedback: CopyFeedback) {
  const read = (path: string) =>
    path
      .split('.')
      .reduce<unknown>(
        (value, key) =>
          value !== null && typeof value === 'object' ? (value as Record<string, unknown>)[key] : undefined,
        row,
      );
  const value = read(column.type === 'nested' ? column.path ?? column.prop : column.prop);
  const text = String(
    column.type === 'enum' ? column.enumList?.find((option) => option.value === value)?.label ?? '--' : value ?? '--',
  );
  if (column.type !== 'clip') return h('span', text);
  const copy = async () => {
    try {
      if (!navigator.clipboard) throw new Error('当前环境不支持剪贴板，请使用 HTTPS 或手动复制');
      await navigator.clipboard.writeText(String(value ?? ''));
      feedback.onCopied?.();
    } catch (error) {
      if (feedback.onCopyError) feedback.onCopyError(error);
      else window.alert(error instanceof Error ? error.message : '复制失败');
    }
  };
  return h(
    'button',
    {
      type: 'button',
      class: 'ai-code-copy',
      onClick: () => {
        void copy();
      },
    },
    text,
  );
}
export function createRender<Row>(
  column: TableColumn<Row>,
  feedback: CopyFeedback = {},
): NonNullable<TableColumn<Row>['render']> {
  if (column.render) return column.render;
  return (_h, { row }) => cell(row, column, feedback);
}
export function buildColumns<Row = Record<string, unknown>>(
  columns: TableColumn<Row>[],
  feedback: CopyFeedback = {},
): TableColumn<Row>[] {
  return columns.map((column) => ({
    ...column,
    showColumn: column.showColumn ?? true,
    render: createRender(column, feedback),
  }));
}

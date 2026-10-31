import type { TableProps } from 'antd';
import type { TableColumn } from '../../types/admin';

/** 业务列到 Ant Design 列的单一适配入口；render 优先于文本 formatter。 */
export function toTableColumns<Row extends object>(columns: TableColumn<Row>[]): TableProps<Row>['columns'] {
  return columns
    .filter((column) => column.showColumn !== false)
    .map((column) => ({
      key: column.prop,
      dataIndex: column.prop,
      title: column.label,
      width: column.width,
      align: column.align,
      fixed: column.fixed === true ? 'left' : column.fixed || undefined,
      sorter: column.sortable,
      ellipsis: column.tooltip,
      render:
        column.render ??
        ((value: unknown, row: Row) =>
          column.formatter ? column.formatter(row, column) : String(value ?? '--')),
    }));
}

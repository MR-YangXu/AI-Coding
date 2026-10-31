import { defineComponent, h } from 'vue';
import type { TableColumn } from '../../types/admin';
export default defineComponent(
  <Row extends object>(props: { row: Row; column: TableColumn<Row>; index: number }) =>
    () => {
      const { row, column, index } = props;
      if (column.render) return column.render(h, { row, column, index });
      const value = column.formatter
        ? column.formatter(row, column)
        : (row as Record<string, unknown>)[column.prop];
      return h('span', value == null ? '--' : String(value));
    },
  { props: ['row', 'column', 'index'] },
);

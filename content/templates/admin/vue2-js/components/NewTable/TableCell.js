export default {
  name: 'TableCell',
  functional: true,
  props: { row: { type: Object, required: true }, column: { type: Object, required: true }, index: Number },
  render(h, { props: { row, column, index } }) {
    if (column.render) return column.render(h, { row, column, index });
    const value = column.formatter ? column.formatter(row, column) : row[column.prop];
    return h('span', value === null || value === undefined ? '--' : String(value));
  },
};

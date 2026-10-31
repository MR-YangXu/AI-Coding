import { computed, ref, watch } from 'vue';
import type { TableColumn } from '../../types/admin';

export function useColumnVisibility<Row extends object>(getColumns: () => TableColumn<Row>[]) {
  const selectedColumns = ref<string[]>([]);
  let previous = new Map<string, boolean>();
  watch(
    () => getColumns().map((column) => ({ prop: column.prop, visible: column.showColumn !== false })),
    (columns) => {
      const selected = new Set(selectedColumns.value);
      // 新列或明确改变的 showColumn 采用外部设置；仅重建数组/修改标题不清空用户选择。
      selectedColumns.value = columns
        .filter(({ prop, visible }) =>
          !previous.has(prop) || previous.get(prop) !== visible ? visible : selected.has(prop),
        )
        .map((column) => column.prop);
      previous = new Map(columns.map((column) => [column.prop, column.visible]));
    },
    { immediate: true },
  );
  return {
    selectedColumns,
    visibleColumns: computed(() =>
      getColumns().filter((column) => selectedColumns.value.includes(column.prop)),
    ),
  };
}

<template>
  <div class="ai-code-table">
    <div v-if="$slots['multiple-operation']" class="ai-code-table__toolbar">
      <div v-if="selection" class="ai-code-table__selection">已选 {{ selectionData.length }} 个条目</div>
      <slot name="multiple-operation" :selection-data="selectionData" />
    </div>
    <el-table
      ref="table"
      v-loading="loading"
      :data="tableData"
      :row-key="rowKey"
      :show-header="showHeader"
      :stripe="stripe"
      border
      :height="tableHeight"
      :max-height="maxHeight"
      :empty-text="noDataShow"
      @row-click="(row) => emit('rowClick', row)"
      @selection-change="handleSelectionChange"
      @sort-change="(value) => emit('handleSortChange', value)"
    >
      <el-table-column
        v-if="selection"
        type="selection"
        width="55"
        :reserve-selection="reserveSelection"
        :selectable="selectFn"
      />
      <el-table-column v-if="showSerialNumber" type="index" label="序号" width="60" />
      <el-table-column
        v-for="item in visibleColumns"
        :key="item.prop"
        :prop="item.prop"
        :label="item.label"
        :width="item.width"
        :min-width="item.minWidth"
        :align="item.align || 'left'"
        :fixed="item.fixed"
        :show-overflow-tooltip="item.tooltip"
        :sortable="item.sortable ? 'custom' : false"
      >
        <template #default="scope">
          <slot v-if="$slots[item.prop]" :name="item.prop" :row="scope.row" :index="scope.$index" />
          <table-cell v-else :row="scope.row" :column="item" :index="scope.$index" />
        </template>
      </el-table-column>
      <template #empty
        ><slot name="empty"
          ><p class="ai-code-table__empty">{{ noDataShow }}</p></slot
        ></template
      >
    </el-table>
    <div v-if="showColumnSettings" class="ai-code-table__settings">
      <column-settings v-model="selectedColumns" :columns="tableColumns" />
    </div>
    <div v-if="pageParams" class="ai-code-table__pagination">
      <slot name="pagination-summary" />
      <el-pagination
        background
        :current-page="pageParams.currentPage"
        :page-size="pageParams.pageSize"
        :page-sizes="pageParams.pageSizes || [10, 20, 50, 100]"
        :total="pageParams.total"
        :layout="paginationLayout"
        @current-change="(pageNum) => emit('handleCurrentChange', { pageNum })"
        @size-change="(pageSize) => emit('handleSizeChange', { pageSize })"
      />
    </div>
  </div>
</template>
<script setup lang="ts" generic="Row extends object = Record<string, unknown>">
import { ref, shallowRef, type PropType } from 'vue';
import { ElTable, ElTableColumn, ElPagination, ElLoading, type TableInstance } from 'element-plus';
import TableCell from './TableCell';
import ColumnSettings from './ColumnSettings.vue';
import { useColumnVisibility } from './useColumnVisibility';
import type { PaginationParams, TableColumn } from '../../types/admin';
const vLoading = ElLoading.directive;
const props = defineProps({
  tableData: { type: Array as PropType<Row[]>, default: () => [] },
  tableColumns: { type: Array as PropType<TableColumn<Row>[]>, default: () => [] },
  pageParams: Object as PropType<PaginationParams>,
  loading: Boolean,
  selection: Boolean,
  reserveSelection: Boolean,
  rowKey: { type: [String, Function] as PropType<string | ((row: Row) => string)>, default: 'id' },
  selectFn: Function as PropType<(row: Row, index: number) => boolean>,
  showHeader: { type: Boolean, default: true },
  showSerialNumber: { type: Boolean, default: true },
  stripe: { type: Boolean, default: true },
  showColumnSettings: Boolean,
  tableHeight: [String, Number],
  maxHeight: [String, Number],
  noDataShow: { type: String, default: '暂无查询结果' },
  paginationLayout: { type: String, default: 'total,prev,pager,next,jumper,sizes' },
});
const emit = defineEmits([
  'handleSizeChange',
  'handleCurrentChange',
  'handleSelectionChange',
  'handleSortChange',
  'rowClick',
]);
const table = ref<TableInstance>();
const { selectedColumns, visibleColumns } = useColumnVisibility(() => props.tableColumns);
const selectionData = shallowRef<Row[]>([]);
function handleSelectionChange(rows: Row[]) {
  selectionData.value = rows;
  emit('handleSelectionChange', rows);
}
defineExpose({
  clearSortFn: () => table.value?.clearSort(),
  clearSelection: () => table.value?.clearSelection(),
});
</script>
<style lang="scss" src="./style.scss"></style>

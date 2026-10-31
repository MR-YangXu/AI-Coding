<template>
  <div class="ai-code-table">
    <div v-if="$scopedSlots['multiple-operation']" class="ai-code-table__toolbar">
      <span v-if="selection">已选 {{ selected.length }} 个条目</span
      ><slot name="multiple-operation" :selection-data="selected" />
    </div>
    <el-table
      ref="table"
      v-loading="loading"
      :data="tableData"
      :row-key="rowKey"
      :empty-text="noDataShow"
      border
      @selection-change="selectionChanged"
      @sort-change="$emit('handleSortChange', $event)"
      @row-click="$emit('rowClick', $event)"
    >
      <el-table-column v-if="selection" type="selection" width="55" />
      <el-table-column
        v-for="column in visibleColumns"
        :key="column.prop"
        :prop="column.prop"
        :label="column.label"
        :width="column.width"
        :min-width="column.minWidth"
        :align="column.align || 'left'"
        :fixed="column.fixed"
        :sortable="column.sortable ? 'custom' : false"
        :show-overflow-tooltip="column.tooltip"
      >
        <template slot-scope="scope">
          <slot v-if="$scopedSlots[column.prop]" :name="column.prop" :row="scope.row" :index="scope.$index" />
          <table-cell v-else :row="scope.row" :column="column" :index="scope.$index" />
        </template>
      </el-table-column>
    </el-table>
    <div v-if="pageParams" class="ai-code-table__pagination">
      <el-pagination
        :current-page="pageParams.currentPage"
        :page-size="pageParams.pageSize"
        :page-sizes="pageParams.pageSizes || [10, 20, 50, 100]"
        :total="pageParams.total"
        layout="total,prev,pager,next,sizes"
        @current-change="$emit('handleCurrentChange', { pageNum: $event })"
        @size-change="$emit('handleSizeChange', { pageSize: $event })"
      />
    </div>
  </div>
</template>
<script>
import { Table, TableColumn, Pagination, Loading } from 'element-ui';
import TableCell from './TableCell';
export default {
  name: 'NewTable',
  components: { ElTable: Table, ElTableColumn: TableColumn, ElPagination: Pagination, TableCell },
  directives: { loading: Loading.directive },
  props: {
    tableData: { type: Array, default: () => [] },
    tableColumns: { type: Array, default: () => [] },
    pageParams: Object,
    loading: Boolean,
    selection: Boolean,
    rowKey: { type: [String, Function], default: 'id' },
    noDataShow: { type: String, default: '暂无查询结果' },
  },
  data() {
    return { selected: [] };
  },
  computed: {
    visibleColumns() {
      return this.tableColumns.filter((column) => column.showColumn !== false);
    },
  },
  methods: {
    selectionChanged(rows) {
      this.selected = rows;
      this.$emit('handleSelectionChange', rows);
    },
    clearSortFn() {
      this.$refs.table.clearSort();
    },
    clearSelection() {
      this.$refs.table.clearSelection();
    },
  },
};
</script>
<style lang="scss" src="./style.scss"></style>

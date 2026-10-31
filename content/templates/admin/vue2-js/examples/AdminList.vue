<template>
  <div>
    <BaseCard title="列表"
      ><NewSearchForm
        :form-header="fields"
        :form-model="list.state.query"
        @submitForm="list.onSubmit"
        @resetForm="list.reset"
    /></BaseCard>
    <p v-if="list.state.error" role="alert">加载失败，请重试</p>
    <NewTable
      :table-data="list.state.tableData"
      :table-columns="columns"
      :loading="list.state.loading"
      :page-params="list.state.pageParams"
      @handleCurrentChange="list.handlePageChange"
      @handleSizeChange="list.handleSizeChange"
    />
  </div>
</template>
<script>
import BaseCard from '../components/BaseCard/index.vue';
import NewSearchForm from '../components/NewSearchForm/index.vue';
import NewTable from '../components/NewTable/index.vue';
import { createPageList } from '../logic/createPageList';
import { buildFormItems } from '../utils/formRender';
import { buildColumns } from '../utils/tableRender';
export default {
  components: { BaseCard, NewSearchForm, NewTable },
  props: { fetchList: { type: Function, required: true } },
  data() {
    const initial = { page: 1, page_size: 10, name: '' };
    return {
      list: createPageList(initial, { initialQuery: initial, fetchList: this.fetchList }),
      fields: buildFormItems([{ propName: 'name', labelName: '名称', itemType: 'text' }]),
      columns: buildColumns([{ prop: 'name', label: '名称' }]),
    };
  },
  mounted() {
    this.list.getData();
  },
  beforeDestroy() {
    this.list.dispose();
  },
};
</script>

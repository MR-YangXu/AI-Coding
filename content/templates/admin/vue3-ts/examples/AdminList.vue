<template>
  <BaseCard title="列表"
    ><NewSearchForm :form-header="formHeader" :form-model="query" @submit-form="list.onSubmit" @reset-form="list.reset"
  /></BaseCard>
  <p v-if="list.error.value" role="alert">加载失败，请重试</p>
  <NewTable
    :table-data="list.tableData.value"
    :table-columns="columns"
    :loading="list.loading.value"
    :page-params="list.pageParams.value"
    @handle-current-change="list.handlePageChange"
    @handle-size-change="list.handleSizeChange"
  />
</template>
<script setup lang="ts">
import { reactive, onMounted } from 'vue';
import BaseCard from '../components/BaseCard/index.vue';
import NewSearchForm from '../components/NewSearchForm/index.vue';
import NewTable from '../components/NewTable/index.vue';
import { usePageList } from '../hooks/usePageList';
import { buildFormItems } from '../utils/formRender';
import { buildColumns } from '../utils/tableRender';
import type { ListOptions } from '../types/admin';
interface Filters { page: number; page_size: number; name: string }
interface Row { id: number; name: string }
const props = defineProps<{ fetchList: ListOptions<Filters, Row>['fetchList'] }>();
const initial: Filters = { page: 1, page_size: 10, name: '' };
const query = reactive({ ...initial });
const formHeader = reactive(buildFormItems([{ propName: 'name', labelName: '名称', itemType: 'text' }]));
const columns = buildColumns<Row>([{ prop: 'name', label: '名称' }]);
const list = usePageList(query, { initialQuery: initial, fetchList: props.fetchList });
onMounted(() => {
  void list.getData();
});
</script>

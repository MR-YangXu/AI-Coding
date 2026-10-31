import { useEffect } from 'react';
import BaseCard from '../components/BaseCard';
import NewSearchForm from '../components/NewSearchForm';
import NewTable from '../components/NewTable';
import { usePageList } from '../hooks/usePageList';
import { buildFormItems } from '../utils/formRender';
import { buildColumns } from '../utils/tableRender';
import type { ListOptions } from '../types/admin';
interface Filters { page: number; page_size: number; name: string }
interface Row { id: number; name: string }
const initial: Filters = { page: 1, page_size: 10, name: '' };
const fields = buildFormItems([{ propName: 'name', labelName: '名称', itemType: 'text' }]);
const columns = buildColumns<Row>([{ prop: 'name', label: '名称' }]);
export default function AdminList({
  fetchList,
}: {
  fetchList: ListOptions<Filters, Row>['fetchList'];
}) {
  const list = usePageList(initial, { initialQuery: initial, fetchList });
  useEffect(() => {
    void list.getData();
  }, [list.getData]);
  return (
    <>
      <BaseCard title="列表">
        <NewSearchForm
          formHeader={fields}
          formModel={list.query}
          onSubmitForm={list.onSubmit}
          onResetForm={list.reset}
        />
      </BaseCard>
      {Boolean(list.error) && <p role="alert">加载失败，请重试</p>}
      <NewTable
        rowKey="id"
        tableData={list.tableData}
        tableColumns={columns}
        loading={list.loading}
        pageParams={list.pageParams}
        onCurrentChange={list.handlePageChange}
        onSizeChange={list.handleSizeChange}
      />
    </>
  );
}

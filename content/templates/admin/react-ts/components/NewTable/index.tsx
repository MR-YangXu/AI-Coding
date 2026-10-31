import { useState } from 'react';
import type { Key, ReactNode } from 'react';
import { Table } from 'antd';
import type { TableProps } from 'antd';
import { toTableColumns } from './columns';
import './style.scss';
import type { PaginationParams, TableColumn } from '../../types/admin';
export interface NewTableProps<Row extends object> {
  tableData: Row[];
  tableColumns: TableColumn<Row>[];
  pageParams?: PaginationParams;
  loading?: boolean;
  rowKey: TableProps<Row>['rowKey'];
  selection?: boolean;
  selectedRowKeys?: Key[];
  onSelectionChange?: (keys: Key[], rows: Row[]) => void;
  onCurrentChange?: (payload: { pageNum: number }) => void;
  onSizeChange?: (payload: { pageSize: number }) => void;
  onSortChange?: (sorter: Parameters<NonNullable<TableProps<Row>['onChange']>>[2]) => void;
  onRowClick?: (row: Row) => void;
  multipleOperation?: ReactNode;
  emptyText?: ReactNode;
}
export default function NewTable<Row extends object>(props: NewTableProps<Row>) {
  const [localKeys, setLocalKeys] = useState<Key[]>([]);
  const columns = toTableColumns(props.tableColumns);
  const keys = props.selectedRowKeys ?? localKeys;
  return (
    <div className="ai-code-table">
      {(props.multipleOperation != null || props.selection) && (
        <div className="ai-code-table__toolbar">
          {props.multipleOperation}
          {props.selection && `已选 ${keys.length} 个条目`}
        </div>
      )}
      <Table<Row>
        rowKey={props.rowKey}
        dataSource={props.tableData}
        columns={columns}
        loading={props.loading}
        locale={{ emptyText: props.emptyText ?? '暂无查询结果' }}
        rowSelection={
          props.selection
            ? {
                selectedRowKeys: keys,
                onChange: (keys, rows) => {
                  if (props.selectedRowKeys === undefined) setLocalKeys(keys);
                  props.onSelectionChange?.(keys, rows);
                },
              }
            : undefined
        }
        onRow={(row) => ({ onClick: () => props.onRowClick?.(row) })}
        pagination={
          props.pageParams
            ? {
                current: props.pageParams.currentPage,
                pageSize: props.pageParams.pageSize,
                total: props.pageParams.total,
                pageSizeOptions: props.pageParams.pageSizes,
                showSizeChanger: true,
              }
            : false
        }
        onChange={(pagination, _filters, sorter, extra) => {
          if (extra.action === 'sort') props.onSortChange?.(sorter);
          if (extra.action === 'paginate') {
            if (pagination.pageSize !== props.pageParams?.pageSize)
              props.onSizeChange?.({ pageSize: pagination.pageSize ?? 10 });
            else props.onCurrentChange?.({ pageNum: pagination.current ?? 1 });
          }
        }}
      />
    </div>
  );
}

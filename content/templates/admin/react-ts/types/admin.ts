import type { SelectOption, Query, ListOptions, PageResult } from '../utils/adminCore';
export type { SelectOption, Query, ListOptions, PageResult };
export type FormValue = string | number | boolean | Date | null | undefined | (string | number | boolean | Date)[];
export type FormModel = Record<string, FormValue>;
export interface FormItemConfig {
  propName: string;
  labelName?: string;
  itemType?: 'text' | 'selectOne' | 'date' | 'dateRange' | 'custom';
  placeholder?: string;
  width?: string;
  labelWidth?: string;
  clearable?: boolean;
  disabled?: boolean;
  multiple?: boolean;
  filterable?: boolean;
  isRequired?: boolean;
  optionsArr?: SelectOption[];
  format?: string;
  valueFormat?: string;
  disabledDate?: (date: Date) => boolean;
}
export interface PaginationParams {
  currentPage: number;
  pageSize: number;
  pageSizes?: number[];
  total: number;
}
export interface TableColumn<Row = Record<string, unknown>> {
  prop: string;
  label: string;
  width?: string | number;
  minWidth?: string | number;
  align?: 'left' | 'center' | 'right';
  fixed?: boolean | 'left' | 'right';
  showColumn?: boolean;
  sortable?: boolean;
  tooltip?: boolean;
  type?: 'default' | 'enum' | 'nested' | 'clip';
  path?: string;
  enumList?: SelectOption[];
  formatter?: (row: Row, column: TableColumn<Row>) => string;
  render?: (value: unknown, row: Row, index: number) => import('react').ReactNode;
}

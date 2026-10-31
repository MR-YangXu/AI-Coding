import { clone } from './adminCore';
import type { FormItemConfig } from '../types/admin';
export function buildFormItems(items: FormItemConfig[]): FormItemConfig[] {
  return items.map((item) => ({ itemType: 'selectOne', clearable: true, width: '200px', ...clone(item) }));
}

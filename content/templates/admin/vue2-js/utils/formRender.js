import { clone } from './adminCore';
export function buildFormItems(items) {
  return items.map((item) => ({ itemType: 'selectOne', clearable: true, width: '200px', ...clone(item) }));
}

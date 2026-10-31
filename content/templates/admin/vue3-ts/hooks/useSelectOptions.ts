import { onScopeDispose } from 'vue';
import { createOptionsController } from '../utils/adminCore';
import type { FormItemConfig } from '../types/admin';
/** formHeader 应由页面按实例创建并使用 reactive 包装。 */
export function useSelectOptions(formHeader: FormItemConfig[]) {
  const controller = createOptionsController((field, options) => {
    const item = formHeader.find((item) => item.propName === field);
    if (!item) throw new Error(`找不到搜索字段：${field}`);
    item.optionsArr = options;
  });
  onScopeDispose(controller.dispose);
  return controller;
}

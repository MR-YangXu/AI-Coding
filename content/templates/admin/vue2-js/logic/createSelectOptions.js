import Vue from 'vue';
import { createOptionsController } from '../utils/adminCore';
/** 在 beforeDestroy 中调用 dispose()。 */
export function createSelectOptions(formHeader) {
  return createOptionsController((field, options) => {
    const item = formHeader.find((item) => item.propName === field);
    if (!item) throw new Error(`找不到搜索字段：${field}`);
    Vue.set(item, 'optionsArr', options);
  });
}

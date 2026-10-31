import Vue from 'vue';
import { createListController } from '../utils/adminCore';
/** 在 data() 中按实例创建，beforeDestroy 中调用 dispose()。 */
export function createPageList(initialQuery, options) {
  const controller = createListController(initialQuery, options);
  const state = Vue.observable({ ...controller.getSnapshot(), pageParams: controller.pageParams() });
  const unsubscribe = controller.subscribe(() => {
    Object.assign(state, controller.getSnapshot(), { pageParams: controller.pageParams() });
  });
  return {
    ...controller,
    state,
    dispose() {
      unsubscribe();
      controller.dispose();
    },
  };
}

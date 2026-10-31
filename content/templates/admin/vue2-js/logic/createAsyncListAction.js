import Vue from 'vue';
import { Message } from 'element-ui';
import { createActionController } from '../utils/adminCore';
/** 在 beforeDestroy 中调用 dispose()；exec 的拒绝由页面处理。 */
export function createAsyncListAction(refresh) {
  const state = Vue.observable({ pendingKeys: [] });
  const controller = createActionController(
    refresh,
    (text) => Message.success(text),
    (keys) => {
      state.pendingKeys = keys;
    },
  );
  return { ...controller, state };
}

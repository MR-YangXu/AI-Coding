import { computed, shallowRef, onScopeDispose } from 'vue';
import { createListController, clone, type Query, type ListOptions } from '../utils/adminCore';
export function usePageList<Q extends Query, Row>(queryForm: Q, options: ListOptions<Q, Row>) {
  const controller = createListController(queryForm, options);
  const state = shallowRef(controller.getSnapshot());
  const unsubscribe = controller.subscribe(() => {
    state.value = controller.getSnapshot();
    for (const key of Object.keys(queryForm)) if (!(key in state.value.query)) Reflect.deleteProperty(queryForm, key);
    Object.assign(queryForm, clone(state.value.query));
  });
  onScopeDispose(() => {
    unsubscribe();
    controller.dispose();
  });
  return {
    ...controller,
    state,
    loading: computed(() => state.value.loading),
    error: computed(() => state.value.error),
    tableData: computed(() => state.value.tableData),
    total: computed(() => state.value.total),
    pageParams: computed(() => {
      state.value;
      return controller.pageParams();
    }),
  };
}

import { ref, watch } from 'vue';
import { clone } from '../../utils/adminCore';
import type { FormModel, FormValue } from '../../types/admin';

/** 外部只同步真正变化的字段；未提交输入不随分页刷新丢失。 */
export function useSearchDraft(getModel: () => object) {
  const initial = clone(getModel()) as FormModel;
  const draft = ref<FormModel>(clone(initial));
  let previous = clone(initial);
  watch(
    getModel,
    (model) => {
      const next = model as FormModel;
      const updated = { ...draft.value };
      for (const key of new Set([...Object.keys(previous), ...Object.keys(next)])) {
        if (!Object.prototype.hasOwnProperty.call(next, key)) delete updated[key];
        else if (
          !Object.prototype.hasOwnProperty.call(previous, key) ||
          JSON.stringify(previous[key]) !== JSON.stringify(next[key])
        )
          updated[key] = clone(next[key]);
      }
      previous = clone(next);
      draft.value = updated;
    },
    { deep: true },
  );
  return {
    draft,
    snapshot: () => clone(draft.value),
    update: (field: string, value: FormValue) => {
      draft.value = { ...draft.value, [field]: value };
    },
    reset: () => {
      draft.value = clone(initial);
    },
  };
}

import { ref, onScopeDispose } from 'vue';
import { ElMessage } from 'element-plus';
import { createActionController } from '../utils/adminCore';
export function useAsyncListAction(refresh?: () => void | Promise<unknown>) {
  const pendingKeys = ref<string[]>([]);
  const controller = createActionController(
    refresh,
    (text) => ElMessage.success(text),
    (keys) => {
      pendingKeys.value = keys;
    },
  );
  onScopeDispose(controller.dispose);
  return { ...controller, pendingKeys };
}

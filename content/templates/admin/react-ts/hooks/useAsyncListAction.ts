import { useEffect, useRef, useState } from 'react';
import { App } from 'antd';
import { createActionController } from '../utils/adminCore';
/** 在 antd 的 <App> 内使用，以继承主题与消息上下文。 */
export function useAsyncListAction(refresh?: () => void | Promise<unknown>) {
  const { message } = App.useApp();
  const latest = useRef({ refresh, message });
  latest.current = { refresh, message };
  const [pendingKeys, setPendingKeys] = useState<string[]>([]);
  const reference = useRef<ReturnType<typeof createActionController> | null>(null);
  if (!reference.current)
    reference.current = createActionController(
      () => latest.current.refresh?.(),
      (text) => {
        void latest.current.message.success(text);
      },
      setPendingKeys,
    );
  const controller = reference.current;
  useEffect(() => {
    controller.activate();
    return controller.dispose;
  }, [controller]);
  return { ...controller, pendingKeys };
}

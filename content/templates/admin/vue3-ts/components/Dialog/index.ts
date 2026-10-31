import {
  createVNode,
  defineComponent,
  h,
  isVNode,
  reactive,
  ref,
  render,
  type App,
  type AppContext,
  type Component,
  type VNode,
} from 'vue';
import BaseDialog from './BaseDialog.vue';
export { BaseDialog };
export interface DialogOptions {
  content?: string | Component | VNode;
  title?: string;
  width?: string | number;
  confirmText?: string;
  cancelText?: string;
  showCancel?: boolean;
  showConfirm?: boolean;
  showClose?: boolean;
  closeOnClickModal?: boolean;
  onConfirm?: () => void | Promise<void>;
  onCancel?: () => void;
  onClose?: () => void;
  onError?: (error: unknown) => void;
}
export interface DialogInstance {
  close: () => void;
  update: (options: Partial<DialogOptions>) => void;
}
export function createDialogService(context: AppContext) {
  const instances = new Set<() => void>();
  const showDialog = (options: DialogOptions | string): DialogInstance => {
    const state = reactive<DialogOptions>({
      title: '提示',
      width: '500px',
      ...(typeof options === 'string' ? { content: options } : options),
    });
    const visible = ref(true);
    let destroyed = false;
    let notified = false;
    let opened = false;
    const container = document.createElement('div');
    document.body.appendChild(container);
    const cleanup = () => {
      if (destroyed) return;
      destroyed = true;
      render(null, container);
      container.remove();
      instances.delete(destroy);
    };
    const close = () => {
      if (destroyed || notified) return;
      notified = true;
      visible.value = false;
      try {
        state.onClose?.();
      } finally {
        if (!opened) queueMicrotask(cleanup);
      }
    };
    const destroy = () => {
      try {
        close();
      } finally {
        cleanup();
      }
    };
    instances.add(destroy);
    const host = defineComponent({
      setup() {
        return () =>
          h(
            BaseDialog,
            {
              ...state,
              modelValue: visible.value,
              'onUpdate:modelValue': (value: boolean) => {
                if (!value) close();
              },
              onClose: close,
              onClosed: cleanup,
              onOpened: () => {
                opened = true;
              },
            },
            {
              default: () =>
                typeof state.content === 'string'
                  ? state.content
                  : isVNode(state.content)
                  ? state.content
                  : state.content
                  ? h(state.content)
                  : null,
            },
          );
      },
    });
    const vnode = createVNode(host);
    vnode.appContext = context;
    try {
      render(vnode, container);
    } catch (error) {
      destroy();
      throw error;
    }
    return {
      close,
      update: (options) => {
        if (!destroyed) Object.assign(state, options);
      },
    };
  };
  const Dialog = {
    alert: (content: string, title?: string) => showDialog({ content, title: title ?? '提示', showCancel: false }),
    confirm: (content: string, title?: string) =>
      new Promise<boolean>((resolve) => {
        showDialog({
          content,
          title: title ?? '确认',
          onConfirm: () => {
            resolve(true);
          },
          onClose: () => resolve(false),
        });
      }),
    component: (component: Component, props: Record<string, unknown> = {}) =>
      showDialog({ content: h(component, props), showCancel: false, showConfirm: false }),
  };
  return {
    showDialog,
    Dialog,
    dispose: () => {
      [...instances].forEach((destroy) => destroy());
    },
  };
}
let installed: ReturnType<typeof createDialogService> | undefined;
function service() {
  if (!installed) throw new Error('请先 app.use(AdminDialog)，或使用 createDialogService(appContext)');
  return installed;
}
export const showDialog = (options: DialogOptions | string) => service().showDialog(options);
export const Dialog = {
  alert: (content: string, title?: string) => service().Dialog.alert(content, title),
  confirm: (content: string, title?: string) => service().Dialog.confirm(content, title),
  component: (component: Component, props?: Record<string, unknown>) => service().Dialog.component(component, props),
};
export default {
  install(app: App) {
    const bound = createDialogService(app._context);
    installed = bound;
    app.component('BaseDialog', BaseDialog);
    app.provide('dialog', bound);
    app.config.globalProperties.$dialog = bound.Dialog;
    const unmount = app.unmount.bind(app);
    app.unmount = () => {
      bound.dispose();
      if (installed === bound) installed = undefined;
      unmount();
    };
  },
};

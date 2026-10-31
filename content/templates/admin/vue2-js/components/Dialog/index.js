import Vue from 'vue';
import BaseDialog from './BaseDialog.vue';
export { BaseDialog };
export function createDialogService(parent) {
  if (!parent) throw new Error('函数式弹窗需要调用组件实例作为 parent');
  const instances = new Set();
  const showDialog = (input) => {
    const options = typeof input === 'string' ? { content: input } : input;
    const state = Vue.observable({ options: { title: '提示', ...options }, visible: true });
    let notified = false;
    let destroyed = false;
    let opened = false;
    let vm;
    const close = () => {
      if (notified) return;
      notified = true;
      state.visible = false;
      try {
        if (state.options.onClose) state.options.onClose();
      } finally {
        if (!opened) Promise.resolve().then(cleanup);
      }
    };
    const cleanup = () => {
      if (destroyed) return;
      destroyed = true;
      if (vm) {
        const element = vm.$el;
        vm.$destroy();
        element.remove();
      }
      instances.delete(destroy);
    };
    const destroy = () => {
      try {
        close();
      } finally {
        cleanup();
      }
    };
    const Host = Vue.extend({
      parent,
      render(h) {
        const content = state.options.content;
        return h(
          BaseDialog,
          {
            props: { ...state.options, value: state.visible, onClose: close },
            on: {
              input: (value) => {
                if (!value) close();
              },
              opened: () => {
                opened = true;
              },
              closed: cleanup,
              error: (error) => {
                if (state.options.onError) state.options.onError(error);
              },
            },
          },
          [
            typeof content === 'string'
              ? content
              : content && content.component
              ? h(content.component, { props: content.props })
              : content,
          ],
        );
      },
    });
    instances.add(destroy);
    try {
      vm = new Host({ parent });
      vm.$mount();
      document.body.appendChild(vm.$el);
    } catch (error) {
      destroy();
      throw error;
    }
    return {
      close,
      update: (patch) => {
        if (!destroyed) state.options = { ...state.options, ...patch };
      },
    };
  };
  const Dialog = {
    alert: (content, title = '提示') => showDialog({ content, title, showCancel: false }),
    confirm: (content, title = '确认') =>
      new Promise((resolve) => {
        showDialog({ content, title, onConfirm: () => resolve(true), onClose: () => resolve(false) });
      }),
    component: (component, props = {}) =>
      showDialog({ content: { component, props }, showCancel: false, showConfirm: false }),
  };
  const dispose = () => {
    [...instances].forEach((destroy) => destroy());
  };
  parent.$once('hook:beforeDestroy', dispose);
  return { showDialog, Dialog, dispose };
}
const services = new WeakMap();
function service(parent) {
  if (!parent) throw new Error('需要调用组件实例');
  if (!services.has(parent)) services.set(parent, createDialogService(parent));
  return services.get(parent);
}
export const showDialog = (options, parent) => service(parent).showDialog(options);
export const Dialog = {
  alert: (content, title, parent) => service(parent).Dialog.alert(content, title),
  confirm: (content, title, parent) => service(parent).Dialog.confirm(content, title),
  component: (component, props, parent) => service(parent).Dialog.component(component, props),
};
export default {
  install(VueConstructor) {
    VueConstructor.component('BaseDialog', BaseDialog);
    Object.defineProperty(VueConstructor.prototype, '$dialog', {
      configurable: true,
      get() {
        return service(this).Dialog;
      },
    });
  },
};

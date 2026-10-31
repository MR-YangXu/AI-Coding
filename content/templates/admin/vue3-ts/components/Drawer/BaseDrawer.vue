<template>
  <el-drawer
    v-model="drawerVisible"
    :close-on-click-modal="closeOnClickModal && !loading"
    :destroy-on-close="destroyOnClose"
    :direction="direction"
    :title="title"
    :show-close="showClose && !loading"
    :close-on-press-escape="!loading"
    :before-close="beforeClose"
    :size="size"
    @closed="handleClosed"
  >
    <template #header>
      <slot name="header">
        <span>{{ title }}</span>
      </slot>
    </template>
    <slot />
    <p v-if="failure" role="alert">{{ failure }}</p>
    <template v-if="showFooter" #footer>
      <slot v-if="slots.footer" name="footer" />
      <span v-else class="drawer-footer">
        <el-button v-if="showCancel" :disabled="loading" @click="handleCancel">{{ cancelText }}</el-button>
        <el-button v-if="showConfirm" :loading="loading" :disabled="loading" type="primary" @click="handleConfirm">{{
          confirmText
        }}</el-button>
      </span>
    </template>
  </el-drawer>
</template>

<script setup lang="ts">
import { ref, computed, watch, onBeforeUnmount, useSlots, type PropType } from 'vue';
import { ElDrawer, ElButton } from 'element-plus';
const props = defineProps({
  modelValue: Boolean,
  title: { type: String, default: '' },
  size: { type: [String, Number], default: '480px' },
  direction: { type: String as PropType<'rtl' | 'ltr' | 'ttb' | 'btt'>, default: 'rtl' },
  closeOnClickModal: { type: Boolean, default: false },
  showClose: { type: Boolean, default: true },
  destroyOnClose: { type: Boolean, default: true },
  cancelText: { type: String, default: '取消' },
  confirmText: { type: String, default: '确定' },
  showCancel: { type: Boolean, default: false },
  showConfirm: { type: Boolean, default: false },
  onConfirm: Function as PropType<() => void | Promise<void>>,
  onCancel: Function as PropType<() => void>,
  onClose: Function as PropType<() => void>,
});
const emit = defineEmits(['update:modelValue', 'error', 'closed']);
const slots = useSlots();
const loading = ref(false);
const failure = ref('');
let generation = 0;
let closed = false;
watch(
  () => props.modelValue,
  (value) => {
    generation++;
    loading.value = false;
    failure.value = '';
    if (value) closed = false;
  },
);
onBeforeUnmount(() => {
  generation++;
});
const drawerVisible = computed({ get: () => props.modelValue, set: (value) => emit('update:modelValue', value) });
const showFooter = computed(() => Boolean(slots.footer) || props.showConfirm || props.showCancel);
function close() {
  if (closed) return;
  closed = true;
  generation++;
  emit('update:modelValue', false);
  props.onClose?.();
}
async function handleConfirm() {
  if (loading.value || closed) return;
  const ticket = ++generation;
  loading.value = true;
  failure.value = '';
  try {
    await props.onConfirm?.();
    if (ticket === generation) close();
  } catch (error) {
    if (ticket === generation) {
      failure.value = error instanceof Error ? error.message : '操作失败';
      emit('error', error);
    }
  } finally {
    if (ticket === generation) loading.value = false;
  }
}
function handleCancel() {
  if (loading.value) return;
  props.onCancel?.();
  close();
}
function beforeClose(done: () => void) {
  if (!loading.value) {
    close();
    done();
  }
}
function handleClosed() {
  emit('closed');
}
defineExpose({ close });
</script>
<style scoped lang="scss">
.drawer-footer {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
}
</style>

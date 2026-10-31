<template>
  <el-dialog
    v-model="dialogVisible"
    :close-on-click-modal="closeOnClickModal && !loading"
    :destroy-on-close="destroyOnClose"
    :show-close="showClose && !loading"
    :close-on-press-escape="!loading"
    :before-close="beforeClose"
    :title="title"
    :width="width"
    @closed="handleClosed"
    @opened="emit('opened')"
  >
    <slot />
    <p v-if="failure" role="alert">{{ failure }}</p>
    <template #footer>
      <slot v-if="slots.footer" name="footer" />
      <span v-else class="dialog-footer">
        <el-button v-if="showCancel" :disabled="loading" @click="handleCancel">{{ cancelText }}</el-button>
        <el-button v-if="showConfirm" :loading="loading" :disabled="loading" type="primary" @click="handleConfirm">{{
          confirmText
        }}</el-button>
      </span>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, computed, watch, onBeforeUnmount, useSlots, type PropType } from 'vue';
import { ElDialog, ElButton } from 'element-plus';
const props = defineProps({
  modelValue: Boolean,
  title: { type: String, default: '' },
  width: { type: [String, Number], default: '50%' },
  closeOnClickModal: { type: Boolean, default: false },
  showClose: { type: Boolean, default: true },
  destroyOnClose: { type: Boolean, default: true },
  cancelText: { type: String, default: '取消' },
  confirmText: { type: String, default: '确定' },
  showCancel: { type: Boolean, default: true },
  showConfirm: { type: Boolean, default: true },
  onConfirm: Function as PropType<() => void | Promise<void>>,
  onCancel: Function as PropType<() => void>,
  onClose: Function as PropType<() => void>,
});
const emit = defineEmits(['update:modelValue', 'error', 'closed', 'opened']);
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
const dialogVisible = computed({ get: () => props.modelValue, set: (value) => emit('update:modelValue', value) });
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
.dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
}
</style>

<template>
  <el-drawer
    :visible="value"
    :title="title"
    :size="width"
    :before-close="beforeClose"
    :show-close="showClose && !loading"
    :close-on-click-modal="closeOnClickModal && !loading"
    :close-on-press-escape="!loading"
    :destroy-on-close="destroyOnClose"
    @closed="$emit('closed')"
    ><slot />
    <p v-if="failure" role="alert">{{ failure }}</p>
    <div class="admin-drawer-footer">
      <slot name="footer"
        ><el-button v-if="showCancel" :disabled="loading" @click="cancel">{{ cancelText }}</el-button
        ><el-button v-if="showConfirm" type="primary" :loading="loading" @click="confirm">{{
          confirmText
        }}</el-button></slot
      >
    </div></el-drawer
  >
</template>
<script>
import { Drawer, Button } from 'element-ui';
export default {
  name: 'BaseDrawer',
  components: { ElDrawer: Drawer, ElButton: Button },
  props: {
    value: Boolean,
    title: String,
    width: { type: [String, Number], default: '480px' },
    showClose: { type: Boolean, default: true },
    closeOnClickModal: Boolean,
    destroyOnClose: { type: Boolean, default: true },
    showConfirm: { type: Boolean, default: false },
    showCancel: { type: Boolean, default: false },
    confirmText: { type: String, default: '确定' },
    cancelText: { type: String, default: '取消' },
    onConfirm: Function,
    onCancel: Function,
    onClose: Function,
  },
  data() {
    return { loading: false, failure: '', generation: 0, closed: false };
  },
  watch: {
    value(value) {
      this.generation++;
      this.loading = false;
      this.failure = '';
      if (value) this.closed = false;
    },
  },
  beforeDestroy() {
    this.generation++;
  },
  methods: {
    close() {
      if (this.closed) return;
      this.closed = true;
      this.generation++;
      this.loading = false;
      this.$emit('input', false);
      if (this.onClose) this.onClose();
      this.$emit('close');
    },
    cancel() {
      if (this.loading) return;
      if (this.onCancel) this.onCancel();
      this.$emit('cancel');
      this.close();
    },
    beforeClose(done) {
      if (!this.loading) {
        this.close();
        done();
      }
    },
    async confirm() {
      if (this.loading || this.closed) return;
      this.loading = true;
      this.failure = '';
      const ticket = ++this.generation;
      try {
        if (this.onConfirm) await this.onConfirm();
        if (ticket === this.generation) {
          this.$emit('confirm');
          this.close();
        }
      } catch (error) {
        if (ticket === this.generation) {
          this.failure = error.message || '操作失败';
          this.$emit('error', error);
        }
      } finally {
        if (ticket === this.generation) this.loading = false;
      }
    },
  },
};
</script>
<style scoped>
.admin-drawer-footer {
  display: flex;
  justify-content: flex-end;
  padding: 16px;
}
</style>

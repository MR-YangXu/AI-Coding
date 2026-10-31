<template>
  <div @submit.prevent="submitForm">
    <el-form
      ref="form"
      class="ai-code-search-form"
      inline
      :model="draft"
      :label-position="labelPosition"
      :label-width="labelwidth"
    >
      <search-field
        v-for="item in formHeader"
        :key="item.propName"
        :item="item"
        :model-value="draft[item.propName]"
        @update:model-value="change(item.propName, $event)"
      >
        <slot :name="item.propName" :model="draft" :item="item" :change="change" />
      </search-field>
      <el-form-item v-if="showButton" class="ai-code-search-form__actions">
        <el-button type="primary" native-type="submit">搜索</el-button>
        <el-button @click="resetForm">重置</el-button>
        <slot name="rightSlotBtn" />
      </el-form-item>
      <el-form-item v-if="showExport" class="ai-code-search-form__actions">
        <el-dropdown :disabled="disabledExport" @command="(command) => emit('export', snapshot(), command)">
          <el-button :disabled="disabledExport">导出</el-button>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item
                v-for="item in exportLists"
                :key="`${typeof item.value}:${item.value}`"
                :command="item.value"
              >
                {{ item.label }}
              </el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
      </el-form-item>
      <el-form-item v-if="showOneBtnExport" class="ai-code-search-form__actions">
        <el-button :disabled="disabledExport" @click="emit('export', snapshot())">导出</el-button>
      </el-form-item>
    </el-form>
  </div>
</template>
<script setup lang="ts">
import { ref, type PropType } from 'vue';
import {
  ElForm,
  ElFormItem,
  ElButton,
  ElDropdown,
  ElDropdownMenu,
  ElDropdownItem,
  type FormInstance,
} from 'element-plus';
import type { FormItemConfig, FormModel, FormValue } from '../../types/admin';
import SearchField from './components/SearchField.vue';
import { useSearchDraft } from './useSearchDraft';
const props = defineProps({
  formHeader: { type: Array as PropType<FormItemConfig[]>, default: () => [] },
  formModel: { type: Object as PropType<object>, default: () => ({}) },
  labelPosition: { type: String as PropType<'left' | 'right' | 'top'>, default: 'left' },
  labelwidth: { type: String, default: '80px' },
  showButton: { type: Boolean, default: true },
  showExport: Boolean,
  showOneBtnExport: Boolean,
  disabledExport: Boolean,
  exportLists: {
    type: Array as PropType<Array<{ label: string; value: string | number }>>,
    default: () => [],
  },
});

const emit = defineEmits<{
  submitForm: [model: FormModel];
  resetForm: [model: FormModel];
  formChange: [model: FormModel];
  export: [model: FormModel, command?: string | number];
}>();
const form = ref<FormInstance>();
const { draft, snapshot, update, reset } = useSearchDraft(() => props.formModel);
function change(field: string, value: FormValue) {
  update(field, value);
  emit('formChange', snapshot());
}
async function submitForm() {
  if (await form.value?.validate().catch(() => false)) emit('submitForm', snapshot());
}
function resetForm() {
  reset();
  form.value?.clearValidate();
  emit('formChange', snapshot());
  emit('resetForm', snapshot());
}
defineExpose({ resetForm, submitForm });
</script>
<style lang="scss" src="./style.scss"></style>

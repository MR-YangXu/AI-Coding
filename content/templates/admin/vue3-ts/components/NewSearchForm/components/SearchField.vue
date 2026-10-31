<template>
  <el-form-item
    class="ai-code-search-form__field"
    :style="{ '--ai-code-field-width': item.width || (item.itemType === 'dateRange' ? '240px' : '150px') }"
    :label="item.labelName"
    :label-width="item.labelWidth"
    :prop="item.propName"
    :rules="
      item.isRequired
        ? [{ required: true, message: `请填写${item.labelName || item.propName}`, trigger: 'change' }]
        : []
    "
  >
    <el-input
      v-if="item.itemType === 'text'"
      class="ai-code-search-form__control"
      :model-value="textValue"
      :placeholder="item.placeholder"
      :disabled="item.disabled"
      :clearable="item.clearable !== false"
      @update:model-value="update"
    />
    <el-select
      v-else-if="!item.itemType || item.itemType === 'selectOne'"
      class="ai-code-search-form__control"
      :model-value="selectValue"
      :multiple="item.multiple"
      :placeholder="item.placeholder"
      :disabled="item.disabled"
      :filterable="item.filterable"
      :clearable="item.clearable !== false"
      @update:model-value="update"
    >
      <el-option
        v-for="option in item.optionsArr || []"
        :key="`${typeof option.value}:${option.value}`"
        :label="option.label"
        :value="option.value"
      />
    </el-select>
    <el-date-picker
      v-else-if="item.itemType === 'date' || item.itemType === 'dateRange'"
      class="ai-code-search-form__control"
      :model-value="dateValue"
      :type="item.itemType === 'dateRange' ? 'daterange' : 'date'"
      :disabled="item.disabled"
      :clearable="item.clearable !== false"
      :placeholder="item.placeholder || '选择日期'"
      :format="item.format || 'YYYY-MM-DD'"
      :value-format="item.valueFormat || 'YYYY-MM-DD'"
      :disabled-date="item.disabledDate"
      start-placeholder="开始日期"
      end-placeholder="结束日期"
      range-separator="～"
      @update:model-value="update"
    />
    <slot v-else />
  </el-form-item>
</template>
<script setup lang="ts">
import { computed } from 'vue';
import { ElFormItem, ElInput, ElSelect, ElOption, ElDatePicker } from 'element-plus';
import type { FormItemConfig, FormValue } from '../../../types/admin';
const props = defineProps<{ item: FormItemConfig; modelValue: FormValue }>();
const emit = defineEmits<{ 'update:modelValue': [value: FormValue] }>();
const update = (value: FormValue) => emit('update:modelValue', value);
const textValue = computed(() =>
  typeof props.modelValue === 'string' || typeof props.modelValue === 'number' ? props.modelValue : '',
);
const selectValue = computed(() =>
  props.modelValue instanceof Date
    ? undefined
    : (props.modelValue as string | number | boolean | (string | number | boolean)[] | undefined),
);
const dateValue = computed(
  () => props.modelValue as string | Date | [string, string] | [Date, Date] | undefined,
);
</script>

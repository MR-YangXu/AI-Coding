<template>
  <el-popover placement="bottom" trigger="click" width="220">
    <template #reference><el-button>显示列</el-button></template>
    <div role="group" aria-label="显示列">
      <el-checkbox-group :model-value="modelValue" @update:model-value="update">
        <el-checkbox v-for="column in columns" :key="column.prop" :label="column.prop">{{
          column.label
        }}</el-checkbox>
      </el-checkbox-group>
    </div>
  </el-popover>
</template>
<script setup lang="ts">
import { ElPopover, ElButton, ElCheckboxGroup, ElCheckbox } from 'element-plus';
// 只消费列身份与标题，不接触行、排序或单元格渲染。
defineProps<{ columns: { prop: string; label: string }[]; modelValue: string[] }>();
const emit = defineEmits<{ 'update:modelValue': [value: string[]] }>();
function update(values: (string | number | boolean)[]) {
  emit(
    'update:modelValue',
    values.filter((value): value is string => typeof value === 'string'),
  );
}
</script>

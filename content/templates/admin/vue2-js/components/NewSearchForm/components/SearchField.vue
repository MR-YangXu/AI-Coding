<template>
  <el-form-item
    class="ai-code-search-form__field"
    :style="{ '--ai-code-field-width': item.width || (item.itemType === 'dateRange' ? '240px' : '150px') }"
    :prop="item.propName"
    :label="item.labelName"
    :label-width="item.labelWidth"
    :rules="
      item.isRequired
        ? [{ required: true, message: '请填写' + (item.labelName || item.propName), trigger: 'change' }]
        : []
    "
  >
    <el-input
      v-if="item.itemType === 'text'"
      class="ai-code-search-form__control"
      :value="value"
      :disabled="item.disabled"
      :placeholder="item.placeholder"
      :clearable="item.clearable !== false"
      @input="$emit('input', $event)"
    />
    <el-date-picker
      v-else-if="item.itemType === 'date' || item.itemType === 'dateRange'"
      class="ai-code-search-form__control"
      :value="value"
      :type="item.itemType === 'date' ? 'date' : 'daterange'"
      :disabled="item.disabled"
      :clearable="item.clearable !== false"
      :placeholder="item.placeholder"
      :format="item.format || 'yyyy-MM-dd'"
      :value-format="item.valueFormat || 'yyyy-MM-dd'"
      :picker-options="{ disabledDate: item.disabledDate }"
      @input="$emit('input', $event)"
    />
    <slot v-else-if="item.itemType === 'custom'" />
    <el-select
      v-else
      class="ai-code-search-form__control"
      :value="value"
      :multiple="item.multiple"
      :disabled="item.disabled"
      :filterable="item.filterable"
      :placeholder="item.placeholder"
      :clearable="item.clearable !== false"
      @input="$emit('input', $event)"
    >
      <el-option
        v-for="option in item.optionsArr || []"
        :key="typeof option.value + ':' + option.value"
        :label="option.label"
        :value="option.value"
      />
    </el-select>
  </el-form-item>
</template>
<script>
import { FormItem, Input, Select, Option, DatePicker } from 'element-ui';
export default {
  name: 'SearchField',
  components: {
    ElFormItem: FormItem,
    ElInput: Input,
    ElSelect: Select,
    ElOption: Option,
    ElDatePicker: DatePicker,
  },
  props: { item: { type: Object, required: true }, value: { default: undefined } },
};
</script>

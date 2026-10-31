<template>
  <el-form ref="form" class="ai-code-search-form" :model="draft" inline @submit.native.prevent="submit">
    <search-field
      v-for="item in formHeader"
      :key="item.propName"
      :item="item"
      :value="draft[item.propName]"
      @input="change(item.propName, $event)"
    >
      <slot :name="item.propName" :model="draft" :item="item" :change="change" />
    </search-field>
    <el-form-item class="ai-code-search-form__actions">
      <el-button type="primary" native-type="submit">搜索</el-button>
      <el-button @click="reset">重置</el-button>
      <slot name="rightSlotBtn" />
    </el-form-item>
  </el-form>
</template>
<script>
import { Form, FormItem, Button } from 'element-ui';
import SearchField from './components/SearchField.vue';
import { clone } from '../../utils/adminCore';
export default {
  name: 'NewSearchForm',
  components: { ElForm: Form, ElFormItem: FormItem, ElButton: Button, SearchField },
  props: { formHeader: { type: Array, default: () => [] }, formModel: { type: Object, default: () => ({}) } },
  data() {
    return { draft: clone(this.formModel), initial: clone(this.formModel), previous: clone(this.formModel) };
  },
  watch: {
    formModel: {
      deep: true,
      handler(next) {
        for (const key of new Set([...Object.keys(this.previous), ...Object.keys(next)])) {
          if (!Object.prototype.hasOwnProperty.call(next, key)) this.$delete(this.draft, key);
          else if (
            !Object.prototype.hasOwnProperty.call(this.previous, key) ||
            JSON.stringify(this.previous[key]) !== JSON.stringify(next[key])
          )
            this.$set(this.draft, key, clone(next[key]));
        }
        this.previous = clone(next);
      },
    },
  },
  methods: {
    change(field, value) {
      this.$set(this.draft, field, value);
      this.changed();
    },
    changed() {
      this.$emit('formChange', clone(this.draft));
    },
    submit() {
      this.$refs.form.validate((valid) => {
        if (valid) this.$emit('submitForm', clone(this.draft));
      });
    },
    reset() {
      this.draft = clone(this.initial);
      this.$refs.form.clearValidate();
      this.changed();
      this.$emit('resetForm', clone(this.draft));
    },
  },
};
</script>
<style lang="scss" src="./style.scss"></style>

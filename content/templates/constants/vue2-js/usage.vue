<script>
import { SWITCH_STATE } from '@/constants';
import { ORDER_STATUS, ORDER_STATUS_OPTIONS } from './constants';

export default {
  data() {
    return {
      ORDER_STATUS,
      statusOptions: ORDER_STATUS_OPTIONS,
      query: { status: ORDER_STATUS.PENDING, enabled: SWITCH_STATE.ON },
    };
  },
  methods: {
    reset() {
      this.query.status = null;
      this.query.enabled = SWITCH_STATE.ON;
    },
  },
};
</script>

<template>
  <section>
    <label>订单状态
      <select v-model="query.status">
        <option :value="null">全部</option>
        <option v-for="option in statusOptions" :key="option.value" :value="option.value">{{ option.label }}</option>
      </select>
    </label>
    <button type="button" @click="reset">重置</button>
    <p v-if="query.status === ORDER_STATUS.COMPLETED">订单已完成</p>
  </section>
</template>

<script setup>
import { reactive } from 'vue';
import { SWITCH_STATE } from '@/constants';
import { ORDER_STATUS, ORDER_STATUS_OPTIONS } from './constants';

const query = reactive({
  status: ORDER_STATUS.PENDING,
  enabled: SWITCH_STATE.ON,
});

function reset() {
  query.status = null;
  query.enabled = SWITCH_STATE.ON;
}
</script>

<template>
  <label>
    订单状态
    <select v-model="query.status">
      <option :value="null">全部</option>
      <option v-for="option in ORDER_STATUS_OPTIONS" :key="option.value" :value="option.value">
        {{ option.label }}
      </option>
    </select>
  </label>
  <button type="button" @click="reset">重置</button>
  <p v-if="query.status === ORDER_STATUS.COMPLETED">订单已完成</p>
</template>

<template>
  <div class="base-card">
    <div v-if="title || $slots.title" class="base-card__header">
      <slot name="title">{{ title }}</slot>
    </div>
    <div class="base-card__body"><slot /></div>
  </div>
</template>
<script>
export default { name: 'BaseCard', props: { title: { type: String, default: '' } } };
</script>
<style scoped>
.base-card {
  background: #fff;
  border-radius: 8px;
  margin-bottom: 20px;
  padding: 0 16px;
}
.base-card__header {
  padding: 16px 0 10px;
  font-size: 18px;
  font-weight: 700;
}
</style>

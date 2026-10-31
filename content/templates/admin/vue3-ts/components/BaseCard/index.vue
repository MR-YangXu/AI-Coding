<template>
  <!-- 纯容器卡片：带标题 + 默认插槽 -->
  <div class="base-card">
    <!-- 标题区域 -->
    <div v-if="title || $slots.title" class="base-card__header">
      <slot name="title">
        <span class="base-card__title">{{ title }}</span>
      </slot>
    </div>

    <!-- 内容区域 -->
    <div class="base-card__body">
      <slot />
    </div>
  </div>
</template>

<script setup lang="ts">
defineProps({ title: { type: String, default: '' } });
</script>

<style scoped lang="scss">
.base-card {
  background: #fff;
  border-radius: 8px;
  margin-bottom: 20px;
  overflow: hidden;
  padding: 0 16px;

  &__header {
    padding: 16px 0 10px;
    font-weight: 700;
    color: #333;
    font-size: 18px;
  }
}
</style>

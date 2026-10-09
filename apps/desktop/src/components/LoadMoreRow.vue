<!--
  LoadMoreRow —— M-15 三列表共用的「截断提示 + 加载更多」行。
  账号 / 文案 / 选题三处同形态，抽成组件消除重复模板与样式。
-->
<template>
  <div class="load-more-row">
    <span class="load-more-hint" role="status">{{ hint }}</span>
    <button type="button" class="load-more-btn" data-testid="load-more" @click="$emit('more')">
      {{ buttonText }}
    </button>
  </div>
</template>

<script setup>
defineProps({
  hint: { type: String, required: true },
  buttonText: { type: String, required: true },
})
defineEmits(['more'])
</script>

<style scoped>
.load-more-row { display: flex; align-items: center; justify-content: center; gap: 14px; padding: 14px 0 4px; }
.load-more-hint { color: #85858f; font-size: var(--font-size-sm); }
.load-more-btn { padding: 6px 18px; border: 1px solid var(--color-border); border-radius: 8px; background: transparent; color: var(--color-text-primary); cursor: pointer; font-size: var(--font-size-sm); }
.load-more-btn:hover { background: var(--color-bg-inset); }
</style>

<template>
  <span :class="['ui-badge', 'ui-badge-' + variant, 'ui-badge-' + size]">
    <slot />
  </span>
</template>

<script setup>
// eslint-disable-next-line no-unused-vars
const props = defineProps({
  variant: { type: String, default: "default" },
  size: { type: String, default: "md" },
});
</script>

<style scoped>
.ui-badge {
  display: inline-flex;
  align-items: center;
  padding: 2px var(--apple-space-2);
  border-radius: var(--apple-radius-pill);
  font-family: var(--apple-font-text);
  font-size: var(--apple-size-xs);
  font-weight: var(--apple-weight-medium);
  line-height: 1.4;
  white-space: nowrap;
}
.ui-badge-info {
  background: var(--apple-info-bg);
  color: var(--apple-accent);
}
.ui-badge-success {
  background: var(--apple-success-bg);
  color: var(--apple-success);
}
.ui-badge-warning {
  background: var(--apple-warning-bg);
  color: var(--apple-warning);
}
.ui-badge-danger {
  background: var(--apple-error-bg);
  color: var(--apple-error);
}
</style>
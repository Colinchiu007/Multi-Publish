<template>
  <span :class="['ui-badge', 'ui-badge-' + variant, 'ui-badge-' + size]">
    <slot />
  </span>
</template>

<script setup>
const props = defineProps({
  variant: { type: String, default: "default" },
  size: { type: String, default: "md" },
});
</script>

<style scoped>
.ui-badge {
  display: inline-flex;
  align-items: center;
  font-weight: 600;
  line-height: 1;
  white-space: nowrap;
}

/* Sizes */
.ui-badge-sm { padding: 2px 8px; font-size: 11px; border-radius: 20px; }
.ui-badge-md { padding: 3px 10px; font-size: 12px; border-radius: 20px; }
.ui-badge-lg { padding: 4px 14px; font-size: 13px; border-radius: 24px; }

/* Variants */
.ui-badge-default { background: var(--border-light); color: var(--text-muted); }
.ui-badge-primary { background: var(--primary-light); color: var(--primary); }
.ui-badge-success { background: #d1fae5; color: #065f46; }
.ui-badge-warning { background: #fef3c7; color: #92400e; }
.ui-badge-error { background: #fee2e2; color: #991b1b; }
</style>
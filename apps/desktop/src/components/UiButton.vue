<template>
  <component
    :is="tag"
    :class="classes"
    :disabled="disabled"
    @click="$emit('click', $event)"
  >
    <slot />
  </component>
</template>

<script setup>
import { computed } from "vue";

const props = defineProps({
  variant: { type: String, default: "primary" },
  size: { type: String, default: "md" },
  disabled: { type: Boolean, default: false },
  tag: { type: String, default: "button" },
});

defineEmits(["click"]);

const classes = computed(() => [
  "ui-btn",
  "ui-btn-" + props.variant,
  "ui-btn-" + props.size,
]);
</script>

<style scoped>
.ui-btn {
  display: inline-flex;
  align-items: center;
  gap: var(--apple-space-1);
  border: none;
  cursor: pointer;
  font-family: var(--apple-font-text);
  font-weight: var(--apple-weight-semibold);
  transition: all var(--apple-duration-normal) var(--apple-ease-default);
  text-decoration: none;
  line-height: 1;
}
.ui-btn:disabled { opacity: 0.5; cursor: not-allowed; }

/* Sizes */
.ui-btn-sm { padding: var(--apple-space-1) var(--apple-space-3); font-size: var(--apple-size-sm); border-radius: var(--apple-radius-sm); }
.ui-btn-md { padding: var(--apple-space-2) var(--apple-space-5); font-size: var(--apple-size-sm); border-radius: var(--apple-radius-sm); }
.ui-btn-lg { padding: var(--apple-space-3) var(--apple-space-6); font-size: var(--apple-size-base); border-radius: var(--apple-radius-sm); }

/* Variants */
.ui-btn-primary { background: var(--apple-accent); color: #fff; }
.ui-btn-primary:hover:not(:disabled) { background: var(--apple-accent-hover); box-shadow: var(--apple-shadow-sm); }

.ui-btn-secondary { background: transparent; color: var(--apple-accent); border: 1px solid var(--apple-accent); }
.ui-btn-secondary:hover:not(:disabled) { background: var(--apple-info-bg); }

.ui-btn-ghost { background: transparent; color: var(--apple-ink-secondary); }
.ui-btn-ghost:hover:not(:disabled) { background: var(--apple-surface-tertiary); color: var(--apple-ink-primary); }

.ui-btn-danger { background: var(--apple-error); color: #fff; }
.ui-btn-danger:hover:not(:disabled) { opacity: 0.85; box-shadow: var(--apple-shadow-sm); }
</style>
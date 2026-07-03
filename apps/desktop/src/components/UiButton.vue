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
  gap: 6px;
  border: none;
  cursor: pointer;
  font-family: inherit;
  font-weight: 600;
  transition: all 150ms ease-out;
  text-decoration: none;
  line-height: 1;
}
.ui-btn:disabled { opacity: 0.5; cursor: not-allowed; }

/* Sizes */
.ui-btn-sm { padding: 6px 14px; font-size: 12px; border-radius: var(--r-sm); }
.ui-btn-md { padding: 10px 22px; font-size: 14px; border-radius: var(--r-md); }
.ui-btn-lg { padding: 14px 28px; font-size: 16px; border-radius: var(--r-md); }

/* Variants */
.ui-btn-primary { background: var(--primary); color: #fff; }
.ui-btn-primary:hover:not(:disabled) { background: var(--primary-hover); transform: translateY(-1px); box-shadow: var(--shadow-lg); }

.ui-btn-secondary { background: var(--primary-light); color: var(--primary); }
.ui-btn-secondary:hover:not(:disabled) { background: #e5dbff; }

.ui-btn-ghost { background: transparent; color: var(--text-muted); }
.ui-btn-ghost:hover:not(:disabled) { background: var(--border-light); color: var(--text); }

.ui-btn-danger { background: var(--error); color: #fff; }
.ui-btn-danger:hover:not(:disabled) { opacity: 0.85; transform: translateY(-1px); }
</style>
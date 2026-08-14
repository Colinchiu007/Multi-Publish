<template>
  <div :class="['ui-card', 'ui-card-' + variant]" :style="{ padding: paddingSize + 'px' }">
    <div v-if="$slots.header || title" class="ui-card-header">
      <span v-if="title" class="ui-card-title">{{ title }}</span>
      <slot name="header" />
    </div>
    <slot />
    <div v-if="$slots.footer" class="ui-card-footer">
      <slot name="footer" />
    </div>
  </div>
</template>

<script setup>
const props = defineProps({
  variant: { type: String, default: "default" },
  padding: { type: String, default: "lg" },
  title: { type: String, default: "" },
});

const paddingMap = { sm: "12", md: "16", lg: "20", xl: "24" };
const paddingSize = paddingMap[props.padding] || "20";
</script>

<style scoped>
.ui-card {
  background: var(--apple-surface-primary);
  border: 1px solid var(--apple-border-subtle);
  border-radius: var(--apple-radius-md);
  transition: box-shadow var(--apple-duration-normal) var(--apple-ease-default);
}
.ui-card:hover {
  box-shadow: var(--apple-shadow-sm);
}
.ui-card-header {
  padding: var(--apple-space-4) var(--apple-space-5);
  border-bottom: 1px solid var(--apple-border-subtle);
  font-weight: var(--apple-weight-semibold);
  font-size: var(--apple-size-base);
}
.ui-card-footer {
  padding: var(--apple-space-3) var(--apple-space-5);
  border-top: 1px solid var(--apple-border-subtle);
}
</style>
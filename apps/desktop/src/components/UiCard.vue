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
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg, 16px);
  box-shadow: var(--shadow);
}
.ui-card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}
.ui-card-title {
  font-size: 16px;
  font-weight: 700;
  color: var(--text);
}
.ui-card-footer {
  margin-top: 16px;
  padding-top: 16px;
  border-top: 1px solid var(--border-light);
}

/* Variants */
.ui-card-elevated { box-shadow: var(--shadow-lg); }
.ui-card-bordered { border-width: 2px; border-color: var(--primary-light); }
.ui-card-flat { background: var(--bg); border-color: transparent; box-shadow: none; }
</style>
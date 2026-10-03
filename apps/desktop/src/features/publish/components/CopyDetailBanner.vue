<template>
  <div class="copy-detail-banner" data-testid="copy-detail-banner" role="status">
    <span class="copy-detail-banner-text">{{ t('copyLibrary.detailModeBanner') }}</span>
    <button
      type="button"
      class="copy-detail-banner-close"
      data-testid="copy-detail-banner-close"
      :aria-label="t('copyLibrary.detailModeBannerClose')"
      @click="$emit('close')"
    >✕</button>
  </div>
</template>

<script setup>
import { useI18n } from 'vue-i18n'

defineEmits(['close'])
const { t } = useI18n()
</script>

<style scoped>
.copy-detail-banner {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  margin-bottom: 12px;
  border: 1px solid var(--color-primary);
  border-radius: 6px;
  background: var(--color-bg-inset, rgba(0, 0, 0, 0.03));
  font-size: var(--font-size-sm);
}
.copy-detail-banner-text {
  flex: 1;
  color: var(--color-text-primary);
}
.copy-detail-banner-close {
  border: none;
  background: transparent;
  cursor: pointer;
  color: var(--color-text-secondary);
  font-size: var(--font-size-sm);
  line-height: 1;
  padding: 2px 4px;
}
.copy-detail-banner-close:hover {
  color: var(--color-text-primary);
}
</style>
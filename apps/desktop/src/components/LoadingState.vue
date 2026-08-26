<template>
  <div
    class="mp-loading-state"
    :class="[`mp-loading-state--${variant}`, size === 'small' ? 'mp-loading-state--small' : '']"
    role="status"
    :aria-live="ariaLive"
  >
    <span class="mp-loading-state__spinner" aria-hidden="true"></span>
    <span v-if="text" class="mp-loading-state__text">{{ text }}</span>
    <slot />
  </div>
</template>

<script setup>
defineProps({
  text: { type: String, default: '' },
  variant: { type: String, default: 'spinner' },
  size: { type: String, default: 'default' },
  ariaLive: { type: String, default: 'polite' }
})
</script>

<style scoped>
.mp-loading-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--spacing-3);
  min-height: 120px;
  color: var(--color-text-secondary);
}
.mp-loading-state--overlay {
  position: absolute;
  inset: 0;
  background: var(--color-bg-canvas);
  opacity: 0.8;
  z-index: 10;
}
.mp-loading-state--small {
  min-height: 48px;
  gap: var(--spacing-2);
}
.mp-loading-state__spinner {
  width: 28px;
  height: 28px;
  border: 3px solid var(--color-border-strong);
  border-top-color: var(--color-primary);
  border-radius: var(--radius-full);
  animation: mp-spin 0.8s linear infinite;
}
.mp-loading-state--small .mp-loading-state__spinner {
  width: 18px;
  height: 18px;
  border-width: 2px;
}
.mp-loading-state__text {
  font-size: var(--font-size-sm);
}
@keyframes mp-spin {
  to {
    transform: rotate(360deg);
  }
}
@media (prefers-reduced-motion: reduce) {
  .mp-loading-state__spinner {
    animation-duration: 2s;
  }
}
</style>

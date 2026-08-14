<template>
  <Teleport to="body">
    <Transition name="modal">
      <div v-if="visible" class="ui-modal-overlay" @click.self="$emit('close')">
        <div :class="['ui-modal', sizeClass]" :style="{ maxWidth: computedMaxWidth }">
          <div class="ui-modal-header">
            <span v-if="title" class="ui-modal-title">{{ title }}</span>
            <button class="ui-modal-close" @click="$emit('close')">&times;</button>
          </div>
          <div class="ui-modal-body">
            <slot />
          </div>
          <div v-if="$slots.footer" class="ui-modal-footer">
            <slot name="footer" />
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup>
import { computed } from "vue";

const props = defineProps({
  visible: { type: Boolean, default: false },
  title: { type: String, default: "" },
  size: { type: String, default: "md" },
  width: { type: String, default: "" },
});

defineEmits(["close"]);

const sizeMap = { sm: "360px", md: "480px", lg: "640px", xl: "800px" };
const sizeClass = computed(() => "ui-modal-" + props.size);
const computedMaxWidth = computed(() => props.width || sizeMap[props.size] || sizeMap.md);
</script>

<style scoped>
.ui-modal-overlay {
  position: fixed;
  inset: 0;
  z-index: 2000;
  background: rgba(0, 0, 0, 0.3);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--apple-space-6);
  backdrop-filter: blur(4px);
}

.ui-modal {
  background: var(--apple-surface-primary);
  border-radius: var(--apple-radius-lg);
  box-shadow: var(--apple-shadow-lg);
  width: 100%;
  overflow: hidden;
}

.ui-modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: var(--apple-space-5) var(--apple-space-6) 0;
}

.ui-modal-title {
  font-size: var(--apple-size-lg);
  font-weight: var(--apple-weight-semibold);
  color: var(--apple-ink-primary);
  font-family: var(--apple-font-display);
}

.ui-modal-close {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  border: none;
  background: var(--apple-surface-tertiary);
  color: var(--apple-ink-secondary);
  font-size: 16px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all var(--apple-duration-fast) var(--apple-ease-default);
}
.ui-modal-close:hover { background: var(--apple-error-bg); color: var(--apple-error); }

.ui-modal-body { padding: var(--apple-space-5) var(--apple-space-6); }
.ui-modal-footer {
  padding: var(--apple-space-4) var(--apple-space-6);
  border-top: 1px solid var(--apple-border-subtle);
  display: flex;
  justify-content: flex-end;
  gap: var(--apple-space-2);
}

/* Transition */
.modal-enter-active, .modal-leave-active { transition: all var(--apple-duration-normal) var(--apple-ease-default); }
.modal-enter-from, .modal-leave-to { opacity: 0; }
.modal-enter-from .ui-modal, .modal-leave-to .ui-modal { transform: scale(0.96) translateY(4px); }
</style>
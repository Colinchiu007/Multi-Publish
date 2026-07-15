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
  background: rgba(30, 27, 75, 0.3);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  backdrop-filter: blur(4px);
}

.ui-modal {
  background: var(--surface);
  border-radius: var(--radius-xl, 20px);
  box-shadow: 0 20px 60px rgba(30, 27, 75, 0.15);
  width: 100%;
  overflow: hidden;
}

.ui-modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20px 24px 0;
}

.ui-modal-title {
  font-size: 18px;
  font-weight: 700;
  color: var(--text);
  font-family: "Satoshi", "Noto Serif SC", serif;
}

.ui-modal-close {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  border: none;
  background: var(--border-light);
  color: var(--text-muted);
  font-size: 18px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 150ms;
}
.ui-modal-close:hover { background: var(--primary-light); color: var(--primary); }

.ui-modal-body { padding: 20px 24px; }
.ui-modal-footer {
  padding: 16px 24px;
  border-top: 1px solid var(--border-light);
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

/* Transition */
.modal-enter-active, .modal-leave-active { transition: all 250ms ease-out; }
.modal-enter-from, .modal-leave-to { opacity: 0; }
.modal-enter-from .ui-modal, .modal-leave-to .ui-modal { transform: scale(0.95) translateY(8px); }
</style>
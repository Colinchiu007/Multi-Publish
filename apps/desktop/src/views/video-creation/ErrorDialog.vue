<template>
  <div v-if="visible" class="error-dialog-overlay" @click.self="$emit('close')">
    <div class="error-dialog" role="dialog" aria-labelledby="error-dialog-title" aria-describedby="error-dialog-message">
      <div class="dialog-header">
        <h3 id="error-dialog-title" class="dialog-title">{{ title }}</h3>
        <button class="close-btn" @click="$emit('close')" aria-label="关闭">×</button>
      </div>
      <div class="dialog-body">
        <p id="error-dialog-message" class="dialog-message">{{ message }}</p>
        <p v-if="detail" class="dialog-detail">{{ detail }}</p>
        <p v-if="hint" class="dialog-hint">{{ hint }}</p>
      </div>
      <div class="dialog-footer">
        <button v-if="showResume" class="btn-primary" :disabled="resuming" @click="$emit('resume')">
          {{ resuming ? '恢复中...' : resumeText }}
        </button>
        <button class="btn-secondary" @click="$emit('close')">
          {{ acknowledgeText }}
        </button>
      </div>
    </div>
  </div>
</template>

<script>
export default {
  name: 'ErrorDialog',
  props: {
    visible: { type: Boolean, default: false },
    title: { type: String, default: '错误' },
    message: { type: String, default: '' },
    detail: { type: String, default: '' },
    hint: { type: String, default: '' },
    showResume: { type: Boolean, default: false },
    resuming: { type: Boolean, default: false },
    resumeText: { type: String, default: '重试' },
    acknowledgeText: { type: String, default: '确定' },
  },
  emits: ['close', 'resume'],
  watch: {
    visible(val) {
      if (val) {
        this.$nextTick(() => {
          this.$el.querySelector('.close-btn')?.focus()
        })
      }
    },
  },
}
</script>

<style scoped>
.error-dialog-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  animation: fadeIn 0.2s ease;
}

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

.error-dialog {
  background: var(--surface);
  border-radius: 12px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
  width: 90%;
  max-width: 480px;
  animation: slideIn 0.2s ease;
}

@keyframes slideIn {
  from { transform: translateY(-20px); opacity: 0; }
  to { transform: translateY(0); opacity: 1; }
}

.dialog-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid var(--border);
}

.dialog-title {
  font-size: 16px;
  font-weight: 600;
  margin: 0;
  color: var(--text);
}

.close-btn {
  width: 32px;
  height: 32px;
  border: none;
  background: none;
  font-size: 24px;
  color: var(--text-muted);
  cursor: pointer;
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.close-btn:hover {
  background: var(--border);
  color: var(--text);
}

.dialog-body {
  padding: 20px;
}

.dialog-message {
  font-size: 14px;
  color: var(--text);
  margin: 0 0 12px;
  line-height: 1.5;
}

.dialog-detail {
  font-size: 13px;
  color: var(--text-muted);
  margin: 0 0 12px;
  padding: 8px 12px;
  background: var(--bg);
  border-radius: 6px;
}

.dialog-hint {
  font-size: 13px;
  color: var(--text-light);
  margin: 0;
}

.dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 16px 20px;
  border-top: 1px solid var(--border);
}

.btn-primary {
  padding: 8px 16px;
  border: none;
  border-radius: 6px;
  background: var(--primary);
  color: #fff;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
}

.btn-primary:hover {
  opacity: 0.9;
}

.btn-primary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-secondary {
  padding: 8px 16px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: transparent;
  color: var(--text);
  font-size: 14px;
  cursor: pointer;
}

.btn-secondary:hover {
  background: var(--border);
}

/* 响应式 */
@media (max-width: 480px) {
  .error-dialog {
    width: 95%;
    margin: 16px;
  }
}
</style>

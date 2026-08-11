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
import "@/styles/error-dialog.css"
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

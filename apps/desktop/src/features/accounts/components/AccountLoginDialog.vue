<template>
  <UiModal :visible="visible" title="添加账号" size="sm" @close="$emit('close')">
    <div class="login-form">
      <label class="field-label">平台</label>
      <UiSelect
        :model-value="modelValue"
        label="选择平台"
        placeholder="请选择平台"
        :options="platforms.map(item => ({ value: item.id, label: item.label }))"
        @update:model-value="$emit('update:modelValue', $event)"
      />

      <label class="field-label">登录方式</label>
      <div class="mode-control" role="group" aria-label="登录方式">
        <button
          type="button"
          :class="{ active: mode === 'browser' }"
          data-testid="mode-browser"
          @click="$emit('update:mode', 'browser')"
        >
          <Monitor />网页登录
        </button>
        <button
          type="button"
          :class="{ active: mode === 'qrcode' }"
          :disabled="!qrAvailable"
          data-testid="mode-qrcode"
          @click="$emit('update:mode', 'qrcode')"
        >
          <Cellphone />扫码登录
        </button>
      </div>
      <div v-if="mode === 'qrcode' && !qrAvailable" class="mode-notice">当前平台暂不支持扫码登录</div>
    </div>
    <template #footer>
      <UiButton variant="ghost" @click="$emit('close')">取消</UiButton>
      <UiButton
        data-testid="submit-login"
        :disabled="busy || !modelValue || (mode === 'qrcode' && !qrAvailable)"
        @click="$emit('submit')"
      >
        {{ busy ? '处理中...' : mode === 'qrcode' ? '开始扫码' : '打开登录页' }}
      </UiButton>
    </template>
  </UiModal>
</template>

<script setup>
import { Cellphone, Monitor } from '@element-plus/icons-vue'
import UiButton from '@/components/UiButton.vue'
import UiModal from '@/components/UiModal.vue'
import UiSelect from '@/components/UiSelect.vue'

defineProps({
  visible: { type: Boolean, default: false },
  platforms: { type: Array, default: () => [] },
  modelValue: { type: String, default: '' },
  mode: { type: String, default: 'browser' },
  busy: { type: Boolean, default: false },
  qrAvailable: { type: Boolean, default: true },
})

defineEmits(['update:modelValue', 'update:mode', 'submit', 'close'])
</script>

<style scoped>
.login-form { display: flex; flex-direction: column; gap: 10px; }
.field-label { color: var(--text-primary, #303039); font-size: 13px; font-weight: 600; }
.mode-control {
  display: grid;
  grid-template-columns: 1fr 1fr;
  padding: 3px;
  border: 1px solid var(--border, #dedee5);
  border-radius: 7px;
  background: #f5f5f7;
}
.mode-control button {
  min-height: 36px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  border: 0;
  border-radius: 5px;
  background: transparent;
  color: #6f7079;
  font-size: 13px;
  cursor: pointer;
}
.mode-control button.active { background: #fff; color: #5048e5; box-shadow: 0 1px 3px rgba(28, 28, 35, 0.12); }
.mode-control button:disabled { cursor: not-allowed; opacity: 0.45; }
.mode-control svg { width: 16px; height: 16px; }
.mode-notice { color: #a66a22; font-size: 12px; }
</style>

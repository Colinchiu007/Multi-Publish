<script setup>
/**
 * IdentityDiagnostics.vue — 身份/连接失败的诊断信息折叠区
 *
 * 存在理由（不是"为了拆文件而拆"）：
 * 1. `ProfileMenu.vue` 已在 max-lines 挂账清单内（606 行），继续往里堆 UI 会持续吃增长容差；
 * 2. 这块 UI 自带完整职责（懒加载 / 复制 / 失败兜底 / 无障碍），内聚度高，本就该独立；
 * 3. 后续若 MemberCenter 也要同样的诊断入口，直接复用，不复制第二份。
 *
 * 数据流：诊断文本由**主进程**组装并脱敏（auth-diagnostics.buildDiagnosticReport），
 * 渲染进程拿不到未脱敏的 cause 链。这里的懒加载是有意为之：
 * 只在用户点开时才走一次 IPC，避免每次失败都多一次跨进程往返。
 */
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { identityDiagnosticReport } from '@/api/identity'
import { writeClipboard } from '@/utils/clipboard'
import { useNotify } from '@/composables/useNotify'

const { t } = useI18n()
const { notifySuccess, notifyWarning } = useNotify()

const open = ref(false)
const text = ref('')
const loading = ref(false)

async function toggle () {
  open.value = !open.value
  // 已加载过就不再请求；折叠后重新展开仍用缓存文本
  if (!open.value || text.value || loading.value) return
  loading.value = true
  try {
    const res = await identityDiagnosticReport()
    text.value = (res && res.code === 0 && res.data && res.data.text) || ''
  } finally {
    loading.value = false
  }
}

async function copy () {
  if (!text.value) return
  const ok = await writeClipboard(text.value)
  if (ok) notifySuccess('memberCenter.diagnosticsCopied')
  else notifyWarning('memberCenter.diagnosticsCopyFailed')
}

defineExpose({ open, text, toggle, copy })
</script>

<template>
  <div class="identity-diagnostics">
    <button
      class="identity-diagnostics-toggle"
      type="button"
      :aria-expanded="String(open)"
      aria-controls="identity-diagnostics-body"
      data-testid="identity-diagnostics-toggle"
      @click="toggle"
    >
      {{ open ? t('memberCenter.diagnosticsHide') : t('memberCenter.diagnosticsShow') }}
    </button>

    <div v-if="open" id="identity-diagnostics-body" class="identity-diagnostics-body">
      <p v-if="loading" class="identity-diagnostics-status" role="status">
        {{ t('memberCenter.diagnosticsLoading') }}
      </p>
      <pre v-else-if="text" class="identity-diagnostics-text">{{ text }}</pre>
      <p v-else class="identity-diagnostics-status">{{ t('memberCenter.diagnosticsEmpty') }}</p>

      <button
        class="identity-diagnostics-copy"
        type="button"
        :disabled="!text"
        data-testid="identity-diagnostics-copy"
        @click="copy"
      >
        {{ t('memberCenter.diagnosticsCopy') }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.identity-diagnostics {
  padding: 0 10px 8px;
}

.identity-diagnostics-toggle {
  padding: 0;
  border: 0;
  background: none;
  color: inherit;
  font-size: var(--font-size-xs);
  text-decoration: underline;
  cursor: pointer;
}

.identity-diagnostics-body {
  margin-top: 6px;
}

/* 中性底 + 等宽 + 可滚动：诊断文本不该和错误提示抢视觉权重 */
.identity-diagnostics-text {
  max-height: 180px;
  margin: 0;
  padding: 6px 8px;
  overflow: auto;
  border-radius: var(--radius-sm);
  background: var(--surface);
  color: var(--color-text-secondary);
  font-family: var(--font-family-mono);
  font-size: var(--font-size-xs);
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-all;
}

.identity-diagnostics-status {
  margin: 0;
  color: var(--color-text-secondary);
  font-size: var(--font-size-xs);
}

.identity-diagnostics-copy {
  margin-top: 6px;
  padding: 4px 10px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface);
  color: inherit;
  font-size: var(--font-size-xs);
  cursor: pointer;
}

.identity-diagnostics-copy:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
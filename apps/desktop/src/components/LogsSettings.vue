<template>
  <div class="logs-settings">
    <!-- 页面头部 -->
    <div class="cohere-page-header">
      <div>
        <div class="page-title">{{ t('settings.logs.title') }}</div>
        <div class="page-subtitle">{{ t('settings.logs.subtitle') }}</div>
      </div>
      <div class="page-actions">
        <button class="cohere-btn-secondary" :disabled="loading" @click="loadInfo">⟳ {{ t('common.refresh') }}</button>
        <button class="clear-btn" :disabled="!info.fileCount || clearing" @click="clearLogs">
          {{ clearing ? t('common.loading') : t('settings.logs.clearBtn') }}
        </button>
      </div>
    </div>

    <!-- 语言设置 -->
    <div class="lang-section" role="group" :aria-label="t('settings.langAria')">
      <div class="lang-row">
        <div class="lang-meta">
          <div class="lang-title">{{ t('settings.language') }}</div>
          <div class="lang-hint">{{ t('settings.langHint') }}</div>
        </div>
        <select class="lang-select" :value="localeModel" data-testid="locale-select" @change="changeLocale">
          <option value="zh">{{ t('settings.langZh') }}</option>
          <option value="en">{{ t('settings.langEn') }}</option>
        </select>
      </div>
    </div>

    <!-- 自动清理提示 -->
    <div class="log-hint" role="note">
      <span class="hint-icon">ℹ️</span>
      {{ t('settings.logs.autoClearHint') }}
    </div>

    <!-- 摘要卡片 -->
    <div class="log-summary">
      <div class="summary-row">
        <span class="summary-label">{{ t('settings.logs.dirLabel') }}</span>
        <span class="summary-value log-dir" :title="info.dir">{{ info.dir || '—' }}</span>
      </div>
      <div class="summary-grid">
        <div class="summary-item">
          <div class="summary-label">{{ t('settings.logs.fileCount') }}</div>
          <div class="summary-value">{{ info.fileCount }}</div>
        </div>
        <div class="summary-item">
          <div class="summary-label">{{ t('settings.logs.totalSize') }}</div>
          <div class="summary-value">{{ formatBytes(info.totalBytes) }}</div>
        </div>
        <div class="summary-item">
          <div class="summary-label">{{ t('settings.logs.maxSize') }}</div>
          <div class="summary-value">{{ formatBytes(info.maxFileBytes) }}</div>
        </div>
      </div>
    </div>

    <!-- 文件列表 -->
    <div class="log-file-list">
      <div v-if="loading" class="log-empty">{{ t('common.loading') }}</div>
      <div v-else-if="!info.fileCount" class="log-empty">{{ t('settings.logs.empty') }}</div>
      <div v-else>
        <div v-for="file in info.files" :key="file.name" class="log-file-row">
          <span class="file-name">{{ file.name }}</span>
          <span class="file-size">{{ formatBytes(file.size) }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { onMounted, reactive, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { logsGetInfo, logsClear } from '@/api/publisher'
import { getAppLocale, setAppLocale } from '@/i18n'

const { t } = useI18n()
const loading = ref(false)
const clearing = ref(false)
const info = reactive({ dir: '', totalBytes: 0, fileCount: 0, maxFileBytes: 0, files: [] })
const localeModel = ref(getAppLocale())

function changeLocale (event) {
  localeModel.value = setAppLocale(event && event.target && event.target.value === 'en' ? 'en' : 'zh')
}

function formatBytes (bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  let value = bytes
  let index = 0
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024
    index += 1
  }
  return `${value.toFixed(index === 0 ? 0 : 2)} ${units[index]}`
}

async function loadInfo () {
  loading.value = true
  try {
    const result = await logsGetInfo()
    if (result && result.code === 0 && result.data) {
      info.dir = result.data.dir || ''
      info.totalBytes = result.data.totalBytes || 0
      info.fileCount = result.data.fileCount || 0
      info.maxFileBytes = result.data.maxFileBytes || 0
      info.files = Array.isArray(result.data.files) ? result.data.files : []
    }
  } finally {
    loading.value = false
  }
}

async function clearLogs () {
  if (clearing.value) return
  clearing.value = true
  try {
    const result = await logsClear()
    if (result && result.code === 0) {
      await loadInfo()
    }
  } finally {
    clearing.value = false
  }
}

onMounted(loadInfo)
</script>

<style scoped>
.logs-settings {
  padding: 20px;
}

.lang-section {
  margin-bottom: 16px;
  border: 1px solid var(--border-light, #e2e8f0);
  border-radius: 8px;
  padding: 14px 16px;
}

.lang-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.lang-meta {
  min-width: 0;
}

.lang-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary, #1a202c);
}

.lang-hint {
  margin-top: 4px;
  font-size: 12px;
  color: var(--text-muted, #718096);
  line-height: 1.5;
}

.lang-select {
  flex-shrink: 0;
  padding: 6px 10px;
  border: 1px solid var(--border-light, #cbd5e0);
  border-radius: 6px;
  background: var(--surface, #fff);
  color: var(--text-primary, #1a202c);
  font-size: 13px;
  cursor: pointer;
}

.log-hint {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  background: var(--primary-light, #eef4ff);
  color: var(--text-secondary, #4a5568);
  border-radius: 8px;
  padding: 10px 14px;
  margin: 12px 0 16px;
  font-size: 13px;
  line-height: 1.6;
}

.hint-icon {
  flex-shrink: 0;
}

.clear-btn {
  background: #e5484d;
  color: #fff;
  border: none;
  border-radius: 8px;
  padding: 8px 16px;
  font-size: 14px;
  cursor: pointer;
  transition: opacity 150ms;
}

.clear-btn:hover:not(:disabled) {
  opacity: 0.88;
}

.clear-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.log-summary {
  border: 1px solid var(--border-light, #e2e8f0);
  border-radius: 10px;
  padding: 14px 16px;
  margin-bottom: 16px;
}

.summary-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding-bottom: 10px;
  margin-bottom: 10px;
  border-bottom: 1px dashed var(--border-light, #e2e8f0);
}

.log-dir {
  word-break: break-all;
  font-family: ui-monospace, SFMono-Regular, Consolas, monospace;
  font-size: 12px;
}

.summary-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
}

.summary-label {
  display: block;
  font-size: 12px;
  color: var(--text-muted, #718096);
  margin-bottom: 4px;
}

.summary-value {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary, #1a202c);
}

.log-file-list {
  border: 1px solid var(--border-light, #e2e8f0);
  border-radius: 10px;
  overflow: hidden;
}

.log-file-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 16px;
  font-size: 13px;
  border-bottom: 1px solid var(--border-light, #e2e8f0);
}

.log-file-row:last-child {
  border-bottom: none;
}

.file-name {
  font-family: ui-monospace, SFMono-Regular, Consolas, monospace;
}

.file-size {
  color: var(--text-muted, #718096);
}

.log-empty {
  padding: 32px;
  text-align: center;
  color: var(--text-muted, #718096);
}
</style>

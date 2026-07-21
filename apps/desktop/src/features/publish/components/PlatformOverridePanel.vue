<template>
  <section class="override-panel" aria-label="平台差异化内容">
    <div class="override-panel__header">
      <div>
        <h3 class="override-panel__title">平台差异化内容</h3>
        <p class="override-panel__hint">为不同平台设置独立标题或正文，留空时使用默认内容。</p>
      </div>
    </div>

    <div class="override-list">
      <article v-for="platform in platforms" :key="platform.id" class="override-item">
        <div class="override-item__header">
          <label class="override-toggle">
            <input
              :data-testid="'override-toggle-' + platform.id"
              type="checkbox"
              :checked="isEnabled(platform.id)"
              @change="toggle(platform.id)"
            />
            <span>{{ platform.label }}</span>
          </label>
          <span v-if="isEnabled(platform.id)" class="override-state">已启用</span>
        </div>

        <div v-if="isEnabled(platform.id)" class="override-fields">
          <label class="override-field">
            <span>标题 <small v-if="platform.titleMax">最多 {{ platform.titleMax }} 字</small></span>
            <input
              :data-testid="'override-title-' + platform.id"
              :value="getValue(platform.id, 'title')"
              type="text"
              :maxlength="platform.titleMax || undefined"
              placeholder="使用默认标题"
              @input="updateField(platform.id, 'title', $event.target.value)"
            />
          </label>
          <label class="override-field">
            <span>正文 <small v-if="platform.contentMax">最多 {{ platform.contentMax }} 字</small></span>
            <textarea
              :data-testid="'override-content-' + platform.id"
              :value="getValue(platform.id, 'content')"
              :maxlength="platform.contentMax || undefined"
              rows="4"
              placeholder="使用默认正文"
              @input="updateField(platform.id, 'content', $event.target.value)"
            />
          </label>
          <template v-if="platform.id === 'zhihu'">
            <label class="override-field">
              <span>评论权限</span>
              <select
                :data-testid="'override-comment-permission-' + platform.id"
                :value="getValue(platform.id, 'commentPermission')"
                @change="updateField(platform.id, 'commentPermission', $event.target.value)"
              >
                <option value="anyone">允许所有人评论</option>
              </select>
            </label>
            <label class="override-field">
              <span>创作声明</span>
              <select
                :data-testid="'override-declare-' + platform.id"
                :value="getValue(platform.id, 'declare')"
                @change="updateField(platform.id, 'declare', $event.target.value)"
              >
                <option v-for="statement in zhihuStatements" :key="statement.value" :value="statement.value">
                  {{ statement.label }}
                </option>
              </select>
            </label>
          </template>
        </div>
      </article>
    </div>
  </section>
</template>

<script setup>
const props = defineProps({
  platforms: { type: Array, default: () => [] },
  modelValue: { type: Object, default: () => ({}) },
})

const emit = defineEmits(['update:modelValue'])

const zhihuStatements = [
  { value: 0, label: '无申明' },
  { value: 1, label: '包含剧透' },
  { value: 2, label: '包含医疗建议' },
  { value: 3, label: '虚构创作' },
  { value: 4, label: '包含理财内容' },
  { value: 5, label: '包含 AI 辅助创作' },
]

function defaultOverride (platformId) {
  if (platformId === 'zhihu') {
    return { title: '', content: '', commentPermission: 'anyone', declare: 0 }
  }
  return { title: '', content: '' }
}

function normalizeValue (platformId, field, value) {
  if (platformId === 'zhihu' && field === 'declare') {
    const number = Number(value)
    return Number.isInteger(number) && number >= 0 && number <= 5 ? number : 0
  }
  if (platformId === 'zhihu' && field === 'commentPermission') return 'anyone'
  return value
}

function cloneModel () {
  return JSON.parse(JSON.stringify(props.modelValue || {}))
}

function isEnabled (platformId) {
  return Boolean(props.modelValue && props.modelValue[platformId])
}

function getValue (platformId, field) {
  const current = props.modelValue?.[platformId]
  if (current && current[field] !== undefined) return current[field]
  return defaultOverride(platformId)[field] ?? ''
}

function toggle (platformId) {
  const next = cloneModel()
  if (next[platformId]) delete next[platformId]
  else next[platformId] = defaultOverride(platformId)
  emit('update:modelValue', next)
}

function updateField (platformId, field, value) {
  const next = cloneModel()
  next[platformId] = {
    ...defaultOverride(platformId),
    ...(next[platformId] || {}),
    [field]: normalizeValue(platformId, field, value),
  }
  emit('update:modelValue', next)
}
</script>

<style scoped>
.override-panel { display: flex; flex-direction: column; gap: 12px; }
.override-panel__header { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
.override-panel__title { margin: 0; font-size: 14px; font-weight: 600; color: var(--text-primary, #202124); }
.override-panel__hint { margin: 4px 0 0; color: var(--muted, #8a8f98); font-size: 12px; }
.override-list { display: grid; gap: 8px; }
.override-item { border: 1px solid var(--border-light, #e8eaed); border-radius: 6px; padding: 10px 12px; background: var(--surface, #fff); }
.override-item__header { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.override-toggle { display: inline-flex; align-items: center; gap: 8px; cursor: pointer; font-size: 13px; color: var(--text-primary, #202124); }
.override-toggle input { accent-color: var(--coral, #f56c6c); }
.override-state { color: var(--action-blue, #1890ff); font-size: 11px; }
.override-fields { display: grid; gap: 10px; margin-top: 10px; padding-top: 10px; border-top: 1px solid var(--border-light, #f0f1f2); }
.override-field { display: grid; gap: 5px; font-size: 12px; color: var(--muted, #73777d); }
.override-field small { margin-left: 6px; color: var(--muted, #9aa0a6); }
.override-field input, .override-field textarea { width: 100%; box-sizing: border-box; border: 1px solid var(--border-light, #e0e0e0); border-radius: 4px; padding: 7px 9px; color: var(--text-primary, #202124); background: var(--surface, #fff); font: inherit; resize: vertical; }
.override-field select { width: 100%; box-sizing: border-box; border: 1px solid var(--border-light, #e0e0e0); border-radius: 4px; padding: 7px 9px; color: var(--text-primary, #202124); background: var(--surface, #fff); font: inherit; }
.override-field input:focus, .override-field textarea:focus { outline: 2px solid color-mix(in srgb, var(--action-blue, #1890ff) 25%, transparent); border-color: var(--action-blue, #1890ff); }
.override-field select:focus { outline: 2px solid color-mix(in srgb, var(--action-blue, #1890ff) 25%, transparent); border-color: var(--action-blue, #1890ff); }
</style>

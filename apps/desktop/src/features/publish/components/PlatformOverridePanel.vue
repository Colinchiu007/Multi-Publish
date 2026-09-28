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
              @input="updateField(platform.id, TITLE_CONTENT_FIELDS.title, $event.target.value)"
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
              @input="updateField(platform.id, TITLE_CONTENT_FIELDS.content, $event.target.value)"
            />
          </label>

          <!-- 注册表驱动的平台特有字段（publish-capabilities.json 单一真源）：
               新增平台/字段只需在注册表登记，本组件零代码接入。 -->
          <template v-for="field in fieldsFor(platform.id)" :key="platform.id + ':' + field.key">
            <label v-if="field.type === 'checkbox'" class="override-check">
              <input
                :data-testid="testId(platform.id, field.key)"
                :checked="Boolean(getValue(platform.id, field.key))"
                type="checkbox"
                @change="updateField(platform.id, field, $event.target.checked)"
              />
              <span>{{ field.label }}</span>
            </label>

            <label v-else-if="field.type === 'select'" class="override-field">
              <span>{{ field.label }}</span>
              <select
                :data-testid="testId(platform.id, field.key)"
                :value="getValue(platform.id, field.key)"
                @change="updateField(platform.id, field, $event.target.value)"
              >
                <option v-for="option in field.options" :key="String(option.value)" :value="option.value">
                  {{ option.label }}
                </option>
              </select>
            </label>

            <label v-else-if="field.type === 'tags'" class="override-field">
              <span>{{ field.label }}</span>
              <input
                :data-testid="testId(platform.id, field.key)"
                :value="getValue(platform.id, field.key).join(', ')"
                type="text"
                :placeholder="field.placeholder"
                @input="updateField(platform.id, field, $event.target.value)"
              />
            </label>

            <label v-else-if="field.type === 'collection'" class="override-field">
              <span>{{ field.label }}</span>
              <div class="collection-picker">
                <button
                  type="button"
                  class="collection-picker__btn"
                  :data-testid="'override-collection-fetch-' + platform.id"
                  :disabled="collectionLoading[platform.id]"
                  @click="fetchCollections(platform.id)"
                >{{ collectionLoading[platform.id] ? '拉取中…' : '拉取我的合集' }}</button>
                <select
                  :data-testid="'override-collection-id-' + platform.id"
                  :value="getValue(platform.id, field.key)"
                  @change="updateField(platform.id, field, $event.target.value)"
                >
                  <option value="">不加入合集</option>
                  <option v-if="!collectionOptions[platform.id] || collectionOptions[platform.id].length === 0" :value="getValue(platform.id, field.key)">
                    {{ getValue(platform.id, field.key) ? 'ID: ' + getValue(platform.id, field.key) : '（先拉取或手输）' }}
                  </option>
                  <option v-for="col in collectionOptions[platform.id] || []" :key="col.id" :value="col.id">
                    {{ col.name }}（{{ col.id }}）
                  </option>
                </select>
              </div>
              <input
                :data-testid="'override-collection-id-input-' + platform.id"
                :value="getValue(platform.id, field.key)"
                type="text"
                :maxlength="field.maxLen || undefined"
                :placeholder="field.placeholder"
                @input="updateField(platform.id, field, $event.target.value)"
              />
            </label>

            <label v-else class="override-field">
              <span>{{ field.label }} <small v-if="field.hint">{{ field.hint }}</small></span>
              <textarea
                v-if="field.type === 'textarea'"
                :data-testid="testId(platform.id, field.key)"
                :value="getValue(platform.id, field.key)"
                :maxlength="field.maxLen || undefined"
                rows="2"
                :placeholder="field.placeholder"
                @input="updateField(platform.id, field, $event.target.value)"
              />
              <input
                v-else
                :data-testid="testId(platform.id, field.key)"
                :value="getValue(platform.id, field.key)"
                type="text"
                :maxlength="field.maxLen || undefined"
                :placeholder="field.placeholder"
                @input="updateField(platform.id, field, $event.target.value)"
              />
            </label>
          </template>
        </div>
      </article>
    </div>
  </section>
</template>

<script setup>
import { reactive } from 'vue'
import { listPlatformCollections } from '@/api/publisher'
import { getPlatformOverrideFields } from '@multi-publish/shared-utils/src/publish-capabilities'

const props = defineProps({
  platforms: { type: Array, default: () => [] },
  modelValue: { type: Object, default: () => ({}) },
})

const emit = defineEmits(['update:modelValue'])

// 标题/正文是所有平台的通用覆盖字段（不属于注册表平台特有字段），
// 以虚拟字段定义参与统一的 normalize 管线。
const TITLE_CONTENT_FIELDS = Object.freeze({
  title: Object.freeze({ key: 'title', type: 'text', label: '标题', default: '' }),
  content: Object.freeze({ key: 'content', type: 'textarea', label: '正文', default: '' }),
})

// P3-7：合集列表拉取状态
const collectionOptions = reactive({})
const collectionLoading = reactive({})

async function fetchCollections (platformId) {
  if (collectionLoading[platformId]) return
  collectionLoading[platformId] = true
  try {
    const result = await listPlatformCollections(platformId)
    if (result?.code === 0 && Array.isArray(result.data)) {
      collectionOptions[platformId] = result.data
    }
  } catch (_) {
    collectionOptions[platformId] = []
  } finally {
    collectionLoading[platformId] = false
  }
}

// 注册表字段查询缓存（注册表数据冻结，缓存安全；避免模板每次重渲染复制数组）
const fieldsCache = new Map()

/**
 * 平台差异化字段（仅 uiExposed && status=implemented，来自注册表单一真源）。
 * @param {string} platformId
 * @returns {object[]}
 */
function fieldsFor (platformId) {
  if (!fieldsCache.has(platformId)) {
    fieldsCache.set(platformId, getPlatformOverrideFields(platformId, { uiOnly: true }))
  }
  return fieldsCache.get(platformId)
}

/**
 * testid 约定：override-{kebab(key)}-{platformId}（与历史测试钉死的形态一致）。
 */
function testId (platformId, key) {
  return 'override-' + String(key).replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase() + '-' + platformId
}

function defaultOverride (platformId) {
  const base = { title: '', content: '' }
  for (const field of fieldsFor(platformId)) {
    base[field.key] = Array.isArray(field.default) ? [...field.default] : field.default
  }
  return base
}

// collection 类型字段的取值形状规则（值形状属代码级契约，不进注册表数据）：
// B站合集 ID 必须是纯数字字符串转 Number；百家号合集输入保持 'ID' 或 'ID:名称' 文本。
const COLLECTION_NORMALIZERS = {
  'bilibili:collectionId': value => (/^\d+$/.test(String(value || '').trim()) ? Number(String(value).trim()) : ''),
  'baijiahao:collectionIdText': value => String(value || '').slice(0, 100),
}

/**
 * 按字段定义归一化输入值。select 以选项值集校验并保留原始类型
 * （知乎 declare/B站分区为 number，YouTube 分类为 string）；
 * checkbox 转 Boolean；tags 拆分去重；text/textarea 截断到 maxLen。
 */
function normalizeValue (platformId, field, value) {
  const key = field ? field.key : ''
  const type = field ? field.type : 'text'
  if (type === 'checkbox') return Boolean(value)
  if (type === 'select') {
    const options = (field && Array.isArray(field.options)) ? field.options : []
    const matched = options.find(option => String(option.value) === String(value))
    return matched ? matched.value : field.default
  }
  if (type === 'tags') {
    return [...new Set(String(value || '').split(/[,，]/).map(item => item.trim()).filter(Boolean))]
  }
  const collectionNormalizer = COLLECTION_NORMALIZERS[platformId + ':' + key]
  if (collectionNormalizer) return collectionNormalizer(value)
  const maxLen = Number(field && field.maxLen)
  const text = String(value ?? '')
  return maxLen > 0 ? text.slice(0, maxLen) : text
}

function cloneModel () {
  return JSON.parse(JSON.stringify(props.modelValue || {}))
}

function isEnabled (platformId) {
  return Boolean(props.modelValue && props.modelValue[platformId])
}

function getValue (platformId, fieldKey) {
  const current = props.modelValue?.[platformId]
  if (current && current[fieldKey] !== undefined) return current[fieldKey]
  return defaultOverride(platformId)[fieldKey] ?? ''
}

function toggle (platformId) {
  const next = cloneModel()
  if (next[platformId]) delete next[platformId]
  else next[platformId] = defaultOverride(platformId)
  emit('update:modelValue', next)
}

function updateField (platformId, field, value) {
  const key = field ? field.key : value
  const next = cloneModel()
  next[platformId] = {
    ...defaultOverride(platformId),
    ...(next[platformId] || {}),
    [key]: normalizeValue(platformId, field, value),
  }
  emit('update:modelValue', next)
}
</script>

<style scoped>
.override-panel { display: flex; flex-direction: column; gap: 12px; }
.override-panel__header { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
.override-panel__title { margin: 0; font-size: var(--font-size-sm); font-weight: 600; color: var(--text-primary, #202124); }
.override-panel__hint { margin: 4px 0 0; color: var(--muted, #8a8f98); font-size: var(--font-size-xs); }
.override-list { display: grid; gap: 8px; }
.override-item { border: 1px solid var(--border-light, #e8eaed); border-radius: 6px; padding: 10px 12px; background: var(--surface, #fff); }
.override-item__header { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.override-toggle { display: inline-flex; align-items: center; gap: 8px; cursor: pointer; font-size: var(--font-size-sm); color: var(--text-primary, #202124); }
.override-toggle input { accent-color: var(--coral, #f56c6c); }
.override-state { color: var(--action-blue, #1890ff); font-size: var(--font-size-xs); }
.override-fields { display: grid; gap: 10px; margin-top: 10px; padding-top: 10px; border-top: 1px solid var(--border-light, #f0f1f2); }
.override-field { display: grid; gap: 5px; font-size: var(--font-size-xs); color: var(--muted, #73777d); }
.override-field small { margin-left: 6px; color: var(--muted, #9aa0a6); }
.override-field input, .override-field textarea { width: 100%; box-sizing: border-box; border: 1px solid var(--border-light, #e0e0e0); border-radius: 4px; padding: 7px 9px; color: var(--text-primary, #202124); background: var(--surface, #fff); font: inherit; resize: vertical; }
.override-field select { width: 100%; box-sizing: border-box; border: 1px solid var(--border-light, #e0e0e0); border-radius: 4px; padding: 7px 9px; color: var(--text-primary, #202124); background: var(--surface, #fff); font: inherit; }
.override-check { display: inline-flex; align-items: center; gap: 8px; font-size: var(--font-size-xs); color: var(--muted, #73777d); }
.override-check input { accent-color: var(--coral, #f56c6c); }
.collection-picker { display: flex; gap: 8px; align-items: center; }
.collection-picker__btn { white-space: nowrap; padding: 6px 10px; border: 1px solid var(--border-light, #e0e0e0); border-radius: 4px; background: var(--surface, #fff); color: var(--text-primary, #202124); font: inherit; font-size: var(--font-size-xs); cursor: pointer; }
.collection-picker__btn:disabled { opacity: 0.6; cursor: wait; }
.collection-picker select { flex: 1; border: 1px solid var(--border-light, #e0e0e0); border-radius: 4px; padding: 6px 8px; font: inherit; }
.override-field input:focus, .override-field textarea:focus { outline: 2px solid color-mix(in srgb, var(--action-blue, #1890ff) 25%, transparent); border-color: var(--action-blue, #1890ff); }
.override-field select:focus { outline: 2px solid color-mix(in srgb, var(--action-blue, #1890ff) 25%, transparent); border-color: var(--action-blue, #1890ff); }
</style>

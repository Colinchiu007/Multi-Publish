<template>
  <div class="cohere-card" style="cursor:default;padding:16px">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:var(--space-md);padding-bottom:var(--space-sm);border-bottom:1px solid var(--border)">
      <span style="font-weight:600;font-size: var(--font-size-sm)">{{ t('tagSuggest.title') }}</span>
      <button class="cohere-btn-ghost" @click="$emit('close')" style="font-size: var(--font-size-xs);padding:2px 6px">✕</button>
    </div>

    <!-- Loading -->
    <div v-if="loading" style="padding:8px 0" data-testid="tag-suggester-loading">
      <UiSkeleton variant="paragraph" :rows="2" />
    </div>

    <!-- Empty / no content -->
    <div v-else-if="!content || content.trim().length < 3" style="padding:12px 0;font-size: var(--font-size-xs);color:var(--muted);text-align:center">
      {{ t('tagSuggest.emptyContent') }}
    </div>

    <!-- Error：一行收敛提示 + 行内重试（空态收敛契约：不渲染整卡结果结构） -->
    <div v-else-if="error" class="tag-error-row" data-testid="tag-suggester-error">
      <span class="tag-error-text">⚠ {{ error }}</span>
      <button class="cohere-btn-ghost tag-retry-button" @click="retry">{{ t('tagSuggest.retry') }}</button>
    </div>

    <!-- Results -->
    <div v-else-if="suggestions">
      <!-- Extracted keywords -->
      <div style="margin-bottom:var(--space-md)">
        <div style="font-size: var(--font-size-xs);color:var(--muted);margin-bottom:6px">提取关键词：</div>
        <div style="display:flex;flex-wrap:wrap;gap:4px">
          <span v-for="kw in suggestions.keywords" :key="kw"
            class="cohere-tag suggested-tag"
            :class="kw.startsWith('#') ? 'cohere-tag-success' : 'cohere-tag-info'"
            data-testid="suggested-tag"
            :title="t('tagSuggest.applyTagHint')"
            style="font-size: var(--font-size-xs);padding:2px 8px;border-radius:4px"
            @click="$emit('apply-tag', kw)">
            {{ kw }}
          </span>
        </div>
      </div>

      <!-- Related terms -->
      <div v-if="suggestions.relatedTerms && suggestions.relatedTerms.length > 0" style="margin-bottom:var(--space-md)">
        <div style="font-size: var(--font-size-xs);color:var(--muted);margin-bottom:6px">相关话题：</div>
        <div style="display:flex;flex-wrap:wrap;gap:4px">
          <span v-for="term in suggestions.relatedTerms" :key="term"
            class="cohere-tag cohere-tag-info suggested-tag"
            data-testid="suggested-tag"
            :title="t('tagSuggest.applyTagHint')"
            style="font-size: var(--font-size-xs);padding:2px 8px;border-radius:4px"
            @click="$emit('apply-tag', term)">
            {{ term }}
          </span>
        </div>
      </div>

      <!-- Per-platform tags (grouped when byPlatformDetail exists, else single group) -->
      <div v-if="suggestions.byPlatform">
        <div style="font-size: var(--font-size-xs);color:var(--muted);margin-bottom:6px">{{ t('tagSuggest.platformTags') }}：</div>
        <div v-for="g in platformGroups" :key="g.platform" style="margin-bottom:var(--space-sm);padding:var(--space-sm);background:#f8f9fa;border-radius:6px">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
            <span style="font-size: var(--font-size-xs);font-weight:600;color:var(--text)">{{ platformLabel(g.platform) }}</span>
            <button class="cohere-btn-ghost" @click="copyPlatformTags(g.platform, allTags(g))" style="font-size: var(--font-size-xs);padding:2px 8px">
              {{ t('tagSuggest.copyTags') }}
            </button>
          </div>

          <!-- Grouped: content + traffic -->
          <template v-if="g.detail">
            <div style="font-size: var(--font-size-xs);color:var(--muted);margin:4px 0 3px"><el-icon><EditPen /></el-icon> {{ t('tagSuggest.contentTags') }}</div>
            <div style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:6px">
              <span v-for="tag in g.detail.content" :key="'c-'+tag"
                class="cohere-tag cohere-tag-info suggested-tag"
                data-testid="suggested-tag"
                :title="t('tagSuggest.applyTagHint')"
                style="font-size: var(--font-size-xs);padding:2px 6px;border-radius:4px"
                @click="$emit('apply-tag', tag)">
                {{ tag }}
              </span>
            </div>

            <div style="font-size: var(--font-size-xs);color:var(--muted);margin:4px 0 3px"><el-icon><TrendCharts /></el-icon> {{ t('tagSuggest.trafficTags') }}</div>
            <div style="display:flex;flex-wrap:wrap;gap:4px">
              <span v-for="tag in g.detail.traffic" :key="'t-'+tag"
                class="cohere-tag cohere-tag-success suggested-tag"
                data-testid="suggested-tag"
                :title="hotTitle(g.platform, tag) || t('tagSuggest.applyTagHint')"
                style="font-size: var(--font-size-xs);padding:2px 6px;border-radius:4px"
                @click="$emit('apply-tag', tag)">
                {{ tag }}<sup v-if="hotHeat(g.platform, tag) != null" class="heat-badge">{{ hotHeat(g.platform, tag) }}</sup>
              </span>
            </div>
          </template>

          <!-- Fallback: single merged group (old structure) -->
          <template v-else>
            <div style="display:flex;flex-wrap:wrap;gap:4px">
              <span v-for="tag in g.tags" :key="tag"
                class="cohere-tag suggested-tag"
                :class="tag.startsWith('#') ? 'cohere-tag-success' : 'cohere-tag-info'"
                data-testid="suggested-tag"
                :title="t('tagSuggest.applyTagHint')"
                style="font-size: var(--font-size-xs);padding:2px 6px;border-radius:4px"
                @click="$emit('apply-tag', tag)">
                {{ tag }}
              </span>
            </div>
          </template>
        </div>

        <!-- Source / calibration status -->
        <div style="font-size: var(--font-size-xs);color:var(--muted);margin-top:6px;display:flex;flex-wrap:wrap;gap:6px;align-items:center">
          <template v-if="suggestions.source === 'llm'">
            <span>{{ t('tagSuggest.sourceAI') }}</span>
            <span :class="suggestions.calibrated ? 'src-ok' : 'src-warn'">
              {{ suggestions.calibrated ? t('tagSuggest.calibrated') : t('tagSuggest.notCalibrated') }}
            </span>
          </template>
          <template v-else-if="suggestions.source === 'extractor'">
            <span>{{ t('tagSuggest.sourceLocal') }}</span>
          </template>
          <template v-else>
            <span>{{ t('tagSuggest.aiNotConfigured') }}</span>
          </template>
          <span v-if="suggestions.fallback" class="src-warn">{{ t('tagSuggest.fallbackNotice') }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { EditPen, TrendCharts } from '@element-plus/icons-vue'
import { ref, computed, watch, onBeforeUnmount } from 'vue'
import { useI18n } from 'vue-i18n'
import { usePlatformStore } from '@/stores/platforms'
import { ElMessage } from 'element-plus'
import { intelligenceSuggestTags } from '@/api/publisher'

const props = defineProps({
  content: { type: String, required: true },
  // 发布目标联动（openspec optimize-publish-right-rail）：请求平台跟随用户勾选；
  // 空数组/未传时回退全量目录，保证未选平台时面板不出空态。
  platforms: { type: Array, default: () => [] },
})

defineEmits(['close', 'apply-tag'])

const { t } = useI18n()

const loading = ref(false)
const error = ref(null)
const suggestions = ref(null)
const platformStore = usePlatformStore()
platformStore.load()

// 全量建议平台目录：platforms prop 为空时的回退范围（保持既有行为）。
const FULL_SUGGESTION_PLATFORMS = ['zhihu', 'weibo', 'xiaohongshu', 'bilibili', 'toutiao']

const requestPlatforms = computed(() => {
  const list = Array.isArray(props.platforms)
    ? props.platforms.filter((p) => typeof p === 'string' && p)
    : []
  return list.length > 0 ? list : FULL_SUGGESTION_PLATFORMS
})

function platformLabel (key) {
  return platformStore.getLabel(key) || key
}

// Grouped view: prefer byPlatformDetail; fall back to single merged group (old structure)
const platformGroups = computed(() => {
  const s = suggestions.value
  if (!s || !s.byPlatform) return []
  const detail = s.byPlatformDetail || {}
  return Object.keys(s.byPlatform).map((p) => ({
    platform: p,
    detail: detail[p] || null,
    tags: s.byPlatform[p] || [],
  }))
})

function allTags (g) {
  return g.detail ? [...g.detail.content, ...g.detail.traffic] : g.tags
}

function hotHeat (platform, tag) {
  const mt = suggestions.value?.matchedTopics?.[platform]
  if (!mt) return null
  const m = mt.find((x) => x.tag === tag)
  return m ? m.heat : null
}

function hotTitle (platform, tag) {
  const heat = hotHeat(platform, tag)
  if (heat == null) return ''
  return t('tagSuggest.hotMatch', { tag, heat })
}

let debounceTimer = null
// R20 修复：组件卸载时清理 debounce timer
onBeforeUnmount(() => { if (debounceTimer) clearTimeout(debounceTimer) })

async function runAnalysis (content) {
  loading.value = true
  error.value = null
  try {
    const res = await intelligenceSuggestTags(content, {
      platforms: requestPlatforms.value,
    })
    const data = res?.code === 0 ? res.data : null
    if (data && data.keywords) {
      suggestions.value = data
    } else {
      suggestions.value = { keywords: [], relatedTerms: [], byPlatform: {} }
    }
  } catch {
    error.value = t('tagSuggest.analysisFailed')
    suggestions.value = null
  } finally {
    loading.value = false
  }
}

// 显式重试：用户点击错误行上的重试按钮，绕过防抖立即重新分析。
function retry () {
  const content = props.content
  if (!content || content.trim().length < 3) return
  runAnalysis(content)
}

// content 与 platforms 共用同一防抖：任一变化只重置计时器，避免请求风暴。
watch([() => props.content, () => props.platforms], ([newVal]) => {
  if (debounceTimer) clearTimeout(debounceTimer)
  if (!newVal || newVal.trim().length < 3) {
    suggestions.value = null
    error.value = null
    return
  }
  debounceTimer = setTimeout(() => runAnalysis(newVal), 800)
})

async function copyPlatformTags (platform, tags) {
  const text = tags.join(' ')
  try {
    await navigator.clipboard.writeText(text)
    ElMessage.success(t('tagSuggest.tagsCopied', { platform: platformLabel(platform) }))
  } catch {
    const ta = document.createElement('textarea')
    ta.value = text
    document.body.appendChild(ta)
    ta.select()
    document.execCommand('copy')
    document.body.removeChild(ta)
    ElMessage.success(t('tagSuggest.tagsCopied', { platform: platformLabel(platform) }))
  }
}
</script>

<style scoped>
@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}
.heat-badge {
  margin-left: 2px;
  font-size: var(--font-size-xs);
  color: var(--coral);
  vertical-align: super;
}
.src-ok { color: var(--success, #2e7d32); }
.src-warn { color: var(--coral); }
/* 空态收敛：错误提示一行呈现，重试按钮行内可达 */
.tag-error-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 6px 0;
  font-size: var(--font-size-sm);
  color: var(--coral);
}
.tag-retry-button { font-size: var(--font-size-xs); padding: 2px 8px; white-space: nowrap; }
/* 点击填入：建议标签可点击 */
.suggested-tag { cursor: pointer; }
.suggested-tag:hover { opacity: 0.8; outline: 1px dashed var(--coral); }
</style>

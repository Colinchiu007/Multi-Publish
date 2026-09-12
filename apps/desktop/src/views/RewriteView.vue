<template>
  <div class="rewrite-page">
    <div class="cohere-page-header">
      <div>
        <div class="page-title">{{ t('rewritePage.title') }}</div>
        <div class="page-subtitle">{{ t('rewritePage.subtitle') }}</div>
      </div>
    </div>

    <div class="cohere-content">
      <!-- 文本输入区 -->
      <div class="cohere-card rewrite-input-card">
        <div class="cohere-section-title">{{ t('rewritePage.inputSection') }}</div>
        <textarea
          v-model="content"
          class="rewrite-textarea"
          rows="8"
          :placeholder="t('rewritePage.inputPlaceholder')"
          :disabled="rewriting"
        ></textarea>
        <div class="rewrite-input-meta">
          <span class="char-count">{{ [...content].length }} {{ t('rewritePage.charCount') }}</span>
          <span v-if="contentError" class="content-error">{{ contentError }}</span>
        </div>
      </div>

      <!-- 配置选项 -->
      <div class="cohere-card rewrite-config-card">
        <div class="cohere-section-title">{{ t('rewritePage.configSection') }}</div>

        <!-- 结合爆款库 / 结合个人经历 -->
        <div class="config-checkboxes">
          <label class="config-checkbox" :class="{ disabled: rewriting }">
            <input
              type="checkbox"
              v-model="useViralLibrary"
              :disabled="rewriting"
              class="coral-check"
            />
            <span class="checkbox-label">
              <span class="checkbox-icon">🔥</span>
              <span>{{ t('rewritePage.useViralLibrary') }}</span>
            </span>
            <span class="checkbox-hint">{{ t('rewritePage.useViralLibraryHint') }}</span>
          </label>
          <label class="config-checkbox" :class="{ disabled: rewriting }">
            <input
              type="checkbox"
              v-model="usePersonalExperience"
              :disabled="rewriting"
              class="coral-check"
            />
            <span class="checkbox-label">
              <span class="checkbox-icon">📝</span>
              <span>{{ t('rewritePage.usePersonalExperience') }}</span>
            </span>
            <span class="checkbox-hint">{{ t('rewritePage.usePersonalExperienceHint') }}</span>
          </label>
        </div>

        <!-- 改写模式 -->
        <div class="config-row">
          <label class="cohere-form-label">{{ t('rewritePage.modeLabel') }}</label>
          <div class="mode-chips">
            <button
              v-for="m in rewriteModes"
              :key="m.value"
              :class="['mode-chip', { active: rewriteMode === m.value }]"
              :disabled="rewriting"
              @click="rewriteMode = m.value"
            >{{ m.label }}</button>
          </div>
        </div>

        <!-- 字数控制 -->
        <div class="config-row">
          <label class="cohere-form-label">{{ t('rewritePage.wordCountLabel') }}</label>
          <WordCountRangeInput
            v-model:min="wordCountMin"
            v-model:max="wordCountMax"
            :min-placeholder="t('rewritePage.wordCountMinPlaceholder')"
            :max-placeholder="t('rewritePage.wordCountMaxPlaceholder')"
            :unit="t('rewritePage.wordCountUnit')"
            :error="wordCountError"
            :disabled="rewriting"
          />
        </div>

        <!-- 目标平台 -->
        <div class="config-row">
          <label class="cohere-form-label">{{ t('rewritePage.platformLabel') }}</label>
          <select v-model="platform" class="cohere-input config-select" :disabled="rewriting">
            <option value="">{{ t('rewriteEngine.platformGeneral') }}</option>
            <option value="douyin">{{ t('rewriteEngine.platformDouyin') }}</option>
            <option value="xiaohongshu">{{ t('rewriteEngine.platformXiaohongshu') }}</option>
            <option value="wechat_mp">{{ t('rewriteEngine.platformWechatMp') }}</option>
            <option value="bilibili">{{ t('rewriteEngine.platformBilibili') }}</option>
            <option value="zhihu">{{ t('rewriteEngine.platformZhihu') }}</option>
          </select>
        </div>

        <!-- 策略选择（自动匹配默认 + 手动下拉，与 AiWriterPanel 行为一致） -->
        <RewriteStrategyPicker
          v-model:strategy-mode="strategyMode"
          v-model:strategy-id="rewriteStrategyId"
          :strategies="rewriteStrategies"
          :preview-name="previewStrategyName"
          :disabled="rewriting"
          :labels="{
            label: t('rewritePage.strategyLabel'),
            auto: t('rewritePage.strategyAuto'),
            manual: t('rewritePage.strategyManual'),
            preview: t('rewritePage.strategyPreview'),
            previewColon: t('rewritePage.strategyPreviewColon'),
            placeholder: t('rewritePage.strategySelectPlaceholder'),
          }"
        />

        <!-- 改写按钮 -->
        <button
          class="cohere-btn-primary rewrite-start-btn"
          :disabled="rewriting || !canStartRewrite"
          @click="startRewrite"
        >
          {{ rewriting ? t('rewritePage.rewritingBtn') : t('rewritePage.rewriteBtn') }}
        </button>
        <div v-if="rewriteError" class="rewrite-error" role="alert">{{ rewriteError }}</div>
      </div>

      <!-- 改写结果区 -->
      <div v-if="rewriteResult" class="cohere-card rewrite-result-card">
        <div class="cohere-section-title">{{ t('rewritePage.resultSection') }}</div>
        <div class="rewrite-result-meta" v-if="rewriteMeta">
          <span>{{ t('rewritePage.metaStrategy') }}：{{ rewriteMeta.strategyName }}</span>
          <span>{{ t('rewritePage.metaAiTaste') }}：{{ rewriteMeta.aiTastePct }}</span>
          <span>{{ t('rewritePage.metaLength', { original: rewriteMeta.originalLength, result: rewriteMeta.resultLength }) }}</span>
        </div>
        <textarea
          v-model="rewriteResult"
          class="rewrite-textarea result-textarea"
          rows="8"
        ></textarea>
        <div class="rewrite-result-actions">
          <button class="cohere-btn-secondary" @click="saveToDraft">
            {{ t('rewritePage.saveDraft') }}
          </button>
          <button class="cohere-btn-primary" @click="goToPublish">
            {{ t('rewritePage.goPublish') }}
          </button>
        </div>
      </div>
    </div>

    <!-- 去发布弹窗 -->
    <PublishDestinationModal
      v-if="showPublishModal"
      :visible="showPublishModal"
      @close="showPublishModal = false"
      @publish-article="onPublishArticle"
      @publish-video="onPublishVideo"
    />
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { aiRewrite, aiListRewriteStrategies, aiGetRecommendedStrategies, draftSave, applyKnowledgeFeedback } from '@/api/publisher'
import { useNotify } from '@/composables/useNotify'
import { formatUserError } from '@/utils/user-facing-error'
import { useLoginGate } from '@/composables/useLoginGate'
import { useWordCountValidation } from '@/composables/useWordCountValidation'
import PublishDestinationModal from '@/components/PublishDestinationModal.vue'
import RewriteStrategyPicker from '@/components/RewriteStrategyPicker.vue'
import WordCountRangeInput from '@/components/WordCountRangeInput.vue'

const router = useRouter()
const route = useRoute()
const { t } = useI18n()
const { notifySuccess, notifyError } = useNotify()
const { ensureLogin } = useLoginGate()

// ── 状态 ──
const content = ref('')
const rewriting = ref(false)
const rewriteError = ref('')
const rewriteResult = ref('')
const rewriteMeta = ref(null)
// P2 隐式反馈：本次改写引用的知识条目（保存/发布=采纳 / 再次改写=弃用）
const rewriteKnowledgeRefs = ref([])
const contentError = ref('')

// 配置
const useViralLibrary = ref(true)
const usePersonalExperience = ref(false)
const rewriteMode = ref('create')
const platform = ref('')
// 字数区间控制（默认 800-2000）
const wordCountMin = ref(800)
const wordCountMax = ref(2000)

// 策略选择（默认自动匹配，与 AiWriterPanel 一致）
const strategyMode = ref('auto')
const rewriteStrategyId = ref('')
const rewriteStrategies = ref([])
const previewStrategyName = ref('--')

// 弹窗
const showPublishModal = ref(false)
let savedDraftId = null

// ── 选项 ──
const rewriteModes = [
  { value: 'imitate', label: t('rewritePage.modeImitate') },
  { value: 'expand', label: t('rewritePage.modeExpand') },
  { value: 'create', label: t('rewritePage.modeCreate') },
]

// ── 策略列表与匹配预览 ──
/** 加载启用策略（内置 + 远程下发）；失败静默降级为空列表，改写仍可用自动匹配 */
async function loadRewriteStrategies() {
  try {
    const res = await aiListRewriteStrategies()
    if (res && res.code === 0) rewriteStrategies.value = res.data || []
  } catch (_e) {
    // 策略列表为空时改写仍可用（走自动匹配）
  }
}

/** 预览请求序列号：快速切换平台时只保留最后一次请求的结果（竞态防护） */
let previewSeq = 0

/** 刷新自动匹配预览：取推荐列表第一名；失败降级为 --，不阻塞改写 */
async function refreshStrategyPreview() {
  if (rewriting.value) return
  const seq = ++previewSeq
  try {
    const res = await aiGetRecommendedStrategies({ platform: platform.value || undefined })
    if (seq !== previewSeq) return // 已有更新的请求，丢弃本次过期结果
    if (res && res.code === 0 && Array.isArray(res.data) && res.data.length > 0) {
      previewStrategyName.value = res.data[0].name || '--'
    } else {
      previewStrategyName.value = '--'
    }
  } catch (_e) {
    if (seq === previewSeq) previewStrategyName.value = '--'
  }
}

// 目标平台变化 → 预览随新 userSettings 刷新（refreshStrategyPreview 内含竞态守卫）
watch(platform, refreshStrategyPreview)

// ── 热门选题带入：/rewrite?topic=xxx → 填入输入框 + 选题创作模式 + 自动开始 ──
onMounted(() => {
  void loadRewriteStrategies()
  void refreshStrategyPreview()
  const topic = typeof route.query.topic === 'string' ? route.query.topic.trim() : ''
  if (!topic) return
  rewriteMode.value = 'create'
  // 选题带入：不再有 ≥20 字符限制（2026-09-12 移除最少字数）
  content.value = topic
  // 等登录门禁与 DOM 就绪后自动触发（nextTick 保证 textarea 绑定完成）
  Promise.resolve().then(() => startRewrite())
})

// ── 计算 ──
const canStartRewrite = computed(() => {
  return content.value.trim().length > 0 && !wordCountError.value
})

// ── 字数区间校验（共享 composable，与 Collection 页一致）──
const { error: wordCountError } = useWordCountValidation(wordCountMin, wordCountMax, (key) => t('rewritePage.' + key))

// ── 方法 ──

/** 开始改写 */
async function startRewrite() {
  const trimmed = content.value.trim()
  if (!trimmed) {
    contentError.value = t('rewritePage.contentEmpty')
    return
  }
  if (wordCountError.value) return
  contentError.value = ''
  if (!(await ensureLogin({ message: t('rewritePage.needLogin') }))) return

  rewriting.value = true
  rewriteError.value = ''
  // P2 隐式反馈：上次改写结果未被保存/发布就再次改写 → 弃用上次引用的知识条目
  if (rewriteResult.value && rewriteKnowledgeRefs.value.length > 0) {
    sendKnowledgeFeedback('rejected', rewriteKnowledgeRefs.value)
  }
  rewriteResult.value = ''
  rewriteMeta.value = null
  rewriteKnowledgeRefs.value = []

  try {
    const params = {
      mode: rewriteMode.value,
      content: trimmed,
      userSettings: {
        platform: platform.value || undefined,
        wordCountRange: {
          min: Number(wordCountMin.value),
          max: Number(wordCountMax.value),
        },
        knowledgeOptions: {
          useViralLibrary: useViralLibrary.value,
          usePersonalKnowledge: usePersonalExperience.value,
        },
      },
      // 策略传参契约（与 AiWriterPanel 一致）：手动=所选 id（未选 null），自动=null 走引擎匹配
      strategyId: strategyMode.value === 'manual' ? (rewriteStrategyId.value || null) : null,
    }

    const res = await aiRewrite(params)
    if (res && res.code === 0 && res.data && res.data.success) {
      const data = res.data
      rewriteResult.value = data.result || ''
      // P2 隐式反馈：记录本次改写引用的知识条目
      rewriteKnowledgeRefs.value = data.knowledgeRefs || []
      rewriteMeta.value = {
        strategyName: data.strategy?.name || '',
        aiTastePct: data.metadata?.aiTasteLevel != null ? (data.metadata.aiTasteLevel * 100).toFixed(0) + '%' : 'N/A',
        originalLength: data.metadata?.originalLength || 0,
        resultLength: data.metadata?.resultLength || 0,
      }
      if (data.warnings && data.warnings.length > 0) {
        rewriteError.value = data.warnings.join('；')
      }
      notifySuccess('collection.rewriteSuccess')
    } else if (res && res.code === 0 && res.data && res.data.error) {
      rewriteError.value = res.data.error
      notifyError('collection.rewriteFailed', { message: res.data.error })
    } else {
      rewriteError.value = (res && res.message) || t('collection.rewriteFailed')
      notifyError('collection.rewriteFailed', { message: rewriteError.value || t('collection.rewriteFailed') })
    }
  } catch (e) {
    rewriteError.value = formatUserError(e, { fallback: t('collection.rewriteFailed') }).message
    notifyError('collection.rewriteFailed', { message: rewriteError.value || t('collection.rewriteFailed') })
  } finally {
    rewriting.value = false
    // 改写结束后刷新预览：改写期间平台可能已变化（rewriting 中不刷新），且引擎
    // 的用户历史（userHistory）在每次改写后更新，会影响下次自动匹配的推荐结果
    refreshStrategyPreview()
  }
}

/** 存入草稿 */
async function saveToDraft() {
  if (!rewriteResult.value.trim()) return
  try {
    const saved = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      title: content.value.trim().slice(0, 64) || t('rewritePage.title'),
      content: rewriteResult.value,
      source: 'rewrite',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    const res = await draftSave(saved)
    if (res && res.code === 0) {
      savedDraftId = saved.id
      // P2 隐式反馈：保存草稿 = 采纳被引用的知识条目
      sendKnowledgeFeedback('adopted', rewriteKnowledgeRefs.value)
      notifySuccess('collection.draftCreated')
    } else {
      notifyError('collection.rewriteFailed', { message: (res && res.message) || t('rewritePage.draftSaveFailed') })
    }
  } catch (e) {
    notifyError('collection.rewriteFailed', { message: formatUserError(e, { fallback: t('rewritePage.draftSaveFailed') }).message })
  }
}

/** P2 隐式反馈：把用户对改写结果的自然操作转换为知识反馈（静默失败不影响主流程） */
function sendKnowledgeFeedback(action, refs) {
  if (!refs || refs.length === 0) return
  try {
    applyKnowledgeFeedback(action, refs)
  } catch (_e) {
    // 知识反馈失败不影响改写主流程
  }
}

/** 去发布 — 先存草稿再弹窗 */
async function goToPublish() {
  if (!rewriteResult.value.trim()) return
  if (!savedDraftId) {
    await saveToDraft()
  }
  if (savedDraftId) {
    showPublishModal.value = true
  }
}

/** 弹窗回调：直接发图文 */
function onPublishArticle() {
  showPublishModal.value = false
  if (savedDraftId) {
    router.push('/publish?draft=' + savedDraftId)
  }
}

/** 弹窗回调：生成视频 */
function onPublishVideo(pipelineId) {
  showPublishModal.value = false
  if (!savedDraftId) return
  const query = { draft: savedDraftId }
  if (pipelineId) query.pipeline = pipelineId
  router.push({ path: '/create', query })
}
</script>

<style scoped>
.rewrite-input-card, .rewrite-config-card, .rewrite-result-card {
  margin-bottom: var(--space-lg);
  padding: var(--space-md);
}

.config-checkboxes {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-bottom: var(--space-md);
}
.config-checkbox {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 10px 14px;
  border: 1px solid var(--border);
  border-radius: 8px;
  cursor: pointer;
  transition: border-color 0.15s, background 0.15s;
}
.config-checkbox:hover { border-color: var(--coral); background: var(--coral-bg, #fef2f2); }
.config-checkbox.disabled { opacity: 0.6; cursor: default; }
.config-checkbox.disabled:hover { border-color: var(--border); background: transparent; }
.checkbox-label {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 14px;
  font-weight: 500;
  color: var(--text-primary);
}
.checkbox-icon { font-size: 16px; }
.checkbox-hint {
  font-size: 12px;
  color: var(--muted);
  margin-left: 24px;
}

.mode-chips {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
.mode-chip {
  padding: 6px 14px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--surface);
  cursor: pointer;
  font-size: 13px;
  color: var(--text-primary);
  transition: all 0.15s;
}
.mode-chip:hover { border-color: var(--coral); }
.mode-chip.active {
  border-color: var(--coral);
  background: var(--coral-bg, #fef2f2);
  color: var(--coral);
  font-weight: 500;
}
.mode-chip:disabled { opacity: 0.5; cursor: default; }

.config-select {
  max-width: 280px;
}

</style>


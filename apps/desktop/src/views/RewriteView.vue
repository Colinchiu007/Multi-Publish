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
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { aiRewrite, draftSave } from '@/api/publisher'
import { useNotify } from '@/composables/useNotify'
import { formatUserError } from '@/utils/user-facing-error'
import { useLoginGate } from '@/composables/useLoginGate'
import PublishDestinationModal from '@/components/PublishDestinationModal.vue'

const router = useRouter()
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

// 弹窗
const showPublishModal = ref(false)
let savedDraftId = null

// ── 选项 ──
const rewriteModes = [
  { value: 'imitate', label: t('rewritePage.modeImitate') },
  { value: 'expand', label: t('rewritePage.modeExpand') },
  { value: 'create', label: t('rewritePage.modeCreate') },
]

// ── 计算 ──
const canStartRewrite = computed(() => {
  return content.value.trim().length >= 20
})

// ── 方法 ──

/** 开始改写 */
async function startRewrite() {
  const trimmed = content.value.trim()
  if (trimmed.length < 20) {
    contentError.value = t('rewritePage.tooShort')
    return
  }
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
        knowledgeOptions: {
          useViralLibrary: useViralLibrary.value,
          usePersonalKnowledge: usePersonalExperience.value,
        },
      },
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
    if (window.electronAPI && typeof window.electronAPI.applyKnowledgeFeedback === 'function') {
      window.electronAPI.applyKnowledgeFeedback(action, refs)
    }
  } catch (e) {
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
.rewrite-page {
  max-width: 900px;
  margin: 0 auto;
}

.rewrite-textarea {
  width: 100%;
  padding: 12px 16px;
  border: 1px solid var(--border);
  border-radius: 10px;
  font-size: 14px;
  line-height: 1.7;
  resize: vertical;
  outline: none;
  box-sizing: border-box;
  font-family: inherit;
  transition: border-color 0.15s;
}
.rewrite-textarea:focus { border-color: var(--coral); }
.rewrite-textarea:disabled { background: var(--soft-stone); opacity: 0.7; }

.rewrite-input-meta {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 6px;
}
.char-count { font-size: 12px; color: var(--muted); }
.content-error { font-size: 12px; color: var(--danger); }

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

.config-row {
  margin-bottom: var(--space-sm);
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

.rewrite-start-btn {
  margin-top: var(--space-sm);
  padding: 10px 28px;
  font-size: 15px;
}
.rewrite-start-btn:disabled { opacity: 0.5; cursor: default; }

.rewrite-error {
  margin-top: 8px;
  padding: 8px 12px;
  background: #fff3f3;
  border-radius: 6px;
  font-size: 12px;
  color: #d32f2f;
}

.rewrite-result-meta {
  display: flex;
  gap: 16px;
  flex-wrap: wrap;
  font-size: 12px;
  color: var(--muted);
  margin-bottom: var(--space-sm);
  padding: 6px 10px;
  background: var(--soft-stone);
  border-radius: 6px;
}
.rewrite-result-meta span {
  white-space: nowrap;
}

.result-textarea {
  min-height: 200px;
}

.rewrite-result-actions {
  display: flex;
  gap: 10px;
  margin-top: var(--space-sm);
}

.cohere-btn-primary {
  padding: 8px 20px;
  background: var(--coral, #f56c6c);
  color: #fff;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  font-size: 14px;
  font-weight: 500;
  transition: opacity 0.15s;
}
.cohere-btn-primary:disabled { opacity: 0.5; cursor: default; }

.cohere-btn-secondary {
  padding: 8px 20px;
  background: var(--surface, #fff);
  color: var(--text-primary);
  border: 1px solid var(--border);
  border-radius: 8px;
  cursor: pointer;
  font-size: 14px;
}
.cohere-btn-secondary:hover { border-color: var(--coral); }
</style>


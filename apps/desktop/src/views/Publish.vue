<template>
  <div>
    <div class="cohere-page-header">
      <div style="display:flex;align-items:center;gap:var(--space-md);width:100%">
        <div style="flex:1">
          <div class="page-title">一键发布</div>
          <div class="page-subtitle">{{ batchMode ? '批量编辑多篇文章，各平台独立发布' : '编辑内容并发布到多个平台' }}</div>
        </div>
        <label class="cohere-toggle" style="cursor:pointer;user-select:none;display:flex;align-items:center;gap:8px;font-size:13px;color:var(--muted)">
          <input type="checkbox" v-model="batchMode" style="accent-color:var(--coral)" @change="checkBatchAccess" />
          <span>批量模式</span>
        </label>
      </div>
    </div>

    <!-- 批量模式：文章列表 -->
    <template v-if="batchMode">
      <div class="cohere-content" style="display:flex;flex-direction:column;gap:var(--space-md)">
        <div v-for="(a, idx) in articles" :key="a._key" class="cohere-card" style="cursor:default;position:relative">
          <!-- 文章编号 + 删除 -->
          <div style="display:flex;align-items:center;gap:var(--space-sm);margin-bottom:var(--space-md)">
            <span class="cohere-tag cohere-tag-info">#{{ idx + 1 }}</span>
            <span v-if="a.publishTime" class="cohere-tag cohere-tag-warning">⏰ 定时</span>
            <div style="flex:1"></div>
            <UiButton variant="ghost" size="sm" @click="duplicateArticle(idx)" title="复制">📋</UiButton>
            <UiButton variant="ghost" size="sm" @click="removeArticle(idx)" v-if="articles.length > 1" title="删除" style="color:var(--coral)">✕</UiButton>
          </div>

          <!-- 文章编辑 -->
          <div class="cohere-form">
            <div class="cohere-form-item">
              <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">
                <label class="cohere-form-label" style="margin-bottom:0">标题</label>
                <button class="cohere-btn-ghost" @click="showTemplatePicker = true; templateTargetIdx = idx" style="font-size:11px;padding:2px 8px;border:none;background:none;cursor:pointer;color:var(--coral)">
                  📝 模板
                </button>
              </div>
              <UiInput v-model="a.title" placeholder="请输入文章标题" />
            </div>
            <div class="cohere-form-item">
              <label class="cohere-form-label">正文</label>
              <UiInput type="textarea" v-model="a.content" placeholder="请输入正文" :rows="5" />
            </div>
            <div class="cohere-form-item">
              <label class="cohere-form-label">发布目标</label>
              <div class="batch-platform-targets">
                <label v-for="p in platforms" :key="p.id" style="display:flex;align-items:center;gap:4px;cursor:pointer;font-size:13px">
                  <input type="checkbox" :value="p.id" v-model="a.platforms" style="accent-color:var(--coral)" />
                  {{ p.label }}
                </label>
                <template v-for="p in platforms" :key="p.id + '-accounts'">
                  <div v-if="a.platforms.includes(p.id) && getAccounts(p.id).length > 0" class="batch-account-targets">
                    <span class="batch-account-label">{{ p.label }}账号</span>
                    <label v-for="account in getAccounts(p.id)" :key="account.id" class="batch-account-option">
                      <input
                        type="checkbox"
                        :checked="isBatchAccountSelected(a, p.id, account.id)"
                        @change="toggleBatchAccount(a, p.id, account.id)"
                      />
                      <span>{{ account.name || account.id?.slice(0, 8) }}</span>
                    </label>
                  </div>
                </template>
              </div>
            </div>
            <div class="cohere-form-item">
              <label class="cohere-form-label">定时发布</label>
              <UiInput type="datetime-local" v-model="a.publishTime" style="max-width:260px" />
              <span style="font-size:12px;color:var(--muted);margin-left:8px">留空 = 立即发布</span>
            </div>
          </div>
        </div>

        <!-- 模板面板 -->
        <div v-if="showTemplatePicker && templateTargetIdx >= 0" style="margin-bottom:var(--space-md)">
          <TemplatePicker @close="showTemplatePicker = false" @apply="applyTemplate" />
        </div>

        <!-- 操作 -->
        <div style="display:flex;gap:var(--space-sm)">
          <UiButton variant="secondary" @click="addArticle">＋ 添加文章</UiButton>
          <div style="flex:1"></div>
          <UiButton @click="handleBatchPublish" :disabled="batchPublishing || articles.length === 0">
            {{ batchPublishing ? '发布中...' : `🚀 批量发布 (${totalPlatformTasks} 个任务)` }}
          </UiButton>
        </div>

        <!-- 进度 -->
        <div v-if="batchProgress.length > 0" class="cohere-card" style="cursor:default">
          <div style="font-weight:600;font-size:14px;margin-bottom:var(--space-sm)">批量发布进度</div>
          <div style="display:flex;gap:var(--space-sm);margin-bottom:var(--space-sm)">
            <span class="cohere-tag cohere-tag-success">✅ {{ batchDone }} 完成</span>
            <span class="cohere-tag cohere-tag-danger">❌ {{ batchFail }} 失败</span>
            <UiButton
              v-if="failedBatchTasks.length > 0"
              variant="secondary"
              size="sm"
              :disabled="retryingFailed || batchPublishing"
              title="重新发布失败任务"
              @click="retryFailedBatch"
            >
              <Refresh class="batch-retry-icon" />
              {{ retryingFailed ? '重新提交中...' : `重新发布失败任务 (${failedBatchTasks.length})` }}
            </UiButton>
          </div>
          <ul class="cohere-timeline">
            <li v-for="item in batchProgress" :key="item.time + item.text" class="cohere-timeline-item" :class="item.type">
              <span class="tl-time">{{ item.time }}</span>
              <span class="tl-text">{{ item.text }}</span>
            </li>
          </ul>
        </div>
      </div>
    </template>

    <!-- 非批量模式：原有界面 -->
    <template v-else>
      <div class="cohere-content" style="display:flex;gap:var(--space-xl)">
        <div style="flex:2;min-width:0">
          <div class="cohere-card" style="cursor:default">
            <div class="cohere-form">
              <div class="cohere-form-item">
                <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">
                  <label class="cohere-form-label" style="margin-bottom:0">标题</label>
                  <button class="cohere-btn-ghost" @click="showTemplatePicker = !showTemplatePicker; templateTargetIdx = -1" style="font-size:11px;padding:2px 8px;border:none;background:none;cursor:pointer;color:var(--coral)">
                    {{ showTemplatePicker ? '✕ 关闭' : '📝 模板' }}
                  </button>
                  <button
                    type="button"
                    class="cohere-btn-ghost"
                    data-testid="open-ai-writer"
                    aria-controls="ai-writer-panel"
                    :aria-expanded="showAiWriter"
                    @click="showAiWriter = !showAiWriter"
                    style="font-size:11px;padding:2px 8px;border:none;background:none;cursor:pointer;color:var(--coral)"
                  >
                    {{ showAiWriter ? '✕ 关闭' : '🤖 AI' }}
                  </button>
                </div>
                <UiInput v-model="article.title" placeholder="请输入文章标题" />
              </div>
              <div v-if="showTemplatePicker && templateTargetIdx < 0" style="margin-bottom:var(--space-md)">
                <TemplatePicker @close="showTemplatePicker = false" @apply="applyTemplate" />
              </div>
              <div v-if="showAiWriter && templateTargetIdx < 0" style="margin-bottom:var(--space-md)">
                <AiWriterPanel
                  :sourceContent="article.content"
                  @close="showAiWriter = false"
                  @apply-title="article.title = $event; showAiWriter = false"
                  @apply-content="article.content = $event + '\n'; showAiWriter = false"
                />
              </div>
              <div class="cohere-form-item">
                <label class="cohere-form-label">作者</label>
                <UiInput v-model="article.author" placeholder="作者名称（选填）" style="max-width:300px" />
              </div>
              <div class="cohere-form-item">
                <label class="cohere-form-label">正文</label>
                <ArticleEditor v-model="article.content" />
              </div>
              <div class="cohere-form-item" v-if="hasVideoPlatforms">
                <label class="cohere-form-label">视频文件</label>
                <el-upload drag :auto-upload="false" :limit="1" accept="video/*" :on-change="(file) => { article.video_path = (file.raw && (file.raw.path || file.raw.name)) || file.name || '' }">
                  <el-icon class="el-icon--upload"><upload-filled /></el-icon>
                  <div class="el-upload__text">拖拽视频文件到这里，或 <em>点击选择</em></div>
                  <template #tip><div class="el-upload__tip">支持 mp4/mov/avi，最大 500MB</div></template>
                </el-upload>
              </div>
              <div class="cohere-form-item">
                <label class="cohere-form-label">封面图 URL</label>
                <UiInput v-model="article.cover_url" placeholder="封面图片链接（选填）" />
              </div>
              <div class="cohere-form-item">
                <label class="cohere-form-label">定时发布</label>
                <UiInput type="datetime-local" v-model="article.publishTime" style="max-width:260px" />
                <span style="font-size:12px;color:var(--muted);margin-left:8px">留空 = 立即发布</span>
              </div>
              <div class="cohere-form-item">
                <button class="publish-section-toggle" type="button" @click="showDiffPanel = !showDiffPanel">
                  <span>平台差异化内容</span>
                  <span class="publish-section-toggle__state">{{ showDiffPanel ? '收起' : '展开' }}</span>
                </button>
                <PlatformOverridePanel
                  v-if="showDiffPanel"
                  :platforms="selectedOverridePlatforms"
                  :model-value="diffEdits"
                  @update:model-value="replaceDiffEdits"
                />
              </div>
            </div>
          </div>
        </div>
        <div style="flex:1;min-width:280px">
          <!-- 智能标签建议 -->
          <TagSuggester v-if="showTagPanel && combinedContent.length > 3" :content="combinedContent" style="margin-bottom:var(--space-md)" @close="showTagPanel = false" />
          <div v-if="!showTagPanel && combinedContent.length > 3" style="margin-bottom:var(--space-md);text-align:center">
            <UiButton variant="ghost" size="sm" @click="showTagPanel = true"># 显示标签建议</UiButton>
          </div>

          <!-- 最佳发布时间 -->
          <OptimalTimeTip v-if="article.title.length > 2" :keyword="article.title" style="margin-bottom:var(--space-md)" />

          <!-- 标题助手 -->
          <TitleAssistantPanel :title="article.title" :visible="showTitlePanel" @close="showTitlePanel = false" style="margin-bottom:var(--space-md)" />
          <div v-if="!showTitlePanel && article.title.length > 5" style="margin-bottom:var(--space-md);text-align:center">
            <UiButton variant="ghost" size="sm" @click="showTitlePanel = true">📊 标题参考</UiButton>
          </div>

          <div class="cohere-card" style="cursor:default">
            <div class="cohere-form" style="gap:var(--space-md)">
              <div class="cohere-form-label">发布目标</div>
              <PublishTargetSelector
                :groups="groupedPlatforms"
                :selected-platforms="selectedPlatforms"
                :selected-accounts="selectedAccounts"
                :disabled="publishing"
                @toggle-platform="togglePlatform"
                @toggle-account="toggleAccount"
              />
              <div class="cohere-divider"></div>
              <UiButton variant="secondary" style="width:100%;justify-content:center;margin-bottom:8px" @click="saveDraft" :disabled="publishing">💾 保存草稿</UiButton>
              <UiButton variant="ghost" size="sm" style="width:100%;justify-content:center;margin-bottom:8px" @click="showDraftList = true; loadDrafts()">📋 草稿箱</UiButton>
              <UiButton style="width:100%;justify-content:center" :disabled="selectedPlatforms.length === 0 || publishing" @click="handlePublish">
                {{ publishing ? '发布中...' : '🚀 一键发布' }}
              </UiButton>
              <UiButton
                v-if="activeTaskIds.length > 0 || activeScheduleIds.length > 0"
                variant="danger"
                style="width:100%;justify-content:center;margin-top:8px"
                @click="cancelPublish"
              >
                取消任务
              </UiButton>
            </div>
          </div>
          <div v-if="progress.length > 0" class="cohere-card" style="margin-top:16px;cursor:default">
            <ul class="cohere-timeline">
              <li v-for="item in progress" :key="item.time + item.text" class="cohere-timeline-item" :class="item.type">
                <span class="tl-time">{{ item.time }}</span>
                <span class="tl-text">{{ item.text }}</span>
              </li>
            </ul>
          </div>

          <!-- 草稿箱面板 -->
          <div v-if="showDraftList" class="cohere-card" style="margin-top:16px;cursor:default">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">
              <div style="font-weight:600;font-size:14px"> 草稿箱</div>
              <button @click="showDraftList = false" style="background:none;border:none;cursor:pointer;font-size:16px;color:var(--muted)">✕</button>
            </div>
            <div v-if="drafts.length === 0" style="text-align:center;padding:20px;color:var(--muted)">暂无草稿</div>
            <div v-else class="draft-list">
              <div v-for="d in drafts" :key="d.id" class="draft-item">
                <div class="draft-info">
                  <div class="draft-title">{{ d.title || '无标题' }}</div>
                  <div class="draft-meta">
                    <span class="draft-time">{{ d.updatedAt ? new Date(d.updatedAt).toLocaleString('zh-CN') : '' }}</span>
                    <span v-if="d.platforms && d.platforms.length" class="cohere-tag cohere-tag-info">{{ d.platforms.length }} 个平台</span>
                  </div>
                </div>
                <div style="display:flex;gap:4px">
                  <UiButton variant="ghost" size="sm" @click="loadDraft(d.id)">加载</UiButton>
                  <UiButton variant="ghost" size="sm" @click="removeDraft(d.id)" style="color:var(--coral)">删除</UiButton>
                </div>
              </div>
            </div>
          </div>
          <div v-if="result" class="cohere-card" style="margin-top:16px;cursor:default">
            <div :style="{ display:'flex', gap:'8px', alignItems:'center' }">
              <span v-if="result.success" class="cohere-tag cohere-tag-success">✓ 发布成功</span>
              <span v-else class="cohere-tag cohere-tag-danger">✗ 发布失败</span>
              <span style="font-size:13px;color:var(--muted)">{{ result.message }}</span>
            </div>
            <UiButton
              v-if="!result.success && !result.cancelled"
              variant="secondary"
              size="sm"
              style="margin-top:12px"
              @click="retryPublish"
            >
              重试发布
            </UiButton>
            <div v-if="result.url" style="margin-top:12px;display:flex;align-items:center;gap:8px">
              <a :href="result.url" target="_blank" style="font-size:13px;color:var(--action-blue);text-decoration:none">查看文章 →</a>
              <button @click="copyUrl(result.url)" style="background:none;border:1px solid var(--border,#e0e0e0);border-radius:4px;padding:2px 8px;font-size:12px;cursor:pointer;color:var(--muted,#999);transition:all .2s" :style="copied ? { background:'var(--cohere-green,#67c23a)', color:'var(--surface)', borderColor:'var(--cohere-green,#67c23a)' } : {}">
                {{ copied ? '✓ 已复制' : '复制链接' }}
              </button>
            </div>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup>
import UiButton from "../components/UiButton.vue";
import UiInput from "../components/UiInput.vue";
import { ref, reactive, computed, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { usePlatformStore } from '@/stores/platforms'
import { useAccountStore } from '@/stores/accounts'
import { Refresh, UploadFilled } from '@element-plus/icons-vue'
import TagSuggester from '@/components/TagSuggester.vue'
import OptimalTimeTip from '@/components/OptimalTimeTip.vue'
import TitleAssistantPanel from '@/components/TitleAssistantPanel.vue'
import ArticleEditor from '@/components/ArticleEditor.vue'
import TemplatePicker from '@/components/TemplatePicker.vue'
// eslint-disable-next-line no-unused-vars
import { useTemplateStore } from '@/stores/templates'
import { useLicenseStore } from '@/stores/license'
// eslint-disable-next-line no-unused-vars
import UpgradeModal from '@/components/UpgradeModal.vue'
import AiWriterPanel from '@/components/AiWriterPanel.vue'
import { usePlatformSelection } from '@/composables/usePlatformSelection'
import { usePublishFlow } from '@/composables/usePublishFlow'
import { useBatchPublish } from '@/composables/useBatchPublish'
import { usePublishDrafts } from '@/composables/usePublishDrafts'
import { getPlatformContentLimit } from '@/features/publish/publish-contract'
import PlatformOverridePanel from '@/features/publish/components/PlatformOverridePanel.vue'
import PublishTargetSelector from '@/features/publish/components/PublishTargetSelector.vue'
import { usePublishPlatformCatalog } from '@/features/publish/usePublishPlatformCatalog'

const route = useRoute()

const showDiffPanel = ref(false)
const diffEdits = reactive({})

function replaceDiffEdits (next) {
  for (const key of Object.keys(diffEdits)) delete diffEdits[key]
  Object.assign(diffEdits, JSON.parse(JSON.stringify(next || {})))
}

const platformStore = usePlatformStore()
platformStore.load()
const accountStore = useAccountStore()
const licenseStore = useLicenseStore()
const { platforms, groupedPlatforms } = usePublishPlatformCatalog(platformStore, accountStore)

// ── 多账号加载 ──────────────────────────
async function loadAccounts () {
  await accountStore.load()
}

// ── 非批量模式（本地 UI 状态） ────────────
const article = reactive({ title: '', content: '', author: '', cover_url: '', video_path: '', publishTime: '' })
const showTagPanel = ref(true)
const showTitlePanel = ref(false)
const showAiWriter = ref(false)
const showUpgradeModal = ref(false)
const combinedContent = computed(() => article.title + ' ' + article.content)

// ── composables ──────────────────────────
const {
  selectedPlatforms,
  selectedAccounts,
  hasVideoPlatforms,
  togglePlatform,
  getAccounts,
  getDefaultAccount,
  getSelectedAccountIds,
  setSelectedAccountIds,
  toggleAccount,
  isAccountSelected,
  isAccountAvailable,
} = usePlatformSelection(accountStore)

const selectedOverridePlatforms = computed(() => {
  return platforms.value
    .filter(platform => selectedPlatforms.value.includes(platform.id))
    .map(platform => ({ ...platform, ...getPlatformContentLimit(platform.id) }))
})

const {
  showDraftList,
  drafts,
  loadingDrafts,
  applyDraft,
  loadDrafts,
  saveDraft,
  loadDraft,
  removeDraft,
} = usePublishDrafts({
  article,
  selectedPlatforms,
  selectedAccounts,
  platformOverrides: diffEdits,
})

const precheckEnabled = ref(false)

const {
  publishing,
  progress,
  result,
  copied,
  activeTaskIds,
  activeScheduleIds,
  handlePublish,
  cancelPublish,
  retryPublish,
  loadPrecheckPreference,
  addProgress,
  copyUrl,
} = usePublishFlow({
  article,
  selectedPlatforms,
  selectedAccounts,
  precheckEnabled,
  diffEdits,
  isAccountAvailable,
})

const {
  batchMode,
  batchPublishing,
  articles,
  batchProgress,
  failedBatchTasks,
  retryingFailed,
  templateTargetIdx,
  showTemplatePicker,
  batchDone,
  batchFail,
  totalPlatformTasks,
  addArticle,
  removeArticle,
  duplicateArticle,
  handleBatchPublish,
  retryFailedBatch,
  applyTemplate,
  checkBatchAccess,
  toggleBatchAccount,
  isBatchAccountSelected,
} = useBatchPublish({ article, licenseStore, isAccountAvailable })

// 草稿导入 — 从 Collection 页跳转时加载
onMounted(async () => {
  await loadAccounts()  // 加载多账号列表
  // 初始化默认选中账号
  for (const pid of selectedPlatforms.value) {
    const def = getDefaultAccount(pid)
    if (def) setSelectedAccountIds(pid, [def.id])
  }
  await loadPrecheckPreference()
  const draftId = route.query.draft
  if (!draftId) return

  await loadDrafts()
  await loadDraft(String(draftId))
})

// 暴露给测试（w.vm.xxx）和外部组件
defineExpose({
  article,
  batchMode,
  batchPublishing,
  articles,
  batchProgress,
  batchDone,
  batchFail,
  totalPlatformTasks,
  precheckEnabled,
  publishing,
  progress,
  result,
  copied,
  activeTaskIds,
  activeScheduleIds,
  selectedPlatforms,
  selectedAccounts,
  hasVideoPlatforms,
  showDiffPanel,
  diffEdits,
  selectedOverridePlatforms,
  showDraftList,
  drafts,
  loadingDrafts,
  showTemplatePicker,
  showAiWriter,
  showUpgradeModal,
  templateTargetIdx,
  addArticle,
  removeArticle,
  duplicateArticle,
  handleBatchPublish,
  handlePublish,
  applyTemplate,
  checkBatchAccess,
  togglePlatform,
  getAccounts,
  getDefaultAccount,
  getSelectedAccountIds,
  setSelectedAccountIds,
  toggleAccount,
  isAccountSelected,
  cancelPublish,
  retryPublish,
  copyUrl,
  addProgress,
  loadAccounts,
  applyDraft,
  loadDrafts,
  saveDraft,
  loadDraft,
  removeDraft,
  replaceDiffEdits,
})
</script>

<style scoped>
.publish-section-toggle {
  width: 100%;
  min-height: 36px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  border: 1px solid var(--border-light, #e0e0e0);
  border-radius: 6px;
  padding: 7px 10px;
  color: var(--text-primary, #202124);
  background: var(--surface, #fff);
  font-size: 13px;
  cursor: pointer;
}
.publish-section-toggle:hover { border-color: var(--action-blue, #1890ff); }
.publish-section-toggle__state { color: var(--action-blue, #1890ff); font-size: 11px; }

.batch-platform-targets {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 16px;
}
.batch-account-targets {
  flex: 1 0 100%;
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px 12px;
  padding: 8px 10px;
  border-left: 2px solid var(--border-light, #e8eaed);
  background: var(--soft-stone, #fafafa);
}
.batch-account-label { color: var(--muted, #73777d); font-size: 12px; font-weight: 600; }
.batch-account-option { display: inline-flex; align-items: center; gap: 5px; color: var(--text-primary, #202124); font-size: 12px; cursor: pointer; }
.batch-account-option input { accent-color: var(--coral, #f56c6c); }
.batch-retry-icon { width: 14px; height: 14px; margin-right: 4px; vertical-align: -2px; }

/* 草稿箱列表 */
.draft-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.draft-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 14px;
  border: 1px solid var(--border-light, #eee);
  border-radius: 8px;
  transition: background 0.15s;
}
.draft-item:hover { background: var(--soft-stone, #f8f8fa); }
.draft-info { flex: 1; min-width: 0; }
.draft-title {
  font-weight: 500;
  font-size: 14px;
  margin-bottom: 4px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.draft-meta {
  display: flex;
  align-items: center;
  gap: 8px;
}
.draft-time {
  font-size: 11px;
  color: var(--muted, #999);
}

@media (max-width: 1080px) {
  .cohere-content {
    flex-direction: column;
  }
}
</style>

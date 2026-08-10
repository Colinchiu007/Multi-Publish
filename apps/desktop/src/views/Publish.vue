<template>
  <div>
    <template v-if="publishTab === 'drafts'">
      <section class="publish-drafts-page" data-testid="publish-drafts-page" aria-labelledby="publish-drafts-title">
        <header class="publish-drafts-header">
          <div>
            <div id="publish-drafts-title" class="page-title">草稿箱</div>
            <div class="page-subtitle">查看、编辑或删除已保存的内容草稿</div>
          </div>
          <UiButton data-testid="publish-drafts-back" variant="secondary" @click="goToPublish">返回发布</UiButton>
        </header>

        <div v-if="loadingDrafts" class="publish-drafts-state" data-testid="publish-drafts-loading" role="status">正在加载草稿...</div>
        <div v-else-if="drafts.length === 0" class="publish-drafts-state" data-testid="publish-drafts-empty">
          <strong>暂无草稿</strong>
          <span>保存草稿后，可以从这里继续编辑。</span>
        </div>
        <div v-else class="publish-drafts-list">
          <article v-for="draft in drafts" :key="draft.id" class="publish-draft-card">
            <div class="publish-draft-info">
              <strong>{{ draft.title || '无标题' }}</strong>
              <span>{{ draft.updatedAt || draft.updated_at ? new Date(draft.updatedAt || draft.updated_at).toLocaleString('zh-CN') : '更新时间未知' }}</span>
              <span v-if="draft.platforms?.length" class="cohere-tag cohere-tag-info">{{ draft.platforms.length }} 个平台</span>
            </div>
            <div class="publish-draft-actions">
              <UiButton :data-testid="`edit-draft-${draft.id}`" variant="ghost" size="sm" @click="editDraft(draft)">继续编辑</UiButton>
              <UiButton :data-testid="`delete-draft-${draft.id}`" variant="ghost" size="sm" @click="removeDraft(draft.id)">删除</UiButton>
            </div>
          </article>
        </div>
      </section>
    </template>

    <template v-else>
    <div class="cohere-page-header">
      <div class="publish-header-row">
        <div class="flex-spacer">
          <div class="page-title">一键发布<span v-if="hasExplicitPublishType" class="publish-type-context"> · {{ publishTypeLabel }}</span></div>
          <div class="page-subtitle">{{ batchMode ? '批量编辑多篇文章，各平台独立发布' : '编辑内容并发布到多个平台' }}</div>
        </div>
        <label class="cohere-toggle batch-mode-toggle">
          <input data-testid="publish-batch-mode" type="checkbox" v-model="batchMode" class="coral-check" @change="checkBatchAccess" />
          <span>批量模式</span>
        </label>
      </div>
    </div>

    <!-- 批量模式：文章列表 -->
    <template v-if="batchMode">
      <div class="cohere-content batch-articles">
        <div v-for="(a, idx) in articles" :key="a._key" class="cohere-card cohere-card-static">
          <!-- 文章编号 + 删除 -->
          <div class="article-card-row">
            <span class="cohere-tag cohere-tag-info">#{{ idx + 1 }}</span>
            <span v-if="a.publishTime" class="cohere-tag cohere-tag-warning">⏰ 定时</span>
            <div class="flex-spacer"></div>
            <UiButton variant="ghost" size="sm" @click="duplicateArticle(idx)" title="复制">📋</UiButton>
            <UiButton variant="ghost" size="sm" @click="removeArticle(idx)" v-if="articles.length > 1" title="删除" class="coral-text">✕</UiButton>
          </div>

          <!-- 文章编辑 -->
          <div class="cohere-form">
            <div class="cohere-form-item">
              <div class="title-row">
                <label class="cohere-form-label no-margin-bottom">标题</label>
                <button class="cohere-btn-ghost template-pick-button" @click="showTemplatePicker = true; templateTargetIdx = idx">
                  📝 模板
                </button>
              </div>
              <UiInput v-model="a.title" placeholder="请输入文章标题" />
            </div>
            <div class="cohere-form-item">
              <label class="cohere-form-label">正文</label>
              <UiInput type="textarea" v-model="a.content" placeholder="请输入正文" :rows="5" />
            </div>
            <div class="cohere-form-item batch-metadata-grid">
              <div>
                <label class="cohere-form-label">标签</label>
                <UiInput v-model="a.tagsText" placeholder="多个标签用逗号分隔" />
              </div>
              <div>
                <label class="cohere-form-label">话题</label>
                <UiInput v-model="a.topicsText" placeholder="多个话题用逗号分隔" />
              </div>
              <div>
                <label class="cohere-form-label">@好友</label>
                <UiInput v-model="a.mentionsText" placeholder="输入昵称或 @昵称" />
              </div>
            </div>
            <div class="cohere-form-item">
              <label class="cohere-form-label">发布目标</label>
              <div class="batch-platform-targets">
                <label v-for="p in platforms" :key="p.id" class="batch-platform-option">
                  <input type="checkbox" :value="p.id" v-model="a.platforms" class="coral-check" />
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
              <UiInput type="datetime-local" v-model="a.publishTime" class="input-max-260" />
              <span class="publish-time-hint">留空 = 立即发布</span>
            </div>
          </div>
        </div>

        <!-- 模板面板 -->
        <div v-if="showTemplatePicker && templateTargetIdx >= 0" class="stack-gap">
          <TemplatePicker @close="showTemplatePicker = false" @apply="applyTemplate" />
        </div>

        <!-- 操作 -->
        <div class="row-actions">
          <UiButton variant="secondary" @click="addArticle">＋ 添加文章</UiButton>
          <div class="flex-spacer"></div>
          <UiButton data-testid="publish-batch-submit" @click="handleBatchPublish" :disabled="batchPublishing || articles.length === 0">
            {{ batchPublishing ? '发布中...' : `🚀 批量发布 (${totalPlatformTasks} 个任务)` }}
          </UiButton>
        </div>

        <!-- 进度 -->
        <div v-if="batchProgress.length > 0" class="cohere-card cohere-card-static">
          <div class="progress-title">批量发布进度</div>
          <div class="progress-toolbar">
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
      <div class="cohere-content cohere-content-split">
        <div class="flex-main">
          <div class="cohere-card cohere-card-static">
            <div class="cohere-form">
              <div class="cohere-form-item">
                <div class="title-row">
                  <label class="cohere-form-label no-margin-bottom">标题</label>
                  <button class="cohere-btn-ghost template-pick-button" @click="showTemplatePicker = !showTemplatePicker; templateTargetIdx = -1">
                    {{ showTemplatePicker ? '✕ 关闭' : '📝 模板' }}
                  </button>
                  <button
                    type="button"
                    class="cohere-btn-ghost template-pick-button"
                    data-testid="open-ai-writer"
                    aria-controls="ai-writer-panel"
                    :aria-expanded="showAiWriter"
                    @click="showAiWriter = !showAiWriter"
                  >
                    {{ showAiWriter ? '✕ 关闭' : '🤖 AI' }}
                  </button>
                </div>
                <UiInput data-testid="publish-title" v-model="article.title" placeholder="请输入文章标题" />
              </div>
              <div v-if="showTemplatePicker && templateTargetIdx < 0" class="stack-gap">
                <TemplatePicker @close="showTemplatePicker = false" @apply="applyTemplate" />
              </div>
              <div v-if="showAiWriter && templateTargetIdx < 0" class="stack-gap">
                <AiWriterPanel
                  :sourceContent="article.content"
                  @close="showAiWriter = false"
                  @apply-title="article.title = $event; showAiWriter = false"
                  @apply-content="article.content = $event + '\n'; showAiWriter = false"
                />
              </div>
              <div class="cohere-form-item">
                <label class="cohere-form-label">作者</label>
                <UiInput v-model="article.author" placeholder="作者名称（选填）" class="input-max-300" />
              </div>
              <div class="cohere-form-item">
                <label class="cohere-form-label">图片素材</label>
                <el-upload
                  v-model:file-list="imageFileList"
                  class="publish-media-upload"
                  :auto-upload="false"
                  :limit="9"
                  multiple
                  accept="image/*"
                  :on-change="handleImageFileChange"
                  :on-remove="handleImageFileRemove"
                >
                  <button type="button" class="media-upload-trigger">选择图片</button>
                  <template #tip><div class="el-upload__tip">支持 JPG/PNG/WebP，最多 9 张；图片会随发布任务传给平台适配器</div></template>
                </el-upload>
              </div>
              <div class="cohere-form-item">
                <label class="cohere-form-label">正文</label>
                <ArticleEditor data-testid="publish-editor" v-model="article.content" />
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
                <label class="cohere-form-label">封面图</label>
                <el-upload
                  v-model:file-list="coverFileList"
                  class="publish-media-upload"
                  :auto-upload="false"
                  :limit="1"
                  accept="image/*"
                  :on-change="handleCoverFileChange"
                  :on-remove="handleCoverFileRemove"
                >
                  <button type="button" class="media-upload-trigger">选择封面</button>
                  <template #tip><div class="el-upload__tip">可选择本地封面，也可以填写图片链接</div></template>
                </el-upload>
                <UiInput v-model="article.cover_url" placeholder="封面图片链接（选填）" />
              </div>
              <div class="cohere-form-item publish-metadata-grid">
                <div>
                  <label class="cohere-form-label" for="publish-tags">标签</label>
                  <UiInput id="publish-tags" v-model="tagsText" placeholder="多个标签用逗号分隔" />
                </div>
                <div>
                  <label class="cohere-form-label" for="publish-topics">话题</label>
                  <UiInput id="publish-topics" v-model="topicsText" placeholder="多个话题用逗号分隔" />
                </div>
                <div>
                  <label class="cohere-form-label" for="publish-mentions">@好友</label>
                  <UiInput id="publish-mentions" v-model="mentionsText" placeholder="输入昵称或 @昵称" />
                </div>
              </div>
              <div class="cohere-form-item">
                <label class="cohere-form-label">定时发布</label>
                <UiInput type="datetime-local" v-model="article.publishTime" class="input-max-260" />
                <span class="publish-time-hint">留空 = 立即发布</span>
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
        <div class="flex-side">
          <!-- 智能标签建议 -->
          <TagSuggester v-if="showTagPanel && combinedContent.length > 3" :content="combinedContent" class="stack-gap" @close="showTagPanel = false" />
          <div v-if="!showTagPanel && combinedContent.length > 3" class="stack-gap stack-center">
            <UiButton variant="ghost" size="sm" @click="showTagPanel = true"># 显示标签建议</UiButton>
          </div>

          <!-- 最佳发布时间 -->
          <OptimalTimeTip v-if="article.title.length > 2" :keyword="article.title" class="stack-gap" />

          <!-- 标题助手 -->
          <TitleAssistantPanel :title="article.title" :visible="showTitlePanel" @close="showTitlePanel = false" class="stack-gap" />
          <div v-if="!showTitlePanel && article.title.length > 5" class="stack-gap stack-center">
            <UiButton variant="ghost" size="sm" @click="showTitlePanel = true">📊 标题参考</UiButton>
          </div>

          <div class="cohere-card cohere-card-static">
            <div class="cohere-form cohere-form-gap">
              <div class="cohere-form-label">发布目标</div>
              <PublishTargetSelector
                data-testid="publish-target-selector"
                :groups="groupedPlatforms"
                :selected-platforms="selectedPlatforms"
                :selected-accounts="selectedAccounts"
                :disabled="publishing"
                @toggle-platform="togglePlatform"
                @toggle-account="toggleAccount"
              />
              <div class="cohere-divider"></div>
              <UiButton variant="secondary" class="side-button-block" @click="saveDraft" :disabled="publishing">💾 保存草稿</UiButton>
              <UiButton variant="ghost" size="sm" class="side-button-block" @click="showDraftList = true; loadDrafts()">📋 草稿箱</UiButton>
              <UiButton data-testid="publish-submit" class="side-button-full" :disabled="selectedPlatforms.length === 0 || publishing" @click="handlePublish">
                {{ publishing ? '发布中...' : '🚀 一键发布' }}
              </UiButton>
              <UiButton
                v-if="activeTaskIds.length > 0 || activeScheduleIds.length > 0"
                variant="danger"
                class="side-button-block side-button-block-top"
                @click="cancelPublish"
              >
                取消任务
              </UiButton>
            </div>
          </div>
          <div v-if="progress.length > 0" class="cohere-card cohere-card-offset" data-testid="publish-progress">
            <ul class="cohere-timeline">
              <li v-for="item in progress" :key="item.time + item.text" class="cohere-timeline-item" :class="item.type">
                <span class="tl-time">{{ item.time }}</span>
                <span class="tl-text">{{ item.text }}</span>
              </li>
            </ul>
          </div>

          <!-- 草稿箱面板 -->
          <div v-if="showDraftList" class="cohere-card cohere-card-offset">
            <div class="draft-list-header">
              <div class="draft-list-title"> 草稿箱</div>
              <button @click="showDraftList = false" class="plain-close-button">✕</button>
            </div>
            <div v-if="drafts.length === 0" class="draft-empty">暂无草稿</div>
            <div v-else class="draft-list">
              <div v-for="d in drafts" :key="d.id" class="draft-item">
                <div class="draft-info">
                  <div class="draft-title">{{ d.title || '无标题' }}</div>
                  <div class="draft-meta">
                    <span class="draft-time">{{ d.updatedAt ? new Date(d.updatedAt).toLocaleString('zh-CN') : '' }}</span>
                    <span v-if="d.platforms && d.platforms.length" class="cohere-tag cohere-tag-info">{{ d.platforms.length }} 个平台</span>
                  </div>
                </div>
                <div class="row-actions-compact">
                  <UiButton variant="ghost" size="sm" @click="loadDraft(d.id)">加载</UiButton>
                  <UiButton variant="ghost" size="sm" @click="removeDraft(d.id)" class="coral-text">删除</UiButton>
                </div>
              </div>
            </div>
          </div>
          <div v-if="result" class="cohere-card cohere-card-offset">
            <div class="result-header-row">
              <span v-if="result.success" class="cohere-tag cohere-tag-success">✓ 发布成功</span>
              <span v-else class="cohere-tag cohere-tag-danger">✗ 发布失败</span>
              <span class="muted-text">{{ result.message }}</span>
            </div>
            <UiButton
              v-if="!result.success && !result.cancelled"
              variant="secondary"
              size="sm"
              class="stack-gap-top"
              @click="retryPublish"
            >
              重试发布
            </UiButton>
            <div v-if="result.url" class="result-link-row">
              <a :href="result.url" target="_blank" class="result-link">查看文章 →</a>
              <button @click="copyUrl(result.url)" class="copy-url-button" :class="{ 'is-copied': copied }">
                {{ copied ? '✓ 已复制' : '复制链接' }}
              </button>
            </div>
          </div>
        </div>
      </div>
    </template>
    </template>
  </div>
</template>

<script setup>
import UiButton from "../components/UiButton.vue";
import UiInput from "../components/UiInput.vue";
import { ref, reactive, computed, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
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
import {
  getPlatformContentLimit,
  normalizePublishFile,
  normalizePublishFiles,
  normalizePublishMentions,
  normalizePublishStringList,
} from '@/features/publish/publish-contract'
import PlatformOverridePanel from '@/features/publish/components/PlatformOverridePanel.vue'
import PublishTargetSelector from '@/features/publish/components/PublishTargetSelector.vue'
import { usePublishPlatformCatalog } from '@/features/publish/usePublishPlatformCatalog'

const route = useRoute()
const router = useRouter()
const publishTab = computed(() => String(route.query?.tab || 'publish'))
const publishType = computed(() => {
  const value = String(route.query?.type || '').toLowerCase()
  return ['video', 'image', 'article', 'wechat'].includes(value) ? value : 'article'
})
const hasExplicitPublishType = computed(() => ['video', 'image', 'article', 'wechat'].includes(String(route.query?.type || '').toLowerCase()))
const publishTypeLabel = computed(() => ({
  video: '视频发布',
  image: '图文发布',
  article: '文章发布',
  wechat: '公众号',
}[publishType.value]))

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
  await accountStore.ensureLoaded()
}

// ── 非批量模式（本地 UI 状态） ────────────
const article = reactive({
  title: '',
  content: '',
  author: '',
  cover_url: '',
  cover_path: '',
  cover_file: null,
  video_path: '',
  images: [],
  image_files: [],
  tags: [],
  topics: [],
  mentions: [],
  publishTime: '',
})
const imageFileList = ref([])
const coverFileList = ref([])
const tagsText = computed({
  get: () => normalizePublishStringList(article.tags).join(', '),
  set: value => { article.tags = normalizePublishStringList(value) },
})
const topicsText = computed({
  get: () => normalizePublishStringList(article.topics).join(', '),
  set: value => { article.topics = normalizePublishStringList(value) },
})
const mentionsText = computed({
  get: () => normalizePublishMentions(article.mentions).map(item => item.text).join(', '),
  set: value => { article.mentions = normalizePublishMentions(value) },
})

function normalizeUploadFile (file) {
  const raw = file?.raw || file
  return normalizePublishFile({
    path: raw?.path || raw?.filePath || file?.path || raw?.name || file?.name,
    name: raw?.name || file?.name,
    type: raw?.type || file?.type,
    size: raw?.size || file?.size,
    lastModified: raw?.lastModified || file?.lastModified,
  })
}

function updateImageFiles (fileList) {
  const files = normalizePublishFiles(fileList).filter(file => file.path)
  article.image_files = files
  article.images = files.map(file => file.path)
  imageFileList.value = files
}

function handleImageFileChange (file, fileList) {
  updateImageFiles(Array.isArray(fileList) ? fileList : [file])
}

function handleImageFileRemove (_file, fileList) {
  updateImageFiles(Array.isArray(fileList) ? fileList : [])
}

function handleCoverFileChange (file) {
  const descriptor = normalizeUploadFile(file)
  article.cover_file = descriptor
  article.cover_path = descriptor?.path || ''
  coverFileList.value = descriptor ? [descriptor] : []
}

function handleCoverFileRemove () {
  article.cover_file = null
  article.cover_path = ''
  coverFileList.value = []
}

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
} = usePlatformSelection(accountStore, platformStore)

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
  publishType,
  publishTypeLabel,
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

watch(publishTab, async value => {
  if (value === 'drafts') {
    showDraftList.value = true
    await loadDrafts()
  } else if (showDraftList.value) {
    showDraftList.value = false
  }
})

watch(() => route.query.draft, async (draftId, previousDraftId) => {
  if (!draftId || draftId === previousDraftId) return
  await loadDrafts()
  await loadDraft(String(draftId))
})

function publishEditorQuery (extra = {}) {
  const query = { tab: 'publish', ...extra }
  if (route.query?.type) query.type = String(route.query.type)
  return query
}

function goToPublish () {
  return router.replace({ path: '/publish', query: publishEditorQuery() })
}

function editDraft (draft) {
  if (!draft?.id) return
  return router.replace({ path: '/publish', query: publishEditorQuery({ draft: String(draft.id) }) })
}

// 草稿导入 — 从 Collection 页跳转时加载
onMounted(async () => {
  if (publishTab.value === 'drafts') {
    showDraftList.value = true
    await loadDrafts()
  }
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
  imageFileList,
  coverFileList,
  tagsText,
  topicsText,
  mentionsText,
  handleImageFileChange,
  handleImageFileRemove,
  handleCoverFileChange,
  handleCoverFileRemove,
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
/* —— 语义化 class（原 inline style 迁移，2026-08-10） —— */
.publish-header-row { display: flex; align-items: center; gap: var(--space-md); width: 100%; }
.batch-mode-toggle { cursor: pointer; user-select: none; display: flex; align-items: center; gap: 8px; font-size: 13px; color: var(--muted); }
.cohere-content-split { display: flex; gap: var(--space-xl); }
.batch-articles { display: flex; flex-direction: column; gap: var(--space-md); }
.cohere-card-static { cursor: default; position: relative; }
.cohere-card-offset { margin-top: 16px; cursor: default; }
.cohere-form-gap { gap: var(--space-md); }
.article-card-row { display: flex; align-items: center; gap: var(--space-sm); margin-bottom: var(--space-md); }
.flex-spacer { flex: 1; }
.flex-main { flex: 2; min-width: 0; }
.flex-side { flex: 1; min-width: 280px; }
.coral-text { color: var(--coral); }
.coral-check { accent-color: var(--coral); }
.title-row { display: flex; align-items: center; gap: 8px; margin-bottom: 4px; }
.no-margin-bottom { margin-bottom: 0; }
.template-pick-button { font-size: 11px; padding: 2px 8px; border: none; background: none; cursor: pointer; color: var(--coral); }
.batch-platform-option { display: flex; align-items: center; gap: 4px; cursor: pointer; font-size: 13px; }
.input-max-260 { max-width: 260px; }
.input-max-300 { max-width: 300px; }
.publish-time-hint { font-size: 12px; color: var(--muted); margin-left: 8px; }
.stack-gap { margin-bottom: var(--space-md); }
.stack-gap-top { margin-top: 12px; }
.stack-center { text-align: center; }
.row-actions { display: flex; gap: var(--space-sm); }
.row-actions-compact { display: flex; gap: 4px; }
.progress-title { font-weight: 600; font-size: 14px; margin-bottom: var(--space-sm); }
.progress-toolbar { display: flex; gap: var(--space-sm); margin-bottom: var(--space-sm); }
.muted-text { font-size: 13px; color: var(--muted); }
.side-button-block { width: 100%; justify-content: center; margin-bottom: 8px; }
.side-button-block-top { margin-bottom: 0; margin-top: 8px; }
.side-button-full { width: 100%; justify-content: center; }
.draft-list-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; }
.draft-list-title { font-weight: 600; font-size: 14px; }
.plain-close-button { background: none; border: none; cursor: pointer; font-size: 16px; color: var(--muted); }
.draft-empty { text-align: center; padding: 20px; color: var(--muted); }
.result-header-row { display: flex; gap: 8px; align-items: center; }
.result-link-row { margin-top: 12px; display: flex; align-items: center; gap: 8px; }
.result-link { font-size: 13px; color: var(--action-blue); text-decoration: none; }
.copy-url-button { background: none; border: 1px solid var(--border, #e0e0e0); border-radius: 4px; padding: 2px 8px; font-size: 12px; cursor: pointer; color: var(--muted, #999); transition: all .2s; }
.copy-url-button.is-copied { background: var(--cohere-green, #67c23a); color: var(--surface); border-color: var(--cohere-green, #67c23a); }

.publish-type-context { color: var(--coral, #f56c6c); font-size: 14px; font-weight: 600; }
.publish-drafts-page {
  min-height: 100%;
  padding: 24px;
  background: var(--canvas, #f7f7fb);
}
.publish-drafts-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 20px;
}
.publish-drafts-state {
  min-height: 220px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  border: 1px dashed var(--border-light, #e8e8ec);
  border-radius: 10px;
  background: var(--surface, #fff);
  color: var(--muted, #73777d);
  text-align: center;
}
.publish-drafts-state strong { color: var(--text-primary, #25252b); font-size: 16px; }
.publish-drafts-list { display: flex; flex-direction: column; gap: 10px; }
.publish-draft-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 16px;
  border: 1px solid var(--border-light, #e8e8ec);
  border-radius: 10px;
  background: var(--surface, #fff);
}
.publish-draft-info { min-width: 0; display: flex; align-items: center; gap: 12px; }
.publish-draft-info strong { overflow: hidden; color: var(--text-primary, #25252b); text-overflow: ellipsis; white-space: nowrap; }
.publish-draft-info span { color: var(--muted, #73777d); font-size: 12px; }
.publish-draft-actions { display: flex; flex: 0 0 auto; gap: 6px; }
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
.batch-metadata-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; }
.batch-metadata-grid > div { min-width: 0; }
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
.publish-media-upload { display: flex; flex-direction: column; align-items: flex-start; gap: 6px; }
.media-upload-trigger { min-height: 32px; padding: 5px 12px; border: 1px solid #d9dce8; border-radius: 6px; background: #fff; color: #4d5574; font-size: 12px; cursor: pointer; }
.media-upload-trigger:hover { border-color: #5048e5; color: #5048e5; }
.publish-metadata-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; }
.publish-metadata-grid > div { min-width: 0; }

@media (max-width: 720px) {
  .publish-metadata-grid { grid-template-columns: 1fr; }
}

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
@media (max-width: 720px) {
  .publish-drafts-page { padding: 16px 12px 24px; }
  .publish-drafts-header,
  .publish-draft-card { align-items: flex-start; flex-direction: column; }
  .publish-draft-info { align-items: flex-start; flex-direction: column; gap: 4px; }
  .publish-draft-actions { width: 100%; }
  .batch-metadata-grid { grid-template-columns: 1fr; }
}
</style>

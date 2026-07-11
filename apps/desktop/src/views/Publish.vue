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
              <div style="display:flex;flex-wrap:wrap;gap:8px">
                <label v-for="p in platforms" :key="p.id" style="display:flex;align-items:center;gap:4px;cursor:pointer;font-size:13px">
                  <input type="checkbox" :value="p.id" v-model="a.platforms" style="accent-color:var(--coral)" />
                  {{ p.label }}
                </label>
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
          <UiButton @click="handleBatchPublish" :disabled="publishing || articles.length === 0">
            {{ publishing ? '发布中...' : `🚀 批量发布 (${totalPlatformTasks} 个任务)` }}
          </UiButton>
        </div>

        <!-- 进度 -->
        <div v-if="batchProgress.length > 0" class="cohere-card" style="cursor:default">
          <div style="font-weight:600;font-size:14px;margin-bottom:var(--space-sm)">批量发布进度</div>
          <div style="display:flex;gap:var(--space-sm);margin-bottom:var(--space-sm)">
            <span class="cohere-tag cohere-tag-success">✅ {{ batchDone }} 完成</span>
            <span class="cohere-tag cohere-tag-danger">❌ {{ batchFail }} 失败</span>
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
                  <button class="cohere-btn-ghost" @click="showAiWriter = !showAiWriter" style="font-size:11px;padding:2px 8px;border:none;background:none;cursor:pointer;color:var(--coral)">
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
              <input
                v-model="platformSearch"
                type="text"
                placeholder="搜索平台..."
                style="width:100%;padding:8px 12px;border:1px solid var(--border-light);border-radius:6px;font-size:13px;outline:none"
              />
              <el-checkbox-group v-model="selectedPlatforms">
                <div v-for="group in groupedPlatforms" :key="group.label" style="margin-bottom:16px">
                  <div style="font-size:12px;color:var(--muted);margin-bottom:8px;font-weight:500">{{ group.label }}</div>
                  <div v-for="p in group.items" :key="p.id" style="margin-bottom:8px">
                    <div style="display:flex;align-items:center;gap:8px">
                      <el-checkbox :label="p.id" :disabled="p.disabled">
                        <span style="margin-left:6px">{{ p.label }}</span>
                      </el-checkbox>
                      <!-- 账号选择器（平台勾选后才显示） -->
                      <template v-if="selectedPlatforms.includes(p.id)">
                        <template v-if="getAccounts(p.id).length > 0">
                          <select
                            class="publish-account-select"
                            :value="selectedAccounts[p.id] || ''"
                            @change="selectedAccounts[p.id] = $event.target.value"
                            @click.stop
                          >
                            <option
                              v-for="a in getAccounts(p.id)"
                              :key="a.id"
                              :value="a.id"
                            >{{ a.name || a.id?.slice(0,8) }}</option>
                          </select>
                        </template>
                        <span v-else style="font-size:11px;color:var(--coral)">请先添加账号</span>
                      </template>
                    </div>
                  </div>
                </div>
              </el-checkbox-group>
              <div class="cohere-divider"></div>
              <UiButton style="width:100%;justify-content:center" :disabled="selectedPlatforms.length === 0 || publishing" @click="handlePublish">
                {{ publishing ? '发布中...' : '🚀 一键发布' }}
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
          <div v-if="result" class="cohere-card" style="margin-top:16px;cursor:default">
            <div :style="{ display:'flex', gap:'8px', alignItems:'center' }">
              <span v-if="result.success" class="cohere-tag cohere-tag-success">✓ 发布成功</span>
              <span v-else class="cohere-tag cohere-tag-danger">✗ 发布失败</span>
              <span style="font-size:13px;color:var(--muted)">{{ result.message }}</span>
            </div>
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
import { ref, reactive, computed, watch, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { usePlatformStore } from '@/stores/platforms'
import { useAccountStore } from '@/stores/accounts'
import { ElMessage } from 'element-plus'
import { UploadFilled } from '@element-plus/icons-vue'
import { storeGetSetting, storeSetSetting } from '@/api/publisher'
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

const route = useRoute()
const platformStore = usePlatformStore()
platformStore.load()
const accountStore = useAccountStore()
const licenseStore = useLicenseStore()

// platform data → usePlatformStore() + bilibili tag override
const PLATFORM_TAGS = { bilibili: { tag: '新', tagClass: 'cohere-tag-success' } }
const PLATFORM_GROUPS = {
  domestic: { label: '国内平台', platforms: ['wechat_mp', 'zhihu', 'weibo', 'douyin', 'xiaohongshu', 'tencent_video', 'kuaishou', 'toutiao', 'bilibili', 'baijiahao'] },
  international: { label: '国际平台', platforms: ['youtube', 'tiktok', 'twitter', 'instagram', 'facebook'] },
}
const platforms = computed(() =>
  platformStore.platforms.map(p => ({
    id: p.id,
    label: p.label,
    ...(PLATFORM_TAGS[p.id] || { tag: null, tagClass: '' }),
  }))
)
const platformSearch = ref('')
const groupedPlatforms = computed(() => {
  const search = platformSearch.value.toLowerCase()
  const filterPlatform = (p) => !search || p.label.toLowerCase().includes(search) || p.id.toLowerCase().includes(search)
  const groups = []
  const domestic = platforms.value.filter(p => PLATFORM_GROUPS.domestic.platforms.includes(p.id) && filterPlatform(p))
  const international = platforms.value.filter(p => PLATFORM_GROUPS.international.platforms.includes(p.id) && filterPlatform(p))
  if (domestic.length > 0) groups.push({ label: PLATFORM_GROUPS.domestic.label, items: domestic })
  if (international.length > 0) groups.push({ label: PLATFORM_GROUPS.international.label, items: international })
  return groups
})

// ── 多账号加载 ──────────────────────────
async function loadAccounts () {
  await accountStore.load()
}

// ── 非批量模式（本地 UI 状态） ────────────
const article = reactive({ title: '', content: '', author: '', cover_url: '', video_path: '' })
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
} = usePlatformSelection(accountStore)

const precheckEnabled = ref(false)

const {
  publishing,
  progress,
  result,
  copied,
  handlePublish,
  addProgress,
  copyUrl,
} = usePublishFlow({ article, selectedPlatforms, selectedAccounts, precheckEnabled })

const {
  batchMode,
  articles,
  batchProgress,
  templateTargetIdx,
  showTemplatePicker,
  batchDone,
  batchFail,
  totalPlatformTasks,
  addArticle,
  removeArticle,
  duplicateArticle,
  handleBatchPublish,
  applyTemplate,
  checkBatchAccess,
} = useBatchPublish({ article, licenseStore })

// 持久化预检开关状态
watch(precheckEnabled, (val) => {
  storeSetSetting("precheckEnabled", val);
})

// 草稿导入 — 从 Collection 页跳转时加载
onMounted(async () => {
  await loadAccounts()  // 加载多账号列表
  // 初始化默认选中账号
  for (const pid of selectedPlatforms.value) {
    const def = getDefaultAccount(pid)
    if (def) selectedAccounts.value[pid] = def.id
  }
  const precheckVal = await storeGetSetting('precheckEnabled', 'false'); precheckEnabled.value = precheckVal === 'true' || precheckVal === true;
  const draftId = route.query.draft
  if (!draftId) return

  const raw = await storeGetSetting('drafts', '[]')
  let drafts
  try { drafts = typeof raw === 'string' ? JSON.parse(raw) : raw } catch { drafts = [] }
  const draft = drafts.find(d => d.id === draftId)
  if (!draft) return

  article.title = draft.title || ''
  article.content = draft.content || ''
  ElMessage.success('已加载草稿')
})

// 暴露给测试（w.vm.xxx）和外部组件
defineExpose({
  article,
  batchMode,
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
  selectedPlatforms,
  selectedAccounts,
  hasVideoPlatforms,
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
  copyUrl,
  addProgress,
  loadAccounts,
})
</script>

<style scoped>
.publish-account-select {
  font-size: 11px;
  padding: 2px 4px;
  border: 1px solid var(--border, #e0e0e0);
  border-radius: 4px;
  background: var(--soft-stone, #f5f5f5);
  color: var(--text-primary, var(--ink));
  cursor: pointer;
  max-width: 120px;
  outline: none;
}
.publish-account-select:hover {
  border-color: var(--coral, #f56c6c);
}
</style>

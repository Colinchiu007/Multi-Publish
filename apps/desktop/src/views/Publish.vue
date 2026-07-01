<template>
  <div>
    <div class="cohere-page-header">
      <div style="display:flex;align-items:center;gap:var(--space-md);width:100%">
        <div style="flex:1">
          <div class="page-title">一键发布</div>
          <div class="page-subtitle">{{ batchMode ? '批量编辑多篇文章，各平台独立发布' : '编辑内容并发布到多个平台' }}</div>
        </div>
        <label class="cohere-toggle" style="cursor:pointer;user-select:none;display:flex;align-items:center;gap:8px;font-size:13px;color:var(--muted)">
          <input type="checkbox" v-model="batchMode" style="accent-color:var(--coral)" />
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
            <button class="cohere-btn-ghost" @click="duplicateArticle(idx)" title="复制">📋</button>
            <button class="cohere-btn-ghost" @click="removeArticle(idx)" v-if="articles.length > 1" title="删除" style="color:var(--coral)">✕</button>
          </div>

          <!-- 文章编辑 -->
          <div class="cohere-form">
            <div class="cohere-form-item">
              <label class="cohere-form-label">标题</label>
              <input class="cohere-input" v-model="a.title" placeholder="请输入文章标题" maxlength="64" />
            </div>
            <div class="cohere-form-item">
              <label class="cohere-form-label">正文</label>
              <textarea class="cohere-input" v-model="a.content" placeholder="请输入正文" rows="5" style="resize:vertical;font-family:inherit;line-height:1.6"></textarea>
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
              <input class="cohere-input" type="datetime-local" v-model="a.publishTime" style="max-width:260px" />
              <span style="font-size:12px;color:var(--muted);margin-left:8px">留空 = 立即发布</span>
            </div>
          </div>
        </div>

        <!-- 操作 -->
        <div style="display:flex;gap:var(--space-sm)">
          <button class="cohere-btn-secondary" @click="addArticle">＋ 添加文章</button>
          <div style="flex:1"></div>
          <button class="cohere-btn-primary" @click="handleBatchPublish" :disabled="publishing || articles.length === 0">
            {{ publishing ? '发布中...' : `🚀 批量发布 (${totalPlatformTasks} 个任务)` }}
          </button>
        </div>

        <!-- 进度 -->
        <div v-if="batchProgress.length > 0" class="cohere-card" style="cursor:default">
          <div style="font-weight:600;font-size:14px;margin-bottom:var(--space-sm)">批量发布进度</div>
          <div style="display:flex;gap:var(--space-sm);margin-bottom:var(--space-sm)">
            <span class="cohere-tag cohere-tag-success">✅ {{ batchDone }} 完成</span>
            <span class="cohere-tag cohere-tag-danger">❌ {{ batchFail }} 失败</span>
          </div>
          <ul class="cohere-timeline">
            <li v-for="(item, idx) in batchProgress" :key="idx" class="cohere-timeline-item" :class="item.type">
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
                <label class="cohere-form-label">标题</label>
                <input class="cohere-input" v-model="article.title" placeholder="请输入文章标题" maxlength="64" />
              </div>
              <div class="cohere-form-item">
                <label class="cohere-form-label">作者</label>
                <input class="cohere-input" v-model="article.author" placeholder="作者名称（选填）" maxlength="20" style="max-width:300px" />
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
                <input class="cohere-input" v-model="article.cover_url" placeholder="封面图片链接（选填）" />
              </div>
            </div>
          </div>
        </div>
        <div style="flex:1;min-width:280px">
          <!-- 智能标签建议 -->
          <TagSuggester v-if="showTagPanel && combinedContent.length > 3" :content="combinedContent" style="margin-bottom:var(--space-md)" @close="showTagPanel = false" />
          <div v-if="!showTagPanel && combinedContent.length > 3" style="margin-bottom:var(--space-md);text-align:center">
            <button class="cohere-btn-ghost" @click="showTagPanel = true" style="font-size:12px;padding:4px 12px"># 显示标签建议</button>
          </div>

          <!-- 最佳发布时间 -->
          <OptimalTimeTip v-if="article.title.length > 2" :keyword="article.title" style="margin-bottom:var(--space-md)" />

          <div class="cohere-card" style="cursor:default">
            <div class="cohere-form" style="gap:var(--space-md)">
              <div class="cohere-form-label">发布目标</div>
              <el-checkbox-group v-model="selectedPlatforms">
                <div v-for="p in platforms" :key="p.id" style="margin-bottom:10px">
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
              </el-checkbox-group>
              <div class="cohere-divider"></div>
              <button class="cohere-btn-primary" style="width:100%;justify-content:center" :disabled="selectedPlatforms.length === 0 || publishing" @click="handlePublish">
                {{ publishing ? '发布中...' : '🚀 一键发布' }}
              </button>
            </div>
          </div>
          <div v-if="progress.length > 0" class="cohere-card" style="margin-top:16px;cursor:default">
            <ul class="cohere-timeline">
              <li v-for="(item, idx) in progress" :key="idx" class="cohere-timeline-item" :class="item.type">
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
              <button @click="copyUrl(result.url)" style="background:none;border:1px solid var(--border,#e0e0e0);border-radius:4px;padding:2px 8px;font-size:12px;cursor:pointer;color:var(--muted,#999);transition:all .2s" :style="copied ? { background:'var(--cohere-green,#67c23a)', color:'#fff', borderColor:'var(--cohere-green,#67c23a)' } : {}">
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
import { ref, reactive, computed, watch, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { UploadFilled } from '@element-plus/icons-vue'
import { publishBatch, onProgress } from '@/api/publisher'
import TagSuggester from '@/components/TagSuggester.vue'
import OptimalTimeTip from '@/components/OptimalTimeTip.vue'
import ArticleEditor from '@/components/ArticleEditor.vue'

const route = useRoute()
const platformStore = usePlatformStore()
platformStore.load()
const accountStore = useAccountStore()

// platform data → usePlatformStore() + bilibili tag override
const PLATFORM_TAGS = { bilibili: { tag: '新', tagClass: 'cohere-tag-success' } }
const platforms = computed(() =>
  platformStore.platforms.map(p => ({
    id: p.id,
    label: p.label,
    ...(PLATFORM_TAGS[p.id] || { tag: null, tagClass: '' }),
  }))
)

// ── 多账号加载 ──────────────────────────


async function loadAccounts () {
  await accountStore.load()
}

function getAccounts (platformId) {
  return accountStore.byPlatform[platformId] || []
}

function getDefaultAccount (platformId) {
  return accountStore.getDefault(platformId)
}

// ── 非批量模式 ──────────────────────────
const selectedPlatforms = ref(['wechat_mp'])
const selectedAccounts = ref({})  // { platformId: accountId }
const publishing = ref(false)
const progress = ref([])
const result = ref(null)
const copied = ref(false)  // P2-3: URL 复制反馈

const article = reactive({ title: '', content: '', author: '', cover_url: '', video_path: '' })
const showTagPanel = ref(true)
const combinedContent = computed(() => article.title + ' ' + article.content)

// 同步 selectedAccounts 默认值
watch(selectedPlatforms, (newPlatforms, oldPlatforms) => {
  for (const pid of newPlatforms) {
    if (!selectedAccounts.value[pid]) {
      const def = getDefaultAccount(pid)
      if (def) selectedAccounts.value[pid] = def.id
    }
  }
  // 清理已移除平台的账号
  for (const pid of Object.keys(selectedAccounts.value)) {
    if (!newPlatforms.includes(pid)) {
      delete selectedAccounts.value[pid]
    }
  }
}, { deep: true })

function togglePlatform (platformId) {
  const idx = selectedPlatforms.value.indexOf(platformId)
  if (idx === -1) {
    selectedPlatforms.value.push(platformId)
  } else {
    selectedPlatforms.value.splice(idx, 1)
  }
}

const hasVideoPlatforms = computed(() =>
  selectedPlatforms.value.some(p => ['douyin', 'tencent_video', 'kuaishou'].includes(p))
)

// P2-3: URL 复制反馈
function copyUrl (url) {
  navigator.clipboard.writeText(url).then(() => {
    copied.value = true
    setTimeout(() => { copied.value = false }, 2000)
  }).catch(() => {
    // fallback for older browsers
    const ta = document.createElement('textarea')
    ta.value = url
    document.body.appendChild(ta)
    ta.select()
    document.execCommand('copy')
    document.body.removeChild(ta)
    copied.value = true
    setTimeout(() => { copied.value = false }, 2000)
  })
}

function addProgress (text, type = 'primary') {
  const now = new Date()
  const time = now.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  progress.value.push({ text, time, type })
}

async function handlePublish () {
  if (!article.title.trim()) { ElMessage.warning('请输入文章标题'); return }
  if (!article.content.trim()) { ElMessage.warning('请输入正文内容'); return }

  // 敏感词预检
  const api = window.electronAPI
  if (api && api.sensitiveCheck) {
    const titleResult = await api.sensitiveCheck(article.title)
    const contentResult = await api.sensitiveCheck(article.content)
    const allWords = [...(titleResult.data?.words || []), ...(contentResult.data?.words || [])]
    if (allWords.length > 0) {
      try {
        await ElMessageBox.confirm(
          `发布内容包含敏感词：${allWords.join('、')}，是否仍然发布？`,
          '敏感词提示',
          { confirmButtonText: '强制发布', cancelButtonText: '修改', type: 'warning' }
        )
      } catch (e) { return /* 用户取消 */ }
    }
  }

  publishing.value = true; progress.value = []; result.value = null

  const off = onProgress((data) => addProgress(`[${data.platform}] ${data.stage}`))
  try {
    const data = { title: article.title, content: article.content, author: article.author || '', cover_url: article.cover_url || '', video_path: article.video_path || '' }
    // 构建带 accountId 的平台列表
    const targets = selectedPlatforms.value.map(pid => ({
      platform: pid,
      accountId: selectedAccounts.value[pid] || null,
    }))
    addProgress(`发布到 ${targets.length} 个目标（含多账号）...`, 'info')
    const res = await publishBatch(targets, data)
    if (res.code === 0) { addProgress(`✓ 已添加 ${res.data?.taskIds?.length || ''} 个任务`, 'success'); result.value = { success: true, message: res.message || '任务已加入队列', url: '' } }
    else { addProgress(`✗ 发布失败: ${res.message}`, 'danger'); result.value = { success: false, message: res.message } }
  } catch (e) { addProgress(`✗ 错误: ${e.message}`, 'danger'); result.value = { success: false, message: e.message } }
  finally { publishing.value = false; off() }
}

// ── 批量模式 ────────────────────────────
const batchMode = ref(false)
let _keyCounter = 1
const articles = ref([])
const batchProgress = ref([])
const batchDone = computed(() => batchProgress.value.filter(p => p.type === 'success').length)
const batchFail = computed(() => batchProgress.value.filter(p => p.type === 'danger').length)
const totalPlatformTasks = computed(() => articles.value.reduce((s, a) => s + (a.platforms?.length || 0), 0))

function freshKey () { return `a_${_keyCounter++}_${Date.now()}` }

function addArticle () {
  articles.value.push({ _key: freshKey(), title: '', content: '', platforms: [], publishTime: '' })
}

function removeArticle (idx) { articles.value.splice(idx, 1) }

function duplicateArticle (idx) {
  const orig = articles.value[idx]
  articles.value.splice(idx + 1, 0, { ...orig, _key: freshKey(), title: orig.title + ' (复制)', publishTime: '' })
}

async function handleBatchPublish () {
  for (const a of articles.value) {
    if (!a.title.trim()) { ElMessage.warning('有文章缺少标题'); return }
    if (!a.content.trim()) { ElMessage.warning('有文章缺少正文'); return }
    if (!a.platforms || a.platforms.length === 0) { ElMessage.warning(`"${a.title.slice(0, 20)}" 未选择发布平台`); return }
  }

  publishing.value = true
  batchProgress.value = []

  const off = onProgress((data) => {
    batchProgress.value.push({
      text: `[${data.platform}] ${data.stage}`,
      time: new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      type: data.type || 'primary',
    })
  })

  const api = window.electronAPI

  try {
    // 创建批量任务
    const createRes = await api.batchCreate({ name: `批量发布 ${new Date().toLocaleDateString('zh-CN')}`, articles: articles.value.map(a => ({
      title: a.title, content: a.content, platforms: a.platforms, publishTime: a.publishTime || null,
    })) })

    if (createRes.code !== 0) { throw new Error(createRes.message) }

    const batchId = createRes.data.id

    // 检查是否有定时任务
    const hasScheduled = articles.value.some(a => a.publishTime)
    if (hasScheduled) {
      await api.batchSchedule(batchId)
      batchProgress.value.push({ text: `✅ 已排期 ${articles.value.length} 篇文章`, time: new Date().toLocaleTimeString('zh-CN'), type: 'success' })
    } else {
      // 接收批量进度
      const off2 = api.onBatchProgress((data) => {
        batchProgress.value.push({
          text: data.ok ? `✅ [${data.platform}] ${data.title.slice(0, 20)}: 发布成功` : `❌ [${data.platform}] ${data.title.slice(0, 20)}: ${data.message}`,
          time: new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }),
          type: data.ok ? 'success' : 'danger',
        })
      })

      await api.batchExecute(batchId)
      batchProgress.value.push({ text: `🚀 ${articles.value.length} 篇文章已提交发布`, time: new Date().toLocaleTimeString('zh-CN'), type: 'primary' })
      off2()
    }
  } catch (e) {
    batchProgress.value.push({ text: `❌ 批量发布失败: ${e.message}`, time: new Date().toLocaleTimeString('zh-CN'), type: 'danger' })
  } finally {
    publishing.value = false
    off()
  }
}

// 批量模式切换时初始化
watch(batchMode, (val) => {
  if (val && articles.value.length === 0) addArticle()
})

// 草稿导入 — 从 Collection 页跳转时加载
onMounted(async () => {
  await loadAccounts()  // 加载多账号列表
  // 初始化默认选中账号
  for (const pid of selectedPlatforms.value) {
    const def = getDefaultAccount(pid)
    if (def) selectedAccounts.value[pid] = def.id
  }
  const draftId = route.query.draft
  if (!draftId) return

  const api = window.electronAPI
  if (!api || !api.storeGetSetting) return

  const raw = await api.storeGetSetting('drafts', '[]')
  let drafts
  try { drafts = typeof raw === 'string' ? JSON.parse(raw) : raw } catch { drafts = [] }
  const draft = drafts.find(d => d.id === draftId)
  if (!draft) return

  article.title = draft.title || ''
  article.content = draft.content || ''
  ElMessage.success('已加载草稿')
})
</script>

<style scoped>
.publish-account-select {
  font-size: 11px;
  padding: 2px 4px;
  border: 1px solid var(--border, #e0e0e0);
  border-radius: 4px;
  background: var(--soft-stone, #f5f5f5);
  color: var(--text-primary, #333);
  cursor: pointer;
  max-width: 120px;
  outline: none;
}
.publish-account-select:hover {
  border-color: var(--coral, #f56c6c);
}
</style>

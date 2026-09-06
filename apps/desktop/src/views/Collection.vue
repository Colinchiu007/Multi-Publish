<template>
  <div>
    <div class="cohere-page-header">
      <div>
        <div class="page-title">内容采集</div>
        <div class="page-subtitle">从各平台采集内容，或快速创建草稿</div>
      </div>
      <div class="page-actions">
        <button class="cohere-btn-secondary" @click="importFromClipboard">📋 从剪贴板导入</button>
        <button class="cohere-btn-primary" @click="createDraft">＋ 新建草稿</button>
      </div>
    </div>

    <div class="cohere-content">
      <!-- URL 采集输入 -->
      <div class="cohere-card" style="padding:var(--space-md);margin-bottom:var(--space-lg)">
        <div style="display:flex;gap:var(--space-sm);align-items:center;flex-wrap:wrap">
          <span style="font-size:1.2rem">🔗</span>
          <select v-model="collectSourceType" style="border:1px solid var(--border);border-radius:6px;padding:8px;font-size:14px">
            <option v-for="s in collectSources" :key="s.type" :value="s.type">{{ s.name }}</option>
          </select>
          <input
            v-model="linkUrl"
            placeholder="输入文章链接，自动采集标题、正文、封面..."
            style="flex:1;border:1px solid var(--border);border-radius:6px;padding:8px 12px;font-size:14px"
            @keyup.enter="collectUrl"
          />
          <button class="cohere-btn-primary" @click="collectUrl" :disabled="collecting">
            {{ collecting ? '采集中...' : '采集' }}
          </button>
          <button v-if="collectError && RETRYABLE_CODES.has(collectError.code)" class="cohere-btn-secondary" @click="retryCollect" :disabled="collecting" style="font-size:13px;padding:8px 12px">
            🔄 重试
          </button>
        </div>
        <div v-if="collectError" style="margin-top:8px;padding:6px 10px;background:#fff3f3;border-radius:4px;font-size:12px;color:#d32f2f">
          {{ collectError.message }}
        </div>
        <div v-if="collectedResult" style="margin-top:var(--space-sm);padding:var(--space-sm);background:var(--soft-stone);border-radius:6px">
          <div style="font-weight:600;margin-bottom:4px">✅ {{ collectedResult.title || '无标题' }}</div>
          <div style="font-size:12px;color:var(--text-secondary)">
            {{ collectedResult.description ? collectedResult.description.slice(0, 120) + '...' : '' }}
            <span v-if="collectedResult.coverImage"> · 有封面图</span>
          </div>
          <div style="margin-top:8px;display:flex;flex-wrap:wrap;gap:8px;align-items:center">
            <button class="cohere-btn-primary" @click="createFromCollected">创建草稿</button>
            <select v-model="rewriteStyle" style="border:1px solid var(--border);border-radius:4px;padding:4px 8px;font-size:13px">
              <option v-for="s in rewriteStyles" :key="s.value" :value="s.value">{{ s.label }}</option>
            </select>
            <select v-model="rewriteLength" style="border:1px solid var(--border);border-radius:4px;padding:4px 8px;font-size:13px">
              <option v-for="l in rewriteLengths" :key="l.value" :value="l.value">{{ l.label }}</option>
            </select>
            <button class="cohere-btn-secondary" @click="rewriteCollected" :disabled="rewriting">
              {{ rewriting ? $t('collection.rewriting') : $t('collection.rewrite') }}
            </button>
            <button v-if="rewriteError && RETRYABLE_CODES.has(rewriteError.code)" class="cohere-btn-secondary" @click="retryRewrite" :disabled="rewriting" style="font-size:13px">
              🔄 重试
            </button>
            <button class="cohere-btn-secondary" @click="collectedResult = null">取消</button>
            <div v-if="rewriteError" style="margin-top:6px;padding:6px 10px;background:#fff3f3;border-radius:4px;font-size:12px;color:#d32f2f">
              {{ rewriteError.message }}
            </div>
          </div>
        </div>
      </div>

      <!-- 采集结果累计列表 -->
      <div v-if="collectedItems.length > 0" style="margin-bottom:var(--space-lg)">
        <div class="cohere-section-title" style="display:flex;justify-content:space-between;align-items:center">
          <span>采集结果（{{ collectedItems.length }} 篇）</span>
          <button class="cohere-btn-secondary" style="font-size:12px;padding:2px 8px" @click="collectedItems = []; collectedResult = null">清空</button>
        </div>
        <div class="cohere-card-grid">
          <div v-for="item in collectedItems" :key="item.id" class="cohere-card" :style="{ borderLeft: item.id === collectedResult?.id ? '3px solid var(--primary)' : '' }">
            <div class="card-top">
              <div class="card-icon">📰</div>
              <div class="card-info">
                <div class="card-platform">{{ item.title || '无标题' }}</div>
                <div class="card-account">{{ item.source || 'url' }} · {{ item.wordCount || (item.content || '').length }}字</div>
              </div>
            </div>
            <div class="card-actions">
              <button @click="collectedResult = item">查看</button>
              <button @click="createFromItem(item)">创建草稿</button>
              <button @click="sendItemToPipeline(item)">视频创作</button>
              <button @click="goPublishFromItem(item)">发布</button>
            </div>
          </div>
        </div>
      </div>

      <!-- 快捷操作 -->
      <div class="cohere-stat-grid" style="margin-bottom:var(--space-lg)">
        <div class="cohere-stat-card" style="cursor:pointer" @click="createDraft">
          <div class="stat-value">✏️</div>
          <div class="stat-label">新建草稿</div>
        </div>
        <div class="cohere-stat-card" style="cursor:pointer" @click="importFromClipboard">
          <div class="stat-value">📋</div>
          <div class="stat-label">剪贴板导入</div>
        </div>
        <div class="cohere-stat-card" style="cursor:pointer" @click="openCollection('weibo')">
          <div class="stat-value">✧</div>
          <div class="stat-label">微博</div>
        </div>
        <div class="cohere-stat-card" style="cursor:pointer" @click="openCollection('zhihu')">
          <div class="stat-value">❓</div>
          <div class="stat-label">知乎</div>
        </div>
        <div class="cohere-stat-card" style="cursor:pointer" @click="openCollection('toutiao')">
          <div class="stat-value">📰</div>
          <div class="stat-label">今日头条</div>
        </div>
      </div>

      <!-- 草稿列表 -->
      <div class="cohere-section-title">草稿箱</div>
      <EmptyState v-if="drafts.length === 0" icon="📝" title="暂无草稿" description="点击「新建草稿」或从平台采集内容开始" />
      <div v-else class="cohere-card-grid">
        <div v-for="d in drafts" :key="d.id" class="cohere-card">
          <div class="card-top">
            <div class="card-icon">📄</div>
            <div class="card-info">
              <div class="card-platform">{{ d.title || '未命名草稿' }}</div>
              <div class="card-account">{{ d.created_at }} · {{ (d.content || '').length }}字</div>
            </div>
          </div>
          <div class="card-actions">
            <button @click="editDraft(d)">编辑</button>
            <button @click="goPublish(d)">发布</button>
            <button class="danger" @click="deleteDraft(d)">删除</button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
// eslint-disable-next-line no-unused-vars
import UiButton from "../components/UiButton.vue";
import { getApi } from '@/api/electron-bridge'
// eslint-disable-next-line no-unused-vars
import UiInput from "../components/UiInput.vue";
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useNotify } from '@/composables/useNotify'
import { resolveNotifyText } from '@/utils/notifyCore'
import { storeGetSetting, storeSetSetting } from '@/api/publisher'
import { formatUserError } from '@/utils/user-facing-error'

const router = useRouter()
const { notifyError, notifySuccess, notifyWarning, notifyInfo, notifyConfirm } = useNotify()
const drafts = ref([])
const linkUrl = ref('')
const collecting = ref(false)
const rewriting = ref(false)
const collectedResult = ref(null)
const collectError = ref(null)
const rewriteError = ref(null)
const collectedItems = ref([])  // 累计采集列表
const collectSourceType = ref('url')
const collectSources = ref([
  { type: 'url', name: 'URL 正文提取' },
  { type: 'rss', name: 'RSS 订阅源' },
  { type: 'sitemap', name: 'Sitemap' },
  { type: 'api', name: '自定义 API' },
])
const rewriteStyle = ref('轻松易懂')
const rewriteLength = ref('keep')
const rewriteStyles = [
  { label: resolveNotifyText('collection.rewriteStyleEasy').text, value: '轻松易懂' },
  { label: resolveNotifyText('collection.rewriteStyleFormal').text, value: '正式严谨' },
  { label: resolveNotifyText('collection.rewriteStyleEyeCatching').text, value: '吸引眼球' },
  { label: resolveNotifyText('collection.rewriteStyleDeep').text, value: '深度分析' },
  { label: resolveNotifyText('collection.rewriteStyleCognitive').text, value: '认知锚点' },
]
const rewriteLengths = [
  { label: resolveNotifyText('collection.rewriteLengthKeep').text, value: 'keep' },
  { label: resolveNotifyText('collection.rewriteLengthCompress').text, value: 'compress' },
  { label: resolveNotifyText('collection.rewriteLengthExpand').text, value: 'expand' },
]

onMounted(async () => {
  await loadDrafts()
})

async function loadDrafts () {
  const raw = await storeGetSetting('drafts')
  // API 不可用（bridge fallback 返回 null）或无数据时，保持当前 drafts 不覆盖
  if (raw == null) return
  try { drafts.value = typeof raw === 'string' ? JSON.parse(raw) : raw } catch { drafts.value = [] }
}

async function saveDrafts () {
  await storeSetSetting('drafts', JSON.stringify(drafts.value))
}

function createDraft () {
  const draft = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    title: '',
    content: '',
    source: 'manual',
    created_at: new Date().toLocaleString('zh-CN'),
  }
  drafts.value.unshift(draft)
  saveDrafts()
  router.push('/publish?draft=' + draft.id)
}

async function importFromClipboard () {
  try {
    const text = await navigator.clipboard.readText()
    if (!text) { notifyWarning('collection.clipboardEmpty'); return }
    const lines = text.split('\n').filter(Boolean)
    const title = lines[0].slice(0, 64)
    const content = lines.slice(1).join('\n').slice(0, 10000)
    const draft = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      title: title || '从剪贴板导入',
      content: content || text.slice(0, 10000),
      source: 'clipboard',
      created_at: new Date().toLocaleString('zh-CN'),
    }
    drafts.value.unshift(draft)
    saveDrafts()
    notifySuccess('collection.importedLines', { params: { count: lines.length } })
  } catch (e) {
    notifyError('collection.clipboardReadFailed', { message: resolveNotifyText('collection.clipboardReadFailed').text + ': ' + formatUserError(e, { fallback: resolveNotifyText('collection.clipboardReadFailed').text }).message })
  }
}

function openCollection (platform) {
  const api = getApi()
  if (api && api.webviewOpenTab) {
    api.webviewOpenTab({ platform })
    notifySuccess('collection.openedPlatform', { params: { platform } })
  } else {
    notifyInfo('collection.switchToMonitor')
  }
}

async function editDraft (d) {
  router.push('/publish?draft=' + d.id)
}

function goPublish (d) {
  router.push('/publish?draft=' + d.id)
}

async function deleteDraft (d) {
  const confirmed = await notifyConfirm('collection.confirmDeleteDraft', { title: resolveNotifyText('collection.confirmTitle').text })
  if (!confirmed) return
  drafts.value = drafts.value.filter(x => x.id !== d.id)
  saveDrafts()
  notifySuccess('collection.deleted')
}

// 错误码常量（与 IPC handler 同步）
const ERROR_CODES = {
  TIMEOUT: -1,
  SOURCE_UNREACHABLE: -2,
  QUOTA_EXHAUSTED: -3,
  CONTENT_UNEXTRACTABLE: -4,
  BACKEND_UNAVAILABLE: -5,
}
const RETRYABLE_CODES = new Set([-1, -2, -3, -5])

async function collectUrl () {
  const api = getApi()
  if (!linkUrl.value || !linkUrl.value.trim()) {
    notifyWarning('collection.enterLink')
    return
  }
  collecting.value = true
  collectedResult.value = null
  collectError.value = null
  try {
    // 优先走 Python aggregation API（content-aggregator v1 引擎）
    if (api && api.aggregationCollect) {
      const res = await api.aggregationCollect({
        url: linkUrl.value.trim(),
        source_type: collectSourceType.value,
        rewrite: false,
      })
      // aggregationCollect 直接返回 CollectResult（无 code 包装），失败由 handler 返回 { code, message }
      if (res && res.code !== undefined && res.code !== 0) {
        collectError.value = { code: res.code, message: res.message }
        notifyError('collection.collectFailed', { message: res.message || resolveNotifyText('collection.collectFailed').text })
        return
      }
      if (res && res.title) {
        const item = {
          id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
          title: res.title,
          content: res.content || '',
          description: res.content ? res.content.slice(0, 120) : '',
          source: collectSourceType.value,
          sourceUrl: linkUrl.value,
          wordCount: res.word_count || 0,
        }
        collectedResult.value = item
        collectedItems.value.unshift(item)
        notifySuccess('collection.collectSuccess')
        return
      }
    }
    // 回退到旧的 url-collect（Node.js 端）
    if (api && api.urlCollectFetch) {
      const result = await api.urlCollectFetch(linkUrl.value.trim())
      if (result.code !== 0) {
        collectError.value = { code: result.code, message: result.message }
        notifyError('collection.collectFailed', { message: formatUserError(result, { fallback: resolveNotifyText('collection.collectFailed').text }).message })
        return
      }
      const item = {
        ...result.data,
        id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      }
      collectedResult.value = item
      collectedItems.value.unshift(item)
      notifySuccess('collection.collectSuccess')
      return
    }
    notifyWarning('collection.collectUnavailable')
  } catch (e) {
    collectError.value = { code: -99, message: formatUserError(e, { fallback: resolveNotifyText('collection.collectFailed').text }).message }
    notifyError('collection.collectRequestFailed', { message: collectError.value.message })
  } finally {
    collecting.value = false
  }
}

function retryCollect () {
  collectUrl()
}

async function rewriteCollected () {
  if (!collectedResult.value) return
  const api = getApi()
  if (!api || !api.aggregationRewrite) {
    notifyWarning('collection.collectUnavailable')
    return
  }
  rewriting.value = true
  rewriteError.value = null
  try {
    const result = await api.aggregationRewrite({
      content: collectedResult.value.content || collectedResult.value.description || '',
      style: rewriteStyle.value,
      length: rewriteLength.value,
    })
    if (result && result.result_content) {
      collectedResult.value = { ...collectedResult.value, content: result.result_content, description: result.result_content.slice(0, 120) }
      notifySuccess('collection.rewriteSuccess')
    } else {
      rewriteError.value = { code: result && result.code != null ? result.code : -99, message: (result && result.message) || '' }
      notifyError('collection.rewriteFailed', { message: resolveNotifyText('collection.rewriteFailed').text + ': ' + (rewriteError.value.message) })
    }
  } catch (e) {
    rewriteError.value = { code: -99, message: formatUserError(e, { fallback: resolveNotifyText('collection.rewriteFailed').text }).message }
    notifyError('collection.rewriteFailed', { message: rewriteError.value.message })
  } finally {
    rewriting.value = false
  }
}

function retryRewrite () {
  rewriteCollected()
}

function getDraftFromItem (data) {
  return {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    title: data.title || '',
    content: data.content || data.description || '',
    coverImage: data.coverImage || '',
    source: data.source || 'url',
    sourceUrl: data.sourceUrl || linkUrl.value || '',
    created_at: new Date().toLocaleString('zh-CN'),
  }
}

function createFromCollected () {
  if (!collectedResult.value) return
  const draft = getDraftFromItem(collectedResult.value)
  drafts.value.unshift(draft)
  saveDrafts()
  collectedResult.value = null
  linkUrl.value = ''
  notifySuccess('collection.draftCreated')
  router.push('/publish?draft=' + draft.id)
}

function createFromItem (item) {
  collectedResult.value = item
  createFromCollected()
}

function sendItemToPipeline (item) {
  // 发送到 Story2Video 流水线：将采集内容作为文案输入
  collectedResult.value = item
  const draft = getDraftFromItem(item)
  drafts.value.unshift(draft)
  saveDrafts()
  notifySuccess('collection.draftCreated')
  router.push('/create?draft=' + draft.id)
}

function goPublishFromItem (item) {
  collectedResult.value = item
  const draft = getDraftFromItem(item)
  drafts.value.unshift(draft)
  saveDrafts()
  notifySuccess('collection.draftCreated')
  router.push('/publish?draft=' + draft.id)
}
</script>

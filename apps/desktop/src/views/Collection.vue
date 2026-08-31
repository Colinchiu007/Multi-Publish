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
        <div style="display:flex;gap:var(--space-sm);align-items:center">
          <span style="font-size:1.2rem">🔗</span>
          <input
            v-model="linkUrl"
            placeholder="输入文章链接，自动采集标题、正文、封面..."
            style="flex:1;border:1px solid var(--border);border-radius:6px;padding:8px 12px;font-size:14px"
            @keyup.enter="collectUrl"
          />
          <button class="cohere-btn-primary" @click="collectUrl" :disabled="collecting">
            {{ collecting ? '采集中...' : '采集' }}
          </button>
        </div>
        <div v-if="collectedResult" style="margin-top:var(--space-sm);padding:var(--space-sm);background:var(--soft-stone);border-radius:6px">
          <div style="font-weight:600;margin-bottom:4px">✅ {{ collectedResult.title || '无标题' }}</div>
          <div style="font-size:12px;color:var(--text-secondary)">
            {{ collectedResult.description ? collectedResult.description.slice(0, 120) + '...' : '' }}
            <span v-if="collectedResult.coverImage"> · 有封面图</span>
          </div>
          <div style="margin-top:8px;display:flex;gap:8px">
            <button class="cohere-btn-primary" @click="createFromCollected">创建草稿</button>
            <button class="cohere-btn-secondary" @click="collectedResult = null">取消</button>
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
const collectedResult = ref(null)

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

async function collectUrl () {
  const api = getApi()
  if (!api || !api.urlCollectFetch) {
    notifyWarning('collection.collectUnavailable')
    return
  }
  if (!linkUrl.value || !linkUrl.value.trim()) {
    notifyWarning('collection.enterLink')
    return
  }
  collecting.value = true
  collectedResult.value = null
  try {
    const result = await api.urlCollectFetch(linkUrl.value.trim())
    if (result.code !== 0) {
      notifyError('collection.collectFailed', { message: formatUserError(result, { fallback: resolveNotifyText('collection.collectFailed').text }).message })
      return
    }
    collectedResult.value = result.data
    notifySuccess('collection.collectSuccess')
  } catch (e) {
    notifyError('collection.collectRequestFailed', { message: resolveNotifyText('collection.collectRequestFailed').text + ': ' + formatUserError(e, { fallback: resolveNotifyText('collection.collectFailed').text }).message })
  } finally {
    collecting.value = false
  }
}

function createFromCollected () {
  if (!collectedResult.value) return
  const data = collectedResult.value
  const draft = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    title: data.title || '',
    content: data.content || data.description || '',
    coverImage: data.coverImage || '',
    source: data.source || 'url',
    sourceUrl: linkUrl.value,
    created_at: new Date().toLocaleString('zh-CN'),
  }
  drafts.value.unshift(draft)
  saveDrafts()
  collectedResult.value = null
  linkUrl.value = ''
  notifySuccess('collection.draftCreated')
  router.push('/publish?draft=' + draft.id)
}
</script>

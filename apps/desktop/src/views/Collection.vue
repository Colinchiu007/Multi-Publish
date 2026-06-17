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
      <div v-if="drafts.length === 0" class="cohere-empty">
        <div class="empty-icon">📝</div>
        <h3>暂无草稿</h3>
        <p>点击「新建草稿」或从平台采集内容开始</p>
      </div>
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
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'

const router = useRouter()
const drafts = ref([])
const linkUrl = ref('')
const collecting = ref(false)
const collectedResult = ref(null)

onMounted(async () => {
  await loadDrafts()
})

async function loadDrafts () {
  const api = window.electronAPI
  if (!api || !api.storeGetSetting) return
  const raw = await api.storeGetSetting('drafts', '[]')
  try { drafts.value = typeof raw === 'string' ? JSON.parse(raw) : raw } catch { drafts.value = [] }
}

async function saveDrafts () {
  const api = window.electronAPI
  if (api && api.storeSetSetting) {
    await api.storeSetSetting('drafts', JSON.stringify(drafts.value))
  }
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
    if (!text) { ElMessage.warning('剪贴板为空'); return }
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
    ElMessage.success(`已导入 ${lines.length} 行内容`)
  } catch (e) {
    ElMessage.error('剪贴板读取失败: ' + e.message)
  }
}

function openCollection (platform) {
  const api = window.electronAPI
  if (api && api.webviewOpenTab) {
    api.webviewOpenTab({ platform })
    ElMessage.success(`已打开 ${platform} 采集页面`)
  } else {
    ElMessage.info('请先切换到分屏监控页查看')
  }
}

async function editDraft (d) {
  router.push('/publish?draft=' + d.id)
}

function goPublish (d) {
  router.push('/publish?draft=' + d.id)
}

async function deleteDraft (d) {
  try {
    await ElMessageBox.confirm('确定删除这篇草稿吗？', '确认', { type: 'warning' })
    drafts.value = drafts.value.filter(x => x.id !== d.id)
    saveDrafts()
    ElMessage.success('已删除')
  } catch (e) { /* 取消 */ }
}

async function collectUrl () {
  const api = window.electronAPI
  if (!api || !api.urlCollect) {
    ElMessage.warning('采集功能不可用')
    return
  }
  if (!linkUrl.value || !linkUrl.value.trim()) {
    ElMessage.warning('请输入链接')
    return
  }
  collecting.value = true
  collectedResult.value = null
  try {
    const result = await api.urlCollect(linkUrl.value.trim())
    if (result.code !== 0) {
      ElMessage.error(result.message || '采集失败')
      return
    }
    collectedResult.value = result.data
    ElMessage.success('内容采集成功')
  } catch (e) {
    ElMessage.error('采集请求失败: ' + e.message)
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
  ElMessage.success('草稿已创建')
  router.push('/publish?draft=' + draft.id)
}
</script>

<template>
  <div>
    <!-- 页面头部 -->
    <div class="cohere-page-header">
      <div>
        <div class="page-title">账号管理</div>
        <div class="page-subtitle">管理各平台发布账号，支持多账号，登录状态长期有效</div>
      </div>
      <div class="page-actions">
        <button class="cohere-btn-secondary" @click="refresh">⟳ 刷新</button>
        <button class="cohere-btn-primary" @click="showAddDialog = true">＋ 添加账号</button>
        <button v-if="authViewVisible" @click="closeAuthView" style="background:#e74c3c;color:white;border:none;padding:6px 16px;border-radius:6px;cursor:pointer;font-size:13px">✕ 关闭登录</button>
      </div>
    </div>

    <!-- 过滤条 -->
    <div style="padding: var(--space-lg) var(--space-xxl) 0">
      <div class="cohere-filter-bar">
        <button class="cohere-filter-chip" :class="{ active: filter === 'all' }" @click="filter = 'all'">全部</button>
        <button class="cohere-filter-chip" :class="{ active: filter === 'active' }" @click="filter = 'active'">已登录</button>
        <button class="cohere-filter-chip" :class="{ active: filter === 'inactive' }" @click="filter = 'inactive'">未登录</button>
        <span class="cohere-filter-meta">共 {{ groupedPlatforms.length }} 个平台 · {{ totalAccounts }} 个账号</span>
      </div>
    </div>

    <!-- 内容体 -->
    <!-- 浮动关闭按钮（始终在 WebContentsView 之上） -->
    <div v-if="authViewVisible" @click="closeAuthView" style="position:fixed;bottom:24px;right:24px;z-index:9999;background:#e74c3c;color:white;border:none;padding:12px 24px;border-radius:8px;cursor:pointer;font-size:14px;font-weight:600;box-shadow:0 4px 12px rgba(0,0,0,0.3);display:flex;align-items:center;gap:8px">✕ 关闭登录</div>
    <div class="cohere-content">
      <div v-if="loading" style="text-align:center;padding:60px 0;color:var(--muted)">加载中...</div>
      <div v-else-if="groupedPlatforms.length === 0" class="cohere-empty">
        <div class="empty-icon">📭</div>
        <h3>暂无账号</h3>
        <p>点击右上角「添加账号」开始配置</p>
      </div>

      <!-- 按平台分组展示 -->
      <div v-else class="cohere-card-grid">
        <div v-for="group in groupedPlatforms" :key="group.platform" class="cohere-card cohere-card-group">
          <!-- 平台标题行 -->
          <div class="card-group-header">
            <div class="card-icon large">{{ platformIcon(group.platform) }}</div>
            <div style="flex:1">
              <div class="card-platform-name">{{ platformLabel(group.platform) }}</div>
              <div class="card-platform-meta">
                <span class="cohere-tag cohere-tag-success" v-if="group.activeCount > 0">{{ group.activeCount }} 个有效</span>
                <span class="cohere-tag cohere-tag-warning" v-if="group.inactiveCount > 0">{{ group.inactiveCount }} 个离线</span>
                <span style="font-size:12px;color:var(--muted);margin-left:8px">共 {{ group.accounts.length }} 个账号</span>
              </div>
            </div>
            <button class="cohere-btn-ghost" @click="addAccountForPlatform(group.platform)" title="为此平台添加账号">＋</button>
          </div>

          <!-- 账号列表 -->
          <div v-for="acc in group.accounts" :key="acc.id" class="account-row" :class="{ 'is-default': acc.is_default }">
            <div class="account-info">
              <!-- 默认标记 -->
              <span v-if="acc.is_default" class="default-badge" title="默认账号">★</span>
              <span v-else class="default-badge muted" title="设为默认" @click="setDefault(acc)" style="cursor:pointer">☆</span>
              <!-- 账号名（可编辑） -->
              <input
                class="account-name-input"
                :value="acc.account_name || acc.name || '未命名'"
                @blur="renameAccount(acc, $event.target.value)"
                @keyup.enter="$event.target.blur()"
                spellcheck="false"
              />
            </div>
            <div class="account-meta">
              <span class="account-status-dot" :class="acc.status === 'active' || acc.status === 'online' ? 'online' : 'offline'"></span>
              <span style="font-size:12px;color:var(--text-secondary)">
                {{ acc.status === 'active' || acc.status === 'online' ? '有效' : '离线' }}
              </span>
              <span style="font-size:11px;color:var(--muted);margin-left:8px">
                {{ acc.created_at ? new Date(acc.created_at).toLocaleDateString('zh-CN') : '' }}
              </span>
            </div>
            <div class="account-actions">
              <button class="cohere-btn-ghost" @click="openPlatform(acc)">打开</button>
              <button class="cohere-btn-ghost" @click="checkLogin(acc)">验证</button>
              <button class="cohere-btn-ghost danger" @click="removeAccount(acc)">删除</button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 新增账号对话框 -->
    <el-dialog v-model="showAddDialog" title="添加账号" width="500px">
      <el-form label-position="top">
        <el-form-item label="选择平台">
          <el-select v-model="newPlatform" placeholder="请选择平台" style="width: 100%">
            <el-option v-for="p in allPlatforms" :key="p.id" :label="p.label" :value="p.id" />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showAddDialog = false">取消</el-button>
        <el-button type="primary" :loading="adding" @click="addAccount">确认添加</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { usePlatformStore } from '@/stores/platforms'
import { useAccountStore } from '@/stores/accounts'
import { ElMessage, ElMessageBox } from 'element-plus'
import { listAccounts, accountDelete, accountCheckLogin, authOpenLogin, authClose, accountAdd, accountSetDefault, accountUpdate } from '@/api/publisher'

const loading = ref(false)
// accounts → useAccountStore()
const showAddDialog = ref(false)
const adding = ref(false)
const newPlatform = ref('')
const filter = ref('all')
const platformStore = usePlatformStore()
const accountStore = useAccountStore()
platformStore.load()
const authViewVisible = ref(false)
const authPlatformName = ref('')

const allPlatforms = computed(() => platformStore.platforms.map(p => ({ id: p.id, label: p.label })))
function platformLabel (id) { return platformStore.getLabel(id) || id }
function platformIcon (id) { return platformStore.getIcon(id) || '📦' }

const totalAccounts = computed(() => accountStore.accounts.length)

// 按平台分组
const groupedPlatforms = computed(() => {
  const filtered = accountStore.accounts.filter(a => {
    if (filter.value === 'all') return true
    if (filter.value === 'active') return a.status === 'active' || a.status === 'online'
    return a.status !== 'active' && a.status !== 'online'
  })

  const groups = {}
  for (const acc of filtered) {
    if (!groups[acc.platform]) {
      groups[acc.platform] = { platform: acc.platform, accounts: [], activeCount: 0, inactiveCount: 0 }
    }
    groups[acc.platform].accounts.push(acc)
    if (acc.status === 'active' || acc.status === 'online') {
      groups[acc.platform].activeCount++
    } else {
      groups[acc.platform].inactiveCount++
    }
  }

  return Object.values(groups).sort((a, b) => b.activeCount - a.activeCount || b.accounts.length - a.accounts.length)
})

// 监听内嵌浏览器事件
let unlistenViewOpened = null
let unlistenAuthCompleted = null
let unlistenViewClosed = null

onMounted(() => {
  refresh()
  const api = window.electronAPI
  if (!api) return
  if (api.onAuthViewOpened) {
    unlistenViewOpened = api.onAuthViewOpened((data) => {
      authPlatformName.value = platformLabel(data.platform)
      authViewVisible.value = true
    })
  }
  if (api.onAuthCompleted) {
    unlistenAuthCompleted = api.onAuthCompleted(() => {
      authViewVisible.value = false
      ElMessage.success('账号添加成功')
      refresh()
    })
  }
  if (api.onAuthViewClosed) {
    unlistenViewClosed = api.onAuthViewClosed(() => {
      authViewVisible.value = false
    })
  }
})

onUnmounted(() => {
  if (unlistenViewOpened) unlistenViewOpened()
  if (unlistenAuthCompleted) unlistenAuthCompleted()
  if (unlistenViewClosed) unlistenViewClosed()
})

async function refresh () {
  loading.value = true
  try {
    await accountStore.load()
  } catch (e) {
    console.error('Failed to load accounts:', e)
  } finally {
    loading.value = false
  }
}

async function addAccount () {
  if (!newPlatform.value) { ElMessage.warning('请选择平台'); return }
  adding.value = true
  try {
    if (authOpenLogin) {
      const platform = newPlatform.value
      showAddDialog.value = false
      newPlatform.value = ''
      authViewVisible.value = true
      const res = await authOpenLogin(platform)
      if (res.code !== 0) ElMessage.error(res.message || '添加失败')
      // auth:completed 事件自动刷新
    } else {
      const res = await accountAdd(newPlatform.value)
      if (res.code === 0) {
        ElMessage.success('账号添加成功，请在弹出的浏览器窗口中完成登录')
        showAddDialog.value = false
        newPlatform.value = ''
        refresh()
      } else {
        ElMessage.error(res.message || '添加失败')
      }
    }
  } catch (e) {
    ElMessage.error(e.message)
  } finally {
    adding.value = false
  }
}

function addAccountForPlatform (platform) {
  newPlatform.value = platform
  showAddDialog.value = true
}

async function closeAuthView () {
  if (authClose) await authClose()
  authViewVisible.value = false
}

async function setDefault (acc) {
  if (!accountSetDefault) return
  try {
    await accountSetDefault(acc.platform, acc.id)
    ElMessage.success(`已设为 ${platformLabel(acc.platform)} 默认账号`)
    refresh()
  } catch (e) {
    ElMessage.error(e.message)
  }
}

async function renameAccount (acc, newName) {
  const name = newName.trim()
  if (!name || name === (acc.account_name || acc.name)) return
  if (!accountUpdate) return
  try {
    await accountUpdate(acc.id, { name })
    refresh()
  } catch (e) {
    ElMessage.error('重命名失败: ' + e.message)
  }
}

function openPlatform (row) {
  const url = {
    wechat_mp: 'https://mp.weixin.qq.com/', zhihu: 'https://www.zhihu.com/',
    weibo: 'https://weibo.com/', douyin: 'https://www.douyin.com/',
    xiaohongshu: 'https://creator.xiaohongshu.com/', tencent_video: 'https://channels.weixin.qq.com/',
    kuaishou: 'https://cp.kuaishou.com/', toutiao: 'https://mp.toutiao.com/',
    bilibili: 'https://www.bilibili.com/', youtube: 'https://studio.youtube.com/', tiktok: 'https://www.tiktok.com/upload/',
  }[row.platform]
  if (url) window.open(url, '_blank')
}

async function checkLogin (row) {
  ElMessage.info(`正在验证 ${platformLabel(row.platform)} 登录状态...`)
  try {
    const res = await accountCheckLogin(row.platform, row.id)
    if (res.code === 0 && res.data?.valid) {
      ElMessage.success('登录状态有效')
    } else {
      ElMessage.warning(res.data?.message || '登录已过期，请重新添加账号')
    }
  } catch (e) {
    ElMessage.error(e.message)
  }
}

async function removeAccount (row) {
  try {
    await ElMessageBox.confirm(
      `确定删除「${platformLabel(row.platform)}」账号「${row.account_name || row.name || ''}」吗？`,
      '确认删除', { type: 'warning' }
    )
    const res = await accountDelete(row.id)
    if (res.code === 0) {
      ElMessage.success('账号已删除')
      refresh()
    } else {
      ElMessage.error(res.message || '删除失败')
    }
  } catch (e) { /* 用户取消 */ }
}
</script>

<style scoped>
.auth-overlay {
  position: fixed;
  top: 0; left: 0; right: 0; bottom: 0;
  background: rgba(0,0,0,0.3);
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
}
.auth-modal {
  background: var(--canvas,#fff);
  border-radius: 12px;
  width: 520px;
  max-height: 80vh;
  overflow: hidden;
  box-shadow: 0 8px 32px rgba(0,0,0,0.12);
}
.auth-modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid var(--hairline,#e8e8ec);
  font-weight: 600;
  font-size: 15px;
}
.auth-close-btn {
  border: none;
  background: none;
  cursor: pointer;
  font-size: 18px;
  color: var(--muted,#8e8e96);
  padding: 4px 8px;
  border-radius: 6px;
}
.auth-close-btn:hover { background: var(--soft-stone,#f5f5f7); }
.auth-modal-body { padding: 16px 20px 20px; }
.auth-hint { font-size: 13px; color: var(--muted,#8e8e96); margin: 0 0 12px; }
.auth-browser-placeholder { height: 400px; background: var(--soft-stone,#f9f9fb); border: 1px dashed var(--hairline,#d9d9dd); border-radius: 8px; }

/* 平台分组卡片 */
.card-group-header {
  display: flex;
  align-items: center;
  gap: var(--space-md);
  padding: var(--space-md) var(--space-md) var(--space-sm);
  border-bottom: 1px solid var(--border, #eee);
  margin-bottom: 0;
}
.card-icon.large { font-size: 28px; }
.card-platform-name { font-weight: 600; font-size: 15px; }
.card-platform-meta { display: flex; align-items: center; gap: 6px; margin-top: 4px; }

/* 账号行 */
.account-row {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  padding: 10px var(--space-md);
  border-bottom: 1px solid var(--border-light, #f0f0f0);
  transition: background 0.15s;
}
.account-row:last-child { border-bottom: none; }
.account-row:hover { background: var(--soft-stone, #f8f8fa); }
.account-row.is-default { background: var(--pale-blue,#fefaf5); }

.account-info { display: flex; align-items: center; gap: 6px; flex: 1; min-width: 0; }
.default-badge { font-size: 14px; color: #f5a623; }
.default-badge.muted { color: var(--muted,#ccc); }
.default-badge.muted:hover { color: #f5a623; }

.account-name-input {
  border: none;
  background: transparent;
  font-size: 13px;
  color: var(--text-primary, #333);
  width: 140px;
  outline: none;
  padding: 2px 4px;
  border-radius: 3px;
}
.account-name-input:hover { background: rgba(0,0,0,0.03); }
.account-name-input:focus { background: var(--canvas,#fff); border: 1px solid var(--coral, #f56c6c); }

.account-meta { display: flex; align-items: center; gap: 4px; min-width: 100px; }
.account-status-dot {
  width: 8px; height: 8px; border-radius: 50%; display: inline-block;
}
.account-status-dot.online { background: #52c41a; }
.account-status-dot.offline { background: #d9d9d9; }

.account-actions { display: flex; gap: 4px; flex-shrink: 0; }
.cohere-btn-ghost {
  font-size: 12px; padding: 4px 8px; border: none; background: none;
  cursor: pointer; border-radius: 4px; color: var(--action-blue, #1890ff);
}
.cohere-btn-ghost:hover { background: rgba(0,0,0,0.05); }
.cohere-btn-ghost.danger { color: var(--coral, #f56c6c); }
.cohere-btn-ghost.danger:hover { background: var(--canvas,#fff)1f0; }
</style>

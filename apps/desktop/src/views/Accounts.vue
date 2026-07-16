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
        <button class="cohere-btn-ghost" @click="showGroupManager = true">📁 分组管理</button>
        <button class="cohere-btn-primary" @click="showAddDialog = true">＋ 添加账号</button>
        <button v-if="authViewVisible" @click="closeAuthView" style="background:var(--error);color:white;border:none;padding:6px 16px;border-radius:6px;cursor:pointer;font-size:13px">✕ 关闭登录</button>
      </div>
    </div>

    <!-- 搜索 + 过滤条 -->
    <div style="padding: var(--space-lg) var(--space-xxl) 0">
      <div class="cohere-filter-bar">
        <div class="search-box">
          <span class="search-icon">🔍</span>
          <input
            v-model="searchInput"
            type="text"
            placeholder="搜索账号名称或平台..."
            class="search-input"
            @input="onSearchInput"
          />
          <button v-if="searchInput" class="search-clear" @click="clearSearch">✕</button>
        </div>
        <div class="filter-chips">
          <button class="cohere-filter-chip" :class="{ active: filter === 'all' }" @click="filter = 'all'">全部</button>
          <button class="cohere-filter-chip" :class="{ active: filter === 'active' }" @click="filter = 'active'">已登录</button>
          <button class="cohere-filter-chip" :class="{ active: filter === 'inactive' }" @click="filter = 'inactive'">未登录</button>
        </div>
        <span class="cohere-filter-meta">共 {{ groupedPlatforms.length }} 个平台 · {{ totalAccounts }} 个账号</span>
      </div>

      <!-- 批量操作栏 -->
      <div v-if="totalAccounts > 0" class="batch-toolbar">
        <label class="batch-select-all">
          <input type="checkbox" :checked="isAllSelected" @change="toggleSelectAll" />
          <span>全选</span>
        </label>
        <template v-if="selectedCount > 0">
          <span class="batch-selected-count">已选 {{ selectedCount }} 个</span>
          <button class="cohere-btn-ghost danger" @click="handleBatchDelete">🗑 批量删除</button>
          <button class="cohere-btn-ghost" @click="clearSelection">取消选择</button>
        </template>
      </div>
    </div>

    <!-- 内容体 -->
    <!-- 浮动关闭按钮（始终在 WebContentsView 之上） -->
    <div v-if="authViewVisible" @click="closeAuthView" class="floating-close-btn">✕ 关闭登录</div>
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
          <div v-for="acc in group.accounts" :key="acc.id" class="account-row" :class="{ 'is-default': acc.is_default, 'is-selected': isSelected(acc.id) }">
            <!-- 批量选择复选框 -->
            <label class="account-checkbox" @click.stop>
              <input type="checkbox" :checked="isSelected(acc.id)" @change="toggleSelect(acc.id)" />
            </label>
            <div class="account-info">
              <!-- 默认标记 -->
              <span v-if="acc.is_default" class="default-badge" title="默认账号">★</span>
              <span v-else class="default-badge muted" title="设为默认" @click="setDefault(acc)" style="cursor:pointer">☆</span>
              <!-- 平台图标 -->
              <span class="account-platform-icon">{{ platformIcon(acc.platform) }}</span>
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
              <span class="account-status-text">
                {{ acc.status === 'active' || acc.status === 'online' ? '有效' : '离线' }}
              </span>
              <span class="account-date">
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
    <UiModal
      :visible="showAddDialog"
      title="添加账号"
      size="sm"
      @close="showAddDialog = false"
    >
      <div class="add-account-form">
        <label class="form-label">选择平台</label>
        <UiSelect
          v-model="newPlatform"
          label="选择平台"
          placeholder="请选择平台"
          :options="allPlatforms.map(p => ({ value: p.id, label: p.label }))"
        />
        <div class="add-account-hint">
          <p>选择平台后，将打开内置浏览器进行登录授权。</p>
          <p>登录成功后，账号会自动添加到列表中。</p>
        </div>
      </div>
      <template #footer>
        <UiButton variant="ghost" @click="showAddDialog = false">取消</UiButton>
        <UiButton @click="addAccount" :disabled="adding || !newPlatform">{{ adding ? '添加中...' : '添加账号' }}</UiButton>
      </template>
    </UiModal>

    <!-- 分组管理弹窗 -->
    <UiModal
      :visible="showGroupManager"
      title="分组管理"
      size="md"
      @close="showGroupManager = false"
    >
      <div class="group-manager">
        <!-- 创建新分组 -->
        <div class="group-create">
          <input
            v-model="newGroupName"
            type="text"
            placeholder="输入新分组名称..."
            class="group-input"
            @keyup.enter="createNewGroup"
          />
          <button class="cohere-btn-primary" @click="createNewGroup" :disabled="!newGroupName.trim()">创建</button>
        </div>

        <!-- 分组列表 -->
        <div v-if="groups.length === 0" class="cohere-empty" style="padding:20px 0">
          <p style="color:var(--muted)">暂无自定义分组</p>
        </div>
        <div v-else class="group-list">
          <div v-for="group in groups" :key="group.id" class="group-item">
            <div class="group-info">
              <span class="group-name">{{ group.name }}</span>
              <span class="group-count">{{ getGroupAccountCount(group.id) }} 个账号</span>
            </div>
            <button class="cohere-btn-ghost danger" @click="deleteGroup(group.id)">删除</button>
          </div>
        </div>
      </div>
      <template #footer>
        <UiButton variant="ghost" @click="showGroupManager = false">关闭</UiButton>
      </template>
    </UiModal>
  </div>
</template>
<script setup>
import UiModal from "../components/UiModal.vue";
import UiSelect from "../components/UiSelect.vue";
import UiButton from "@/components/UiButton.vue";
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { usePlatformStore } from '@/stores/platforms'
import { useAccountStore } from '@/stores/accounts'
import { ElMessage, ElMessageBox } from 'element-plus'
import { listAccounts, accountDelete, accountCheckLogin, authOpenLogin, authClose, accountAdd, accountSetDefault, accountUpdate } from '@/api/publisher'

const loading = ref(false)
const showAddDialog = ref(false)
const adding = ref(false)
const newPlatform = ref('')
const filter = ref('all')
const searchInput = ref('')
const platformStore = usePlatformStore()
const accountStore = useAccountStore()
platformStore.load()
const authViewVisible = ref(false)
const authPlatformName = ref('')
const showGroupManager = ref(false)
const newGroupName = ref('')

// 搜索防抖
let searchTimer = null
function onSearchInput () {
  clearTimeout(searchTimer)
  searchTimer = setTimeout(() => {
    accountStore.searchQuery = searchInput.value
  }, 300)
}
function clearSearch () {
  searchInput.value = ''
  accountStore.searchQuery = ''
}

const allPlatforms = computed(() => platformStore.platforms.map(p => ({ id: p.id, label: p.label })))
function platformLabel (id) { return platformStore.getLabel(id) || id }
function platformIcon (id) { return platformStore.getIcon(id) || '📦' }

const totalAccounts = computed(() => accountStore.accounts.length)

// 批量选择
const selectedCount = computed(() => accountStore.selectedIds.size)
const isAllSelected = computed(() => {
  const accounts = accountStore.accounts
  return accounts.length > 0 && accounts.every(a => accountStore.selectedIds.has(a.id))
})

function isSelected (id) {
  return accountStore.selectedIds.has(id)
}
function toggleSelect (id) {
  accountStore.toggleSelect(id)
}
function toggleSelectAll () {
  accountStore.selectAll()
}
function clearSelection () {
  accountStore.clearSelection()
}

// 分组管理
const groups = computed(() => accountStore.groups || [])

function getGroupAccountCount (groupId) {
  const groupAccounts = accountStore.getGroupAccounts(groupId)
  return groupAccounts ? groupAccounts.length : 0
}

function createNewGroup () {
  const name = newGroupName.value.trim()
  if (!name) return
  accountStore.createGroup(name, '')
  newGroupName.value = ''
  ElMessage.success('分组创建成功')
}

function deleteGroup (groupId) {
  ElMessageBox.confirm('确定删除此分组吗？', '确认', { type: 'warning' }).then(() => {
    accountStore.deleteGroup(groupId)
    ElMessage.success('分组已删除')
  }).catch(() => {})
}

// 按平台分组
const groupedPlatforms = computed(() => {
  const accounts = accountStore.accounts
  const filtered = accounts.filter(a => {
    // 状态筛选
    if (filter.value === 'active') {
      if (a.status !== 'active' && a.status !== 'online') return false
    } else if (filter.value === 'inactive') {
      if (a.status === 'active' || a.status === 'online') return false
    }
    // 搜索筛选
    if (accountStore.searchQuery) {
      const q = accountStore.searchQuery.toLowerCase()
      const name = (a.account_name || a.name || '').toLowerCase()
      const platform = (a.platform || '').toLowerCase()
      if (!name.includes(q) && !platform.includes(q) && !platformLabel(a.platform).toLowerCase().includes(q)) return false
    }
    return true
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
  accountStore.loadGroups()
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
  clearTimeout(searchTimer)
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
      if (res.cancelled) {
        authViewVisible.value = false
      } else if (res.code !== 0) {
        ElMessage.error(res.message || '添加失败')
      }
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
  } catch (e) {
    if (e !== 'cancel' && e?.message !== 'canceled') {
      console.error('removeAccount error:', e)
      ElMessage.error('操作失败: ' + (e.message || '未知错误'))
    }
  }
}

async function handleBatchDelete () {
  const count = selectedCount.value
  if (count === 0) return
  try {
    await ElMessageBox.confirm(
      `确定删除选中的 ${count} 个账号吗？此操作不可恢复。`,
      '批量删除确认', { type: 'warning', confirmButtonText: '确认删除', cancelButtonText: '取消' }
    )
    await accountStore.batchDelete()
    ElMessage.success(`已删除 ${count} 个账号`)
    refresh()
  } catch (e) {
    if (e !== 'cancel' && e?.message !== 'canceled') {
      ElMessage.error('批量删除失败: ' + (e.message || '未知错误'))
    }
  }
}
</script>
<style scoped>
/* 搜索框 */
.search-box {
  position: relative;
  display: flex;
  align-items: center;
  flex: 0 0 280px;
}
.search-icon {
  position: absolute;
  left: 10px;
  font-size: 14px;
  color: var(--muted, #999);
  pointer-events: none;
}
.search-input {
  width: 100%;
  padding: 7px 32px 7px 32px;
  border: 1px solid var(--border, #e0e0e0);
  border-radius: 8px;
  font-size: 13px;
  background: var(--canvas, #fff);
  color: var(--text-primary, #333);
  outline: none;
  transition: border-color 0.2s, box-shadow 0.2s;
}
.search-input:focus {
  border-color: var(--action-blue, #1890ff);
  box-shadow: 0 0 0 2px rgba(24,144,255,0.12);
}
.search-input::placeholder { color: var(--muted, #bbb); }
.search-clear {
  position: absolute;
  right: 8px;
  background: none;
  border: none;
  cursor: pointer;
  font-size: 12px;
  color: var(--muted, #999);
  padding: 2px 4px;
  border-radius: 4px;
}
.search-clear:hover { background: rgba(0,0,0,0.05); }

.filter-chips {
  display: flex;
  gap: 4px;
}

.cohere-filter-bar {
  display: flex;
  align-items: center;
  gap: var(--space-md, 12px);
  flex-wrap: wrap;
}

/* 批量操作栏 */
.batch-toolbar {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 0;
  border-bottom: 1px solid var(--border-light, #eee);
  margin-bottom: 4px;
}
.batch-select-all {
  display: flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  font-size: 13px;
  color: var(--text-primary, #333);
  user-select: none;
}
.batch-select-all input[type="checkbox"] {
  width: 16px;
  height: 16px;
  accent-color: var(--action-blue, #1890ff);
  cursor: pointer;
}
.batch-selected-count {
  font-size: 13px;
  color: var(--action-blue, #1890ff);
  font-weight: 500;
}

/* 账号行复选框 */
.account-checkbox {
  display: flex;
  align-items: center;
  cursor: pointer;
  flex-shrink: 0;
}
.account-checkbox input[type="checkbox"] {
  width: 16px;
  height: 16px;
  accent-color: var(--action-blue, #1890ff);
  cursor: pointer;
}
.account-row.is-selected {
  background: rgba(24,144,255,0.06);
}

/* 平台图标 */
.account-platform-icon {
  font-size: 18px;
  flex-shrink: 0;
}

/* 添加账号表单 */
.add-account-form {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.form-label {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-primary, #333);
}
.add-account-hint {
  font-size: 12px;
  color: var(--muted, #999);
  line-height: 1.6;
  padding: 8px 12px;
  background: var(--soft-stone, #f8f8fa);
  border-radius: 8px;
}

/* 分组管理 */
.group-manager {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.group-create {
  display: flex;
  gap: 8px;
}
.group-input {
  flex: 1;
  padding: 8px 12px;
  border: 1px solid var(--border, #e0e0e0);
  border-radius: 8px;
  font-size: 13px;
  outline: none;
}
.group-input:focus {
  border-color: var(--action-blue, #1890ff);
}
.group-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.group-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px;
  border: 1px solid var(--border-light, #eee);
  border-radius: 8px;
  transition: background 0.15s;
}
.group-item:hover { background: var(--soft-stone, #f8f8fa); }
.group-info {
  display: flex;
  align-items: center;
  gap: 8px;
}
.group-name {
  font-weight: 500;
  font-size: 14px;
}
.group-count {
  font-size: 12px;
  color: var(--muted, #999);
}

/* 浮动关闭按钮 */
.floating-close-btn {
  position: fixed;
  bottom: 24px;
  right: 24px;
  z-index: 9999;
  background: var(--error);
  color: white;
  border: none;
  padding: 12px 24px;
  border-radius: 8px;
  cursor: pointer;
  font-size: 14px;
  font-weight: 600;
  box-shadow: 0 4px 12px rgba(0,0,0,0.3);
  display: flex;
  align-items: center;
  gap: 8px;
}

/* 原有样式保留 */
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
  background: var(--canvas,var(--surface));
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
  border-bottom: 1px solid var(--hairline,var(--border-light));
  font-weight: 600;
  font-size: 15px;
}
.auth-close-btn {
  border: none;
  background: none;
  cursor: pointer;
  font-size: 18px;
  color: var(--muted,var(--text-muted));
  padding: 4px 8px;
  border-radius: 6px;
}
.auth-close-btn:hover { background: var(--soft-stone,var(--bg)); }
.auth-modal-body { padding: 16px 20px 20px; }
.auth-hint { font-size: 13px; color: var(--muted,var(--text-muted)); margin: 0 0 12px; }
.auth-browser-placeholder { height: 400px; background: var(--soft-stone,#f9f9fb); border: 1px dashed var(--hairline,#d9d9dd); border-radius: 8px; }

/* 平台分组卡片 */
.card-group-header {
  display: flex;
  align-items: center;
  gap: var(--space-md);
  padding: var(--space-md) var(--space-md) var(--space-sm);
  border-bottom: 1px solid var(--border, var(--border));
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
  border-bottom: 1px solid var(--border-light, var(--border));
  transition: background 0.15s;
  flex-wrap: wrap;
}
.account-row:last-child { border-bottom: none; }
.account-row:hover { background: var(--soft-stone, #f8f8fa); }
.account-row.is-default { background: var(--pale-blue,#fefaf5); }

.account-info { display: flex; align-items: center; gap: 6px; flex: 1; min-width: 160px; }
.default-badge { font-size: 14px; color: var(--warning); }
.default-badge.muted { color: var(--muted,#ccc); }
.default-badge.muted:hover { color: var(--warning); }

.account-name-input {
  border: none;
  background: transparent;
  font-size: 13px;
  color: var(--text-primary, var(--ink));
  width: 140px;
  outline: none;
  padding: 2px 4px;
  border-radius: 3px;
}
.account-name-input:hover { background: rgba(0,0,0,0.03); }
.account-name-input:focus { background: var(--canvas,var(--surface)); border: 1px solid var(--coral, #f56c6c); }

.account-meta { display: flex; align-items: center; gap: 4px; min-width: 100px; }
.account-status-dot {
  width: 8px; height: 8px; border-radius: 50%; display: inline-block;
}
.account-status-dot.online { background: var(--success); }
.account-status-dot.offline { background: var(--border); }
.account-status-text {
  font-size: 12px;
  color: var(--text-secondary, #666);
}
.account-date {
  font-size: 11px;
  color: var(--muted, #ccc);
  margin-left: 8px;
}

.account-actions { display: flex; gap: 4px; flex-shrink: 0; }
.cohere-btn-ghost {
  font-size: 12px; padding: 4px 8px; border: none; background: none;
  cursor: pointer; border-radius: 4px; color: var(--action-blue, #1890ff);
}
.cohere-btn-ghost:hover { background: rgba(0,0,0,0.05); }
.cohere-btn-ghost.danger { color: var(--coral, #f56c6c); }
.cohere-btn-ghost.danger:hover { background: rgba(245,108,108,0.08); }
</style>
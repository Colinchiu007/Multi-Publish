<template>
  <div class="accounts-page">
    <header class="cohere-page-header accounts-header">
      <div>
        <div class="page-title">账号管理</div>
        <div class="page-subtitle">统一管理各平台账号、登录状态和发布分组</div>
      </div>
      <div class="page-actions">
        <button class="page-button secondary" type="button" @click="refresh"><Refresh />刷新</button>
        <button class="page-button secondary" type="button" @click="showGroupManager = true"><FolderOpened />分组管理</button>
        <button class="page-button primary" type="button" @click="showAddDialog = true"><Plus />添加账号</button>
        <button v-if="authViewVisible && loginMode === 'browser'" class="page-button primary" type="button" :disabled="completingLogin" @click="completeAuthView"><CircleCheck />{{ completingLogin ? '正在保存' : '我已完成登录' }}</button>
        <button v-if="authViewVisible" class="page-button danger" type="button" @click="closeAuthView"><Close />关闭登录</button>
      </div>
    </header>

    <section class="account-controls" aria-label="账号筛选">
      <div class="search-box">
        <Search class="search-icon" />
        <input
          v-model="searchInput"
          type="search"
          placeholder="搜索账号或平台"
          aria-label="搜索账号或平台"
          @input="onSearchInput"
        >
        <button v-if="searchInput" class="clear-search" type="button" title="清空搜索" aria-label="清空搜索" @click="clearSearch"><Close /></button>
      </div>

      <div class="filter-tabs" role="tablist" aria-label="账号状态">
        <button
          v-for="(item, index) in filterOptions"
          :key="item.value"
          type="button"
          role="tab"
          :class="{ active: filter === item.value }"
          :aria-selected="filter === item.value"
          :aria-controls="'account-results'"
          :tabindex="filter === item.value ? 0 : -1"
          @click="setFilter(item.value)"
          @keydown="onFilterKeydown($event, index)"
        >
          {{ item.label }}
        </button>
      </div>
      <span class="account-count">{{ groupedPlatforms.length }} 个平台，{{ totalAccounts }} 个账号</span>
    </section>

    <div v-if="totalAccounts > 0" class="batch-toolbar">
      <label>
        <input type="checkbox" :checked="isAllSelected" @change="toggleSelectAll">
        <span>全选当前结果</span>
      </label>
      <template v-if="selectedCount > 0">
        <span class="selected-count">已选 {{ selectedCount }} 个</span>
        <button class="batch-delete" type="button" @click="handleBatchDelete"><Delete />批量删除</button>
        <button class="batch-cancel" type="button" @click="clearSelection">取消选择</button>
      </template>
    </div>

    <div v-if="authViewVisible" class="login-state" role="status">
      <component :is="loginMode === 'qrcode' ? Cellphone : Monitor" />
      <div>
        <strong>{{ authPlatformName }}</strong>
        <span>{{ loginStateText }}</span>
      </div>
      <div class="login-state-actions">
        <button v-if="loginMode === 'browser'" class="complete-login" type="button" :disabled="completingLogin" @click="completeAuthView">{{ completingLogin ? '正在保存' : '我已完成登录' }}</button>
        <button type="button" @click="closeAuthView">关闭</button>
      </div>
    </div>

    <main id="account-results" class="accounts-content" role="tabpanel">
      <div v-if="loading" class="loading-state">正在加载账号...</div>
      <div v-else-if="groupedPlatforms.length === 0" class="empty-state">
        <UserFilled />
        <h2>{{ totalAccounts === 0 ? '暂无账号' : '没有匹配的账号' }}</h2>
      </div>
      <div v-else class="platform-groups">
        <PlatformAccountGroup
          v-for="group in groupedPlatforms"
          :key="group.platform"
          :group="group"
          :platform-label="platformLabel(group.platform)"
          :platform-icon="platformIcon(group.platform)"
          :selected-ids="accountStore.selectedIds"
          :favorite-ids="accountStore.favoriteIds || emptyIds"
          @add="addAccountForPlatform"
          @toggle-select="toggleSelect"
          @toggle-favorite="toggleFavorite"
          @set-default="setDefault"
          @rename="renameAccount"
          @open="openPlatform"
          @check="checkLogin"
          @remove="removeAccount"
        />
      </div>
    </main>

    <AccountLoginDialog
      :visible="showAddDialog"
      :platforms="allPlatforms"
      :model-value="newPlatform"
      :mode="selectedLoginMode"
      :busy="adding"
      :qr-available="qrAvailable"
      @update:model-value="newPlatform = $event"
      @update:mode="selectedLoginMode = $event"
      @submit="addAccount"
      @close="showAddDialog = false"
    />

    <AccountGroupManager
      :visible="showGroupManager"
      :groups="accountStore.groups || []"
      :accounts="accountStore.accounts"
      :platform-label="platformLabel"
      @create="createNewGroup"
      @delete="deleteGroup"
      @toggle-account="toggleAccountInGroup"
      @close="showGroupManager = false"
    />

    <AccountAuthorizationGuide
      :visible="showAuthorizationGuide"
      :platform-name="authPlatformName"
      @acknowledge="acknowledgeAuthorizationGuide"
    />

    <button v-if="authViewVisible" class="floating-close-button" type="button" @click="closeAuthView"><Close />关闭登录</button>
  </div>
</template>

<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { Cellphone, CircleCheck, Close, Delete, FolderOpened, Monitor, Plus, Refresh, Search, UserFilled } from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import AccountGroupManager from '@/features/accounts/components/AccountGroupManager.vue'
import AccountAuthorizationGuide from '@/features/accounts/components/AccountAuthorizationGuide.vue'
import AccountLoginDialog from '@/features/accounts/components/AccountLoginDialog.vue'
import PlatformAccountGroup from '@/features/accounts/components/PlatformAccountGroup.vue'
import { useAccountActions } from '@/composables/useAccountActions'
import { useAccountEvents } from '@/composables/useAccountEvents'
import { useAccountStore } from '@/stores/accounts'
import { usePlatformStore } from '@/stores/platforms'

const filterOptions = [
  { value: 'all', label: '全部' },
  { value: 'active', label: '已登录' },
  { value: 'inactive', label: '未登录' },
  { value: 'favorite', label: '收藏' },
]
const emptyIds = new Set()

const platformStore = usePlatformStore()
const accountStore = useAccountStore()
const accountActions = useAccountActions()
const loading = ref(false)
const showAddDialog = ref(false)
const showGroupManager = ref(false)
const adding = ref(false)
const completingLogin = ref(false)
const showAuthorizationGuide = ref(false)
const newPlatform = ref('')
const selectedLoginMode = ref('browser')
const filter = ref('all')
const searchInput = ref('')
let searchTimer = null
let resolveAuthorizationGuide = null

platformStore.load()

const accountEvents = useAccountEvents({
  onCompleted: async (_data, mode) => {
    ElMessage.success(mode === 'qrcode' ? '扫码登录成功' : '账号添加成功')
    await refresh()
  },
  onStatusChanged: async data => {
    await refresh()
    if (Number(data?.expiredCount) > 0) ElMessage.warning(`${data.expiredCount} 个账号登录已失效`)
  },
  onError: error => {
    ElMessage.error(error?.message || '账号事件处理失败')
  },
})
const {
  loginVisible,
  loginMode,
  platform: loginPlatform,
  qrStatus,
  markOpening,
  start: startAccountEvents,
  stop: stopAccountEvents,
} = accountEvents

const authViewVisible = computed({
  get: () => loginVisible.value,
  set: value => { loginVisible.value = Boolean(value) },
})
const authPlatformName = computed(() => loginPlatform.value ? platformLabel(loginPlatform.value) : '账号登录')
const loginStateText = computed(() => {
  if (loginMode.value !== 'qrcode') return '网页登录窗口已打开'
  return {
    opening: '正在打开扫码页',
    waiting: '等待二维码加载',
    detected: '二维码已就绪',
    completed: '账号保存完成',
    closed: '扫码窗口已关闭',
  }[qrStatus.value] || '扫码登录进行中'
})

const allPlatforms = computed(() => platformStore.platforms.map(item => ({ id: item.id, label: item.label })))
const totalAccounts = computed(() => accountStore.accounts.length)
const qrAvailable = computed(() => platformStore.supportsQrCode(newPlatform.value))

function shouldShowAuthorizationGuide () {
  try { return localStorage.getItem('account-authorization-guide-seen') !== '1' } catch (_) { return true }
}

function acknowledgeAuthorizationGuide () {
  showAuthorizationGuide.value = false
  try { localStorage.setItem('account-authorization-guide-seen', '1') } catch (_) { /* 隐私模式下仍允许继续 */ }
  if (resolveAuthorizationGuide) {
    resolveAuthorizationGuide()
    resolveAuthorizationGuide = null
  }
}

function waitForAuthorizationGuide () {
  if (!shouldShowAuthorizationGuide()) return Promise.resolve()
  showAuthorizationGuide.value = true
  return new Promise(resolve => { resolveAuthorizationGuide = resolve })
}

watch(filter, value => {
  accountStore.filterStatus = value
}, { flush: 'sync', immediate: true })

function platformLabel (id) {
  return platformStore.getLabel(id) || id
}

function platformIcon (id) {
  const icon = platformStore.getIcon(id)
  if (typeof icon === 'string' && icon.trim()) return icon
  return (platformLabel(id) || '?').slice(0, 1)
}

const groupedPlatforms = computed(() => {
  void filter.value
  return accountStore.groupedByPlatform
})

const visibleAccountIds = computed(() => groupedPlatforms.value.flatMap(group => group.accounts.map(account => account.id)))
const selectedVisibleIds = computed(() => visibleAccountIds.value.filter(id => accountStore.selectedIds.has(id)))
const selectedCount = computed(() => selectedVisibleIds.value.length)
const isAllSelected = computed(() => visibleAccountIds.value.length > 0 && selectedCount.value === visibleAccountIds.value.length)

function setFilter (value) {
  filter.value = value
}

function onFilterKeydown (event, index) {
  const lastIndex = filterOptions.length - 1
  let nextIndex = index
  if (event.key === 'ArrowRight' || event.key === 'ArrowDown') nextIndex = index === lastIndex ? 0 : index + 1
  else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') nextIndex = index === 0 ? lastIndex : index - 1
  else if (event.key === 'Home') nextIndex = 0
  else if (event.key === 'End') nextIndex = lastIndex
  else return

  event.preventDefault()
  const tablist = event.currentTarget?.parentElement
  setFilter(filterOptions[nextIndex].value)
  nextTick(() => {
    const tabs = tablist?.querySelectorAll('[role="tab"]')
    tabs?.[nextIndex]?.focus()
  })
}

function onSearchInput () {
  clearTimeout(searchTimer)
  searchTimer = setTimeout(() => { accountStore.searchQuery = searchInput.value }, 300)
}

function clearSearch () {
  searchInput.value = ''
  accountStore.searchQuery = ''
}

function toggleSelect (id) {
  accountStore.toggleSelect(id)
}

function toggleSelectAll () {
  accountStore.selectAll(visibleAccountIds.value)
}

function clearSelection () {
  accountStore.clearSelection()
}

function toggleFavorite (id) {
  accountStore.toggleFavorite(id)
}

function createNewGroup (name) {
  accountStore.createGroup(name.trim(), '')
  ElMessage.success('分组创建成功')
}

async function deleteGroup (groupId) {
  try {
    await ElMessageBox.confirm('确定删除此分组吗？', '确认', { type: 'warning' })
    accountStore.deleteGroup(groupId)
    ElMessage.success('分组已删除')
  } catch (_) { /* 用户取消 */ }
}

function toggleAccountInGroup (groupId, accountId) {
  accountStore.toggleAccountInGroup(groupId, accountId)
}

async function refresh () {
  loading.value = true
  try {
    await accountStore.load()
    if (accountStore.error) ElMessage.error(accountStore.error)
  } finally {
    loading.value = false
  }
}

async function addAccount () {
  if (!newPlatform.value) {
    ElMessage.warning('请选择平台')
    return
  }
  const platform = newPlatform.value
  const mode = selectedLoginMode.value
  adding.value = true
  showAddDialog.value = false
  if (mode === 'browser') await waitForAuthorizationGuide()
  markOpening(mode, platform)
  try {
    const result = await accountActions.openLogin(mode, platform)
    if (result?.cancelled) {
      loginVisible.value = false
    } else if (result?.code !== 0) {
      loginVisible.value = false
      ElMessage.error(result?.message || '添加失败')
    }
    if (result?.code === 0) newPlatform.value = ''
  } catch (error) {
    loginVisible.value = false
    ElMessage.error(error?.message || '添加账号失败')
  } finally {
    adding.value = false
  }
}

async function completeAuthView () {
  completingLogin.value = true
  try {
    const result = await accountActions.completeLogin(loginMode.value)
    if (result?.code !== 0) ElMessage.error(result?.message || '未能保存账号')
    else ElMessage.info('正在保存账号...')
  } catch (error) {
    ElMessage.error(error?.message || '未能保存账号')
  } finally {
    completingLogin.value = false
  }
}

function addAccountForPlatform (platform) {
  newPlatform.value = platform
  selectedLoginMode.value = 'browser'
  showAddDialog.value = true
}

async function closeAuthView () {
  try {
    await accountActions.closeLogin(loginMode.value)
  } finally {
    loginVisible.value = false
  }
}

async function setDefault (account) {
  try {
    const result = await accountStore.setDefault(account.id, account.platform)
    if (result?.code === 0) ElMessage.success(`已设为 ${platformLabel(account.platform)} 默认账号`)
    else ElMessage.error(result?.message || '设置默认账号失败')
  } catch (error) {
    ElMessage.error(error?.message || '设置默认账号失败')
  }
}

async function renameAccount (account, nextName) {
  const name = nextName.trim()
  if (!name || name === (account.account_name || account.name)) return
  try {
    const result = await accountStore.renameAccount(account.id, name)
    if (result?.code !== 0) ElMessage.error(result?.message || '重命名失败')
  } catch (error) {
    ElMessage.error(error?.message || '重命名失败')
  }
}

function openPlatform (account) {
  const url = platformStore.getDashboardUrl(account.platform)
  if (url) window.open(url, '_blank')
}

async function checkLogin (account) {
  ElMessage.info(`正在验证 ${platformLabel(account.platform)} 登录状态...`)
  try {
    const result = await accountActions.checkLogin(account)
    if (result?.code === 0 && result.data?.valid) ElMessage.success('登录状态有效')
    else ElMessage.warning(result?.data?.message || '登录已失效')
  } catch (error) {
    ElMessage.error(error?.message || '验证失败')
  }
}

async function removeAccount (account) {
  try {
    await ElMessageBox.confirm(
      `确定删除「${platformLabel(account.platform)}」账号「${account.account_name || account.name || ''}」吗？`,
      '确认删除',
      { type: 'warning' },
    )
    const result = await accountActions.remove(account.id)
    if (result?.code !== 0) {
      ElMessage.error(result?.message || '删除失败')
      return
    }
    ElMessage.success('账号已删除')
    await refresh()
  } catch (error) {
    if (error !== 'cancel' && error?.message !== 'canceled') ElMessage.error(`操作失败: ${error?.message || '未知错误'}`)
  }
}

async function handleBatchDelete () {
  const ids = [...selectedVisibleIds.value]
  const count = ids.length
  if (count === 0) return
  try {
    await ElMessageBox.confirm(
      `确定删除选中的 ${count} 个账号吗？此操作不可恢复。`,
      '批量删除确认',
      { type: 'warning', confirmButtonText: '确认删除', cancelButtonText: '取消' },
    )
    const result = await accountStore.batchDelete(ids)
    const { success, failed } = result || {}
    if (!Number.isInteger(success) || !Number.isInteger(failed) || success < 0 || failed < 0 || success + failed !== count) {
      throw new Error('批量删除返回了无效结果')
    }
    if (failed === 0) ElMessage.success(`已删除 ${success} 个账号`)
    else if (success > 0) ElMessage.warning(`已删除 ${success} 个账号，${failed} 个删除失败`)
    else ElMessage.error(`${failed} 个账号删除失败`)
  } catch (error) {
    if (error !== 'cancel' && error?.message !== 'canceled') ElMessage.error(`批量删除失败: ${error?.message || '未知错误'}`)
  }
}

onMounted(() => {
  accountStore.loadGroups()
  startAccountEvents()
  refresh()
})

onUnmounted(() => {
  clearTimeout(searchTimer)
  if (resolveAuthorizationGuide) resolveAuthorizationGuide()
  resolveAuthorizationGuide = null
  stopAccountEvents()
})
</script>

<style scoped>
.accounts-page { min-height: 100%; background: var(--surface, #f6f6f8); color: var(--text-primary, #28282f); }
.accounts-header { gap: 16px; }
.page-actions { display: flex; align-items: center; justify-content: flex-end; flex-wrap: wrap; gap: 8px; }
.page-button {
  min-height: 32px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  padding: 5px 10px;
  border: 1px solid var(--border, #dedee5);
  border-radius: 6px;
  background: #fff;
  color: #4d4e57;
  font-size: 13px;
  cursor: pointer;
}
.page-button svg { width: 15px; height: 15px; }
.page-button.primary { border-color: #5048e5; background: #5048e5; color: #fff; }
.page-button:disabled { opacity: 0.58; cursor: not-allowed; }
.page-button.danger { border-color: #d85a68; background: #d85a68; color: #fff; }
.page-button:focus-visible,
.clear-search:focus-visible,
.filter-tabs button:focus-visible,
.batch-toolbar button:focus-visible,
.login-state button:focus-visible,
.floating-close-button:focus-visible {
  outline: 2px solid #5048e5;
  outline-offset: 2px;
}
.account-controls {
  display: grid;
  grid-template-columns: minmax(220px, 320px) auto 1fr;
  align-items: center;
  gap: 14px;
  padding: 14px 24px 10px;
  border-bottom: 1px solid var(--border-light, #e8e8ec);
  background: #fff;
}
.search-box { position: relative; display: flex; align-items: center; }
.search-box input {
  width: 100%;
  height: 36px;
  padding: 7px 34px;
  border: 1px solid var(--border, #dedee5);
  border-radius: 6px;
  background: #fff;
  color: #28282f;
  font-size: 13px;
  outline: none;
}
.search-box input:focus { border-color: #5048e5; box-shadow: 0 0 0 2px rgba(80, 72, 229, 0.1); }
.search-icon { position: absolute; left: 11px; z-index: 1; width: 15px; height: 15px; color: #92939c; }
.clear-search { position: absolute; right: 6px; width: 26px; height: 26px; display: grid; place-items: center; border: 0; background: transparent; color: #92939c; cursor: pointer; }
.clear-search svg { width: 13px; height: 13px; }
.filter-tabs { display: inline-flex; align-items: center; gap: 2px; padding: 3px; border-radius: 7px; background: #f2f2f5; }
.filter-tabs button { min-height: 30px; padding: 4px 11px; border: 0; border-radius: 5px; background: transparent; color: #6f7079; font-size: 13px; cursor: pointer; }
.filter-tabs button.active { background: #fff; color: #5048e5; box-shadow: 0 1px 3px rgba(28, 28, 35, 0.12); }
.account-count { justify-self: end; color: #85858f; font-size: 12px; }
.batch-toolbar { min-height: 42px; display: flex; align-items: center; gap: 12px; padding: 6px 24px; border-bottom: 1px solid #e8e8ec; background: #fafafd; }
.batch-toolbar label { display: inline-flex; align-items: center; gap: 7px; font-size: 13px; cursor: pointer; }
.batch-toolbar input { width: 15px; height: 15px; accent-color: #5048e5; }
.selected-count { color: #5048e5; font-size: 13px; font-weight: 600; }
.batch-toolbar button { min-height: 28px; display: inline-flex; align-items: center; gap: 4px; padding: 4px 8px; border: 0; border-radius: 4px; background: transparent; font-size: 12px; cursor: pointer; }
.batch-toolbar svg { width: 14px; height: 14px; }
.batch-delete { color: #c43d4d; }
.batch-cancel { color: #5f6069; }
.login-state { position: fixed; top: 56px; left: 280px; right: 0; z-index: 9700; height: 44px; box-sizing: border-box; display: flex; align-items: center; gap: 10px; padding: 7px 24px; border-bottom: 1px solid #dcd9ff; background: #f3f2ff; color: #3d378f; }
.login-state > svg { width: 20px; height: 20px; }
.login-state div { display: flex; align-items: baseline; gap: 9px; flex: 1; min-width: 0; overflow: hidden; }
.login-state strong { flex: 0 0 auto; font-size: 13px; }
.login-state span { min-width: 0; overflow: hidden; color: #6e69a0; font-size: 12px; text-overflow: ellipsis; white-space: nowrap; }
.login-state-actions { flex: 0 0 auto; display: flex; align-items: center; gap: 8px; }
.login-state-actions button { border: 0; background: transparent; color: #5048e5; font-size: 12px; cursor: pointer; }
.login-state-actions .complete-login { min-height: 28px; padding: 4px 9px; border: 1px solid #5048e5; border-radius: 5px; background: #5048e5; color: #fff; }
.login-state-actions button:disabled { opacity: 0.58; cursor: not-allowed; }
.accounts-content { padding: 16px 24px 28px; }
.platform-groups { display: flex; flex-direction: column; gap: 12px; }
.loading-state, .empty-state { min-height: 260px; display: flex; align-items: center; justify-content: center; color: #85858f; font-size: 13px; }
.empty-state { flex-direction: column; gap: 10px; }
.empty-state svg { width: 38px; height: 38px; color: #b3b4bc; }
.empty-state h2 { margin: 0; color: #696a73; font-size: 15px; font-weight: 600; }
.floating-close-button {
  position: fixed;
  right: 22px;
  bottom: 22px;
  z-index: 9999;
  min-height: 36px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 7px 12px;
  border: 0;
  border-radius: 6px;
  background: #d34d5d;
  color: #fff;
  font-size: 13px;
  box-shadow: 0 5px 16px rgba(45, 31, 35, 0.22);
  cursor: pointer;
}
.floating-close-button svg { width: 15px; height: 15px; }
@media (max-width: 900px) {
  .account-controls { grid-template-columns: 1fr; }
  .account-count { justify-self: start; }
  .accounts-content { padding: 12px; }
  .floating-close-button { display: none; }
}
@media (max-width: 1360px) {
  .login-state { left: 0; }
}
</style>

import { defineStore } from 'pinia'
import { ref, computed, watch } from 'vue'
import { listAccounts, accountDelete, accountSetDefault, accountUpdate } from '@/api/publisher'
import { usePlatformStore } from '@/stores/platforms'

/**
 * 账号管理 Store（增强版 - 蚁小二复用）
 * 支持：按平台分组展示、账号分组管理、批量操作、搜索过滤、排序
 */
export const useAccountStore = defineStore('accounts', () => {
  const platformStore = usePlatformStore()
  const accounts = ref([])
  const groups = ref([])
  const favoriteIds = ref(new Set())
  const loading = ref(false)
  const error = ref(null)

  const searchQuery = ref('')
  const filterStatus = ref('all')
  const filterPlatform = ref('')
  const sortBy = ref('name')
  const sortOrder = ref('asc')
  const selectedIds = ref(new Set())
  const isAllSelected = ref(false)

  async function load() {
    loading.value = true
    error.value = null
    let shouldReconcileMetadata = false
    try {
      const res = await listAccounts()
      if (res && res.code === 0 && Array.isArray(res.data)) {
        accounts.value = res.data
        shouldReconcileMetadata = true
      } else if (Array.isArray(res)) {
        accounts.value = res
        shouldReconcileMetadata = true
      } else {
        accounts.value = []
      }
      reconcileSelection()
      loadGroups()
      loadFavorites()
      if (shouldReconcileMetadata) reconcileAccountMetadata()
    } catch (e) {
      error.value = e.message
      accounts.value = []
      reconcileSelection()
    } finally {
      loading.value = false
    }
  }

  const byPlatform = computed(() => {
    const map = {}
    for (const acc of accounts.value) {
      const p = acc.platform
      if (!map[p]) map[p] = []
      map[p].push(acc)
    }
    return map
  })

  const filteredAccounts = computed(() => {
    let result = [...accounts.value]
    if (searchQuery.value) {
      const q = searchQuery.value.toLowerCase()
      result = result.filter(acc =>
        (acc.name || '').toLowerCase().includes(q) ||
        (acc.account_name || '').toLowerCase().includes(q) ||
        (acc.platform || '').toLowerCase().includes(q) ||
        String(platformStore.getLabel(acc.platform) || '').toLowerCase().includes(q)
      )
    }
    if (filterStatus.value === 'favorite') {
      result = result.filter(acc => favoriteIds.value.has(acc.id))
    } else if (filterStatus.value !== 'all') {
      result = result.filter(acc => {
        if (filterStatus.value === 'active') return acc.status === 'active' || acc.status === 'online'
        return acc.status !== 'active' && acc.status !== 'online'
      })
    }
    if (filterPlatform.value) {
      result = result.filter(acc => acc.platform === filterPlatform.value)
    }
    result.sort((a, b) => {
      let valA, valB
      if (sortBy.value === 'name') {
        valA = (a.name || a.account_name || '').toLowerCase()
        valB = (b.name || b.account_name || '').toLowerCase()
      } else if (sortBy.value === 'created_at') {
        valA = new Date(a.created_at || 0).getTime()
        valB = new Date(b.created_at || 0).getTime()
      } else {
        valA = a[sortBy.value] || ''
        valB = b[sortBy.value] || ''
      }
      if (valA < valB) return sortOrder.value === 'asc' ? -1 : 1
      if (valA > valB) return sortOrder.value === 'asc' ? 1 : -1
      return 0
    })
    return result
  })

  const groupedByPlatform = computed(() => {
    const map = {}
    for (const acc of filteredAccounts.value) {
      const p = acc.platform
      if (!map[p]) map[p] = { platform: p, accounts: [], activeCount: 0, inactiveCount: 0 }
      map[p].accounts.push(acc)
      if (acc.status === 'active' || acc.status === 'online') map[p].activeCount++
      else map[p].inactiveCount++
    }
    return Object.values(map).sort((a, b) => b.activeCount - a.activeCount || b.accounts.length - a.accounts.length)
  })

  function syncAllSelected() {
    const visibleIds = filteredAccounts.value.map(account => account.id)
    isAllSelected.value = visibleIds.length > 0 && visibleIds.every(id => selectedIds.value.has(id))
  }

  function reconcileSelection() {
    const validIds = new Set(accounts.value.map(account => account.id))
    selectedIds.value = new Set(Array.from(selectedIds.value).filter(id => validIds.has(id)))
    syncAllSelected()
  }

  watch([filteredAccounts, selectedIds], syncAllSelected, { flush: 'sync' })

  function loadGroups() {
    try {
      const raw = localStorage.getItem('mp_account_groups')
      const parsed = raw ? JSON.parse(raw) : []
      if (!Array.isArray(parsed)) {
        groups.value = []
        return
      }
      let migrated = false
      groups.value = parsed.map(group => {
        const platformFilter = group.platformFilter || null
        let accountIds = group.accountIds
        if (!Array.isArray(accountIds)) {
          accountIds = accounts.value
            .filter(account => !platformFilter || account.platform === platformFilter)
            .map(account => account.id)
          migrated = true
        }
        return {
          ...group,
          platformFilter,
          accountIds: Array.from(new Set(accountIds)),
        }
      })
      if (migrated) saveGroups()
    } catch { groups.value = [] }
  }
  function saveGroups() {
    try {
      localStorage.setItem('mp_account_groups', JSON.stringify(groups.value))
      return true
    } catch {
      return false
    }
  }
  function createGroup(name, platformFilter, accountIds = []) {
    const normalizedPlatform = platformFilter || null
    const validIds = new Set(accounts.value
      .filter(account => !normalizedPlatform || account.platform === normalizedPlatform)
      .map(account => account.id))
    const group = {
      id: 'grp_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
      name,
      platformFilter: normalizedPlatform,
      accountIds: Array.from(new Set(accountIds.filter(id => validIds.has(id)))),
    }
    groups.value.push(group)
    saveGroups()
    return group
  }
  function deleteGroup(groupId) {
    groups.value = groups.value.filter(g => g.id !== groupId)
    saveGroups()
  }
  function getGroupAccounts(groupId) {
    const group = groups.value.find(g => g.id === groupId)
    if (!group) return []
    const memberIds = new Set(group.accountIds || [])
    return accounts.value.filter(account =>
      memberIds.has(account.id) && (!group.platformFilter || account.platform === group.platformFilter)
    )
  }
  function isAccountInGroup(groupId, accountId) {
    const group = groups.value.find(item => item.id === groupId)
    return Boolean(group && Array.isArray(group.accountIds) && group.accountIds.includes(accountId))
  }
  function toggleAccountInGroup(groupId, accountId) {
    const group = groups.value.find(item => item.id === groupId)
    const account = accounts.value.find(item => item.id === accountId)
    if (!group || !account || (group.platformFilter && account.platform !== group.platformFilter)) return false
    const next = new Set(group.accountIds || [])
    if (next.has(accountId)) next.delete(accountId)
    else next.add(accountId)
    group.accountIds = Array.from(next)
    saveGroups()
    return true
  }

  function loadFavorites() {
    try {
      const raw = localStorage.getItem('mp_account_favorites')
      const parsed = raw ? JSON.parse(raw) : []
      favoriteIds.value = new Set(Array.isArray(parsed) ? parsed : [])
    } catch {
      favoriteIds.value = new Set()
    }
  }
  function saveFavorites() {
    try {
      localStorage.setItem('mp_account_favorites', JSON.stringify(Array.from(favoriteIds.value)))
      return true
    } catch {
      return false
    }
  }
  function isFavorite(accountId) {
    return favoriteIds.value.has(accountId)
  }
  function toggleFavorite(accountId) {
    if (!accounts.value.some(account => account.id === accountId)) return false
    const next = new Set(favoriteIds.value)
    if (next.has(accountId)) next.delete(accountId)
    else next.add(accountId)
    favoriteIds.value = next
    saveFavorites()
    return true
  }
  function reconcileAccountMetadata() {
    const validIds = new Set(accounts.value.map(account => account.id))
    const nextFavorites = new Set(Array.from(favoriteIds.value).filter(id => validIds.has(id)))
    if (nextFavorites.size !== favoriteIds.value.size) {
      favoriteIds.value = nextFavorites
      saveFavorites()
    }
    let groupsChanged = false
    for (const group of groups.value) {
      const nextIds = (group.accountIds || []).filter(id => validIds.has(id))
      if (nextIds.length !== (group.accountIds || []).length) {
        group.accountIds = nextIds
        groupsChanged = true
      }
    }
    if (groupsChanged) saveGroups()
  }

  function toggleSelect(accountId) {
    if (selectedIds.value.has(accountId)) selectedIds.value.delete(accountId)
    else selectedIds.value.add(accountId)
    selectedIds.value = new Set(selectedIds.value)
    syncAllSelected()
  }
  function selectAll(accountIds) {
    const visibleIds = Array.isArray(accountIds)
      ? Array.from(new Set(accountIds))
      : filteredAccounts.value.map(account => account.id)
    const next = new Set(selectedIds.value)
    const allVisibleSelected = visibleIds.length > 0 && visibleIds.every(id => next.has(id))
    if (allVisibleSelected) visibleIds.forEach(id => next.delete(id))
    else visibleIds.forEach(id => next.add(id))
    selectedIds.value = next
    syncAllSelected()
  }
  function clearSelection() {
    selectedIds.value = new Set()
    isAllSelected.value = false
  }
  async function batchDelete(accountIds) {
    const ids = Array.isArray(accountIds)
      ? Array.from(new Set(accountIds)).filter(id => selectedIds.value.has(id))
      : Array.from(selectedIds.value)
    let success = 0, failed = 0
    for (const id of ids) {
      try {
        const res = await accountDelete(id)
        if (res.code === 0) success++; else failed++
      } catch { failed++ }
    }
    clearSelection()
    await load()
    return { success, failed }
  }
  async function batchSetStatus(status) {
    const ids = Array.from(selectedIds.value)
    let success = 0, failed = 0
    for (const id of ids) {
      try {
        const res = await accountUpdate(id, { status })
        if (res.code === 0) success++; else failed++
      } catch { failed++ }
    }
    clearSelection()
    await load()
    return { success, failed }
  }

  function getDefault(platform) {
    const list = byPlatform.value[platform]
    if (!list || list.length === 0) return null
    return list.find(a => a.is_default) || list[0]
  }
  async function setDefault(accountId, platform) {
    const account = accounts.value.find(item => item.id === accountId)
    if (!account || account.platform !== platform) return { code: -2, message: '账号不属于指定平台' }
    try { const res = await accountSetDefault(platform, accountId); if (res.code === 0) await load(); return res }
    catch (e) { return { code: -1, message: e.message } }
  }
  async function renameAccount(accountId, newName) {
    try { const res = await accountUpdate(accountId, { name: newName }); if (res.code === 0) await load(); return res }
    catch (e) { return { code: -1, message: e.message } }
  }

  return {
    accounts, groups, favoriteIds, loading, error, searchQuery, filterStatus, filterPlatform, sortBy, sortOrder, selectedIds, isAllSelected,
    byPlatform, filteredAccounts, groupedByPlatform,
    load, loadGroups, loadFavorites, getDefault, setDefault, renameAccount,
    createGroup, deleteGroup, getGroupAccounts, isAccountInGroup, toggleAccountInGroup,
    isFavorite, toggleFavorite,
    toggleSelect, selectAll, clearSelection, batchDelete, batchSetStatus,
  }
})

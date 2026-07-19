import { defineStore } from 'pinia'
import { ref, computed, watch } from 'vue'
import { listAccounts, accountDelete, accountSetDefault, accountUpdate } from '@/api/publisher'

/**
 * 账号管理 Store（增强版 - 蚁小二复用）
 * 支持：按平台分组展示、账号分组管理、批量操作、搜索过滤、排序
 */
export const useAccountStore = defineStore('accounts', () => {
  const accounts = ref([])
  const groups = ref([])
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
    try {
      const res = await listAccounts()
      if (res && res.code === 0 && Array.isArray(res.data)) {
        accounts.value = res.data
      } else if (Array.isArray(res)) {
        accounts.value = res
      } else {
        accounts.value = []
      }
      reconcileSelection()
      loadGroups()
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
        (acc.platform || '').toLowerCase().includes(q)
      )
    }
    if (filterStatus.value !== 'all') {
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
      groups.value = raw ? JSON.parse(raw) : []
    } catch { groups.value = [] }
  }
  function saveGroups() {
    localStorage.setItem('mp_account_groups', JSON.stringify(groups.value))
  }
  function createGroup(name, platformFilter) {
    const group = { id: 'grp_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8), name, platformFilter: platformFilter || null }
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
    if (group.platformFilter) return accounts.value.filter(a => a.platform === group.platformFilter)
    return [...accounts.value]
  }

  function toggleSelect(accountId) {
    if (selectedIds.value.has(accountId)) selectedIds.value.delete(accountId)
    else selectedIds.value.add(accountId)
    selectedIds.value = new Set(selectedIds.value)
    syncAllSelected()
  }
  function selectAll() {
    const visibleIds = filteredAccounts.value.map(account => account.id)
    const next = new Set(selectedIds.value)
    if (isAllSelected.value) visibleIds.forEach(id => next.delete(id))
    else visibleIds.forEach(id => next.add(id))
    selectedIds.value = next
    syncAllSelected()
  }
  function clearSelection() {
    selectedIds.value = new Set()
    isAllSelected.value = false
  }
  async function batchDelete() {
    const ids = Array.from(selectedIds.value)
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
    try { const res = await accountSetDefault(platform, accountId); if (res.code === 0) await load(); return res }
    catch (e) { return { code: -1, message: e.message } }
  }
  async function renameAccount(accountId, newName) {
    try { const res = await accountUpdate(accountId, { name: newName }); if (res.code === 0) await load(); return res }
    catch (e) { return { code: -1, message: e.message } }
  }

  return {
    accounts, groups, loading, error, searchQuery, filterStatus, filterPlatform, sortBy, sortOrder, selectedIds, isAllSelected,
    byPlatform, filteredAccounts, groupedByPlatform,
    load, loadGroups, getDefault, setDefault, renameAccount,
    createGroup, deleteGroup, getGroupAccounts,
    toggleSelect, selectAll, clearSelection, batchDelete, batchSetStatus,
  }
})

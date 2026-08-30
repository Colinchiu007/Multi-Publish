// @ts-check
/**
 * useProviderCrud.js — Provider CRUD composable（从 Providers.vue 拆分）
 *
 * 职责：
 *   - 维护 provider 列表 + 表单 + 删除 + 用户 Key 状态
 *   - loadProviders / submitForm / doDelete / testProvider / saveUserKey 副作用方法
 *   - filteredProviders / enabledCount 计算属性
 *
 * 复用：
 *   - useProviderForm 的 createDefaultForm / createEditForm / buildSubmitData 纯函数
 *   - useProviderFilters 的 filterProviders / enabledCount 纯函数
 */
import { ref, computed } from 'vue'
import { getApi } from '@/api/electron-bridge'
import { formatUserError } from '@/utils/user-facing-error'
import { useNotify } from './useNotify'
import { resolveNotifyText } from '@/utils/notifyCore'
import {
  providerList,
  providerCreate,
  providerUpdate,
  providerDelete,
  providerTest,
} from '@/api/providers'
import { createDefaultForm, createEditForm, buildSubmitData } from './useProviderForm'
import { filterProviders, enabledCount as countEnabled } from './useProviderFilters'

/**
 * Provider CRUD composable
 * @returns {object} 响应式状态 + 方法
 */
export function useProviderCrud() {
  // 统一通知通道（D1 决策）：toast 走 useNotify（带 notify:log 上报）
  const { notifyError, notifySuccess, notifyWarning } = useNotify()

  // 进度条/内联文案解析（非 toast，组件展示；文案统一进 locales）
  function progressText (messageKey, params, fallback) {
    const { text, resolved } = resolveNotifyText(messageKey, params)
    return resolved ? text : (fallback || '')
  }

  // ─── 数据状态 ─────────────────────────────────
  const providers = ref([])
  const loading = ref(true)
  const submitting = ref(false)
  const filterType = ref('all')

  // 测试结果缓存
  const testResults = ref({})
  const testingName = ref('')

  // 表单状态
  const showFormDialog = ref(false)
  const isEditing = ref(false)
  const formRef = ref(null)
  const form = ref(createDefaultForm())

  // 删除状态
  const showDeleteDialog = ref(false)
  const deleteTarget = ref(null)

  // 用户 Key 管理
  const showUserKeyDialog = ref(false)
  const userKeyTarget = ref(null)
  const userKeyForm = ref({ apiKey: '', baseUrl: '' })

  // ─── 计算属性 ─────────────────────────────────
  const filteredProviders = computed(function () {
    return filterProviders(providers.value, filterType.value)
  })

  const enabledCount = computed(function () {
    return countEnabled(providers.value)
  })

  // ─── 数据加载 ─────────────────────────────────
  async function loadProviders() {
    loading.value = true
    try {
      const res = await providerList()
      if (res.code === 0 && Array.isArray(res.data)) {
        providers.value = res.data
      } else {
        notifyError('providerCrud.loadFailed', { message: formatUserError(res, { fallback: progressText('providerCrud.loadFailed') }).message })
      }
    } catch (e) {
      notifyError('providerCrud.loadFailed', { message: formatUserError(e, { fallback: progressText('providerCrud.loadFailed') }).message })
    } finally {
      loading.value = false
    }
  }

  // ─── 创建/编辑 ────────────────────────────────
  function openCreate() {
    isEditing.value = false
    form.value = createDefaultForm()
    showFormDialog.value = true
  }

  function openEdit(provider) {
    isEditing.value = true
    form.value = createEditForm(provider)
    showFormDialog.value = true
  }

  async function submitForm() {
    if (!formRef.value) return
    const valid = await formRef.value.validate().catch(function () { return false })
    if (!valid) return

    submitting.value = true
    try {
      const data = buildSubmitData(form.value)
      let res
      if (isEditing.value) {
        res = await providerUpdate(form.value.name, data)
      } else {
        res = await providerCreate(data)
      }

      if (res.code === 0) {
        notifySuccess('providerCrud.updateSuccess', { message: progressText(isEditing.value ? 'providerCrud.updateSuccess' : 'providerCrud.createSuccess') })
        showFormDialog.value = false
        await loadProviders()
      } else {
        notifyError('providerCrud.saveFailed', { message: formatUserError(res, { fallback: progressText('providerCrud.saveFailed') }).message })
      }
    } catch (e) {
      notifyError('providerCrud.saveFailed', { message: formatUserError(e, { fallback: progressText('providerCrud.saveFailed') }).message })
    } finally {
      submitting.value = false
    }
  }

  // ─── 删除 ─────────────────────────────────────
  function confirmDelete(provider) {
    deleteTarget.value = provider
    showDeleteDialog.value = true
  }

  async function doDelete() {
    if (!deleteTarget.value) return
    submitting.value = true
    try {
      const res = await providerDelete(deleteTarget.value.name)
      if (res.code === 0) {
        notifySuccess('providerCrud.deleted', { message: progressText('providerCrud.deleted') })
        showDeleteDialog.value = false
        deleteTarget.value = null
        await loadProviders()
      } else {
        notifyError('providerCrud.deleteFailed', { message: formatUserError(res, { fallback: progressText('providerCrud.deleteFailed') }).message })
      }
    } catch (e) {
      notifyError('providerCrud.deleteFailed', { message: formatUserError(e, { fallback: progressText('providerCrud.deleteFailed') }).message })
    } finally {
      submitting.value = false
    }
  }

  // ─── 测试连接 ─────────────────────────────────
  async function testProvider(name) {
    testingName.value = name
    delete testResults.value[name]
    try {
      const res = await providerTest(name)
      if (res.code === 0) {
        testResults.value[name] = { success: true, message: res.message || 'ok' }
      } else {
        testResults.value[name] = { success: false, message: formatUserError(res, { fallback: progressText('providerCrud.connectionFailed') }).message }
      }
    } catch (e) {
      testResults.value[name] = { success: false, message: formatUserError(e, { fallback: progressText('providerCrud.connectionFailed') }).message }
    } finally {
      testingName.value = ''
      // 5 秒后自动清除结果
      setTimeout(function () { delete testResults.value[name] }, 5000)
    }
  }

  // ─── 用户 Key 管理 ────────────────────────────
  function openUserKey(provider) {
    userKeyTarget.value = provider
    userKeyForm.value = { apiKey: '', baseUrl: '' }
    showUserKeyDialog.value = true
  }

  async function saveUserKey() {
    if (!userKeyTarget.value) return
    try {
      const api = getApi()
      await api.providerSetUserKey(userKeyTarget.value.name, userKeyForm.value.apiKey, userKeyForm.value.baseUrl)
      notifySuccess('providerCrud.userKeySaved', { message: progressText('providerCrud.userKeySaved') })
      showUserKeyDialog.value = false
    } catch (e) {
      notifyError('providerCrud.saveUserKeyFailed', { message: formatUserError(e, { fallback: progressText('providerCrud.saveUserKeyFailed') }).message })
    }
  }

  return {
    // 数据状态
    providers,
    loading,
    submitting,
    filterType,
    testResults,
    testingName,
    // 表单状态
    showFormDialog,
    isEditing,
    formRef,
    form,
    // 删除状态
    showDeleteDialog,
    deleteTarget,
    // 用户 Key 状态
    showUserKeyDialog,
    userKeyTarget,
    userKeyForm,
    // 计算属性
    filteredProviders,
    enabledCount,
    // 方法
    loadProviders,
    openCreate,
    openEdit,
    submitForm,
    confirmDelete,
    doDelete,
    testProvider,
    openUserKey,
    saveUserKey,
  }
}

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
import { ElMessage } from 'element-plus'
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
        ElMessage.error(res.message || '加载失败')
      }
    } catch (e) {
      ElMessage.error(e.message)
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
        ElMessage.success(isEditing.value ? '更新成功' : '创建成功')
        showFormDialog.value = false
        await loadProviders()
      } else {
        ElMessage.error(res.message || '保存失败')
      }
    } catch (e) {
      ElMessage.error(e.message)
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
        ElMessage.success('已删除')
        showDeleteDialog.value = false
        deleteTarget.value = null
        await loadProviders()
      } else {
        ElMessage.error(res.message || '删除失败')
      }
    } catch (e) {
      ElMessage.error(e.message)
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
        testResults.value[name] = { success: false, message: res.message || '连接失败' }
      }
    } catch (e) {
      testResults.value[name] = { success: false, message: e.message }
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
      const api = window.electronAPI
      await api.providerSetUserKey(userKeyTarget.value.name, userKeyForm.value.apiKey, userKeyForm.value.baseUrl)
      ElMessage.success('用户 Key 已保存')
      showUserKeyDialog.value = false
    } catch (e) {
      ElMessage.error(e.message)
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

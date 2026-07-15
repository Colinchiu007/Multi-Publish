/**
 * useModelProviderCrud.js — 模型服务商 CRUD composable
 *
 * 职责：
 *   - 维护 5 类模型服务商列表 + 表单 + 删除 + 默认设置
 *   - loadProviders / submitForm / doDelete / testProvider / setDefault 等方法
 *   - filteredProviders / configuredCount 计算属性
 */
import { ref, computed } from 'vue'
import { ElMessage } from 'element-plus'
import {
  modelProviderList,
  modelProviderCreate,
  modelProviderUpdate,
  modelProviderDelete,
  modelProviderSetDefault,
  modelProviderTest,
  modelProviderPresets,
} from '@/api/model-providers'

const CATEGORY_OPTIONS = [
  { value: 'all', label: '全部' },
  { value: 'llm', label: '推理模型' },
  { value: 'tts', label: 'TTS语音' },
  { value: 'speech_recognition', label: '语音识别' },
  { value: 'image', label: '图片生成' },
  { value: 'video', label: '视频模型' },
]

const CATEGORY_LABELS = {
  llm: '推理模型',
  tts: 'TTS语音',
  speech_recognition: '语音识别',
  image: '图片生成',
  video: '视频模型',
}

function createDefaultForm () {
  return {
    id: '',
    name: '',
    category: 'llm',
    base_url: '',
    api_key: '',
    models: [],
    modelsText: '',
    config: {},
  }
}

function createEditForm (provider) {
  return {
    id: provider.id,
    name: provider.name,
    category: provider.category,
    base_url: provider.base_url || '',
    api_key: '',
    models: provider.models || [],
    modelsText: (provider.models || []).join(', '),
    config: provider.config || {},
  }
}

export function useModelProviderCrud () {
  // ─── 数据状态 ─────────────────────────────────
  const providers = ref([])
  const loading = ref(true)
  const submitting = ref(false)
  const filterCategory = ref('all')
  const safeStorageAvailable = ref(true) // P0: safeStorage 不可用时显示警告

  // 测试结果缓存
  const testResults = ref({})
  const testingId = ref('')

  // 表单状态
  const showFormDialog = ref(false)
  const isEditing = ref(false)
  const form = ref(createDefaultForm())

  // 删除状态
  const showDeleteDialog = ref(false)
  const deleteTarget = ref(null)

  // 新增对话框步骤
  const showAddDialog = ref(false)
  const addStep = ref(1) // 1: 选类别, 2: 选预设/自定义, 3: 填配置
  const addCategory = ref('llm')
  const addPresetId = ref('')
  const availablePresets = ref([])
  const isCustomAdd = ref(false)

  // ─── 计算属性 ─────────────────────────────────
  const filteredProviders = computed(() => {
    if (filterCategory.value === 'all') return providers.value
    return providers.value.filter(p => p.category === filterCategory.value)
  })

  const configuredCount = computed(() => {
    return providers.value.filter(p => p.api_key_masked || p.api_key).length
  })

  const categoryCounts = computed(() => {
    const counts = { all: providers.value.length }
    for (const p of providers.value) {
      counts[p.category] = (counts[p.category] || 0) + 1
    }
    return counts
  })

  // ─── 数据加载 ─────────────────────────────────
  async function loadProviders () {
    loading.value = true
    try {
      const res = await modelProviderList()
      if (res.code === 0 && Array.isArray(res.data)) {
        providers.value = res.data
      } else {
        ElMessage.error(res.message || '加载失败')
      }
    } catch (e) {
      ElMessage.error(e.message || '加载失败')
    } finally {
      loading.value = false
    }
  }

  // ─── 新增流程 ─────────────────────────────────
  function openAdd () {
    addStep.value = 1
    addCategory.value = 'llm'
    addPresetId.value = ''
    isCustomAdd.value = false
    showAddDialog.value = true
  }

  async function loadAvailablePresets () {
    try {
      const res = await modelProviderPresets(addCategory.value)
      if (res.code === 0) {
        availablePresets.value = res.data || []
      }
    } catch (e) {
      availablePresets.value = []
    }
  }

  function selectPreset (presetId) {
    addPresetId.value = presetId
    isCustomAdd.value = false
    addStep.value = 3
    const preset = availablePresets.value.find(p => p.id === presetId)
    if (preset) {
      form.value = {
        id: preset.id,
        name: preset.name,
        category: preset.category,
        base_url: preset.base_url || '',
        api_key: '',
        models: preset.models || [],
        modelsText: (preset.models || []).join(', '),
        config: {},
      }
    }
  }

  function selectCustom () {
    isCustomAdd.value = true
    addPresetId.value = ''
    addStep.value = 3
    form.value = createDefaultForm()
    form.value.category = addCategory.value
  }

  function nextAddStep () {
    if (addStep.value === 1) {
      addStep.value = 2
      loadAvailablePresets()
    }
  }

  // ─── 创建/编辑 ────────────────────────────────
  function openEdit (provider) {
    isEditing.value = true
    form.value = createEditForm(provider)
    showFormDialog.value = true
  }

  async function submitForm () {
    if (!form.value.name && !form.value.id) {
      ElMessage.warning('请填写服务商名称')
      return
    }

    submitting.value = true
    try {
      // 解析 models 文本
      const models = form.value.modelsText
        ? form.value.modelsText.split(',').map(s => s.trim()).filter(Boolean)
        : form.value.models || []

      const data = {
        name: form.value.name,
        category: form.value.category,
        base_url: form.value.base_url,
        api_key: form.value.api_key,
        models,
        config: form.value.config,
      }

      let res
      if (isEditing.value) {
        res = await modelProviderUpdate(form.value.id, data)
      } else {
        data.id = form.value.id || form.value.name.toLowerCase().replace(/\s+/g, '-')
        res = await modelProviderCreate(data)
      }

      if (res.code === 0) {
        ElMessage.success(isEditing.value ? '更新成功' : '添加成功')
        showFormDialog.value = false
        showAddDialog.value = false
        await loadProviders()
      } else {
        ElMessage.error(res.message || '保存失败')
      }
    } catch (e) {
      ElMessage.error(e.message || '保存失败')
    } finally {
      submitting.value = false
    }
  }

  // ─── 删除 ─────────────────────────────────────
  function confirmDelete (provider) {
    if (provider.is_preset) {
      ElMessage.warning('预设服务商不支持删除，如需移除请禁用该服务商')
      return
    }
    deleteTarget.value = provider
    showDeleteDialog.value = true
  }

  async function doDelete () {
    if (!deleteTarget.value) return
    submitting.value = true
    try {
      const res = await modelProviderDelete(deleteTarget.value.id)
      if (res.code === 0) {
        ElMessage.success('已删除')
        showDeleteDialog.value = false
        deleteTarget.value = null
        await loadProviders()
      } else {
        ElMessage.error(res.message || '删除失败')
      }
    } catch (e) {
      ElMessage.error(e.message || '删除失败')
    } finally {
      submitting.value = false
    }
  }

  // ─── 启用/禁用 ────────────────────────────────
  async function toggleEnabled (provider) {
    const newEnabled = !provider.enabled
    const res = await modelProviderUpdate(provider.id, { enabled: newEnabled })
    if (res.code === 0) {
      ElMessage.success(newEnabled ? '已启用' : '已禁用')
      await loadProviders()
    } else {
      ElMessage.error(res.message || '操作失败')
    }
  }

  // ─── 设为默认 ─────────────────────────────────
  async function setDefault (provider) {
    if (!provider.api_key_masked && !provider.api_key) {
      ElMessage.warning('请先配置 API Key 后再设为默认')
      return
    }
    try {
      const res = await modelProviderSetDefault(provider.category, provider.id)
      if (res.code === 0) {
        ElMessage.success('已设为默认')
        await loadProviders()
      } else {
        ElMessage.error(res.message || '设置失败')
      }
    } catch (e) {
      ElMessage.error(e.message || '设置失败')
    }
  }

  // ─── 测试连接 ─────────────────────────────────
  async function testProvider (id) {
    testingId.value = id
    delete testResults.value[id]
    try {
      const res = await modelProviderTest(id)
      if (res.code === 0) {
        testResults.value[id] = { success: true, message: res.message || 'ok' }
      } else {
        testResults.value[id] = { success: false, message: res.message || '连接失败' }
      }
    } catch (e) {
      testResults.value[id] = { success: false, message: e.message }
    } finally {
      testingId.value = ''
      setTimeout(() => { delete testResults.value[id] }, 5000)
    }
  }

  return {
    // 常量
    CATEGORY_OPTIONS,
    CATEGORY_LABELS,
    // 数据状态
    providers,
    loading,
    submitting,
    filterCategory,
    testResults,
    testingId,
    safeStorageAvailable,
    // 表单状态
    showFormDialog,
    isEditing,
    form,
    // 删除状态
    showDeleteDialog,
    deleteTarget,
    // 新增对话框
    showAddDialog,
    addStep,
    addCategory,
    addPresetId,
    availablePresets,
    isCustomAdd,
    // 计算属性
    filteredProviders,
    configuredCount,
    categoryCounts,
    // 方法
    loadProviders,
    openAdd,
    nextAddStep,
    selectPreset,
    selectCustom,
    openEdit,
    submitForm,
    confirmDelete,
    doDelete,
    toggleEnabled,
    setDefault,
    testProvider,
  }
}

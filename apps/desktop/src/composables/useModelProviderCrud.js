/**
 * useModelProviderCrud.js — 模型服务商 CRUD composable
 *
 * 职责：
 *   - 维护 6 类模型服务商列表 + 表单 + 删除 + 默认设置
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
import { storeGetSetting, storeSetSetting } from '@/api/publisher'

const CATEGORY_OPTIONS = [
  { value: 'all', label: '全部' },
  { value: 'llm', label: '推理模型' },
  { value: 'tts', label: 'TTS语音' },
  { value: 'speech_recognition', label: '语音识别' },
  { value: 'image', label: '图片生成' },
  { value: 'video', label: '视频模型' },
  { value: 'audio', label: '音频生成' },
  { value: 'multimodal', label: '多模态模型' },
]

const CATEGORY_LABELS = {
  llm: '推理模型',
  tts: 'TTS语音',
  speech_recognition: '语音识别',
  image: '图片生成',
  video: '视频模型',
  audio: '音频生成',
  multimodal: '多模态模型',
}

/** 多模态能力的中文标签（用于前端展示预设能力） */
const MULTIMODAL_CAPABILITY_LABELS = {
  llm: '文字推理',
  tts: 'TTS语音',
  speech_recognition: '语音识别',
  image: '生图',
  video: '生成视频',
}

/** 偏好开关的持久化 key（与主进程 ModelProviderManager 一致） */
const PREFER_MULTIMODAL_SETTING_KEY = 'prefer_multimodal'

const LOCAL_NO_KEY_PROVIDER_IDS = new Set(['piper', 'local-diffusion', 'comfyui'])

function canUseWithoutApiKey (provider) {
  if (!provider || !LOCAL_NO_KEY_PROVIDER_IDS.has(provider.id)) return false
  const baseUrl = String(provider.base_url || '').trim()
  if (!baseUrl) return true
  try {
    const url = new URL(baseUrl)
    return ['localhost', '127.0.0.1', '::1', '[::1]'].includes(url.hostname.toLowerCase())
  } catch (_) {
    return false
  }
}

function isProviderConfigured (provider) {
  return Boolean(provider && provider.is_configured === true)
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
  const viewMode = ref('configured') // 'configured' | 'all'
  const safeStorageAvailable = ref(true) // P0: safeStorage 不可用时显示警告
  // 「优先使用多模态模型进行所有的AI操作」全局开关（默认开启）
  const preferMultimodal = ref(true)

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
  const configuredProviders = computed(() => {
    if (!providers.value) return []
    return providers.value.filter(isProviderConfigured)
  })

  const unconfiguredPresets = computed(() => {
    return providers.value.filter(p => p.is_preset && !isProviderConfigured(p))
  })

  const customProviders = computed(() => {
    return providers.value.filter(p => !p.is_preset)
  })

  const filteredProviders = computed(() => {
    if (!providers.value) return []
    const base = viewMode.value === 'configured' ? configuredProviders.value : providers.value
    if (filterCategory.value === 'all') return base
    return base.filter(p => p.category === filterCategory.value)
  })

  const configuredCount = computed(() => {
    if (!providers.value) return 0
    return providers.value.filter(isProviderConfigured).length
  })

  const presetCount = computed(() => {
    if (!providers.value) return 0
    return providers.value.filter(p => p.is_preset).length
  })

  const categoryCounts = computed(() => {
    if (!providers.value) return {}
    const counts = { all: providers.value.length }
    for (const p of providers.value) {
      counts[p.category] = (counts[p.category] || 0) + 1
    }
    return counts
  })

  const configuredCategoryCounts = computed(() => {
    const counts = { all: configuredProviders.value.length }
    for (const p of configuredProviders.value) {
      counts[p.category] = (counts[p.category] || 0) + 1
    }
    return counts
  })

  const activeCategoryCounts = computed(() => {
    return viewMode.value === 'configured'
      ? configuredCategoryCounts.value
      : categoryCounts.value
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

  // ─── 多模态优先开关 ──────────────────────────
  async function loadMultimodalPreference () {
    try {
      const res = await storeGetSetting(PREFER_MULTIMODAL_SETTING_KEY)
      // 未配置时默认开启（true）
      preferMultimodal.value = res?.code === 0 ? res.data !== false : true
    } catch (_) {
      preferMultimodal.value = true
    }
  }

  async function saveMultimodalPreference (value) {
    const next = value !== false
    preferMultimodal.value = next
    try {
      await storeSetSetting(PREFER_MULTIMODAL_SETTING_KEY, next)
    } catch (_) {
      ElMessage.error('多模态优先设置保存失败')
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
        capabilities: Array.isArray(preset.capabilities) ? [...preset.capabilities] : [],
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
    if (!isEditing.value && !String(form.value.api_key || '').trim() && !canUseWithoutApiKey(form.value)) {
      ElMessage.warning('请填写 API Key；仅本地 Piper、Local Diffusion 或 ComfyUI 可免填')
      return
    }

    submitting.value = true
    try {
      // 解析 models 文本
      const models = form.value.modelsText
        ? form.value.modelsText.split(',').map(s => s.trim()).filter(Boolean)
        : form.value.models || []

      // 深拷贝：Vue ref 嵌套对象是 reactive proxy，传给 IPC 时 structured clone 会报
      // 'An object could not be cloned'。JSON 序列化安全脱壳。
      const data = JSON.parse(JSON.stringify({
        name: form.value.name,
        category: form.value.category,
        base_url: form.value.base_url,
        models,
        config: form.value.config || {},
      }))
      // API Key 留空 = 保持不变；只有填写了新 Key 才上送，避免误清除已保存的 Key
      if (form.value.api_key) data.api_key = form.value.api_key
      if (!isEditing.value && canUseWithoutApiKey(form.value)) data.enabled = true

      let res
      if (isEditing.value) {
        res = await modelProviderUpdate(String(form.value.id), data)
      } else {
        data.id = String(form.value.id || form.value.name.toLowerCase().replace(/\s+/g, '-'))
        res = await modelProviderCreate(data)
      }

      if (res.code === 0) {
        ElMessage.success(isEditing.value ? '更新成功' : '添加成功')
        filterCategory.value = 'all'
        showFormDialog.value = false
        showAddDialog.value = false
        await loadProviders()
      } else if (!isEditing.value && res.message && res.message.includes('already exists')) {
        // ID 冲突（预设已存在）→ 自动降级为更新，允许用户配置已有预设
        const updateRes = await modelProviderUpdate(data.id, data)
        if (updateRes.code === 0) {
          ElMessage.success('已更新已有服务商配置')
          filterCategory.value = 'all'
          showFormDialog.value = false
          showAddDialog.value = false
          await loadProviders()
        } else {
          ElMessage.error(updateRes.message || '更新失败')
        }
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
    if (!isProviderConfigured(provider)) {
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
      // 成功只显示友好提示，不暴露技术性响应体（如 {"success":true}）；
      // 失败时仅在存在可读 detail 时展示，避免原始技术错误对象外泄。
      testResults.value[id] = {
        success: res.code === 0,
        code: res.code,
        message: res.message || (res.code === 0 ? '连接成功' : '连接失败'),
        detail: res.code !== 0 && res.detail ? String(res.detail) : null,
      }
    } catch (e) {
      testResults.value[id] = {
        success: false,
        code: -1,
        message: e.message || '请求异常',
        detail: null,
      }
    } finally {
      testingId.value = ''
      setTimeout(() => { delete testResults.value[id] }, 8000)
    }
  }

  return {
    // 常量
    CATEGORY_OPTIONS,
    CATEGORY_LABELS,
    MULTIMODAL_CAPABILITY_LABELS,
    // 数据状态
    providers,
    loading,
    submitting,
    filterCategory,
    viewMode,
    testResults,
    testingId,
    safeStorageAvailable,
    preferMultimodal,
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
    configuredProviders,
    unconfiguredPresets,
    customProviders,
    filteredProviders,
    configuredCount,
    presetCount,
    categoryCounts,
    configuredCategoryCounts,
    activeCategoryCounts,
    isProviderConfigured,
    // 方法
    loadProviders,
    loadMultimodalPreference,
    saveMultimodalPreference,
    openAdd,
    nextAddStep,
    loadAvailablePresets,
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


/**
 * useModelProviderCrud.js — 模型服务商 CRUD composable
 *
 * 职责：
 *   - 维护 6 类模型服务商列表 + 表单 + 删除 + 默认设置
 *   - loadProviders / submitForm / doDelete / testProvider / setDefault 等方法
 *   - filteredProviders / configuredCount 计算属性
 */
import { ref, computed } from 'vue'
import { useI18n } from 'vue-i18n'
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
import { formatUserError } from '@/utils/user-facing-error'

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
  const { t } = useI18n()

  const CATEGORY_OPTIONS = computed(() => [
    { value: 'all', label: t('modelProviders.catAll') },
    { value: 'llm', label: t('modelProviders.catLlm') },
    { value: 'tts', label: t('modelProviders.catTts') },
    { value: 'speech_recognition', label: t('modelProviders.catSpeechRecognition') },
    { value: 'image', label: t('modelProviders.catImage') },
    { value: 'video', label: t('modelProviders.catVideo') },
    { value: 'audio', label: t('modelProviders.catAudio') },
    { value: 'multimodal', label: t('modelProviders.catMultimodal') },
  ])
  const CATEGORY_LABELS = computed(() => ({
    llm: t('modelProviders.catLlm'),
    tts: t('modelProviders.catTts'),
    speech_recognition: t('modelProviders.catSpeechRecognition'),
    image: t('modelProviders.catImage'),
    video: t('modelProviders.catVideo'),
    audio: t('modelProviders.catAudio'),
    multimodal: t('modelProviders.catMultimodal'),
  }))
  const MULTIMODAL_CAPABILITY_LABELS = computed(() => ({
    llm: t('modelProviders.capLlm'),
    tts: t('modelProviders.capTts'),
    speech_recognition: t('modelProviders.capSpeechRecognition'),
    image: t('modelProviders.capImage'),
    video: t('modelProviders.capVideo'),
  }))

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
        ElMessage.error(formatUserError(res, { fallback: t('modelProviders.loadFailed') }).message)
      }
    } catch (e) {
      ElMessage.error(formatUserError(e, { fallback: t('modelProviders.loadFailed') }).message)
    } finally {
      loading.value = false
    }
  }

  // ─── 多模态优先开关 ──────────────────────────
  async function loadMultimodalPreference () {
    try {
      const res = await storeGetSetting(PREFER_MULTIMODAL_SETTING_KEY)
      // storeGetSetting 已解包 IPC 信封：成功返回裸值（false/true/null），失败返回 null。
      // 未配置或读取失败时按产品语义默认开启（true）。
      preferMultimodal.value = res !== false
    } catch (_) {
      preferMultimodal.value = true
    }
  }

  async function saveMultimodalPreference (value) {
    const next = value !== false
    const previous = preferMultimodal.value
    preferMultimodal.value = next
    try {
      const res = await storeSetSetting(PREFER_MULTIMODAL_SETTING_KEY, next)
      // 保存失败（未登录 AUTH_ERROR、IPC 不可用 undefined 等）时回滚 UI，
      // 避免乐观更新造成「已保存」假象；再次进入页面又恢复默认值。
      if (res?.code !== 0) {
        preferMultimodal.value = previous
        ElMessage.error(formatUserError(res, { fallback: t('modelProviders.preferMultimodalSaveFailed') }).message)
      }
    } catch (_) {
      preferMultimodal.value = previous
      ElMessage.error(t('modelProviders.preferMultimodalSaveFailed'))
    }
  }

  // MiniMax 多模态预设：模型列表由程序预设（seeds）+ 运营后台（catalog 下发）控制，
  // 前端不提供模型列表编辑输入框，仅只读展示。
  const isMiniMaxMultimodal = computed(() => form.value.id === 'minimax-multimodal')

  // 多模态「支持生成视频」开关（默认关闭；仅影响 video 能力默认路由，见 _multimodalProviderFor）
  const multimodalVideoEnabled = computed({
    get: () => {
      const cfg = form.value.config || {}
      return cfg.capability_enabled?.video === true
    },
    set: (value) => {
      const cfg = (form.value.config = form.value.config || {})
      // 克隆后写入，避免原地修改 provider.config 导致「取消」后内存态被污染
      cfg.capability_enabled = { ...(cfg.capability_enabled || {}), video: value === true }
    },
  })

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
        // 多模态预设「支持生成视频」默认关闭：新建即持久化 capability_enabled.video=false
        config: preset.category === 'multimodal' ? { capability_enabled: { video: false } } : {},
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
      ElMessage.warning(t('modelProviders.nameRequired'))
      return
    }
    if (!isEditing.value && !String(form.value.api_key || '').trim() && !canUseWithoutApiKey(form.value)) {
      ElMessage.warning(t('modelProviders.apiKeyRequired'))
      return
    }

    submitting.value = true
    try {
      // 运营限流字段校验（每分钟连接次数 / 5小时限额次数）：正整数或留空
      const cfg = form.value.config || {}
      for (const field of ['rate_per_minute', 'limit_per_5h']) {
        if (!(field in cfg)) continue
        const raw = cfg[field]
        if (raw === '' || raw === undefined || raw === null) { cfg[field] = null; continue }
        const num = Number(raw)
        if (!Number.isInteger(num) || num < 1) {
          ElMessage.warning(t(field === 'rate_per_minute' ? 'modelProviders.ratePerMinuteInvalid' : 'modelProviders.limitPer5hInvalid'))
          return
        }
        cfg[field] = num
      }

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
        ElMessage.success(t(isEditing.value ? 'modelProviders.updateSuccess' : 'modelProviders.addSuccess'))
        filterCategory.value = 'all'
        showFormDialog.value = false
        showAddDialog.value = false
        await loadProviders()
      } else if (!isEditing.value && (res.errorCode === 'PROVIDER_EXISTS' || (res.message && res.message.includes('already exists')))) {
        // ID 冲突（预设已存在）→ 自动降级为更新，允许用户配置已有预设
        const updateRes = await modelProviderUpdate(data.id, data)
        if (updateRes.code === 0) {
          ElMessage.success(t('modelProviders.updatedExisting'))
          filterCategory.value = 'all'
          showFormDialog.value = false
          showAddDialog.value = false
          await loadProviders()
        } else {
          ElMessage.error(formatUserError(updateRes, { fallback: t('modelProviders.updateFailed') }).message)
        }
      } else {
        ElMessage.error(formatUserError(res, { fallback: t('modelProviders.saveFailed') }).message)
      }
    } catch (e) {
      ElMessage.error(formatUserError(e, { fallback: t('modelProviders.saveFailed') }).message)
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
        ElMessage.success(t('modelProviders.deleted'))
        showDeleteDialog.value = false
        deleteTarget.value = null
        await loadProviders()
      } else {
        ElMessage.error(formatUserError(res, { fallback: t('modelProviders.deleteFailed') }).message)
      }
    } catch (e) {
      ElMessage.error(formatUserError(e, { fallback: t('modelProviders.deleteFailed') }).message)
    } finally {
      submitting.value = false
    }
  }

  // ─── 启用/禁用 ────────────────────────────────
  async function toggleEnabled (provider) {
    const newEnabled = !provider.enabled
    const res = await modelProviderUpdate(provider.id, { enabled: newEnabled })
    if (res.code === 0) {
      ElMessage.success(t(newEnabled ? 'modelProviders.enabledMsg' : 'modelProviders.disabledMsg'))
      await loadProviders()
    } else {
      ElMessage.error(formatUserError(res, { fallback: t('modelProviders.operationFailed') }).message)
    }
  }

  // ─── 设为默认 ─────────────────────────────────
  async function setDefault (provider) {
    if (!isProviderConfigured(provider)) {
      ElMessage.warning(t('modelProviders.configureFirst'))
      return
    }
    try {
      const res = await modelProviderSetDefault(provider.category, provider.id)
      if (res.code === 0) {
        ElMessage.success(t('modelProviders.setDefaultSuccess'))
        await loadProviders()
      } else {
        ElMessage.error(formatUserError(res, { fallback: t('modelProviders.setDefaultFailed') }).message)
      }
    } catch (e) {
      ElMessage.error(formatUserError(e, { fallback: t('modelProviders.setDefaultFailed') }).message)
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
        message: res.code === 0 ? t('modelProviders.connectionSuccess') : formatUserError(res, { fallback: t('modelProviders.connectionFailed') }).message,
        detail: res.code !== 0 && res.detail ? String(res.detail) : null,
      }
    } catch (e) {
      testResults.value[id] = {
        success: false,
        code: -1,
        message: formatUserError(e, { fallback: t('modelProviders.requestError') }).message,
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
    multimodalVideoEnabled,
    isMiniMaxMultimodal,
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


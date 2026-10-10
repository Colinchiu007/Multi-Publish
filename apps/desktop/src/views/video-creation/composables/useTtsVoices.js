/**
 * useTtsVoices — TTS 音色域状态域（CreateView 拆分第 2 步，FRONTEND-FILE-SPLIT-PLAN-2026-10 v3 §2.2）
 *
 * 承接 CreateView 的 TTS 音色状态与方法（`s2vVoice*` 20 个状态 + 6 个计算属性 + 28 个方法）。
 * 设计约束（与 useBgmLibrary 同构，见方案 §2.3）：
 *   - 模块级单例（音色目录/克隆列表为设备级资源）；无实例依赖（不调 watch/onMounted），
 *     壳 CreateView 以「方法代理 + computed get/set 状态桥接」接入，旧测试触点不变；
 *   - 跨域写点（s2vConfig 读写、IPC 脱壳、卸载守卫、toast、locale 取值）经
 *     setupTtsVoicesDeps 注入，不反向 import 壳；
 *   - 用户可见文案一律走 locale（debs.t），**本文件不得出现 CJK 字面量**
 *     （CI Gate 7 --cjk 基线拦新路径，见方案 §2.6 发现 T1）。
 */
import { reactive, computed, toRefs } from 'vue'
import {
  getTtsVoiceCatalog,
  getTtsVoiceCapability,
  selectTtsVoice,
  clearTtsVoicePreference,
} from '@/api/tts-voice-catalog'
import {
  addTtsVoiceClone,
  chooseTtsVoiceCloneSamples,
  deleteTtsVoiceClone,
  getTtsVoiceCloneRequirements,
  listTtsVoiceClones,
  renameTtsVoiceClone,
} from '@/api/tts-voice-clone'
import { formatUserError } from '@/utils/user-facing-error'
import { confirmDanger } from '@/utils/confirm-danger'

/** 模块级状态（单例：音色目录与克隆列表为设备级资源，跨组件共享同一份） */
const state = reactive({
  s2vVoiceProviders: [],
  s2vVoiceCatalog: [],
  s2vVoiceCatalogLoading: false,
  s2vVoiceCatalogError: '',
  s2vVoiceCatalogErrorCode: '',
  s2vVoiceCapability: null,
  s2vVoiceProviderRequestId: 0,
  s2vVoiceRequestId: 0,
  s2vVoiceSelectionRequestId: 0,
  s2vVoiceCloneRequestId: 0,
  s2vPersistedVoiceId: '',
  s2vVoiceCloneRequirements: null,
  s2vVoiceClones: [],
  s2vVoiceCloneSelection: null,
  s2vVoiceCloneLoading: false,
  s2vVoiceCloneError: '',
  s2vVoiceClonePending: null,
  s2vVoiceCloneRenamingId: '',
  s2vVoiceCloneRenameDraft: '',
  s2vVoiceProviderExplicitEdge: false,
})

/** 壳注入的跨域依赖（setupTtsVoicesDeps 一次性注入；window 兜底防测试/早调用时序） */
let deps = null
const WINDOW_KEY = '__ttsVoicesDeps'

export function setupTtsVoicesDeps(d) {
  deps = d
  if (typeof window !== 'undefined') window[WINDOW_KEY] = d
}

function requireDeps() {
  const d = deps || (typeof window !== 'undefined' ? window[WINDOW_KEY] : null)
  if (!d) throw new Error('[useTtsVoices] deps not injected: shell component must call setupTtsVoicesDeps first')
  return d
}

// ── 计算属性（壳以只读 computed 转发到模板）──────────────────
const s2vVoiceProviderOptions = computed(() => {
  const d = requireDeps()
  // 首项「自动 Edge TTS」必须带 displayName，否则模板 {{ provider.displayName }} 渲染为空选项（2026-08-10 Bug 反哺）
  return [{ id: '', name: d.t('create.story2video.voice.autoEdgeProvider'), displayName: d.t('create.story2video.voice.autoEdgeProvider') }, ...state.s2vVoiceProviders.map(provider => ({
    ...provider,
    displayName: provider.category === 'multimodal' ? provider.name + d.t('create.story2video.voice.multimodalSuffix') : provider.name,
  }))]
})

const s2vVoiceCatalogRefreshable = computed(() => {
  const d = requireDeps()
  // 仅瞬时/未知错误提供「刷新音色列表」；配置类/不支持/模型不匹配/身份问题重试无效
  if (!state.s2vVoiceCatalogError) return false
  const code = state.s2vVoiceCatalogErrorCode
  return code === '' || code === 'VOICE_CATALOG_UNAVAILABLE'
})

const s2vVoiceModelOptions = computed(() => {
  const d = requireDeps()
  const provider = state.s2vVoiceProviders.find(item => item?.id === d.getS2vConfig().voiceProvider)
  if (!provider) return []
  const models = Array.isArray(provider.models) ? provider.models : []
  const strings = models.filter(model => typeof model === 'string' && model)
  // MiMo TTS：语音模型下拉隐藏（模型由「语音/音色 ID」区分：预置→mimo-v2.5-tts，克隆→mimo-v2.5-tts-voiceclone）
  if (provider.id === 'mimo-tts') return []
  // 多模态：只展示声明支持 TTS 的默认模型（capability_models.tts），
  // 避免把 image/video/llm 模型混入「语音模型」下拉。
  if (provider.category === 'multimodal' && provider.capability_models && typeof provider.capability_models.tts === 'string') {
    const ttsModel = provider.capability_models.tts
    return strings.includes(ttsModel) ? [ttsModel] : [ttsModel, ...strings]
  }
  return strings
})

// MiMo TTS 的「语音模型」下拉隐藏：mimo-v2.5-tts 与 mimo-v2.5-tts-voiceclone
// 由「语音 / 音色 ID」下拉区分（预置音色 → tts，克隆音色 → voiceclone）。
const s2vVoiceModelHidden = computed(() => {
  const d = requireDeps()
  const provider = getS2VVoiceProvider()
  return Boolean(provider && provider.id === 'mimo-tts')
})

// MiMo TTS 下 catalog 请求使用的模型：预置音色目录用 mimo-v2.5-tts
// （克隆音色由 tts-voice-clone-service 单独按 provider:model 管理）。
const s2vVoiceContextModel = computed(() => {
  const d = requireDeps()
  if (s2vVoiceModelHidden.value) return 'mimo-v2.5-tts'
  return typeof d.getS2vConfig().voiceModel === 'string' ? d.getS2vConfig().voiceModel.trim() : ''
})

const s2vVoiceOptions = computed(() => {
  const d = requireDeps()
  const voices = [
    ...(Array.isArray(state.s2vVoiceCatalog) ? state.s2vVoiceCatalog : []),
    ...(Array.isArray(state.s2vVoiceClones) ? state.s2vVoiceClones : []),
  ]
  return [...new Map(voices.map(voice => [voice.id, voice])).values()]
})

// ── 方法（壳以同名代理转发）──────────────────────────────────
function getS2VVoiceContext() {
  const d = requireDeps()
  const providerId = typeof d.getS2vConfig().voiceProvider === 'string' ? d.getS2vConfig().voiceProvider.trim() : ''
  // MiMo TTS：语音模型下拉隐藏，catalog 请求固定用 mimo-v2.5-tts（预置音色目录）
  const model = s2vVoiceModelHidden.value
    ? 'mimo-v2.5-tts'
    : (typeof d.getS2vConfig().voiceModel === 'string' ? d.getS2vConfig().voiceModel.trim() : '')
  return providerId && model ? { providerId, model } : null
}

// MiMo TTS 克隆上下文：克隆 registry/偏好绑定在 voiceclone 模型下
function getS2VVoiceCloneContext() {
  const d = requireDeps()
  const context = getS2VVoiceContext()
  if (!context) return null
  return s2vVoiceModelHidden.value
    ? { providerId: context.providerId, model: 'mimo-v2.5-tts-voiceclone' }
    : context
}

function getS2VVoiceProvider(providerId) {
  const d = requireDeps()
  if (providerId === undefined) providerId = d.getS2vConfig().voiceProvider
  return state.s2vVoiceProviders.find(provider => provider?.id === providerId) || null
}

function getS2VDefaultVoiceModel(providerId) {
  const d = requireDeps()
  if (providerId === undefined) providerId = d.getS2vConfig().voiceProvider
  const provider = getS2VVoiceProvider(providerId)
  const models = Array.isArray(provider?.models)
    ? provider.models.filter(model => typeof model === 'string' && model)
    : []
  // MiMo TTS：语音模型下拉隐藏，voiceModel 置空（模型由「语音/音色 ID」区分）
  if (provider?.id === 'mimo-tts') return ''
  // 多模态：默认取 capability_models.tts（能力默认模型），models 首项可能是 image/video/llm 模型。
  if (provider?.category === 'multimodal' && provider.capability_models && typeof provider.capability_models.tts === 'string') {
    const ttsModel = provider.capability_models.tts
    return models.includes(ttsModel) ? ttsModel : (ttsModel || models[0] || '')
  }
  const configuredDefault = typeof provider?.defaultModel === 'string' ? provider.defaultModel : ''
  return models.includes(configuredDefault) ? configuredDefault : (models[0] || '')
}

function isCurrentS2VVoiceRequest(requestId, context) {
  const d = requireDeps()
  return requestId === state.s2vVoiceRequestId
    && d.getS2vConfig().voiceProvider === context.providerId
    && s2vVoiceContextModel.value === context.model
}

function isCurrentS2VVoiceCloneRequest(requestId, context) {
  const d = requireDeps()
  // MiMo TTS：克隆请求的 context.model 是 mimo-v2.5-tts-voiceclone（与 catalog 的 tts 模型不同）
  const expectedModel = s2vVoiceModelHidden.value ? 'mimo-v2.5-tts-voiceclone' : s2vVoiceContextModel.value
  return requestId === state.s2vVoiceCloneRequestId
    && d.getS2vConfig().voiceProvider === context.providerId
    && expectedModel === context.model
}

function isCurrentS2VVoiceSelectionRequest(requestId, context, voiceId) {
  const d = requireDeps()
  // MiMo TTS：克隆音色选择请求的 context.model 是 mimo-v2.5-tts-voiceclone
  const expectedModel = s2vVoiceModelHidden.value ? 'mimo-v2.5-tts-voiceclone' : s2vVoiceContextModel.value
  return requestId === state.s2vVoiceSelectionRequestId
    && d.getS2vConfig().voiceProvider === context.providerId
    && expectedModel === context.model
    && d.getS2vConfig().voiceId === voiceId
}

function toS2VVoiceOption(voice) {
  const d = requireDeps()
  const id = typeof voice?.id === 'string' ? voice.id.trim() : ''
  const name = typeof voice?.name === 'string' ? voice.name.trim() : ''
  if (!id || !name) return null
  return { id, name, invalid: voice.invalid === true }
}

function toS2VVoiceCloneRequirements(requirements) {
  const d = requireDeps()
  if (!requirements || typeof requirements !== 'object' || Array.isArray(requirements)) return null
  const toFiniteNumber = (value) => Number.isFinite(value) && value >= 0 ? value : null
  return {
    allowedExtensions: Array.isArray(requirements.allowedExtensions)
      ? requirements.allowedExtensions.filter(extension => typeof extension === 'string' && extension)
      : [],
    maxSampleCount: toFiniteNumber(requirements.maxSampleCount),
    maxSampleBytes: toFiniteNumber(requirements.maxSampleBytes),
    maxTotalBytes: toFiniteNumber(requirements.maxTotalBytes),
    minSampleDurationSeconds: toFiniteNumber(requirements.minSampleDurationSeconds) || 0,
    maxSampleDurationSeconds: toFiniteNumber(requirements.maxSampleDurationSeconds),
    maxTotalDurationSeconds: toFiniteNumber(requirements.maxTotalDurationSeconds),
  }
}

function friendlyVoiceCatalogError(message) {
  const d = requireDeps()
  const raw = String(message || '')
  const map = {
    VOICE_CATALOG_UNSUPPORTED: 'This voice model does not support voice lists or cloning yet. Using the default voice.',
    VOICE_CATALOG_CONFIG_UNAVAILABLE: 'The voice provider configuration is unavailable. Check it in model settings and retry.',
    VOICE_CATALOG_UNAVAILABLE: 'The voice list is temporarily unavailable. Using the default voice. Please try again later.',
    VOICE_MODEL_MISMATCH: 'The selected voice model does not match the configuration. Check the model settings.',
    VOICE_PREFERENCE_STORE_UNAVAILABLE: 'Voice preference storage is unavailable. Check local storage.',
    VOICE_OWNER_UNAVAILABLE: 'Sign-in state is unavailable. Sign in again and retry.',
    VOICE_NOT_IN_CATALOG: 'The selected voice is not in the current voice list. Select another voice.',
    VOICE_CLONE_SAMPLE_INVALID: 'The uploaded audio does not meet the requirements. Adjust format, duration, or size and retry.',
    VOICE_CLONE_SAMPLE_DURATION_INVALID: 'The uploaded audio duration does not meet the requirements. Adjust the duration and retry.',
    VOICE_CLONE_SAMPLE_EXTENSION_UNSUPPORTED: 'The uploaded audio format is not supported. Use mp3, m4a, or wav.',
    VOICE_CLONE_SAMPLE_TOO_LARGE: 'The uploaded audio is too large. Compress it or use another file.',
    VOICE_CLONE_TOTAL_SIZE_EXCEEDED: 'The total audio size exceeds the limit. Remove files and retry.',
    VOICE_CLONE_TOTAL_DURATION_EXCEEDED: 'The total audio duration exceeds the limit. Remove files and retry.',
    VOICE_CLONE_PROVIDER_UNAVAILABLE: 'Voice cloning is temporarily unavailable. Please try again later.',
    VOICE_CLONE_UNAVAILABLE: 'Voice cloning is temporarily unavailable. Please try again later.',
    VOICE_CLONE_UNSUPPORTED: 'This voice model does not support voice cloning yet. Using the default voice.',
    VOICE_CLONE_DIALOG_UNAVAILABLE: 'Could not open the audio file picker. Please try again.',
    VOICE_CLONE_DUPLICATE_ID: 'A cloned voice with this name already exists. Use another name.',
    VOICE_CLONE_MODEL_MISMATCH: 'The selected voice model does not match the clone configuration. Check the model settings.',
    VOICE_CLONE_NOT_FOUND: 'The cloned voice was not found. Select it again.',
    VOICE_CLONE_REGISTRY_INVALID: 'The local clone voice record is invalid. Select the audio file again and retry.',
    VOICE_CLONE_ROLLBACK_REQUIRED: 'The clone voice save did not finish. Select the audio file again and retry.',
    VOICE_CLONE_SELECTION_UNAVAILABLE: 'Audio sample staging is unavailable. Select the audio file again.',
    VOICE_CLONE_STORE_UNAVAILABLE: 'Clone voice storage is unavailable. Check disk space and retry.',
    VOICE_CLONE_STORAGE_UNAVAILABLE: 'Clone voice storage is unavailable. Check disk space and retry.',
    VOICE_CLONE_INVALID_ARGUMENTS: 'Invalid clone voice parameters. Select the audio file again.',
  }
  const found = Object.entries(map).find(([key]) => raw.includes(key))
  // 英文兜底（ASCII）仅用于「键缺失」的防御路径；键存在时一律取 locale 值（zh/en 成对）
  if (found) return d.translate('create.story2video.voice.' + found[0], found[1], found[1])
  // 不向用户泄露系统技术错误码
  const generic = 'The voice list could not be loaded. Using the default voice. Please try again later.'
  return d.translate('create.story2video.voice.catalogLoadFailed', generic, generic)
}

function s2vVoiceCloneHint() {
  const d = requireDeps()
  const r = state.s2vVoiceCloneRequirements
  if (!r) return ''
  const parts = []
  if (Array.isArray(r.allowedExtensions) && r.allowedExtensions.length > 0) {
    const extText = r.allowedExtensions.map(ext => String(ext).replace(/^\./, '')).join('、')
    parts.push(d.t('create.story2video.voice.cloneHintFormat', { extensions: extText }))
  }
  if (r.minSampleDurationSeconds > 0 && r.maxSampleDurationSeconds > 0) {
    const maxMinutes = Math.round(r.maxSampleDurationSeconds / 60)
    parts.push(d.t('create.story2video.voice.cloneHintMinDuration', { seconds: r.minSampleDurationSeconds, minutes: maxMinutes }))
  } else if (r.maxSampleDurationSeconds > 0) {
    parts.push(d.t('create.story2video.voice.cloneHintMaxDuration', { duration: formatS2VVoiceCloneDuration(r.maxSampleDurationSeconds) }))
  }
  if (r.maxSampleBytes > 0) {
    parts.push(d.t('create.story2video.voice.cloneHintMaxSize', { size: formatS2VVoiceCloneBytes(r.maxSampleBytes) }))
  }
  return parts.length > 0 ? parts.join('；') + '。' : ''
}

function resetS2VVoiceData() {
  const d = requireDeps()
  state.s2vVoiceCatalog = []
  state.s2vVoiceCatalogLoading = false
  state.s2vVoiceCatalogError = ''
  state.s2vVoiceCatalogErrorCode = ''
  state.s2vVoiceCapability = null
  state.s2vPersistedVoiceId = ''
  state.s2vVoiceCloneRequirements = null
  state.s2vVoiceClones = []
  state.s2vVoiceCloneSelection = null
  state.s2vVoiceClonePending = null
  state.s2vVoiceCloneLoading = false
  state.s2vVoiceCloneError = ''
  state.s2vVoiceCloneRenamingId = ''
  state.s2vVoiceCloneRenameDraft = ''
}

async function loadS2VVoiceData(options = {}) {
  const d = requireDeps()
  // 卸载守卫：弹窗关闭触发的语音目录/能力重载可能跨越组件卸载（2026-08-12 复审 I1）
  if (d.isAlive() === false) return
  const context = getS2VVoiceContext()
  const requestId = ++state.s2vVoiceRequestId
  state.s2vVoiceSelectionRequestId += 1
  state.s2vVoiceCloneRequestId += 1
  resetS2VVoiceData()
  if (!context) return

  state.s2vVoiceCatalogLoading = true
  const catalogInput = d.cloneForIpc({ ...context, refresh: options.refresh === true })
  // MiMo TTS：catalog 用 mimo-v2.5-tts（预置音色），capability/克隆用 mimo-v2.5-tts-voiceclone
  // （音色复刻能力由 voiceclone 模型声明）。语音模型下拉隐藏，模型由音色类型区分。
  const cloneContext = s2vVoiceModelHidden.value
    ? { providerId: context.providerId, model: 'mimo-v2.5-tts-voiceclone' }
    : context
  const [catalogResult, capabilityResult] = await Promise.allSettled([
    getTtsVoiceCatalog(catalogInput),
    getTtsVoiceCapability(d.cloneForIpc(cloneContext)),
  ])
  if (!isCurrentS2VVoiceRequest(requestId, context)) return

  const catalogResponse = catalogResult.status === 'fulfilled' ? catalogResult.value : null
  const capabilityResponse = capabilityResult.status === 'fulfilled' ? capabilityResult.value : null
  const catalogData = catalogResponse?.code === 0 && catalogResponse.data && typeof catalogResponse.data === 'object'
    ? catalogResponse.data
    : null
  const capabilityData = capabilityResponse?.code === 0 && capabilityResponse.data && typeof capabilityResponse.data === 'object'
    ? capabilityResponse.data
    : null
  state.s2vVoiceCatalog = [
    ...(Array.isArray(catalogData?.voices) ? catalogData.voices.map(voice => toS2VVoiceOption(voice)).filter(Boolean) : []),
    // 失效克隆音色（如旧版生成的非法 voice_id）：仅展示提示，不可选择
    ...(Array.isArray(catalogData?.invalidVoices) ? catalogData.invalidVoices.map(voice => toS2VVoiceOption(voice)).filter(Boolean) : []),
  ]
  state.s2vVoiceCapability = capabilityData
    ? {
        type: capabilityData.type,
        clone: { enabled: capabilityData.clone?.enabled === true },
      }
    : null
  state.s2vVoiceCatalogLoading = false
  state.s2vVoiceCatalogErrorCode = catalogData ? '' : String(catalogResponse?.message || '')
  if (!catalogData) {
    state.s2vVoiceCatalogError = friendlyVoiceCatalogError(catalogResponse?.message)
  }

  const cloneEnabled = state.s2vVoiceCapability?.type === 'user_clone'
    && state.s2vVoiceCapability?.clone?.enabled === true
  if (cloneEnabled) {
    const cloneRequestId = ++state.s2vVoiceCloneRequestId
    state.s2vVoiceCloneLoading = true
    const [requirementsResult, clonesResult] = await Promise.allSettled([
      getTtsVoiceCloneRequirements(d.cloneForIpc(cloneContext)),
      listTtsVoiceClones(d.cloneForIpc(cloneContext)),
    ])
    if (!isCurrentS2VVoiceRequest(requestId, context)
      || !isCurrentS2VVoiceCloneRequest(cloneRequestId, cloneContext)) return

    const requirementsResponse = requirementsResult.status === 'fulfilled' ? requirementsResult.value : null
    const clonesResponse = clonesResult.status === 'fulfilled' ? clonesResult.value : null
    state.s2vVoiceCloneRequirements = requirementsResponse?.code === 0
      ? toS2VVoiceCloneRequirements(requirementsResponse.data)
      : null
    state.s2vVoiceClones = clonesResponse?.code === 0 && Array.isArray(clonesResponse.data?.voices)
      ? clonesResponse.data.voices.map(voice => toS2VVoiceOption(voice)).filter(Boolean)
      : []
    state.s2vVoiceCloneError = requirementsResponse?.code === 0 && clonesResponse?.code === 0
      ? ''
      : (requirementsResponse?.message || clonesResponse?.message || d.t('create.story2video.voice.cloneInfoUnavailable'))
    state.s2vVoiceCloneLoading = false
  }

  if (!isCurrentS2VVoiceRequest(requestId, context)) return
  const selectedVoiceId = typeof catalogData?.selectedVoiceId === 'string' ? catalogData.selectedVoiceId : ''
  const configuredVoiceId = typeof d.getS2vConfig().voiceId === 'string' ? d.getS2vConfig().voiceId : ''
  const availableVoiceIds = new Set(s2vVoiceOptions.value.map(voice => voice.id))
  if (selectedVoiceId && availableVoiceIds.has(selectedVoiceId)) {
    d.getS2vConfig().voiceId = selectedVoiceId
    state.s2vPersistedVoiceId = selectedVoiceId
  } else if (configuredVoiceId && availableVoiceIds.has(configuredVoiceId)) {
    state.s2vPersistedVoiceId = configuredVoiceId
  } else {
    d.getS2vConfig().voiceId = ''
  }
}

async function refreshS2VVoiceCatalog() {
  const d = requireDeps()
  state.s2vVoiceCatalogError = ''
  await loadS2VVoiceData({ refresh: true })
}

async function handleS2VVoiceProviderChange() {
  const d = requireDeps()
  const nextProviderId = getS2VVoiceProvider()?.id || ''
  // 记录「显式选择自动 Edge TTS」：空 id 既是未选择也是显式 Edge，需区分以免被多模态默认覆盖
  state.s2vVoiceProviderExplicitEdge = !nextProviderId
  d.getS2vConfig().voiceProvider = nextProviderId
  d.getS2vConfig().voiceModel = nextProviderId ? getS2VDefaultVoiceModel(nextProviderId) : ''
  d.getS2vConfig().voiceId = ''
  await loadS2VVoiceData()
}

async function handleS2VVoiceModelChange() {
  const d = requireDeps()
  const nextModel = s2vVoiceModelOptions.value.includes(d.getS2vConfig().voiceModel)
    ? d.getS2vConfig().voiceModel
    : getS2VDefaultVoiceModel()
  d.getS2vConfig().voiceModel = nextModel
  d.getS2vConfig().voiceId = ''
  await loadS2VVoiceData()
}

async function handleS2VVoiceSelection() {
  const d = requireDeps()
  await selectS2VVoice(d.getS2vConfig().voiceId)
}

async function selectS2VVoice(voiceId) {
  const d = requireDeps()
  if (voiceId === undefined) voiceId = d.getS2vConfig().voiceId
  const context = getS2VVoiceContext()
  // MiMo TTS：克隆音色的偏好持久化到 voiceclone 模型下（与克隆 registry 同键域）
  const selectContext = s2vVoiceModelHidden.value && typeof voiceId === 'string' && voiceId.startsWith('mimo-clone-')
    ? { providerId: context?.providerId, model: 'mimo-v2.5-tts-voiceclone' }
    : context
  const normalizedVoiceId = typeof voiceId === 'string' ? voiceId.trim() : ''
  if (!selectContext) return false
  if (!normalizedVoiceId) {
    const requestId = ++state.s2vVoiceSelectionRequestId
    const result = await clearTtsVoicePreference(d.cloneForIpc(selectContext))
    if (!isCurrentS2VVoiceSelectionRequest(requestId, selectContext, d.getS2vConfig().voiceId)) return false
    if (result?.code !== 0) {
      state.s2vVoiceCatalogError = friendlyVoiceCatalogError(result?.message) || formatUserError(result, { fallback: d.t('create.story2video.voice.catalogFetchFailed') }).message
        ? friendlyVoiceCatalogError(result?.message)
        : d.t('create.story2video.voice.defaultVoiceRestoreFailed')
      return false
    }
    const selectedVoiceId = typeof result.data?.selectedVoiceId === 'string' ? result.data.selectedVoiceId : ''
    d.getS2vConfig().voiceId = selectedVoiceId
    state.s2vPersistedVoiceId = selectedVoiceId
    state.s2vVoiceCatalogError = ''
    return true
  }
  if (!s2vVoiceOptions.value.some(voice => voice.id === normalizedVoiceId)) {
    state.s2vVoiceCatalogError = d.t('create.story2video.voice.selectionNotInCatalog')
    return false
  }
  // 显式选择（下拉或克隆列表「设为默认」）先同步下拉框与配置：
  // 1) 让 isCurrentS2VVoiceSelectionRequest 并发守卫命中本次请求（否则结果被静默丢弃）；
  // 2) 让下拉框与克隆行「默认」徽标立即反映本次选择。
  const previousVoiceId = d.getS2vConfig().voiceId
  d.getS2vConfig().voiceId = normalizedVoiceId

  const requestId = ++state.s2vVoiceSelectionRequestId
  const result = await selectTtsVoice(d.cloneForIpc({ ...selectContext, voiceId: normalizedVoiceId }))
  if (!isCurrentS2VVoiceSelectionRequest(requestId, selectContext, normalizedVoiceId)) return false
  if (result?.code !== 0) {
    // 保存失败：回滚下拉与徽标，避免显示一个从未持久化的「默认」音色
    d.getS2vConfig().voiceId = previousVoiceId
    state.s2vVoiceCatalogError = friendlyVoiceCatalogError(result?.message) || formatUserError(result, { fallback: d.t('create.story2video.voice.catalogFetchFailed') }).message
      ? friendlyVoiceCatalogError(result?.message)
      : d.t('create.story2video.voice.selectionSaveFailed')
    return false
  }
  state.s2vPersistedVoiceId = typeof result.data?.selectedVoiceId === 'string'
    ? result.data.selectedVoiceId
    : normalizedVoiceId
  state.s2vVoiceCatalogError = ''
  return true
}

async function chooseS2VVoiceCloneSamples() {
  const d = requireDeps()
  const context = getS2VVoiceCloneContext()
  const cloneEnabled = state.s2vVoiceCapability?.type === 'user_clone'
    && state.s2vVoiceCapability?.clone?.enabled === true
  if (!context || !cloneEnabled) return

  const requestId = ++state.s2vVoiceCloneRequestId
  state.s2vVoiceCloneLoading = true
  state.s2vVoiceCloneError = ''
  try {
    const result = await chooseTtsVoiceCloneSamples(d.cloneForIpc(context))
    if (!isCurrentS2VVoiceCloneRequest(requestId, context)) return
    const selectionId = typeof result?.data?.selectionId === 'string' ? result.data.selectionId : ''
    const sampleCount = Array.isArray(result?.data?.samples) ? result.data.samples.length : 0
    if (result?.code === 0 && selectionId && sampleCount > 0) {
      state.s2vVoiceCloneSelection = { selectionId, sampleCount }
      // 2026-08-12 需求调整：选择本地文件后自动保存为克隆音色（默认名「音色XXX」），
      // 不再需要手动填写名称并点击「添加克隆音色」；如需改名使用列表中的「重命名」。
      // 先释放「选择中」加载态，让 addS2VVoiceClone 进入自己的加载流程。
      if (isCurrentS2VVoiceCloneRequest(requestId, context)) state.s2vVoiceCloneLoading = false
      await addS2VVoiceClone(nextS2VVoiceCloneName())
      return
    }
    state.s2vVoiceCloneSelection = null
    if (result?.code !== 0) state.s2vVoiceCloneError = friendlyVoiceCatalogError(result?.message) || d.t('create.story2video.voice.cloneSamplePickFailed')
  } catch (error) {
    // 异常路径硬化（2026-08-13 审查 W1）：IPC 封装层已将 reject 统一转为错误码，此处兜底
    if (isCurrentS2VVoiceCloneRequest(requestId, context)) {
      state.s2vVoiceCloneSelection = null
      state.s2vVoiceCloneError = friendlyVoiceCatalogError(error?.message) || d.t('create.story2video.voice.cloneSamplePickFailed')
    }
  } finally {
    if (isCurrentS2VVoiceCloneRequest(requestId, context)) state.s2vVoiceCloneLoading = false
  }
}

function nextS2VVoiceCloneName() {
  const d = requireDeps()
  // 自动克隆默认名「音色XXX」：以「当前克隆数量」与「现有最大音色序号」较大者 +1（3 位零填充）。
  // - 首个克隆为 音色001；按创建顺序递增 音色002/003…，重命名后不回退旧序号；
  // - 用户手动命名为 音色100 后，下一个自动名继续用 音色101。
  // 序号用 BigInt 解析/比较，避免超长数字名（如 128 位）经 Number 转浮点后污染名称。
  const clones = Array.isArray(state.s2vVoiceClones) ? state.s2vVoiceClones : []
  const cloneNamePrefix = d.t('create.story2video.voice.cloneNamePrefix')
  const escapedNamePrefix = cloneNamePrefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const cloneNamePattern = new RegExp('^' + escapedNamePrefix + '(\\d+)$')
  let maxIndex = 0n
  for (const voice of clones) {
    const match = cloneNamePattern.exec(String(voice?.name || '').trim())
    if (match) {
      try {
        const index = BigInt(match[1])
        if (index > maxIndex) maxIndex = index
      } catch (_) { /* 非数字忽略 */ }
    }
  }
  const count = BigInt(clones.length)
  const nextIndex = (count > maxIndex ? count : maxIndex) + 1n
  return cloneNamePrefix + String(nextIndex).padStart(3, '0')
}

async function addS2VVoiceClone(name = nextS2VVoiceCloneName()) {
  const d = requireDeps()
  const context = getS2VVoiceCloneContext()
  const selectionId = state.s2vVoiceCloneSelection?.selectionId
  const normalizedName = String(name || '').trim()
  if (!context || !selectionId || !normalizedName || state.s2vVoiceCloneLoading) return

  const requestId = ++state.s2vVoiceCloneRequestId
  state.s2vVoiceCloneLoading = true
  state.s2vVoiceCloneError = ''
  // 克隆进行中占位行：选完文件立即反馈「创建中」，避免长时间无响应观感（2026-08-13）
  state.s2vVoiceClonePending = {
    id: 'pending-' + requestId,
    name: normalizedName,
    sampleCount: state.s2vVoiceCloneSelection?.sampleCount || 1,
  }
  try {
    const result = await addTtsVoiceClone(d.cloneForIpc({
      ...context,
      name: normalizedName,
      selectionId,
      consent: true,
    }))
    if (!isCurrentS2VVoiceCloneRequest(requestId, context)) return
    const voice = result?.code === 0 ? toS2VVoiceOption(result.data?.voice) : null
    if (!voice) {
      // 自动保存失败：一次性选择令牌已被主进程销毁，清除本地快照避免「已选择 N 个样本」误导
      state.s2vVoiceCloneSelection = null
      state.s2vVoiceClonePending = null
      state.s2vVoiceCloneError = friendlyVoiceCatalogError(result?.message) || d.t('create.story2video.voice.cloneAddFailed')
      return
    }
    state.s2vVoiceClones = [
      ...state.s2vVoiceClones.filter(item => item.id !== voice.id),
      voice,
    ]
    state.s2vVoiceCloneSelection = null
    state.s2vVoiceClonePending = null
    d.getS2vConfig().voiceId = voice.id
    await selectS2VVoice(voice.id)
    d.showOptionsToast(d.translate(
      'create.story2video.voice.cloneSuccessToast',
      d.t('create.story2video.voice.cloneSuccessToast', { name: voice.name }),
      'Cloned voice "' + voice.name + '" added',
      { name: voice.name },
    ))
  } catch (error) {
    // 异常路径硬化（2026-08-13 审查 W1）：IPC 封装层已将 reject 统一转为错误码，
    // 此处兜底保证未知 reject 也不「占位行凭空消失且无提示」。
    if (isCurrentS2VVoiceCloneRequest(requestId, context)) {
      state.s2vVoiceCloneSelection = null
      state.s2vVoiceClonePending = null
      state.s2vVoiceCloneError = friendlyVoiceCatalogError(error?.message) || d.t('create.story2video.voice.cloneAddFailed')
    }
  } finally {
    if (isCurrentS2VVoiceCloneRequest(requestId, context)) {
      state.s2vVoiceCloneLoading = false
      state.s2vVoiceClonePending = null
    }
  }
}

function s2vVoiceCloneStatusText() {
  const d = requireDeps()
  const pending = state.s2vVoiceClonePending
  if (!pending) return ''
  const count = Number.isFinite(pending.sampleCount) ? pending.sampleCount : 1
  return d.translate(
    'create.story2video.voice.cloneStatusPending',
    d.t('create.story2video.voice.cloneStatusPending', { count }),
    'Selected ' + count + ' sample(s). Uploading and cloning the voice... (usually 10-60 s, please wait)',
    { count },
  )
}

async function deleteS2VVoiceClone(voiceId) {
  const d = requireDeps()
  const context = getS2VVoiceCloneContext()
  const normalizedVoiceId = typeof voiceId === 'string' ? voiceId.trim() : ''
  if (!context || !normalizedVoiceId || state.s2vVoiceCloneLoading) return

  const requestId = ++state.s2vVoiceCloneRequestId
  state.s2vVoiceCloneLoading = true
  state.s2vVoiceCloneError = ''
  try {
    // 危险操作门禁（docs/frontend-interaction-spec.md §2）：删除克隆音色不可逆，
    // 确认文案须说明后果并点名受影响音色；取消时直接返回，不调用删除 API。
    const target = state.s2vVoiceClones.find(item => item.id === normalizedVoiceId)
    const voiceName = target?.name || normalizedVoiceId
    const confirmed = await confirmDanger({
      title: d.t('create.story2video.voice.cloneDeleteConfirmTitle'),
      message: d.t('create.story2video.voice.cloneDeleteConfirmMessage', { name: voiceName }),
      confirmText: d.t('create.story2video.voice.cloneDeleteConfirmButton'),
    })
    if (!confirmed) return

    const result = await deleteTtsVoiceClone(d.cloneForIpc({ ...context, voiceId: normalizedVoiceId }))
    if (!isCurrentS2VVoiceCloneRequest(requestId, context)) return
    if (result?.code !== 0) {
      state.s2vVoiceCloneError = friendlyVoiceCatalogError(result?.message) || d.t('create.story2video.voice.cloneDeleteFailed')
      return
    }
    state.s2vVoiceClones = state.s2vVoiceClones.filter(voice => voice.id !== normalizedVoiceId)
    state.s2vVoiceCatalog = state.s2vVoiceCatalog.filter(voice => voice.id !== normalizedVoiceId)
    if (d.getS2vConfig().voiceId === normalizedVoiceId) {
      const fallbackVoiceId = s2vVoiceOptions.value[0]?.id || ''
      d.getS2vConfig().voiceId = fallbackVoiceId
      state.s2vPersistedVoiceId = ''
      if (fallbackVoiceId) await selectS2VVoice(fallbackVoiceId)
    }
  } finally {
    if (isCurrentS2VVoiceCloneRequest(requestId, context)) state.s2vVoiceCloneLoading = false
  }
}

function startS2VVoiceCloneRename(voiceId) {
  const d = requireDeps()
  const voice = state.s2vVoiceClones.find(item => item.id === voiceId)
  if (!voice || state.s2vVoiceCloneLoading) return
  state.s2vVoiceCloneRenamingId = voiceId
  state.s2vVoiceCloneRenameDraft = voice.name || ''
  state.s2vVoiceCloneError = ''
}

function cancelS2VVoiceCloneRename() {
  const d = requireDeps()
  state.s2vVoiceCloneRenamingId = ''
  state.s2vVoiceCloneRenameDraft = ''
  state.s2vVoiceCloneError = ''
}

async function renameS2VVoiceClone(voiceId) {
  const d = requireDeps()
  const context = getS2VVoiceCloneContext()
  const normalizedVoiceId = typeof voiceId === 'string' ? voiceId.trim() : ''
  const name = String(state.s2vVoiceCloneRenameDraft || '').trim()
  if (!context || !normalizedVoiceId || !name || state.s2vVoiceCloneLoading) return

  const requestId = ++state.s2vVoiceCloneRequestId
  state.s2vVoiceCloneLoading = true
  state.s2vVoiceCloneError = ''
  try {
    const result = await renameTtsVoiceClone(d.cloneForIpc({ ...context, voiceId: normalizedVoiceId, name }))
    if (!isCurrentS2VVoiceCloneRequest(requestId, context)) return
    const voice = result?.code === 0 ? toS2VVoiceOption(result.data?.voice) : null
    if (!voice) {
      state.s2vVoiceCloneError = friendlyVoiceCatalogError(result?.message) || d.t('create.story2video.voice.cloneRenameFailed')
      return
    }
    // 重命名只更新展示名；保留旧条目的 invalid 标记，避免失效克隆在重命名后被误判为可用
    const previous = state.s2vVoiceClones.find(item => item.id === voice.id)
    if (previous?.invalid === true) voice.invalid = true
    state.s2vVoiceClones = state.s2vVoiceClones.map(item => item.id === voice.id ? voice : item)
    state.s2vVoiceCloneRenamingId = ''
    state.s2vVoiceCloneRenameDraft = ''
  } finally {
    if (isCurrentS2VVoiceCloneRequest(requestId, context)) state.s2vVoiceCloneLoading = false
  }
}

function formatS2VVoiceCloneBytes(value) {
  const d = requireDeps()
  if (!Number.isFinite(value) || value < 0) return '—'
  if (value < 1024) return `${value} B`
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`
  return `${(value / (1024 * 1024)).toFixed(value % (1024 * 1024) === 0 ? 0 : 1)} MB`
}

function formatS2VVoiceCloneDuration(value) {
  const d = requireDeps()
  if (!Number.isFinite(value) || value < 0) return '—'
  const seconds = Math.floor(value)
  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = seconds % 60
  if (minutes <= 0) return d.t('create.story2video.voice.durationSeconds', { seconds })
  if (!remainingSeconds) return d.t('create.story2video.voice.durationMinutes', { minutes })
  return d.t('create.story2video.voice.durationMinutesSeconds', { minutes, seconds: remainingSeconds })
}

/** 状态桥接用 toRefs（壳 CreateView computed get/set 委托到这里） */
export const ttsVoicesRefs = toRefs(state)

/** 计算属性（壳 computed 转发；composable 内部以 .value 读取） */
export const ttsVoicesComputeds = {
  s2vVoiceProviderOptions,
  s2vVoiceCatalogRefreshable,
  s2vVoiceModelOptions,
  s2vVoiceModelHidden,
  s2vVoiceContextModel,
  s2vVoiceOptions,
}

/** 方法表（壳同名代理转发） */
export const ttsVoicesMethods = {
  getS2VVoiceContext,
  getS2VVoiceCloneContext,
  getS2VVoiceProvider,
  getS2VDefaultVoiceModel,
  isCurrentS2VVoiceRequest,
  isCurrentS2VVoiceCloneRequest,
  isCurrentS2VVoiceSelectionRequest,
  toS2VVoiceOption,
  toS2VVoiceCloneRequirements,
  friendlyVoiceCatalogError,
  s2vVoiceCloneHint,
  resetS2VVoiceData,
  loadS2VVoiceData,
  refreshS2VVoiceCatalog,
  handleS2VVoiceProviderChange,
  handleS2VVoiceModelChange,
  handleS2VVoiceSelection,
  selectS2VVoice,
  chooseS2VVoiceCloneSamples,
  nextS2VVoiceCloneName,
  addS2VVoiceClone,
  s2vVoiceCloneStatusText,
  deleteS2VVoiceClone,
  startS2VVoiceCloneRename,
  cancelS2VVoiceCloneRename,
  renameS2VVoiceClone,
  formatS2VVoiceCloneBytes,
  formatS2VVoiceCloneDuration,
}

/** 测试复位（模块级单例状态跨用例泄漏防护）：仅测试环境使用 */
export function resetTtsVoicesForTest() {
  const initial = {
    s2vVoiceProviders: [],
    s2vVoiceCatalog: [],
    s2vVoiceCatalogLoading: false,
    s2vVoiceCatalogError: '',
    s2vVoiceCatalogErrorCode: '',
    s2vVoiceCapability: null,
    s2vVoiceProviderRequestId: 0,
    s2vVoiceRequestId: 0,
    s2vVoiceSelectionRequestId: 0,
    s2vVoiceCloneRequestId: 0,
    s2vPersistedVoiceId: '',
    s2vVoiceCloneRequirements: null,
    s2vVoiceClones: [],
    s2vVoiceCloneSelection: null,
    s2vVoiceCloneLoading: false,
    s2vVoiceCloneError: '',
    s2vVoiceClonePending: null,
    s2vVoiceCloneRenamingId: '',
    s2vVoiceCloneRenameDraft: '',
    s2vVoiceProviderExplicitEdge: false,
  }
  Object.assign(state, initial)
  deps = null
  if (typeof window !== 'undefined') delete window[WINDOW_KEY]
}

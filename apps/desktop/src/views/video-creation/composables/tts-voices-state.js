/**
 * tts-voices-state —— TTS 音色域最低层：共享状态 + 跨域依赖 + 计算属性 + 测试复位
 *
 * 拆分理由：CI 债务熔断对新建文件有 500 行硬上限（scripts/check-debt-budget.js 的
 * NEW_OVER_LIMIT），故按子域拆模块。本层不 import 任何同族模块（层次最底），
 * 只对外暴露状态、requireDeps 与计算属性。
 *
 * 为何 getS2VVoiceProvider / getS2VDefaultVoiceModel 在本层：计算属性 s2vVoiceModelHidden
 * 依赖前者，而 shared 层又依赖这些计算属性；放 shared 会形成 state→shared→state 环。
 *
 * 设计约束（与 useBgmLibrary 同构，见方案 §2.3）：模块级单例、无实例依赖、
 * 跨域写点经 setupTtsVoicesDeps 注入、用户可见文案走 locale（deps.t）——
 * **同族模块不得出现 CJK 字面量**（CI Gate 7 --cjk 拦新路径，见方案 §2.6 发现 T1）。
 */
import { reactive, computed, toRefs } from 'vue'

/** 模块级状态（单例：音色目录与克隆列表为设备级资源，跨组件共享同一份） */
export const state = reactive({
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

/** 取依赖；未注入即抛错（fail-closed，不静默降级） */
export function requireDeps() {
  const d = deps || (typeof window !== 'undefined' ? window[WINDOW_KEY] : null)
  if (!d) throw new Error('[useTtsVoices] deps not injected: shell component must call setupTtsVoicesDeps first')
  return d
}

export function getS2VVoiceProvider(providerId) {
  const d = requireDeps()
  if (providerId === undefined) providerId = d.getS2vConfig().voiceProvider
  return state.s2vVoiceProviders.find(provider => provider?.id === providerId) || null
}

export function getS2VDefaultVoiceModel(providerId) {
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

// ── 计算属性（壳以只读 computed 转发到模板；模块内以 .value 读取）──────
export const s2vVoiceProviderOptions = computed(() => {
  const d = requireDeps()
  // 首项「自动 Edge TTS」必须带 displayName，否则模板 {{ provider.displayName }} 渲染为空选项（2026-08-10 Bug 反哺）
  return [{ id: '', name: d.t('create.story2video.voice.autoEdgeProvider'), displayName: d.t('create.story2video.voice.autoEdgeProvider') }, ...state.s2vVoiceProviders.map(provider => ({
    ...provider,
    displayName: provider.category === 'multimodal' ? provider.name + d.t('create.story2video.voice.multimodalSuffix') : provider.name,
  }))]
})

export const s2vVoiceCatalogRefreshable = computed(() => {
  const d = requireDeps()
  // 仅瞬时/未知错误提供「刷新音色列表」；配置类/不支持/模型不匹配/身份问题重试无效
  if (!state.s2vVoiceCatalogError) return false
  const code = state.s2vVoiceCatalogErrorCode
  return code === '' || code === 'VOICE_CATALOG_UNAVAILABLE'
})

export const s2vVoiceModelOptions = computed(() => {
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
export const s2vVoiceModelHidden = computed(() => {
  const d = requireDeps()
  const provider = getS2VVoiceProvider()
  return Boolean(provider && provider.id === 'mimo-tts')
})

// MiMo TTS 下 catalog 请求使用的模型：预置音色目录用 mimo-v2.5-tts
// （克隆音色由 tts-voice-clone-service 单独按 provider:model 管理）。
export const s2vVoiceContextModel = computed(() => {
  const d = requireDeps()
  if (s2vVoiceModelHidden.value) return 'mimo-v2.5-tts'
  return typeof d.getS2vConfig().voiceModel === 'string' ? d.getS2vConfig().voiceModel.trim() : ''
})

export const s2vVoiceOptions = computed(() => {
  const d = requireDeps()
  const voices = [
    ...(Array.isArray(state.s2vVoiceCatalog) ? state.s2vVoiceCatalog : []),
    ...(Array.isArray(state.s2vVoiceClones) ? state.s2vVoiceClones : []),
  ]
  return [...new Map(voices.map(voice => [voice.id, voice])).values()]
})

/** 计算属性表（壳 computed 转发） */
export const ttsVoicesComputeds = {
  s2vVoiceProviderOptions,
  s2vVoiceCatalogRefreshable,
  s2vVoiceModelOptions,
  s2vVoiceModelHidden,
  s2vVoiceContextModel,
  s2vVoiceOptions,
}

/** 状态桥接用 toRefs（壳 CreateView computed get/set 委托到这里） */
export const ttsVoicesRefs = toRefs(state)

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

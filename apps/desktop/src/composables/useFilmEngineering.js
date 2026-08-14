// @ts-check
/**
 * useFilmEngineering.js — 影视工程流水线 composable（《Hell Grind》复刻）
 *
 * 职责：
 *   - kit 状态检查（可用 → 空态 + 重试）
 *   - 分镜库：场景树 / 分镜列表 / 分镜详情（提示词 + 引用素材解析）
 *   - 一键复制：full / blocks / characters / geo 四模式（文本由主进程组装）
 *   - 多选：批量复制 / 导出 JSON|Markdown / 勾选生成图片（≤20）
 *   - 剧本套用：剧本 + 角色映射 → 套用 Hell Grind 提示词架构生成分镜
 *   - 方法论：prompt-doctrine 展示
 *
 * 依赖 window.electronAPI.filmEngineering（Electron 窗口）；浏览器直开 Vite 时静默降级。
 * 所有 IPC 返回统一信封 { code, data?, message? }，code === 0 为成功。
 */
import { ref, reactive } from 'vue'
import { ElMessage } from 'element-plus'
import { formatUserError } from '@/utils/user-facing-error'
import i18n from '@/i18n'

const t = (key) => i18n.global.t(key)

const api = () => (typeof window !== 'undefined' && window.electronAPI && window.electronAPI.filmEngineering) || null

const COPY_MODES = ['full', 'blocks', 'characters', 'geo']

/** 剪贴板写入：优先 navigator.clipboard，失败回退 textarea 复制 */
async function writeClipboard (text) {
  const nav = (typeof window !== 'undefined' && window.navigator) || (typeof navigator !== 'undefined' && navigator) || null
  try {
    if (nav && nav.clipboard && typeof nav.clipboard.writeText === 'function') {
      await nav.clipboard.writeText(text)
      return true
    }
  } catch (_) { /* 继续回退 */ }
  try {
    const doc = typeof document !== 'undefined' ? document : null
    if (!doc) return false
    const ta = doc.createElement('textarea')
    ta.value = text
    ta.style.position = 'fixed'
    ta.style.opacity = '0'
    doc.body.appendChild(ta)
    ta.select()
    const ok = doc.execCommand('copy')
    doc.body.removeChild(ta)
    return ok
  } catch (_) {
    return false
  }
}

function unwrap (res) {
  if (res && res.code === 0) return { ok: true, data: res.data }
  return { ok: false, error: formatUserError(res, { fallback: t('filmEngineering.errorFallback') }).message }
}

export function useFilmEngineering () {
  const status = ref(null)
  const statusLoading = ref(false)
  const scenes = ref([])
  const scenesLoading = ref(false)
  const selectedSceneId = ref(null)
  const shots = ref([])
  const shotsLoading = ref(false)
  const shotDetail = ref(null)
  const detailLoading = ref(false)
  const doctrine = ref(null)
  const doctrineLoading = ref(false)
  const selectedShotIds = ref([])
  const copyMode = ref('full')
  const generating = ref(false)
  const exportLoading = ref(false)
  const adapt = reactive({
    script: '',
    characterMap: { ROKO: '', JAXX: '', LULU: '', REIN: '' },
    llmEnabled: false,
    adaptedShots: [],
    warnings: [],
    loading: false,
  })

  function setError (target, e) {
    target.value = formatUserError(e, { fallback: t('filmEngineering.errorFallback') }).message
  }

  async function loadStatus () {
    const a = api()
    if (!a) { status.value = { available: false, error: t('filmEngineering.noDesktopWarning'), filmMeta: null, sceneCount: 0, shotCount: 0, referenceCount: 0 }; return false }
    statusLoading.value = true
    try {
      const res = await a.status()
      if (res && res.code === 0) {
        status.value = res.data
        return res.data && res.data.available === true
      }
      status.value = { available: false, error: formatUserError(res, { fallback: t('filmEngineering.unavailable') }).message, filmMeta: null, sceneCount: 0, shotCount: 0, referenceCount: 0 }
      return false
    } catch (e) {
      setError(status, e)
      return false
    } finally {
      statusLoading.value = false
    }
  }

  async function loadScenes () {
    const a = api()
    if (!a) return
    scenesLoading.value = true
    try {
      const res = await a.listScenes()
      if (res && res.code === 0) {
        scenes.value = res.data || []
        if (!selectedSceneId.value) {
          const firstWithShots = scenes.value.find((s) => s.shotCount > 0)
          if (firstWithShots) await selectScene(firstWithShots.id)
        }
        return
      }
      ElMessage.warning(formatUserError(res, { fallback: t('filmEngineering.sceneLoadFailed') }).message)
    } catch (e) {
      ElMessage.warning(formatUserError(e, { fallback: t('filmEngineering.sceneLoadFailed') }).message)
    } finally {
      scenesLoading.value = false
    }
  }

  async function selectScene (sceneId) {
    const a = api()
    if (!a || !sceneId) return
    selectedSceneId.value = sceneId
    shots.value = []
    selectedShotIds.value = []
    shotsLoading.value = true
    try {
      const res = await a.listShots(sceneId)
      if (res && res.code === 0) shots.value = res.data || []
      else ElMessage.warning(formatUserError(res, { fallback: t('filmEngineering.shotLoadFailed') }).message)
    } catch (e) {
      ElMessage.warning(formatUserError(e, { fallback: t('filmEngineering.shotLoadFailed') }).message)
    } finally {
      shotsLoading.value = false
    }
  }

  async function openShot (shotId) {
    const a = api()
    if (!a || !shotId) return
    detailLoading.value = true
    try {
      const res = await a.getShot(shotId)
      if (res && res.code === 0) shotDetail.value = res.data
      else ElMessage.warning(formatUserError(res, { fallback: t('filmEngineering.detailLoadFailed') }).message)
    } catch (e) {
      ElMessage.warning(formatUserError(e, { fallback: t('filmEngineering.detailLoadFailed') }).message)
    } finally {
      detailLoading.value = false
    }
  }

  async function loadDoctrine () {
    const a = api()
    if (!a || doctrine.value) return
    doctrineLoading.value = true
    try {
      const res = await a.doctrine()
      if (res && res.code === 0) doctrine.value = res.data
    } catch (_) { /* 方法论展示失败不打断主流程 */ } finally {
      doctrineLoading.value = false
    }
  }

  function toggleShot (shotId) {
    const idx = selectedShotIds.value.indexOf(shotId)
    if (idx >= 0) selectedShotIds.value.splice(idx, 1)
    else selectedShotIds.value.push(shotId)
  }

  function toggleAllInScene () {
    const all = shots.value.map((s) => s.shotId)
    const every = all.every((id) => selectedShotIds.value.includes(id))
    selectedShotIds.value = every ? [] : all
  }

  async function copyText (shotId, mode) {
    const a = api()
    if (!a) { ElMessage.warning(t('filmEngineering.noDesktopWarning')); return false }
    try {
      const res = await a.copyText(shotId, mode)
      if (res && res.code === 0) {
        const ok = await writeClipboard(res.data.text)
        ElMessage.success(ok ? t('filmEngineering.promptCopied') : t('filmEngineering.copyFailed'))
        return ok
      }
      ElMessage.warning(formatUserError(res, { fallback: t('filmEngineering.copyFailed') }).message)
      return false
    } catch (e) {
      ElMessage.warning(formatUserError(e, { fallback: t('filmEngineering.copyFailed') }).message)
      return false
    }
  }

  async function copySelected () {
    const a = api()
    if (!a) { ElMessage.warning(t('filmEngineering.noDesktopWarning')); return false }
    if (selectedShotIds.value.length === 0) { ElMessage.warning(t('filmEngineering.selectFirst')); return false }
    try {
      const res = await a.copyTexts(selectedShotIds.value.slice(), copyMode.value)
      if (res && res.code === 0) {
        const ok = await writeClipboard(res.data.text)
        ElMessage.success(ok ? t('filmEngineering.copiedCount') + ' ' + res.data.count + ' ' + t('filmEngineering.shotsUnit') : t('filmEngineering.copyFailed'))
        return ok
      }
      ElMessage.warning(formatUserError(res, { fallback: t('filmEngineering.copyBatchFailed') }).message)
      return false
    } catch (e) {
      ElMessage.warning(formatUserError(e, { fallback: t('filmEngineering.copyBatchFailed') }).message)
      return false
    }
  }

  function selectedShotsPayload () {
    const byId = new Map(shots.value.map((s) => [s.shotId, s]))
    const list = []
    for (const id of selectedShotIds.value) {
      const s = byId.get(id)
      if (s) list.push({ shotId: s.shotId, sceneId: s.sceneId, prompt: s.prompt, model: s.model, refTokens: s.refTokens || [] })
    }
    return list
  }

  function downloadText (text, fileName) {
    try {
      const blob = new Blob([text], { type: 'application/octet-stream' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = fileName
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      return true
    } catch (_) {
      return false
    }
  }

  async function exportSelected (format) {
    const a = api()
    if (!a) { ElMessage.warning(t('filmEngineering.noDesktopWarning')); return false }
    if (selectedShotIds.value.length === 0) { ElMessage.warning(t('filmEngineering.selectFirst')); return false }
    exportLoading.value = true
    try {
      const res = await a.exportPrompts(selectedShotsPayload(), format)
      if (res && res.code === 0) {
        const text = res.data.export[format === 'markdown' ? 'markdown' : 'json']
        downloadText(text, res.data.fileName)
        ElMessage.success(t('filmEngineering.exported') + ' ' + res.data.fileName)
        return true
      }
      ElMessage.warning(formatUserError(res, { fallback: t('filmEngineering.exportFailed') }).message)
      return false
    } catch (e) {
      ElMessage.warning(formatUserError(e, { fallback: t('filmEngineering.exportFailed') }).message)
      return false
    } finally {
      exportLoading.value = false
    }
  }

  async function generateSelected () {
    const a = api()
    if (!a) { ElMessage.warning(t('filmEngineering.noDesktopWarning')); return false }
    if (selectedShotIds.value.length === 0) { ElMessage.warning(t('filmEngineering.selectFirst')); return false }
    if (selectedShotIds.value.length > 20) { ElMessage.warning(t('filmEngineering.maxGenerate')); return false }
    generating.value = true
    try {
      const res = await a.generateSelected(selectedShotsPayload(), { aspectRatio: '16:9' })
      if (res && res.code === 0) {
        const failed = (res.data.results || []).filter((r) => r.code !== 0)
        if (failed.length > 0) {
          ElMessage.warning(t('filmEngineering.generatePartial') + ' ' + failed.length + ' ' + t('filmEngineering.generateFailed'))
        } else {
          ElMessage.success(t('filmEngineering.generateSubmitted') + ' ' + res.data.results.length + ' ' + t('filmEngineering.shotsUnit'))
        }
        return res.data
      }
      ElMessage.warning(formatUserError(res, { fallback: t('filmEngineering.generateFailedMsg') }).message)
      return null
    } catch (e) {
      ElMessage.warning(formatUserError(e, { fallback: t('filmEngineering.generateFailedMsg') }).message)
      return null
    } finally {
      generating.value = false
    }
  }

  async function adaptScript () {
    const a = api()
    if (!a) { ElMessage.warning(t('filmEngineering.noDesktopWarning')); return false }
    const characterMap = {}
    for (const [k, v] of Object.entries(adapt.characterMap)) {
      if (typeof v === 'string' && v.trim()) characterMap[k] = v.trim()
    }
    adapt.loading = true
    adapt.adaptedShots = []
    adapt.warnings = []
    try {
      const res = await a.adaptScript({ script: adapt.script, characterMap, llmEnabled: adapt.llmEnabled })
      if (res && res.code === 0) {
        adapt.adaptedShots = res.data.adaptedShots || []
        adapt.warnings = res.data.warnings || []
        ElMessage.success(t('filmEngineering.adaptDone') + ' ' + adapt.adaptedShots.length + ' ' + t('filmEngineering.shotsUnit'))
        return true
      }
      ElMessage.warning(formatUserError(res, { fallback: t('filmEngineering.adaptFailed') }).message)
      return false
    } catch (e) {
      ElMessage.warning(formatUserError(e, { fallback: t('filmEngineering.adaptFailed') }).message)
      return false
    } finally {
      adapt.loading = false
    }
  }

  async function copyAdaptedShot (shot, index) {
    // 套用分镜为前端本地产物（虚拟 shotId），不经过主进程 copy-texts，直接写剪贴板
    const ok = await writeClipboard(shot.prompt || '')
    ElMessage.success(ok ? t('filmEngineering.copiedShot') + ' ' + (index + 1) + ' ' + t('filmEngineering.promptCopied') : t('filmEngineering.copyFailed'))
    return ok
  }

  async function refreshAll () {
    const ok = await loadStatus()
    if (!ok) return false
    await Promise.all([loadScenes(), loadDoctrine()])
    return true
  }

  return {
    status, statusLoading, scenes, scenesLoading, selectedSceneId,
    shots, shotsLoading, shotDetail, detailLoading,
    doctrine, doctrineLoading, selectedShotIds, copyMode, generating, exportLoading, adapt,
    COPY_MODES,
    loadStatus, loadScenes, selectScene, openShot, loadDoctrine,
    toggleShot, toggleAllInScene, copyText, copySelected, exportSelected, generateSelected,
    adaptScript, copyAdaptedShot, refreshAll,
  }
}

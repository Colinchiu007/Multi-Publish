// @ts-check
/**
 * useVideoClone.js — 视频克隆流水线 composable（切片 4b）
 *
 * 职责：
 *   - 输入状态（链接/本地文件 + 复刻层级/模式/改写开关）
 *   - run：经 window.electronAPI.videoClone.run 启动，onProgress 驱动六阶段卡片
 *   - cancel：中止当前 run
 *   - 结果：report / similarity / publishResult；editReport 编辑往返（IPC 校验）
 *   - 错误：formatUserError 统一「原因 + 建议」本地化
 *
 * 依赖 window.electronAPI（Electron 窗口）；浏览器直开 Vite 时静默降级。
 */
import { ref, reactive } from 'vue'
import { getApi } from '@/api/electron-bridge'
import { formatUserError } from '@/utils/user-facing-error'
import i18n from '@/i18n'
import { useNotify } from './useNotify'
import {
  story2videoConfigProfileList,
  story2videoConfigProfileCreate,
  story2videoConfigProfileRename,
  story2videoConfigProfileDelete,
} from '@/api/publisher'

const api = () => (getApi() || {}).videoClone || null

const STAGE_LABELS = ['ingest', 'analyze', 'plan', 'generate', 'compose', 'publish']
const VIDEO_CLONE_PIPELINE_ID = 'video-clone'
const VIDEO_CLONE_MODES = ['structure', 'style', 'inspiration']
const t = (key) => i18n.global.t(key)

function cloneJson (value) {
  try { return JSON.parse(JSON.stringify(value)) } catch (_) { return null }
}

export function useVideoClone() {
  // 统一通知通道（D1 决策）：toast 走 useNotify（带 notify:log 上报）
  const { notifyError, notifySuccess, notifyWarning } = useNotify()
  const sourceType = ref('url')
  const linkUrl = ref('')
  const filePath = ref('')
  const mode = ref('structure')
  const rewriteScript = ref(false)

  const running = ref(false)
  const runId = ref(null)
  const stageStatus = reactive({ ingest: 'idle', analyze: 'idle', plan: 'idle', generate: 'idle', compose: 'idle', publish: 'idle' })
  const report = ref(null)
  const similarity = ref(null)
  const publishResult = ref(null)
  const error = ref(null)
  let offProgress = null

  function resetStages() {
    for (const s of STAGE_LABELS) stageStatus[s] = 'idle'
  }

  function buildRequest() {
    return {
      source: sourceType.value === 'url' ? { type: 'url', url: linkUrl.value } : { type: 'local', path: filePath.value },
      options: { mode: mode.value, rewriteScript: rewriteScript.value },
    }
  }

  function buildConfigProfileSnapshot () {
    return {
      schemaVersion: 1,
      capturedAt: new Date().toISOString(),
      kind: 'video-clone',
      videoClone: {
        sourceType: sourceType.value === 'local' ? 'local' : 'url',
        mode: mode.value,
        rewriteScript: rewriteScript.value === true,
      },
    }
  }

  function applyConfigProfileSnapshot (snapshot) {
    if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot) || snapshot.kind !== 'video-clone') return false
    const config = snapshot.videoClone
    if (!config || typeof config !== 'object' || Array.isArray(config)) return false
    const nextSourceType = config.sourceType === 'local' || config.sourceType === 'url' ? config.sourceType : null
    const nextMode = VIDEO_CLONE_MODES.includes(config.mode) ? config.mode : null
    const hasRewriteScript = typeof config.rewriteScript === 'boolean'
    if (!nextSourceType || !nextMode || !hasRewriteScript) return false
    sourceType.value = nextSourceType
    mode.value = nextMode
    rewriteScript.value = config.rewriteScript
    return true
  }

  async function loadConfigProfiles () {
    const result = await story2videoConfigProfileList()
    if (!result || result.code !== 0) return result || { code: -1, message: t('create.story2video.configProfile.loadFailed') }
    if (!Array.isArray(result.data)) return { code: -1, message: t('create.story2video.configProfile.loadFailed') }
    const data = result.data
    return data.filter((profile) => profile && typeof profile === 'object').map(cloneJson).filter(Boolean)
  }

  async function saveConfigProfile (name, options = {}) {
    const snapshot = cloneJson(options.snapshot || buildConfigProfileSnapshot())
    if (!snapshot) return { code: -2, message: t('create.story2video.configProfile.snapshotInvalid') }
    return story2videoConfigProfileCreate({
      pipelineId: VIDEO_CLONE_PIPELINE_ID,
      name,
      snapshot,
      overwrite: options.overwrite === true,
    })
  }

  async function renameConfigProfile (id, name) {
    return story2videoConfigProfileRename(id, name)
  }

  async function deleteConfigProfile (id) {
    return story2videoConfigProfileDelete(id)
  }

  function applyProgress(evt) {
    if (!evt) return
    if (evt.type === 'stage:started') stageStatus[evt.stage] = 'running'
    else if (evt.type === 'stage:succeeded') stageStatus[evt.stage] = 'success'
    else if (evt.type === 'stage:failed') stageStatus[evt.stage] = 'failed'
    else if (evt.type === 'aborted') { running.value = false; error.value = { code: 'ABORTED' } }
  }

  async function start() {
    const a = api()
    if (!a) { notifyWarning('videoClone.noDesktopWarning', { message: t('videoClone.noDesktopWarning') }); return }
    error.value = null
    running.value = true
    resetStages()
    offProgress = a.onProgress((evt) => applyProgress(evt))
    try {
      const resp = await a.run(buildRequest())
      if (resp && resp.code === 0 && resp.data) {
        const d = resp.data
        runId.value = d.runId || null
        report.value = d.report || null
        similarity.value = d.similarity || null
        publishResult.value = d.publishResult || null
        if (!d.ok && d.error) {
          error.value = { code: d.error.code, phase: d.error.phase, userMessageKey: d.error.userMessageKey, params: d.error.params }
          notifyError('videoClone.error.internal', { message: formatUserError({ message: d.error.code }, { fallback: t('videoClone.error.internal') }).message })
        } else if (d.ok) {
          notifySuccess('videoClone.done', { message: t('videoClone.done') })
        }
      } else {
        error.value = { code: (resp && resp.errorCode) || 'UNKNOWN' }
        notifyError('videoClone.error.internal', { message: formatUserError({ message: (resp && resp.errorCode) || t('videoClone.error.internal') }, { fallback: t('videoClone.error.internal') }).message })
      }
    } catch (e) {
      error.value = { code: 'UNKNOWN', message: String(e && e.message) }
      notifyError('videoClone.error.internal', { message: formatUserError(e, {}).message })
    } finally {
      running.value = false
      if (offProgress) { offProgress(); offProgress = null }
    }
  }

  async function cancel() {
    const a = api()
    if (a && runId.value) await a.cancel(runId.value)
    running.value = false
  }

  async function regenerate() {
    const a = api()
    if (!a || !runId.value) return null
    running.value = true
    resetStages()
    try {
      const resp = await a.regenerate(runId.value)
      if (resp && resp.code === 0 && resp.data) {
        const d = resp.data
        report.value = d.report || report.value
        similarity.value = d.similarity || null
        publishResult.value = d.publishResult || null
        if (!d.ok && d.error) error.value = { code: d.error.code, phase: d.error.phase }
      }
    } catch (e) { error.value = { code: 'UNKNOWN', message: String(e && e.message) } }
    finally { running.value = false }
  }

  async function pickFile() {
    const a = api()
    if (!a || typeof a.pickFile !== 'function') { notifyWarning('videoClone.noDesktopWarning', { message: t('videoClone.noDesktopWarning') }); return }
    try {
      const resp = await a.pickFile()
      if (resp && resp.code === 0 && resp.data && resp.data.path) filePath.value = resp.data.path
    } catch (e) { notifyError('videoClone.error.internal', { message: formatUserError(e, {}).message }) }
  }

  async function editReport(path, value) {
    const a = api()
    if (!a || !report.value) return null
    try {
      const resp = await a.editReport(report.value, { path, value })
      if (resp && resp.code === 0 && resp.data) {
        report.value = resp.data
        return resp.data
      }
      notifyError('videoClone.error.reportEditInvalid', { message: formatUserError({ message: 'VIDEOCLONE_REPORT_EDIT_INVALID' }, { fallback: t('videoClone.error.reportEditInvalid') }).message })
      return null
    } catch (e) {
      notifyError('videoClone.error.internal', { message: formatUserError(e, {}).message })
      return null
    }
  }

  return {
    sourceType, linkUrl, filePath, mode, rewriteScript,
    running, runId, stageStatus, report, similarity, publishResult, error,
    start, cancel, editReport, pickFile, regenerate, STAGE_LABELS,
    buildConfigProfileSnapshot, applyConfigProfileSnapshot,
    loadConfigProfiles, saveConfigProfile, renameConfigProfile, deleteConfigProfile,
  }
}

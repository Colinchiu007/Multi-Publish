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
import { ref, reactive, computed } from 'vue'
import { getApi } from '@/api/electron-bridge'
import { ElMessage } from 'element-plus'
import { formatUserError } from '@/utils/user-facing-error'

const api = () => (getApi() || {}).videoClone || null

const STAGE_LABELS = ['ingest', 'analyze', 'plan', 'generate', 'compose', 'publish']

export function useVideoClone() {
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

  function applyProgress(evt) {
    if (!evt) return
    if (evt.type === 'stage:started') stageStatus[evt.stage] = 'running'
    else if (evt.type === 'stage:succeeded') stageStatus[evt.stage] = 'success'
    else if (evt.type === 'stage:failed') stageStatus[evt.stage] = 'failed'
    else if (evt.type === 'aborted') { running.value = false; error.value = { code: 'ABORTED' } }
  }

  async function start() {
    const a = api()
    if (!a) { ElMessage.warning('当前环境未提供桌面端能力'); return }
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
          ElMessage.error(formatUserError({ message: d.error.code }, {}))
        } else if (d.ok) {
          ElMessage.success('视频克隆分析完成')
        }
      } else {
        error.value = { code: (resp && resp.errorCode) || 'UNKNOWN' }
        ElMessage.error(formatUserError({ message: (resp && resp.errorCode) || '操作失败' }, {}))
      }
    } catch (e) {
      error.value = { code: 'UNKNOWN', message: String(e && e.message) }
      ElMessage.error(formatUserError(e, {}))
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
    if (!a || typeof a.pickFile !== 'function') { ElMessage.warning('当前环境未提供桌面端能力'); return }
    try {
      const resp = await a.pickFile()
      if (resp && resp.code === 0 && resp.data && resp.data.path) filePath.value = resp.data.path
    } catch (e) { ElMessage.error(formatUserError(e, {})) }
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
      ElMessage.error(formatUserError({ message: 'VIDEOCLONE_REPORT_EDIT_INVALID' }, {}))
      return null
    } catch (e) {
      ElMessage.error(formatUserError(e, {}))
      return null
    }
  }

  return {
    sourceType, linkUrl, filePath, mode, rewriteScript,
    running, runId, stageStatus, report, similarity, publishResult, error,
    start, cancel, editReport, pickFile, regenerate, STAGE_LABELS,
  }
}

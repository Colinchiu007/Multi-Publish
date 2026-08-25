// @ts-check
/**
 * usePromptEval — 提示词评估 composable
 * 封装 window.electronAPI.promptEval* 调用与响应式状态。
 */
import { ref } from 'vue'
import { getApi } from '@/api/electron-bridge'

export function usePromptEval() {
  const records = ref([])
  const analyze = ref(null)
  const dimensions = ref(null)
  const loading = ref(false)
  const error = ref(null)

  async function run(request) {
    loading.value = true
    error.value = null
    try {
      const api = getApi()
      if (!api || typeof api.promptEvalRun !== 'function') {
        throw Object.assign(new Error('EVAL_LLM_UNAVAILABLE: 当前环境不支持提示词评估（IPC 不可用）'), { code: 'EVAL_LLM_UNAVAILABLE' })
      }
      const result = await api.promptEvalRun(request)
      if (!result || result.success === false) {
        throw Object.assign(new Error((result && result.error && result.error.message) || '评估失败'), {
          code: result && result.error && result.error.code,
        })
      }
      return result.report
    } finally {
      loading.value = false
    }
  }

  async function list() {
    const api = getApi()
    if (!api || typeof api.promptEvalList !== 'function') return []
    records.value = await api.promptEvalList()
    return records.value
  }

  async function get(id) {
    const api = getApi()
    if (!api || typeof api.promptEvalGet !== 'function') return null
    return api.promptEvalGet(id)
  }

  async function remove(id) {
    const api = getApi()
    if (!api || typeof api.promptEvalDelete !== 'function') return false
    await api.promptEvalDelete(id)
    await list()
    return true
  }

  async function loadAnalyze() {
    const api = getApi()
    if (!api || typeof api.promptEvalAnalyze !== 'function') return null
    analyze.value = await api.promptEvalAnalyze()
    return analyze.value
  }

  async function loadDimensions() {
    const api = getApi()
    if (!api || typeof api.promptEvalDimensions !== 'function') return null
    dimensions.value = await api.promptEvalDimensions()
    return dimensions.value
  }

  return { records, analyze, dimensions, loading, error, run, list, get, remove, loadAnalyze, loadDimensions }
}


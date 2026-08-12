// @ts-check
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { usePromptEval } from './prompt-eval'

function makeApi(overrides = {}) {
  return {
    promptEvalRun: vi.fn(async () => ({ success: true, report: { id: 'eval-1', overallScore: 82 } })),
    promptEvalList: vi.fn(async () => [{ id: 'eval-1', overallScore: 82 }]),
    promptEvalGet: vi.fn(async (id) => ({ id, overallScore: 82 })),
    promptEvalDelete: vi.fn(async () => true),
    promptEvalAnalyze: vi.fn(async () => ({ recordCount: 1, averageOverall: 82 })),
    promptEvalDimensions: vi.fn(async () => ({ image: [{ id: 'relevance' }] })),
    ...overrides,
  }
}

describe('usePromptEval', () => {
  beforeEach(() => {
    window.electronAPI = makeApi()
  })

  it('IPC 返回非空数据 → 响应式状态转发（run 报告、list 记录、analyze、dimensions）', async () => {
    const evalApi = usePromptEval()
    const report = await evalApi.run({ mediaType: 'image', items: [] })
    expect(report.overallScore).toBe(82)
    await evalApi.list()
    expect(evalApi.records.value).toHaveLength(1)
    await evalApi.loadAnalyze()
    expect(evalApi.analyze.value.averageOverall).toBe(82)
    await evalApi.loadDimensions()
    expect(evalApi.dimensions.value.image[0].id).toBe('relevance')
  })

  it('run 失败（success:false）→ 抛带错误码的 Error 且 error 状态更新', async () => {
    window.electronAPI = makeApi({
      promptEvalRun: vi.fn(async () => ({ success: false, error: { code: 'EVAL_LLM_UNAVAILABLE', message: '未配置模型' } })),
    })
    const evalApi = usePromptEval()
    let thrown = null
    try {
      await evalApi.run({ mediaType: 'image', items: [] })
    } catch (e) {
      thrown = e
    }
    expect(thrown).not.toBeNull()
    expect(thrown.code).toBe('EVAL_LLM_UNAVAILABLE')
  })

  it('IPC 不可用 → run 抛 EVAL_LLM_UNAVAILABLE，list 返回空数组', async () => {
    window.electronAPI = null
    const evalApi = usePromptEval()
    await expect(evalApi.run({ mediaType: 'image', items: [] })).rejects.toThrow(/EVAL_LLM_UNAVAILABLE/)
    expect(await evalApi.list()).toEqual([])
  })
})

// @vitest-environment node
const { registerSmokeTestStages, SMOKETEST_STAGE_TYPES } = require('./smoketest-stages')

function makePipeline() {
  const executors = new Map()
  const pipeline = {
    stageExecutor: { executors, register(type, fn) { executors.set(type, fn) } },
    log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    listPipelines: () => [{ name: 'framework-smoke' }, { name: 'cinematic' }],
    registerStageExecutor(type, fn) { executors.set(type, fn); return { success: true } },
  }
  const reg = registerSmokeTestStages(pipeline)
  const get = (type) => executors.get(type)
  return { pipeline, get, reg }
}

describe('framework-smoke 阶段执行器', () => {
  it('注册 verify 与 report 两个自定义阶段', () => {
    const { reg, get } = makePipeline()
    expect(reg.success).toBe(true)
    expect(reg.registered).toHaveLength(2)
    expect(get(SMOKETEST_STAGE_TYPES.VERIFY)).toBeTypeOf('function')
    expect(get(SMOKETEST_STAGE_TYPES.REPORT)).toBeTypeOf('function')
  })

  it('verify 输出工具与流水线注册表状态', async () => {
    const { get } = makePipeline()
    const events = []
    const result = await get(SMOKETEST_STAGE_TYPES.VERIFY)({
      stage: {}, params: {}, context: {}, onProgress: event => events.push(event),
    })
    expect(result.success).toBe(true)
    expect(result.output.tools).toMatchObject({ ffmpeg: expect.any(Boolean), ffprobe: expect.any(Boolean) })
    expect(result.output.pipelineCount).toBe(2)
    expect(result.output.stageExecutor).toBe(true)
    expect(events).toEqual([
      expect.objectContaining({ percent: 0, messageKey: 'stageProgress.smoketestVerify' }),
      expect.objectContaining({ percent: 100, summaryKey: 'stageProgress.smoketestVerifySummary', detail: { done: 1, total: 1, kind: 'resource' } }),
    ])
  })

  it('report 缺少 context.verify 时失败', async () => {
    const { get } = makePipeline()
    const result = await get(SMOKETEST_STAGE_TYPES.REPORT)({
      runId: 'r', stage: {}, params: {}, context: {},
    })
    expect(result.success).toBe(false)
    expect(result.error).toContain('需要 context.verify')
  })
})

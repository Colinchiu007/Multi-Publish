// @vitest-environment node
const os = require('os')
const path = require('path')
const fs = require('fs')

// 适配：subtitle-align-service 依赖 aligner-bridge.isAlignerAvailable()（检查 ALIGNER_DIR/aligner 目录，
// 测试环境默认未部署 → fail-fast 跳过 bridge）。在模块加载前设置 ALIGNER_DIR 指向含 aligner/ 的临时目录，
// 使「已部署」路径可测（2026-08-12 顺带适配 main 既有失败）。
const alignerDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aligner-test-'))
fs.mkdirSync(path.join(alignerDir, 'aligner'))
process.env.ALIGNER_DIR = alignerDir

const { alignScenes, buildTimelineItem } = require('./subtitle-align-service')

afterAll(() => {
  try { fs.rmSync(alignerDir, { recursive: true, force: true }) } catch (_) { /* ignore */ }
})

describe('subtitle-align-service 编排', () => {
  it('有音频+字幕块的场景被对齐并附加 subtitleTimeline/subtitleAlign', async () => {
    const scenes = [{
      index: 0,
      audioPath: 'C:/tmp/vo.mp3',
      duration: 6,
      subtitleBlocks: [{ displayOrder: 0, text: '今天天气真好' }],
    }]
    const bridge = {
      transcribeAudio: vi.fn(async () => ({
        words: [
          { text: '今天', start: 0.0, end: 0.5 },
          { text: '天气', start: 0.5, end: 0.9 },
          { text: '真好', start: 0.9, end: 1.3 },
        ],
      })),
    }
    await alignScenes(scenes, { alignerBridge: bridge, log: { warn: () => {} } })
    expect(bridge.transcribeAudio).toHaveBeenCalledTimes(1)
    const body = bridge.transcribeAudio.mock.calls[0][1]
    expect(body.initialPrompt).toBe('今天天气真好')
    expect(scenes[0].subtitleTimeline).toBeDefined()
    expect(scenes[0].subtitleTimeline[0].text).toBe('今天天气真好')
    expect(scenes[0].subtitleTimeline[0].startTime).toBe(0)
    expect(scenes[0].subtitleTimeline[0].endTime).toBe(1.3)
    expect(scenes[0].subtitleTimeline[0].charTimings).toHaveLength(6)
    expect(scenes[0].subtitleAlign.aligned).toBe(true)
    expect(scenes[0].subtitleAlign.method).toBe('asr')
    expect(scenes[0].subtitleAlign.reason).toBe('ok')
  })

  it('ASR 失败 fail-open：保留场景 + aligned:false + reason，不抛错', async () => {
    const scenes = [{
      index: 1,
      audioPath: 'C:/tmp/bad.mp3',
      duration: 6,
      subtitleBlocks: [{ displayOrder: 0, text: '测试' }],
    }]
    const bridge = {
      transcribeAudio: vi.fn(async () => { throw new Error('ECONNREFUSED') }),
    }
    await alignScenes(scenes, { alignerBridge: bridge, log: { warn: () => {} } })
    expect(scenes[0].subtitleAlign.aligned).toBe(false)
    expect(scenes[0].subtitleAlign.reason).toContain('ECONNREFUSED')
    expect(scenes[0].subtitleTimeline).toBeUndefined()
  })

  it('无音频或无字幕块的场景跳过', async () => {
    const scenes = [{ index: 0, audioPath: 'C:/tmp/vo.mp3', subtitleBlocks: [] }, { index: 1, audioPath: null, subtitleBlocks: [{ displayOrder: 0, text: 'x' }] }]
    const bridge = { transcribeAudio: vi.fn(async () => ({ words: [] })) }
    await alignScenes(scenes, { alignerBridge: bridge, log: { warn: () => {} } })
    expect(bridge.transcribeAudio).not.toHaveBeenCalled()
  })

  it('buildTimelineItem 生成 charTimings', () => {
    const item = buildTimelineItem({ text: '甲乙', startTime: 1.0, endTime: 2.0 }, 2)
    expect(item.charTimings).toEqual([1.5, 2.0])
  })
})

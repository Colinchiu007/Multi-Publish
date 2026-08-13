// @vitest-environment node
import { afterAll, describe, expect, it, vi } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

// 对齐服务在调用 bridge 前先检查 isAlignerAvailable()（aligner-bridge 模块加载时读取
// ALIGNER_DIR/aligner 模块存在性）。CI（Linux、无 ALIGNER_DIR）默认为 false → fail-fast 跳过
// mock bridge（原 #588 用例仅在 Windows 本机存在 D:\...\packages\audio-aligner 时通过，CI 必挂）。
// 这里将 ALIGNER_DIR 指向带 aligner/ 模块的临时目录，使可用性判定与生产同源（真实 fs 检查）为 true，
// 确定性覆盖编排路径；生产行为不变（未部署 aligner 仍 fail-fast）。
const alignerDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mp-aligner-test-'))
fs.mkdirSync(path.join(alignerDir, 'aligner'), { recursive: true })
process.env.ALIGNER_DIR = alignerDir
afterAll(() => {
  fs.rmSync(alignerDir, { recursive: true, force: true })
})

const { alignScenes, buildTimelineItem } = require('./subtitle-align-service')

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

  it('alignScenes 把 opts.traceId 透传给 transcribeAudio（R3/R4）', async () => {
    const scenes = [{
      index: 0,
      audioPath: 'C:/tmp/vo.mp3',
      duration: 6,
      subtitleBlocks: [{ displayOrder: 0, text: '今天天气真好' }],
    }]
    const bridge = {
      transcribeAudio: vi.fn(async () => ({ words: [{ text: '今天', start: 0.0, end: 0.5 }] })),
    }
    await alignScenes(scenes, { alignerBridge: bridge, log: { warn: () => {} }, traceId: 'run_5' })
    const body = bridge.transcribeAudio.mock.calls[0][1]
    expect(body.traceId).toBe('run_5')
    // traceId 只进控制字段，不进入发送给 Python 的 payload 相关字段
    expect(body.model).toBe('base')
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

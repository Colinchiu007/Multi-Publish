// @vitest-environment node
/**
 * 字幕对齐真实集成验证（stage 接线链路）：真实音频 + 真实 aligner + 真实 alignScenes。
 *
 * 仅在 RUN_ALIGNER_E2E=1 时执行（需要：本机 faster-whisper + edge-tts + ffmpeg；aligner 由测试自行 spawn）。
 * 覆盖：alignScenes → AlignerBridge(真实子进程) → /align(真实 ASR) → JS 聚合器 → subtitleTimeline/subtitleAlign。
 */
const { execFileSync } = require('node:child_process')
const { mkdtempSync, rmSync, existsSync } = require('node:fs')
const { tmpdir } = require('node:os')
const { join } = require('node:path')
const AlignerBridge = require('./aligner-bridge')
const { alignScenes } = require('./subtitle-align-service')

const RUN = process.env.RUN_ALIGNER_E2E === '1'

const BLOCKS = [
  '要知道在农耕社会', '柴火、盐巴和香料', '那可都是绝对的硬通货',
  '处理猪肠、牛肚这些下水', '得反复搓洗焯水', '再配上八角桂皮黄', '酒等香料慢慢炖煮',
]

const describeE2E = RUN ? describe : describe.skip

describeE2E('字幕对齐真实 E2E（stage 接线链路）', () => {
  let dir
  let audioPath
  let bridge

  beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), 'align-e2e-'))
    audioPath = join(dir, 'vo.mp3')
    const alignerDir = join(process.cwd(), '../../packages/audio-aligner')
    if (!existsSync(join(alignerDir, 'aligner'))) {
      throw new Error('aligner 包不存在: ' + alignerDir)
    }
    // 1) edge-tts 合成真实旁白（Python）
    const text = BLOCKS.join('，') + '。'
    const script = [
      'import asyncio, edge_tts, sys',
      'async def main():',
      '    await edge_tts.Communicate(sys.argv[1], "zh-CN-YunxiNeural").save(sys.argv[2])',
      'asyncio.run(main())',
    ].join('\n')
    execFileSync('python', ['-c', script, text, audioPath], { timeout: 120000 })
    // 2) 启动真实 aligner（aligner-bridge workDir 指向 aligner 包）
    bridge = new AlignerBridge({ log: { info: () => {}, warn: () => {}, error: () => {} } })
    await bridge.start()
  }, 180000)

  afterAll(async () => {
    try { await bridge.stop() } catch (e) { /* ignore */ }
    try { rmSync(dir, { recursive: true, force: true }) } catch (e) { /* ignore */ }
  }, 30000)

  it('真实音频 → 真实 ASR → 聚合 → subtitleTimeline 非比例估算', async () => {
    const scenes = [{
      index: 0,
      audioPath,
      duration: null,
      subtitleBlocks: BLOCKS.map((text, i) => ({ displayOrder: i, text })),
    }]
    await alignScenes(scenes, { alignerBridge: bridge, log: { info: () => {}, warn: () => {}, error: () => {} } })

    const scene = scenes[0]
    expect(scene.subtitleAlign).toBeDefined()
    expect(scene.subtitleAlign.aligned).toBe(true)
    expect(scene.subtitleAlign.method).toBe('asr')
    expect(scene.subtitleAlign.coverage).toBeGreaterThanOrEqual(0.9)
    expect(Array.isArray(scene.subtitleTimeline)).toBe(true)
    expect(scene.subtitleTimeline.length).toBe(BLOCKS.length)

    // 区间连续不重叠
    for (let i = 1; i < scene.subtitleTimeline.length; i++) {
      expect(scene.subtitleTimeline[i].startTime).toBeGreaterThanOrEqual(scene.subtitleTimeline[i - 1].endTime)
    }
    // 存在真实停顿间隔（比例估算严格连续无间隔）
    const gaps = scene.subtitleTimeline.slice(1).map((b, i) => b.startTime - scene.subtitleTimeline[i].endTime)
    expect(Math.max(...gaps)).toBeGreaterThan(0.1)
    // charTimings 与块区间一致
    const last = scene.subtitleTimeline[scene.subtitleTimeline.length - 1]
    expect(last.charTimings.length).toBe(last.text.length)
    expect(last.charTimings[last.charTimings.length - 1]).toBeCloseTo(last.endTime, 2)
    console.log('E2E timeline:', JSON.stringify(scene.subtitleTimeline.map((b) => [b.text, b.startTime, b.endTime])))
  }, 300000)
})

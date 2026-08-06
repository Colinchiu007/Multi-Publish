// @ts-check
/**
 * story2video-compose-engine 字幕转义单元测试
 *
 * 测试 ffmpeg drawtext 滤镜中字幕文本的转义逻辑。
 * 重点：转义顺序（\ 必须最先）+ 字符覆盖（: , ' % { } \）
 */
const fs = require('fs')
const os = require('os')
const path = require('path')
const {
  Story2VideoComposeEngine,
  findFfmpeg,
  findFfprobe,
  buildTransitionPlan,
  escapeSubtitleText,
  normalizeComposeScenes,
  buildImageEffectFilter,
  buildSubtitleFilter,
  buildWatermarkFilter,
  buildScaleFilter,
  parseResolution,
} = require('./story2video-compose-engine')

function writeFixture (root, name, content = 'media') {
  const filePath = path.join(root, name)
  fs.writeFileSync(filePath, content)
  return filePath
}

describe('escapeSubtitleText — ffmpeg drawtext 字幕转义', () => {
  // 1. 正常路径：纯中文无需转义
  it('1. 纯中文文本保持原样', () => {
    expect(escapeSubtitleText('你好世界')).toBe('你好世界')
  })

  // 2. 冒号转义
  it('2. 冒号转义为 \\:', () => {
    expect(escapeSubtitleText('时间: 30秒')).toBe('时间\\: 30秒')
  })

  // 3. 单引号转义
  it('3. 单引号转义为 \\’', () => {
    expect(escapeSubtitleText("It's OK")).toBe("It\\'s OK")
  })

  // 4. 逗号转义
  it('4. 逗号转义为 \\,', () => {
    expect(escapeSubtitleText('Hello, World')).toBe('Hello\\, World')
  })

  // 5. 反斜杠转义（必须最先转义，否则后续转义符被二次转义）
  // 输入 'C:\\path'（JS 字符串值 C:\path）含 \ 和 :，两者都需转义
  // 步骤1 \→\\：C:\\path；步骤2 :→\:：C\:\\path
  // JS 字面量 'C\\:\\\\path' 表示字符串值 C\:\\path
  it('5. 反斜杠转义为 \\\\', () => {
    expect(escapeSubtitleText('C:\\path')).toBe('C\\:\\\\path')
  })

  // 6. 百分号转义（避免 %{...} 函数扩展）
  it('6. 百分号转义为 \\%', () => {
    expect(escapeSubtitleText('50% off')).toBe('50\\% off')
  })

  // 7. 花括号转义（避免 ${...} 变量扩展；$ 本身不需转义）
  it('7. 花括号转义为 \\{ \\}', () => {
    expect(escapeSubtitleText('${var}')).toBe('$\\{var\\}')
  })

  // 8. 组合特殊字符
  it('8. 组合特殊字符全部转义', () => {
    const input = "100% {k}: v, 't'"
    const expected = "100\\% \\{k\\}\\: v\\, \\'t\\'"
    expect(escapeSubtitleText(input)).toBe(expected)
  })

  // 9. 空字符串
  it('9. 空字符串返回空', () => {
    expect(escapeSubtitleText('')).toBe('')
  })

  // 10. 转义顺序验证：含 \\ 的文本先转义 \\，否则后续 : 转义会变成 \\\\
  it('10. 转义顺序：反斜杠在冒号之前转义', () => {
    // 输入 "a\b:c"
    // 错误顺序（先 : 后 \）：a\b\:c → a\\b\\:c（多了一个 \）
    // 正确顺序（先 \ 后 :）：a\\b:c → a\\b\:c
    expect(escapeSubtitleText('a\\b:c')).toBe('a\\\\b\\:c')
  })

  // 11. null/undefined 边界
  it('11. null/undefined 返回空字符串', () => {
    expect(escapeSubtitleText(null)).toBe('')
    expect(escapeSubtitleText(undefined)).toBe('')
  })

  // 12. 换行符保留（ffmpeg drawtext 支持换行）
  it('12. 换行符保留不转义', () => {
    expect(escapeSubtitleText('第一行\n第二行')).toBe('第一行\n第二行')
  })
})

describe('Story2VideoComposeEngine 资源与效果契约', () => {
  it('默认成片上限与旧 PRD 一致为 10 分钟', () => {
    const engine = new Story2VideoComposeEngine({
      log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    })
    expect(engine.maxDurationSeconds).toBe(10 * 60)
    expect(engine.maxAudioDurationSeconds).toBe(15 * 60)
    expect(engine.maxSegmentDurationSeconds).toBe(3 * 60)
  })

  it('缺少 duration 时保留 null，不在 normalize 阶段伪造 3 秒', () => {
    const scenes = normalizeComposeScenes({
      scenes: [{ imagePath: 'image.png', audioPath: 'audio.mp3' }],
    })
    expect(scenes[0].duration).toBeNull()
  })

  it('转场时长按相邻片段真实时长收敛，并为极短片段关闭转场', () => {
    const plan = buildTransitionPlan([0.2, 0.35], 1.2)
    expect(plan.enabled).toBe(true)
    expect(plan.transitions[0].duration).toBeLessThan(0.2)
    expect(plan.transitions[0].offset).toBeGreaterThan(0)

    const fallback = buildTransitionPlan([0.01, 0.4], 0.4)
    expect(fallback.enabled).toBe(false)
  })

  it('优先使用 scenes 的原始 index，部分资源不会错配字幕', () => {
    const scenes = normalizeComposeScenes({
      scenes: [
        { index: 2, imagePath: 'image-2.png', audioPath: 'audio-2.mp3', text: '第三句' },
      ],
      images: [{ index: 0, path: 'wrong.png' }],
      audio: [{ index: 0, path: 'wrong.mp3' }],
      sentences: [{ text: '第一句' }, { text: '第二句' }, { text: '第三句' }],
    })
    expect(scenes).toEqual([
      expect.objectContaining({ index: 2, imagePath: 'image-2.png', audioPath: 'audio-2.mp3', text: '第三句' }),
    ])
  })

  it('保留素材来源元数据，供项目持久化和结果页提示使用', () => {
    const scenes = normalizeComposeScenes({
      scenes: [{
        imagePath: 'image.png',
        audioPath: 'audio.mp3',
        imageMeta: { source: 'model-provider', degraded: false },
        audioMeta: { source: 'ffmpeg-silence', degraded: true },
      }],
    })

    expect(scenes[0]).toMatchObject({
      imageMeta: { source: 'model-provider', degraded: false },
      audioMeta: { source: 'ffmpeg-silence', degraded: true },
    })
  })

  it('归一化场景时保留双层分句结果和降级来源', () => {
    const scenes = normalizeComposeScenes({
      scenes: [{
        imagePath: 'image.png',
        audioPath: 'audio.mp3',
        text: '场景文本需要显示为多页字幕。',
        subtitleBlocks: ['场景文本需要', '显示为多页字幕。'],
        sceneSource: 'local-typescript-fallback',
        subtitleSource: 'local-typescript',
        degraded: true,
        fallbackReason: 'ECONNREFUSED',
      }],
    })

    expect(scenes[0]).toMatchObject({
      subtitleBlocks: ['场景文本需要', '显示为多页字幕。'],
      sceneSource: 'local-typescript-fallback',
      subtitleSource: 'local-typescript',
      degraded: true,
      fallbackReason: 'ECONNREFUSED',
    })
  })

  it('支持旧项目的图片动效、字幕样式、水印和分辨率约束', () => {
    expect(buildImageEffectFilter('zoom-in', 1280, 720, 30)).toContain('zoompan')
    expect(buildImageEffectFilter('pan-left', 1280, 720, 30)).toContain('pan')
    // 回归：zoompan 必须使用 d=总帧数（时长×帧率），d=1 + -loop 1 静态图不会产生动画
    expect(buildImageEffectFilter('zoom-in', 1280, 720, 30)).toContain(':d=90:')
    expect(buildImageEffectFilter('zoom-in', 1280, 720, 30, 180)).toContain(':d=180:')
    expect(buildImageEffectFilter('zoom-in', 1280, 720, 30)).not.toContain(':d=1:')
    expect(buildSubtitleFilter('字幕', { size: 'lg', style: 'style2' })).toContain('box=1')
    expect(buildWatermarkFilter({
      watermark: { enabled: true, text: '品牌', position: 'top-left', opacity: 0.5 },
    })).toContain('x=20:y=40')
    expect(parseResolution('1920x1080')).toEqual({ width: 1920, height: 1080 })
    expect(parseResolution('../bad')).toEqual({ width: 1280, height: 720 })
    expect(buildScaleFilter(1920, 1080)).toContain('scale=1920:1080')
    expect(buildScaleFilter(1920, 1080)).toContain('pad=1920:1080')
  })

  it('为每个字幕页生成首尾不重叠的 FFmpeg 半开时间区间', () => {
    const filter = buildSubtitleFilter([
      { text: '第一屏字幕', startTime: 0, endTime: 1.25 },
      { text: '第二屏字幕', startTime: 1.25, endTime: 2.5 },
    ], { size: 'lg' })

    expect(filter.match(/drawtext=/g)).toHaveLength(2)
    expect(filter).toContain("enable='gte(t,0.000)*lt(t,1.250)'")
    expect(filter).toContain("enable='gte(t,1.250)*lt(t,2.500)'")
    expect(filter).not.toContain('between(t,')
  })

  it('compose 以 scenes 为权威并把效果/BGM参数传给合成阶段', async () => {
    if (!findFfmpeg()) return
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 's2v-compose-contract-'))
    const image = path.join(root, 'image.png')
    const audio = path.join(root, 'audio.mp3')
    fs.writeFileSync(image, Buffer.from('image'))
    fs.writeFileSync(audio, Buffer.from('audio'))
    const engine = new Story2VideoComposeEngine({
      outputDir: root,
      log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    })
    const segmentCalls = []
    engine._createSegment = vi.fn(async (_image, _audio, output, options) => {
      segmentCalls.push(options)
      fs.writeFileSync(output, Buffer.from('segment'))
    })
    engine._concatSegments = vi.fn(async (_segments, output) => {
      fs.writeFileSync(output, Buffer.from('video'))
    })
    engine._concatNarrationAudio = vi.fn(async (_audioPaths, output) => {
      fs.writeFileSync(output, Buffer.from('narration'))
    })
    engine._validateOutput = vi.fn(async () => {})

    try {
      const result = await engine.compose({
        scenes: [
          { index: 3, imagePath: image, audioPath: audio, duration: 2, text: '原始第三句' },
        ],
        images: [],
        audio: [],
      }, {
        transition: 'slide-left',
        imageEffect: 'zoom-in',
        subtitleStyle: { size: 'lg' },
        watermark: true,
        watermarkText: '品牌',
        voiceVolume: 0.75,
        validateOutput: false,
      })
      expect(result.code).toBe(0)
      expect(segmentCalls).toHaveLength(1)
      expect(segmentCalls[0]).toMatchObject({
        duration: 2,
        subtitleText: '原始第三句',
        transition: 'slide-left',
        imageEffect: 'zoom-in',
        voiceVolume: 0.75,
      })
      expect(result.data.segmentCount).toBe(1)
      expect(result.data.segments).toEqual([
        expect.objectContaining({ index: 3, text: '原始第三句', videoPath: expect.any(String) }),
      ])
      expect(result.data.audioPath).toEqual(expect.any(String))
      expect(fs.existsSync(result.data.audioPath)).toBe(true)
    } finally {
      fs.rmSync(root, { recursive: true, force: true })
    }
  })

  it('以 ffprobe 的 TTS 真实时长覆盖估算值，并同步分页字幕时间轴', async () => {
    if (!findFfmpeg()) return
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 's2v-compose-subtitle-timing-'))
    const image = writeFixture(root, 'image.png')
    const audio = writeFixture(root, 'audio.mp3')
    const engine = new Story2VideoComposeEngine({
      outputDir: root,
      log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    })
    const segmentCalls = []
    engine._probeMediaDuration = vi.fn(async () => 4)
    engine._createSegment = vi.fn(async (_image, _audio, output, options) => {
      segmentCalls.push(options)
      fs.writeFileSync(output, 'segment')
    })
    engine._concatNarrationAudio = vi.fn(async (_audioPaths, output) => fs.writeFileSync(output, 'narration'))
    engine._validateOutput = vi.fn(async () => {})

    try {
      const result = await engine.compose({
        scenes: [{
          imagePath: image,
          audioPath: audio,
          duration: 1,
          text: '第一屏字幕内容，第二屏字幕内容。',
          subtitleBlocks: ['第一屏字幕内容，', '第二屏字幕内容。'],
        }],
      }, { transition: 'none', validateOutput: false })

      expect(result.code).toBe(0)
      expect(segmentCalls[0].duration).toBe(4)
      expect(segmentCalls[0].subtitleTimeline.at(-1).endTime).toBe(4)
      expect(result.data.segments[0].subtitleBlocks).toEqual(['第一屏字幕内容，', '第二屏字幕内容。'])
      expect(result.data.segments[0].subtitleTimeline.at(-1).endTime).toBe(4)
    } finally {
      fs.rmSync(root, { recursive: true, force: true })
    }
  })

  it('旧项目没有字幕块时会按场景文本自动分页，并同步真实音频时长', async () => {
    if (!findFfmpeg()) return
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 's2v-compose-legacy-subtitles-'))
    const image = writeFixture(root, 'image.png')
    const audio = writeFixture(root, 'audio.mp3')
    const text = '第一屏字幕内容需要完整呈现，第二屏字幕内容也要连续显示。'
    const engine = new Story2VideoComposeEngine({
      outputDir: root,
      log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    })
    const segmentCalls = []
    engine._probeMediaDuration = vi.fn(async () => 4)
    engine._createSegment = vi.fn(async (_image, _audio, output, options) => {
      segmentCalls.push(options)
      fs.writeFileSync(output, 'segment')
    })
    engine._concatNarrationAudio = vi.fn(async (_audioPaths, output) => fs.writeFileSync(output, 'narration'))
    engine._validateOutput = vi.fn(async () => {})

    try {
      const result = await engine.compose({
        scenes: [{ imagePath: image, audioPath: audio, duration: 1, text }],
      }, { transition: 'none', validateOutput: false })

      expect(result.code).toBe(0)
      const timeline = segmentCalls[0].subtitleTimeline
      expect(timeline.length).toBeGreaterThan(1)
      expect(timeline[0].startTime).toBe(0)
      timeline.slice(1).forEach((item, index) => {
        expect(item.startTime).toBe(timeline[index].endTime)
      })
      expect(timeline.at(-1).endTime).toBe(4)
      expect(timeline.map(item => item.text).join('')).toBe(text)
      expect(result.data.segments[0].subtitleBlocks).toEqual(timeline.map(item => item.text))
      expect(result.data.segments[0].subtitleTimeline.at(-1).endTime).toBe(4)
    } finally {
      fs.rmSync(root, { recursive: true, force: true })
    }
  })

  it('多段旁白导出会消费所有音频，而不是只使用第一段', async () => {
    if (!findFfmpeg()) return
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 's2v-compose-narration-'))
    const scenes = [0, 1].map(index => ({
      index,
      imagePath: writeFixture(root, 'image-' + index + '.png'),
      audioPath: writeFixture(root, 'audio-' + index + '.mp3'),
      duration: 1,
      text: '第' + (index + 1) + '段',
    }))
    const engine = new Story2VideoComposeEngine({ outputDir: root, log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } })
    engine._createSegment = vi.fn(async (_image, _audio, output) => fs.writeFileSync(output, 'segment'))
    engine._concatSegments = vi.fn(async (_segments, output) => fs.writeFileSync(output, 'video'))
    engine._probeMediaDuration = vi.fn(async () => null)
    const expectedAudioPaths = scenes.map(scene => fs.realpathSync.native(scene.audioPath))
    engine._concatNarrationAudio = vi.fn(async (audioPaths, output) => {
      expect(audioPaths).toEqual(expectedAudioPaths)
      fs.writeFileSync(output, 'narration')
    })
    engine._validateOutput = vi.fn(async () => {})

    try {
      const result = await engine.compose({ scenes }, { transition: 'none', validateOutput: false })
      expect(result.code).toBe(0)
      expect(engine._concatNarrationAudio).toHaveBeenCalledTimes(1)
      expect(result.data.segments).toHaveLength(2)
      expect(fs.existsSync(result.data.audioPath)).toBe(true)
    } finally {
      fs.rmSync(root, { recursive: true, force: true })
    }
  })

  it('format=webm 时执行最终转码并返回 webm 路径', async () => {
    if (!findFfmpeg()) return
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 's2v-compose-webm-'))
    const image = path.join(root, 'image.png')
    const audio = path.join(root, 'audio.mp3')
    fs.writeFileSync(image, Buffer.from('image'))
    fs.writeFileSync(audio, Buffer.from('audio'))
    const engine = new Story2VideoComposeEngine({
      outputDir: root,
      log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    })
    engine._createSegment = vi.fn(async (_image, _audio, output) => fs.writeFileSync(output, Buffer.from('segment')))
    engine._concatNarrationAudio = vi.fn(async (_audioPaths, output) => fs.writeFileSync(output, Buffer.from('narration')))
    engine._transcodeWebm = vi.fn(async (_input, output) => fs.writeFileSync(output, Buffer.from('webm')))
    engine._validateOutput = vi.fn(async () => {})

    try {
      const result = await engine.compose({
        scenes: [{ imagePath: image, audioPath: audio, duration: 1, text: '字幕' }],
      }, { format: 'webm', validateOutput: false })

      expect(result.code).toBe(0)
      expect(engine._transcodeWebm).toHaveBeenCalledTimes(1)
      expect(result.data.videoPath).toMatch(/\.webm$/)
      expect(result.data.format).toBe('webm')
    } finally {
      fs.rmSync(root, { recursive: true, force: true })
    }
  })

  it('缺少场景 duration 时不向 ffmpeg 传固定截断值，并使用探测时长', async () => {
    if (!findFfmpeg()) return
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 's2v-compose-probe-'))
    const image = path.join(root, 'image.png')
    const audio = path.join(root, 'audio.mp3')
    fs.writeFileSync(image, Buffer.from('image'))
    fs.writeFileSync(audio, Buffer.from('audio'))
    const engine = new Story2VideoComposeEngine({
      outputDir: root,
      log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    })
    const segmentCalls = []
    engine._probeMediaDuration = vi.fn()
      .mockResolvedValueOnce(1.75)
      .mockResolvedValueOnce(1.7)
      .mockResolvedValueOnce(1.7)
    engine._createSegment = vi.fn(async (_image, _audio, output, options) => {
      segmentCalls.push(options)
      fs.writeFileSync(output, Buffer.from('segment'))
    })
    engine._concatNarrationAudio = vi.fn(async (_audioPaths, output) => fs.writeFileSync(output, Buffer.from('narration')))
    engine._validateOutput = vi.fn(async () => {})

    try {
      const result = await engine.compose({
        scenes: [{ imagePath: image, audioPath: audio, text: '按真实时长' }],
      }, { transition: 'none', validateOutput: false })
      expect(result.code).toBe(0)
      expect(segmentCalls[0].duration).toBeNull()
      expect(result.data.duration).toBe(1.7)
    } finally {
      fs.rmSync(root, { recursive: true, force: true })
    }
  })

  it('真实 ffprobe 遇到损坏媒体时返回 null，不伪造时长', async () => {
    if (!findFfprobe()) return
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 's2v-compose-invalid-probe-'))
    const invalidMedia = writeFixture(root, 'invalid.mp3', 'not-a-media-file')
    const log = { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
    const engine = new Story2VideoComposeEngine({ outputDir: root, log })

    try {
      await expect(engine._probeMediaDuration(invalidMedia)).resolves.toBeNull()
      expect(log.warn).toHaveBeenCalledWith(
        'Story2VideoCompose',
        expect.stringContaining('Failed to probe media duration'),
      )
    } finally {
      fs.rmSync(root, { recursive: true, force: true })
    }
  })

  it.each([
    [0.5, 1],
    [undefined, 6],
  ])('无可探测时长时把默认场景时长 %s 收敛为 %s 秒', async (defaultSceneDuration, expectedDuration) => {
    if (!findFfmpeg()) return
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 's2v-compose-default-duration-'))
    const image = writeFixture(root, 'image.png')
    const audio = writeFixture(root, 'audio.mp3')
    const engine = new Story2VideoComposeEngine({
      outputDir: root,
      log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    })
    engine._probeMediaDuration = vi.fn().mockResolvedValue(null)
    engine._createSegment = vi.fn(async (_image, _audio, output) => fs.writeFileSync(output, 'segment'))
    engine._concatNarrationAudio = vi.fn(async (_audioPaths, output) => fs.writeFileSync(output, 'narration'))
    engine._validateOutput = vi.fn(async () => {})

    try {
      const result = await engine.compose({
        scenes: [{ imagePath: image, audioPath: audio, text: '时长回退' }],
      }, { defaultSceneDuration, transition: 'none', validateOutput: false })

      expect(result.code).toBe(0)
      expect(result.data.duration).toBe(expectedDuration)
      expect(result.data.segments[0].duration).toBe(expectedDuration)
    } finally {
      fs.rmSync(root, { recursive: true, force: true })
    }
  })

  it('61 个场景可合成，仍保留分辨率像素上限', async () => {
    if (!findFfmpeg()) return
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 's2v-compose-limits-'))
    const image = writeFixture(root, 'image.png')
    const audio = writeFixture(root, 'audio.mp3')
    const engine = new Story2VideoComposeEngine({
      outputDir: root,
      log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    })
    engine._probeMediaDuration = vi.fn(async () => 1)
    engine._createSegment = vi.fn(async (_image, _audio, output) => fs.writeFileSync(output, 'segment'))
    engine._concatSegments = vi.fn(async (_segments, output) => fs.writeFileSync(output, 'video'))
    engine._concatNarrationAudio = vi.fn(async (_audioPaths, output) => fs.writeFileSync(output, 'narration'))

    try {
      const result = await engine.compose({
        scenes: Array.from({ length: 61 }, (_, index) => ({
          index,
          imagePath: image,
          audioPath: audio,
          text: '第 ' + (index + 1) + ' 个场景',
        })),
      }, { transition: 'none', validateOutput: false })
      expect(result.code).toBe(0)
      expect(result.data.segmentCount).toBe(61)
      expect(engine._createSegment).toHaveBeenCalledTimes(61)

      const invalidResolution = await engine.compose({
        scenes: [{ imagePath: 'image.png', audioPath: 'audio.mp3' }],
      }, { resolution: '10000x10000' })
      expect(invalidResolution).toMatchObject({ code: -1 })
      expect(invalidResolution.message).toMatch(/resolution|分辨率|pixel/i)
    } finally {
      fs.rmSync(root, { recursive: true, force: true })
    }
  })

  it('合成阶段拒绝允许目录之外的本地媒体', async () => {
    if (!findFfmpeg()) return
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 's2v-compose-allowed-'))
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), 's2v-compose-outside-'))
    const image = path.join(outside, 'image.png')
    const audio = path.join(outside, 'audio.mp3')
    fs.writeFileSync(image, 'image')
    fs.writeFileSync(audio, 'audio')
    const engine = new Story2VideoComposeEngine({
      outputDir: root,
      allowedMediaRoots: [root],
      log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    })

    try {
      const result = await engine.compose({ scenes: [{ imagePath: image, audioPath: audio }] })
      expect(result).toMatchObject({ code: -1 })
      expect(result.message).toMatch(/path|路径|media|媒体/i)
    } finally {
      fs.rmSync(root, { recursive: true, force: true })
      fs.rmSync(outside, { recursive: true, force: true })
    }
  })

  it('在执行 ffmpeg 前拒绝超过 10 分钟的声明时长', async () => {
    if (!findFfmpeg()) return
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 's2v-compose-duration-'))
    const image = path.join(root, 'image.png')
    const audio = path.join(root, 'audio.mp3')
    fs.writeFileSync(image, 'image')
    fs.writeFileSync(audio, 'audio')
    const engine = new Story2VideoComposeEngine({
      outputDir: root,
      log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    })
    engine._createSegment = vi.fn()

    try {
      const result = await engine.compose({
        scenes: [{ imagePath: image, audioPath: audio, duration: 601 }],
      })
      expect(result).toMatchObject({ code: -1 })
      expect(result.message).toMatch(/10 分钟|时长|duration/i)
      expect(engine._createSegment).not.toHaveBeenCalled()
    } finally {
      fs.rmSync(root, { recursive: true, force: true })
    }
  })

  it('批量旁白单段超过 3 分钟时在合成前失败', async () => {
    if (!findFfmpeg()) return
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 's2v-compose-segment-duration-'))
    const scenes = [0, 1].map(index => {
      const imagePath = path.join(root, 'image-' + index + '.png')
      const audioPath = path.join(root, 'audio-' + index + '.mp3')
      fs.writeFileSync(imagePath, 'image')
      fs.writeFileSync(audioPath, 'audio')
      return { imagePath, audioPath }
    })
    const engine = new Story2VideoComposeEngine({
      outputDir: root,
      log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    })
    engine._probeMediaDuration = vi.fn().mockResolvedValueOnce(181).mockResolvedValueOnce(2)
    engine._createSegment = vi.fn()

    try {
      const result = await engine.compose({ scenes })
      expect(result).toMatchObject({ code: -1 })
      expect(result.message).toMatch(/单段|3 分钟|时长/)
      expect(engine._createSegment).not.toHaveBeenCalled()
    } finally {
      fs.rmSync(root, { recursive: true, force: true })
    }
  })
})

describe('Story2Video 六档字幕字号', () => {
  it.each([
    ['size1', 16], ['size2', 20], ['size3', 24],
    ['size4', 28], ['size5', 32], ['size6', 40],
  ])('将 %s 传递为独立的 FFmpeg fontsize=%i', (size, fontSize) => {
    const filter = buildSubtitleFilter('字幕可见性验证', { size })

    expect(filter).toContain(':fontsize=' + fontSize + ':')
  })
})
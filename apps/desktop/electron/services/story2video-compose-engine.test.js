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
  resolveCjkFont,
  escapeFontFilePath,
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
    // transitionName 随计划返回：_xfadeMerge 依赖 plan.transitionName 构造 xfade 滤镜
    expect(plan.transitionName).toBe('fade')
    expect(buildTransitionPlan([0.2, 0.35], 1.2, 'slideleft').transitionName).toBe('slideleft')

    const fallback = buildTransitionPlan([0.01, 0.4], 0.4)
    expect(fallback.enabled).toBe(false)
    expect(fallback.transitionName).toBe('fade')
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
    // 回归：zoompan 必须使用 d=总帧数（时长×帧率），d=1 + -loop 1 静态图不会产生动画。
    // 第 5 参为“有效时长（秒）”，总帧数在函数内按 duration*fps 计算。
    expect(buildImageEffectFilter('zoom-in', 1280, 720, 30)).toContain(':d=90:')
    expect(buildImageEffectFilter('zoom-in', 1280, 720, 30, 6)).toContain(':d=180:')
    expect(buildImageEffectFilter('zoom-in', 1280, 720, 30)).not.toContain(':d=1:')
    expect(buildSubtitleFilter('字幕', { size: 'lg', style: 'style2' })).toContain('box=1')
    // 回归：中文 drawtext 必须显式指定 CJK fontfile，否则 Windows 静态 ffmpeg 渲染成豆腐块。
    // 跨平台契约：能解析到 CJK 字体则必须注入 fontfile；否则（Linux 无 Windows 字体）不注入但仍合法。
    const resolvedFont = resolveCjkFont()
    const subtitleFilter = buildSubtitleFilter('中文字幕测试', { size: 'md' })
    if (resolvedFont) {
      expect(subtitleFilter).toContain("fontfile='" + escapeFontFilePath(resolvedFont) + "'")
    } else {
      expect(subtitleFilter).not.toContain('fontfile=')
    }
    expect(escapeFontFilePath('C:\\Windows\\Fonts\\msyh.ttc')).toBe('C\\:/Windows/Fonts/msyh.ttc')
    if (process.platform === 'win32') {
      expect(resolveCjkFont()).toBeTruthy()
    }
    expect(buildWatermarkFilter({
      watermark: { enabled: true, text: '品牌', position: 'top-left', opacity: 0.5 },
    })).toContain('x=20:y=40')
    expect(parseResolution('1920x1080')).toEqual({ width: 1920, height: 1080 })
    expect(parseResolution('../bad')).toEqual({ width: 1280, height: 720 })
    expect(buildScaleFilter(1920, 1080)).toContain('scale=1920:1080')
    expect(buildScaleFilter(1920, 1080)).toContain('pad=1920:1080')
  })

  it('有效时长已知时把动效进度归一化到场景时长', () => {
    // 6s @30fps → T=180：动效在场景结束帧恰好完成，不再受固定帧增量速度限制
    expect(buildImageEffectFilter('zoom-in', 1280, 720, 30, 6)).toContain('1+0.25*min(1,on/180)')
    expect(buildImageEffectFilter('zoom-out', 1280, 720, 30, 6)).toContain('if(eq(on,1),1.25,1.25-0.25*min(1,on/180))')
    expect(buildImageEffectFilter('pan-left', 1280, 720, 30, 6)).toContain('(iw-iw/zoom)*min(1,on/180)')
    expect(buildImageEffectFilter('pan-right', 1280, 720, 30, 6)).toContain('(iw-iw/zoom)*(1-min(1,on/180))')
    expect(buildImageEffectFilter('pan-up', 1280, 720, 30, 6)).toContain('(ih-ih/zoom)*min(1,on/180)')
    expect(buildImageEffectFilter('pan-down', 1280, 720, 30, 6)).toContain('(ih-ih/zoom)*(1-min(1,on/180))')
    expect(buildImageEffectFilter('zoom-pan', 1280, 720, 30, 6)).toContain('1+0.15*min(1,on/180)')
    // 非 30fps：fps=24、4s → T=96
    expect(buildImageEffectFilter('zoom-in', 1280, 720, 24, 4)).toContain('min(1,on/96)')
  })

  it('时长未知或无效时保持固定帧增量公式，向后兼容', () => {
    expect(buildImageEffectFilter('zoom-in', 1280, 720, 30)).toContain('min(zoom+0.0015,1.25)')
    expect(buildImageEffectFilter('zoom-out', 1280, 720, 30)).toContain('max(zoom-0.0015,1)')
    expect(buildImageEffectFilter('pan-left', 1280, 720, 30)).toContain('on/120')
    expect(buildImageEffectFilter('zoom-pan', 1280, 720, 30)).toContain('on/180')
    for (const bad of [0, -1, Number.NaN, null, undefined, 'x']) {
      expect(buildImageEffectFilter('zoom-in', 1280, 720, 30, bad)).toContain('min(zoom+0.0015,1.25)')
    }
    // 极端有限值：duration*fps 溢出为 Infinity 时回退 legacy，不得出现 on/Infinity
    const overflow = buildImageEffectFilter('zoom-in', 1280, 720, 30, 1e308)
    expect(overflow).toContain('min(zoom+0.0015,1.25)')
    expect(overflow).not.toContain('Infinity')
  })

  it('极短时长使用最小帧数下限，fps 极值按场景时长换算', () => {
    // 0.05s @30fps → round(1.5)=2，下限 Math.max(2) 防止 on/0、on/1
    expect(buildImageEffectFilter('zoom-in', 1280, 720, 30, 0.05)).toContain('min(1,on/2)')
    // fps 极值：1fps×6s=6、120fps×6s=720
    expect(buildImageEffectFilter('zoom-in', 1280, 720, 1, 6)).toContain('min(1,on/6)')
    expect(buildImageEffectFilter('zoom-in', 1280, 720, 120, 6)).toContain('min(1,on/720)')
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

  it('字幕默认位于距底部 20% 处，且可经 bottomMarginRatio 覆盖（0.05-0.5）', () => {
    expect(buildSubtitleFilter('字幕', { size: 'lg' })).toContain(':y=h*0.800-th')
    expect(buildSubtitleFilter('字幕', { size: 'lg' })).not.toContain('y=h-th-40')
    expect(buildSubtitleFilter('字幕', { size: 'lg', bottomMarginRatio: 0.1 })).toContain(':y=h*0.900-th')
    // clamp：超出 0.05-0.5 范围时回退到边界
    expect(buildSubtitleFilter('字幕', { size: 'lg', bottomMarginRatio: 0.6 })).toContain(':y=h*0.500-th')
    expect(buildSubtitleFilter('字幕', { size: 'lg', bottomMarginRatio: 0.01 })).toContain(':y=h*0.950-th')
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
  }, 60000)

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
      // follow-audio 参数级回归（T5）：默认模式不传 padTo、sceneDurationMode=follow-audio
      expect(segmentCalls[0].padTo).toBeNull()
      expect(segmentCalls[0].sceneDurationMode).toBe('follow-audio')
      expect(result.data.duration).toBe(1.7)
    } finally {
      fs.rmSync(root, { recursive: true, force: true })
    }
  }, 60000)

  it('min-duration 模式：3s 旁白补齐到 minSceneDuration=6，effectDuration/字幕/片段一致，旁白导出不补齐', async () => {
    if (!findFfmpeg()) return
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 's2v-compose-min-duration-'))
    const image = writeFixture(root, 'image.png')
    const audio = writeFixture(root, 'audio.mp3')
    const engine = new Story2VideoComposeEngine({
      outputDir: root,
      log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    })
    const segmentCalls = []
    // 音频探测 3s → 补齐后片段探测 6s
    engine._probeMediaDuration = vi.fn()
      .mockResolvedValueOnce(3)
      .mockResolvedValueOnce(6)
    engine._createSegment = vi.fn(async (_image, _audio, output, options) => {
      segmentCalls.push(options)
      fs.writeFileSync(output, Buffer.from('segment'))
    })
    engine._concatNarrationAudio = vi.fn(async (_audioPaths, output) => fs.writeFileSync(output, Buffer.from('narration')))
    engine._validateOutput = vi.fn(async () => {})

    try {
      const result = await engine.compose({
        scenes: [{ imagePath: image, audioPath: audio, text: '短旁白' }],
      }, { sceneDurationMode: 'min-duration', minSceneDuration: 6, transition: 'none', validateOutput: false })

      expect(result.code).toBe(0)
      expect(segmentCalls[0]).toMatchObject({ sceneDurationMode: 'min-duration', effectDuration: 6, padTo: 6 })
      // 字幕时间轴按补齐后的 effectiveDuration=6 生成，末页结束于 6s
      expect(segmentCalls[0].subtitleTimeline.at(-1).endTime).toBeCloseTo(6, 1)
      // 片段与成片时长 = 补齐后 6s
      expect(result.data.duration).toBe(6)
      expect(result.data.segments[0].duration).toBe(6)
      // 完整旁白导出仍用原始音频，不补齐。
      // CI 下 os.tmpdir 可能返回 8.3 短路径（RUNNER~1），引擎经 realpathSync.native 归一化为长路径，
      // 按 AGENTS.md「Windows 路径身份断言」合同：两边 realpath 后比较，不做原始字符串比较。
      const narrationCall = engine._concatNarrationAudio.mock.calls[0]
      expect(narrationCall[0].length).toBe(1)
      expect(fs.realpathSync.native(narrationCall[0][0])).toBe(fs.realpathSync.native(audio))
      expect(narrationCall[1]).toEqual(expect.any(String))
      expect(narrationCall[2]).toEqual(expect.any(String))
      expect(narrationCall[3]).toBe(1)
    } finally {
      fs.rmSync(root, { recursive: true, force: true })
    }
  })

  it('min-duration 模式：10s 长旁白不被截断（effectDuration=max(音频, minSceneDuration)）', async () => {
    if (!findFfmpeg()) return
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 's2v-compose-min-duration-long-'))
    const image = writeFixture(root, 'image.png')
    const audio = writeFixture(root, 'audio.mp3')
    const engine = new Story2VideoComposeEngine({
      outputDir: root,
      log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    })
    const segmentCalls = []
    engine._probeMediaDuration = vi.fn().mockResolvedValue(10)
    engine._createSegment = vi.fn(async (_image, _audio, output, options) => {
      segmentCalls.push(options)
      fs.writeFileSync(output, Buffer.from('segment'))
    })
    engine._concatNarrationAudio = vi.fn(async (_audioPaths, output) => fs.writeFileSync(output, Buffer.from('narration')))
    engine._validateOutput = vi.fn(async () => {})

    try {
      const result = await engine.compose({
        scenes: [{ imagePath: image, audioPath: audio, text: '长旁白' }],
      }, { sceneDurationMode: 'min-duration', minSceneDuration: 6, transition: 'none', validateOutput: false })
      expect(result.code).toBe(0)
      expect(segmentCalls[0].effectDuration).toBe(10)
      // 10s > minSceneDuration → 无需补齐，padTo=null 保持 -shortest 跟随旁白
      expect(segmentCalls[0].padTo).toBeNull()
      expect(result.data.duration).toBe(10)
    } finally {
      fs.rmSync(root, { recursive: true, force: true })
    }
  })

  it('真实 ffmpeg：min-duration 补齐段实际时长 = max(音频, minSceneDuration)，follow-audio 不补齐', async () => {
    if (!findFfmpeg()) return
    const { promisify } = require('util')
    const { execFile } = require('child_process')
    const execFileAsync = promisify(execFile)
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 's2v-compose-real-pad-'))
    // min-duration 无 -shortest 时靠 -t 截断，必须使用真实可解码图片（假字节会让 -loop 1 无限刷解码错误）
    const image = path.join(root, 'image.png')
    await execFileAsync(findFfmpeg(), ['-y', '-f', 'lavfi', '-i', 'color=c=black:s=320x180', '-frames:v', '1', image], { maxBuffer: 10 * 1024 * 1024 })
    const audio = path.join(root, 'silence2s.m4a')
    await execFileAsync(findFfmpeg(), ['-y', '-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=stereo', '-t', '2', '-c:a', 'aac', audio], { maxBuffer: 10 * 1024 * 1024 })
    const engine = new Story2VideoComposeEngine({ outputDir: root, log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } })
    const baseOpts = {
      width: 320, height: 180, fps: 24, imageEffect: 'none', transition: 'none',
      subtitleText: '', subtitleStyle: undefined, watermark: false, watermarkText: '', watermarkConfig: undefined,
      voiceVolume: 1, duration: null,
    }

    const probeStreamDurations = async (filePath) => {
      const { stdout } = await execFileAsync(findFfprobe(), [
        '-v', 'error', '-show_entries', 'stream=codec_type,duration', '-of', 'json', filePath,
      ], { maxBuffer: 1024 * 1024 })
      const parsed = JSON.parse(stdout)
      return parsed.streams.map(s => ({ type: s.codec_type, duration: Number(s.duration) }))
    }

    try {
      // min-duration：-t 6 + apad + 无 -shortest → 视频/音频双轨 ≈6s（±0.3，AAC 帧对齐容差）
      const padded = path.join(root, 'padded.mp4')
      await engine._createSegment(image, audio, padded, { ...baseOpts, effectDuration: 6, sceneDurationMode: 'min-duration', padTo: 6 })
      const paddedDur = await engine._probeMediaDuration(padded)
      expect(paddedDur).not.toBeNull()
      expect(paddedDur).toBeGreaterThanOrEqual(5.7)
      expect(paddedDur).toBeLessThanOrEqual(6.3)
      const paddedStreams = await probeStreamDurations(padded)
      const paddedAudio = paddedStreams.find(s => s.type === 'audio')
      expect(paddedAudio).toBeTruthy()
      // 音频轨也被补齐到 ≈6s，证明去掉 -shortest 后没有把静音尾部裁掉（W3/T7）
      expect(paddedAudio.duration).toBeGreaterThanOrEqual(5.7)
      expect(paddedAudio.duration).toBeLessThanOrEqual(6.3)

      // voiceVolume≠1 + padTo：-af 链为 volume=X,apad（先缩放后补静音），真实渲染 ≈6s（W3 回归）
      const volumePadded = path.join(root, 'volume-padded.mp4')
      await engine._createSegment(image, audio, volumePadded, { ...baseOpts, effectDuration: 6, sceneDurationMode: 'min-duration', padTo: 6, voiceVolume: 0.5 })
      const volumeDur = await engine._probeMediaDuration(volumePadded)
      expect(volumeDur).not.toBeNull()
      expect(volumeDur).toBeGreaterThanOrEqual(5.7)
      expect(volumeDur).toBeLessThanOrEqual(6.3)

      // follow-audio：-shortest 跟随 2s 音频，不补齐（padTo=null）
      const follow = path.join(root, 'follow.mp4')
      await engine._createSegment(image, audio, follow, { ...baseOpts, effectDuration: 6, sceneDurationMode: 'follow-audio', padTo: null })
      const followDur = await engine._probeMediaDuration(follow)
      expect(followDur).not.toBeNull()
      expect(followDur).toBeLessThanOrEqual(3)
      const followStreams = await probeStreamDurations(follow)
      const followAudio = followStreams.find(s => s.type === 'audio')
      expect(followAudio).toBeTruthy()
      expect(followAudio.duration).toBeLessThanOrEqual(3)
    } finally {
      fs.rmSync(root, { recursive: true, force: true })
    }
  }, 60000)

  it('min-duration 模式：音频探测失败时不启用静音补齐（C1，不 -t/apad 硬截断未知长度旁白）', async () => {
    if (!findFfmpeg()) return
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 's2v-compose-min-duration-probe-fail-'))
    const image = writeFixture(root, 'image.png')
    const audio = writeFixture(root, 'audio.mp3')
    const engine = new Story2VideoComposeEngine({
      outputDir: root,
      log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    })
    const segmentCalls = []
    engine._probeMediaDuration = vi.fn().mockResolvedValue(null)
    engine._createSegment = vi.fn(async (_image, _audio, output, options) => {
      segmentCalls.push(options)
      fs.writeFileSync(output, Buffer.from('segment'))
    })
    engine._concatNarrationAudio = vi.fn(async (_audioPaths, output) => fs.writeFileSync(output, Buffer.from('narration')))
    engine._validateOutput = vi.fn(async () => {})

    try {
      const result = await engine.compose({
        scenes: [{ imagePath: image, audioPath: audio, text: '探测失败' }],
      }, { sceneDurationMode: 'min-duration', minSceneDuration: 6, transition: 'none', validateOutput: false })

      expect(result.code).toBe(0)
      expect(segmentCalls[0].sceneDurationMode).toBe('min-duration')
      // 探测失败 → padTo=null，_createSegment 走 follow-audio -shortest 路径
      expect(segmentCalls[0].padTo).toBeNull()
      // 有效时长仍按 defaultSceneDuration 兜底（动效/字幕归一化用）
      expect(segmentCalls[0].effectDuration).toBe(6)
    } finally {
      fs.rmSync(root, { recursive: true, force: true })
    }
  })

  it('min-duration 模式：原始音频和 <600s 但补齐后超限时在预检拒绝，不进入渲染（W1）', async () => {
    if (!findFfmpeg()) return
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 's2v-compose-min-duration-limit-'))
    const image = writeFixture(root, 'image.png')
    const audio = writeFixture(root, 'audio.mp3')
    const engine = new Story2VideoComposeEngine({
      outputDir: root,
      log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    })
    // 11 段 × 50s = 550s < 600（通过音频和校验）；minSceneDuration=60 → 11 × max(50,60) = 660 > 600 → 预检拒绝
    const scenes = Array.from({ length: 11 }, () => ({ imagePath: image, audioPath: audio, text: 'x' }))
    engine._probeMediaDuration = vi.fn().mockResolvedValue(50)
    engine._createSegment = vi.fn(async (_image, _audio, output) => fs.writeFileSync(output, Buffer.from('segment')))
    engine._concatNarrationAudio = vi.fn(async (_audioPaths, output) => fs.writeFileSync(output, Buffer.from('narration')))
    engine._validateOutput = vi.fn(async () => {})

    try {
      const result = await engine.compose({ scenes }, {
        sceneDurationMode: 'min-duration', minSceneDuration: 60, transition: 'none', validateOutput: false,
      })
      expect(result.code).toBe(-1)
      expect(result.message).toContain('Requested video duration exceeds the allowed limit')
      expect(engine._createSegment).not.toHaveBeenCalled()
    } finally {
      fs.rmSync(root, { recursive: true, force: true })
    }
  })

  it.each([
    ['N<default 且可探测（audio=3,default=10,min=4 → 4s 且补齐）', 3, 10, 4, 4, true],
    ['N<default 且探测失败（→ default=10，不补齐）', null, 10, 4, 10, false],
    ['N>default 且可探测（audio=3,default=2,min=4 → 4s 且补齐）', 3, 2, 4, 4, true],
    ['N>default 且探测失败（→ max(default,min)=4，不补齐）', null, 2, 4, 4, false],
    ['等值边界：audio==min（6s 音频 min=6 → effect=6 但不补齐，严格 > 守卫）', 6, 6, 6, 6, false],
  ])('min-duration 边界矩阵（I3）：%s', async (_label, probed, defaultSceneDuration, minSceneDuration, expectedEffect, expectedPad) => {
    if (!findFfmpeg()) return
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 's2v-compose-min-duration-matrix-'))
    const image = writeFixture(root, 'image.png')
    const audio = writeFixture(root, 'audio.mp3')
    const engine = new Story2VideoComposeEngine({
      outputDir: root,
      log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    })
    const segmentCalls = []
    engine._probeMediaDuration = vi.fn().mockResolvedValue(probed)
    engine._createSegment = vi.fn(async (_image, _audio, output, options) => {
      segmentCalls.push(options)
      fs.writeFileSync(output, Buffer.from('segment'))
    })
    engine._concatNarrationAudio = vi.fn(async (_audioPaths, output) => fs.writeFileSync(output, Buffer.from('narration')))
    engine._validateOutput = vi.fn(async () => {})

    try {
      const result = await engine.compose({
        scenes: [{ imagePath: image, audioPath: audio, text: '边界' }],
      }, {
        sceneDurationMode: 'min-duration', minSceneDuration, defaultSceneDuration,
        transition: 'none', validateOutput: false,
      })
      expect(result.code).toBe(0)
      expect(segmentCalls[0].effectDuration).toBe(expectedEffect)
      if (expectedPad) {
        expect(segmentCalls[0].padTo).toBe(expectedEffect)
      } else {
        expect(segmentCalls[0].padTo).toBeNull()
      }
    } finally {
      fs.rmSync(root, { recursive: true, force: true })
    }
  })

  it('真实 ffmpeg：2 个 min-duration 补齐段 xfade 转场 + BGM 混音，成片 ≈ 6+6-0.4=11.6s（W5）', async () => {
    if (!findFfmpeg()) return
    const { promisify } = require('util')
    const { execFile } = require('child_process')
    const execFileAsync = promisify(execFile)
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 's2v-compose-real-xfade-pad-'))
    try {
      const image1 = path.join(root, 'image1.png')
      const image2 = path.join(root, 'image2.png')
      const audio1 = path.join(root, 'audio1.m4a')
      const audio2 = path.join(root, 'audio2.m4a')
      const bgm = path.join(root, 'bgm.m4a')
      await execFileAsync(findFfmpeg(), ['-y', '-f', 'lavfi', '-i', 'color=c=black:s=320x180', '-frames:v', '1', image1], { maxBuffer: 10 * 1024 * 1024 })
      await execFileAsync(findFfmpeg(), ['-y', '-f', 'lavfi', '-i', 'color=c=white:s=320x180', '-frames:v', '1', image2], { maxBuffer: 10 * 1024 * 1024 })
      const genAudio = (p) => execFileAsync(findFfmpeg(), ['-y', '-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=stereo', '-t', '2', '-c:a', 'aac', p], { maxBuffer: 10 * 1024 * 1024 })
      await genAudio(audio1)
      await genAudio(audio2)
      await genAudio(bgm)
      const engine = new Story2VideoComposeEngine({ outputDir: root, log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } })
      const result = await engine.compose({
        scenes: [
          { imagePath: image1, audioPath: audio1, text: '场景一' },
          { imagePath: image2, audioPath: audio2, text: '场景二' },
        ],
      }, {
        sceneDurationMode: 'min-duration', minSceneDuration: 6,
        transition: 'fade', transitionDuration: 0.4,
        subtitleEnabled: false, bgmPath: bgm,
        resolution: '320x180', fps: 24,
        validateOutput: false,
      })
      expect(result.code).toBe(0)
      expect(result.data.segmentCount).toBe(2)
      expect(result.data.bgmApplied).toBe(true)
      expect(result.data.duration).toBeGreaterThanOrEqual(11.3)
      expect(result.data.duration).toBeLessThanOrEqual(11.9)
    } finally {
      fs.rmSync(root, { recursive: true, force: true })
    }
  }, 90000)

  it('renderSegment：min-duration 模式 3s 音频补齐到 6s，返回补齐段', async () => {
    if (!findFfmpeg()) return
    const { promisify } = require('util')
    const { execFile } = require('child_process')
    const execFileAsync = promisify(execFile)
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 's2v-render-segment-min-duration-'))
    const image = path.join(root, 'image.png')
    const audio = path.join(root, 'audio.m4a')
    try {
      await execFileAsync(findFfmpeg(), ['-y', '-f', 'lavfi', '-i', 'color=c=black:s=320x180', '-frames:v', '1', image], { maxBuffer: 10 * 1024 * 1024 })
      await execFileAsync(findFfmpeg(), ['-y', '-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=stereo', '-t', '2', '-c:a', 'aac', audio], { maxBuffer: 10 * 1024 * 1024 })
      const engine = new Story2VideoComposeEngine({ outputDir: root, log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } })
      // 场景音频探测 2s → 渲染后片段探测 6s
      engine._probeMediaDuration = vi.fn()
        .mockResolvedValueOnce(2)
        .mockResolvedValueOnce(6)
      const result = await engine.renderSegment(
        { imagePath: image, audioPath: audio, text: '短旁白', duration: null },
        { sceneDurationMode: 'min-duration', minSceneDuration: 6, defaultSceneDuration: 6, resolution: '320x180', fps: 24, subtitleEnabled: false, transition: 'none' },
        path.join(root, 'out.mp4'),
      )
      expect(result.code).toBe(0)
      expect(result.data.duration).toBe(6)
    } finally {
      fs.rmSync(root, { recursive: true, force: true })
    }
  }, 60000)

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
      // 音频探测失败时动效归一化同样回退到 defaultSceneDuration
      expect(engine._createSegment.mock.calls[0][3]).toMatchObject({ effectDuration: expectedDuration })
    } finally {
      fs.rmSync(root, { recursive: true, force: true })
    }
  }, 60000)

  it('renderSegment 把有效时长传给动效归一化，音频优先、探测失败回退默认', async () => {
    if (!findFfmpeg()) return
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 's2v-render-segment-effect-'))
    const image = writeFixture(root, 'image.png')
    const audio = writeFixture(root, 'audio.mp3')
    const engine = new Story2VideoComposeEngine({
      outputDir: root,
      log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    })
    engine._probeMediaDuration = vi.fn().mockResolvedValue(null)
    engine._createSegment = vi.fn(async () => fs.writeFileSync(path.join(root, 'out.mp4'), 'seg'))
    try {
      // 音频探测失败 + 无上报时长 → effectDuration 回退 defaultSceneDuration=6
      const out = path.join(root, 'out.mp4')
      const result = await engine.renderSegment(
        { imagePath: image, audioPath: audio, text: '测试', duration: null },
        { defaultSceneDuration: 6, resolution: '320x180', fps: 24, subtitleEnabled: false, transition: 'none' },
        out,
      )
      expect(result.code).toBe(0)
      expect(engine._createSegment.mock.calls[0][3]).toMatchObject({ effectDuration: 6 })

      // 音频优先：ffprobe 4.2s 覆盖上报 1s
      engine._probeMediaDuration = vi.fn().mockResolvedValue(4.2)
      const result2 = await engine.renderSegment(
        { imagePath: image, audioPath: audio, text: '测试', duration: 1 },
        { defaultSceneDuration: 6, resolution: '320x180', fps: 24, subtitleEnabled: false, transition: 'none' },
        path.join(root, 'out2.mp4'),
      )
      expect(result2.code).toBe(0)
      expect(engine._createSegment.mock.calls[1][3]).toMatchObject({ effectDuration: 4.2 })

      // 极端有限 duration 收敛到 0.1..3600，effectDuration 保持有限值（W1 回归）
      engine._probeMediaDuration = vi.fn().mockResolvedValue(null)
      const result3 = await engine.renderSegment(
        { imagePath: image, audioPath: audio, text: '极端值', duration: 1e308 },
        { defaultSceneDuration: 6, resolution: '320x180', fps: 24, subtitleEnabled: false, transition: 'none' },
        path.join(root, 'out3.mp4'),
      )
      expect(result3.code).toBe(0)
      expect(engine._createSegment.mock.calls[2][3]).toMatchObject({ duration: 3600, effectDuration: 3600 })
    } finally {
      fs.rmSync(root, { recursive: true, force: true })
    }
  }, 60000)

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


describe('_concatSegments 分块合成（25+ 场景防单命令输入过多）', () => {
  let tmp
  let engine

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'compose-chunk-test-'))
    engine = new Story2VideoComposeEngine({ outputDir: tmp, log: { info() {}, warn() {}, error() {} } })
  })

  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true })
  })

  function makeSegments (count) {
    const segments = []
    for (let i = 0; i < count; i++) {
      const filePath = path.join(tmp, 'seg_' + String(i).padStart(4, '0') + '.mp4')
      fs.writeFileSync(filePath, 'seg' + i)
      segments.push(filePath)
    }
    return segments
  }

  it('27 段转场合成：分块 ≤8 输入，递归合并后输出文件存在', async () => {
    const segments = makeSegments(27)
    const durations = segments.map((_, i) => 6 + (i % 3))
    const output = path.join(tmp, 'out.mp4')
    const xfadeMerge = vi.fn(async (_segs, _plan, outputPath) => { fs.writeFileSync(outputPath, 'video') })
    const plainConcat = vi.fn(async (_segs, outputPath) => { fs.writeFileSync(outputPath, 'video') })
    engine._xfadeMerge = xfadeMerge
    engine._plainConcat = plainConcat

    await engine._concatSegments(segments, output, tmp, { transition: 'fade', transitionDuration: 0.4, segmentDurations: durations })

    expect(fs.existsSync(output)).toBe(true)
    // 27 段 → 4 块（8/8/8/3）+ 4 个中间文件再合并 1 次 = 5 次 xfadeMerge
    expect(xfadeMerge.mock.calls.length).toBe(5)
    for (const call of xfadeMerge.mock.calls) {
      expect(call[0].length).toBeLessThanOrEqual(8)
      // 每个块计划都携带 transitionName，避免 xfade=transition=undefined
      expect(call[1].transitionName).toBe('fade')
    }
    // 每块调用输入数：8,8,8,3,4（最后是 4 个中间文件合并）
    expect(xfadeMerge.mock.calls.map(c => c[0].length)).toEqual([8, 8, 8, 3, 4])
    expect(plainConcat).not.toHaveBeenCalled()
    // 4 个 level0 块 + 1 个 level1 合并中间文件
    const chunks = fs.readdirSync(tmp).filter(n => n.startsWith('merge_l'))
    expect(chunks.length).toBe(5)
  })

  it('≤8 段保持单命令合成，不产生中间块', async () => {
    const segments = makeSegments(6)
    const durations = [6, 6, 6, 6, 6, 6]
    const output = path.join(tmp, 'out.mp4')
    const xfadeMerge = vi.fn(async (_segs, _plan, outputPath) => { fs.writeFileSync(outputPath, 'video') })
    engine._xfadeMerge = xfadeMerge

    await engine._concatSegments(segments, output, tmp, { transition: 'fade', transitionDuration: 0.4, segmentDurations: durations })

    expect(xfadeMerge.mock.calls.length).toBe(1)
    expect(xfadeMerge.mock.calls[0][0].length).toBe(6)
    expect(fs.readdirSync(tmp).filter(n => n.startsWith('merge_l')).length).toBe(0)
  })

  it('直接合并路径（≤8 段）的计划携带 transitionName=fade，不生成 transition=undefined', async () => {
    const segments = makeSegments(6)
    const durations = [6, 6, 6, 6, 6, 6]
    const output = path.join(tmp, 'out.mp4')
    const xfadeMerge = vi.fn(async (_segs, plan, outputPath) => { fs.writeFileSync(outputPath, 'video') })
    engine._xfadeMerge = xfadeMerge

    await engine._concatSegments(segments, output, tmp, { transition: 'fade', transitionDuration: 0.4, segmentDurations: durations })

    expect(xfadeMerge).toHaveBeenCalledTimes(1)
    expect(xfadeMerge.mock.calls[0][1]).toMatchObject({ enabled: true, transitionName: 'fade' })
  })

  it('时长未知时回退无损 concat（不构建转场图）', async () => {
    const segments = makeSegments(3)
    const output = path.join(tmp, 'out.mp4')
    const xfadeMerge = vi.fn(async (_segs, _plan, outputPath) => { fs.writeFileSync(outputPath, 'video') })
    const plainConcat = vi.fn(async (_segs, outputPath) => { fs.writeFileSync(outputPath, 'video') })
    engine._xfadeMerge = xfadeMerge
    engine._plainConcat = plainConcat

    await engine._concatSegments(segments, output, tmp, { transition: 'fade' })

    expect(plainConcat).toHaveBeenCalledTimes(1)
    expect(xfadeMerge).not.toHaveBeenCalled()
  })
})

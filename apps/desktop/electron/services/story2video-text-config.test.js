// @vitest-environment node
const {
  DEFAULT_STORY2VIDEO_TEXT_CONFIG,
  normalizeStory2VideoTextParams,
  MAX_STORY2VIDEO_TEXT_UNICODE_CHARS,
  countStory2VideoTextCharacters,
} = require('./story2video-text-config')

describe('Story2Video text 参数合同', () => {
  it('使用独立 Story2Video 的 text 默认值并映射到六阶段参数', () => {
    const result = normalizeStory2VideoTextParams({ text: '长安城的灯火。' })

    expect(result).toMatchObject({
      mode: 'text',
      inputMode: 'text',
      text: '长安城的灯火。',
      size: '720x1280',
      resolution: '720x1280',
      defaultSceneDuration: 6,
      imageEffect: 'zoom-in',
      transition: 'fade',
      subtitleEnabled: false,
      bgmPath: null,
      bgmVolume: 0.5,
    })
    expect(result.images).toEqual([])
    expect(result.audio).toEqual([])
    expect(result.video).toBeNull()
    expect(result.stageOptions).toEqual(expect.objectContaining({
      split: expect.objectContaining({
        language: 'auto',
        mode: 'balanced',
        max_sentence_length: 200,
        target_duration: 6,
        speech_rate: 1,
        min_words: 10,
        max_words: 50,
      }),
      optimize: expect.objectContaining({
        style: 'realistic',
        creative_level: 5,
      }),
      generate_assets: expect.objectContaining({
        imageStyle: 'cinematic',
        voiceSpeed: 1,
        voicePitch: 0,
        voiceEmotion: 'default',
      }),
      compose: expect.objectContaining({
        resolution: '720x1280',
        defaultSceneDuration: 6,
        sceneDurationMode: 'follow-audio',
        minSceneDuration: 6,
        imageEffect: 'zoom-in',
        subtitleEnabled: false,
        bgmVolume: 0.5,
      }),
      publish: expect.objectContaining({ publishEnabled: false, platforms: [] }),
    }))
    expect(result.story2videoTextConfig).toEqual(expect.objectContaining({
      version: 1,
      mode: 'text',
      prompt: '长安城的灯火。',
      size: '720x1280',
      split: expect.objectContaining({ targetCharsPerScene: 20 }),
      sceneDurationMode: 'follow-audio',
      minSceneDuration: 6,
    }))
    expect(DEFAULT_STORY2VIDEO_TEXT_CONFIG.mode).toBe('text')
    expect(DEFAULT_STORY2VIDEO_TEXT_CONFIG.split.language).toBe('auto')
    expect(result).not.toHaveProperty('seconds')
    expect(result).not.toHaveProperty('generateBase')
    expect(result).not.toHaveProperty('generateMerged')
    expect(result).not.toHaveProperty('perImageDuration')
    expect(result.story2videoTextConfig).not.toHaveProperty('seconds')
    expect(result.story2videoTextConfig).not.toHaveProperty('versions')
    expect(result.story2videoTextConfig).not.toHaveProperty('perImageDuration')
    expect(result.stageOptions.optimize).toMatchObject({
      platform: 'generic',
      max_length: 300,
      num_candidates: 1,
      auto_detect_style: true,
    })
  })

  it('参数治理（7.1.19）：缺省 voice.pitch / optimize.creativeLevel 时以契约默认 0 / 5 兜底', () => {
    // 前端自 7.1.19 起不提交 voicePitch/creativeLevel（系统管理参数），
    // normalizer 必须用契约默认兜底，保证行为等价。
    const result = normalizeStory2VideoTextParams({
      text: '参数治理缺省兜底。',
      story2videoTextConfig: {
        version: 1,
        mode: 'text',
        prompt: '参数治理缺省兜底。',
        voice: { provider: 'edge-tts', id: 'v1' },
        optimize: { style: 'realistic' },
      },
    })
    expect(result.story2videoTextConfig.voice.pitch).toBe(0)
    expect(result.story2videoTextConfig.optimize.creativeLevel).toBe(5)
    expect(result.stageOptions.generate_assets.voicePitch).toBe(0)
    expect(result.stageOptions.optimize.creative_level).toBe(5)
  })

  it('接受全自动编排策略并透传 background 后台模式，同时保留历史分句语言快照', () => {
    const automatic = normalizeStory2VideoTextParams({
      text: '自动编排使用语言识别。',
      autoAdvance: true,
      background: true,
      checkpointPolicy: 'none',
    })
    const historical = normalizeStory2VideoTextParams({
      story2videoTextConfig: {
        version: 1,
        mode: 'text',
        prompt: '保留历史语言。',
        split: { language: 'zh' },
      },
    })

    expect(automatic).toMatchObject({
      autoAdvance: true,
      background: true,
      checkpointPolicy: 'none',
      language: 'auto',
      stageOptions: { split: { language: 'auto' } },
    })
    expect(historical).toMatchObject({
      language: 'zh',
      story2videoTextConfig: { split: { language: 'zh' } },
      stageOptions: { split: { language: 'zh' } },
    })
  })

  it('将图片风格与提示词风格隔离，并把兼容值映射为 Story2Video 合法值', () => {
    const result = normalizeStory2VideoTextParams({
      text: '未来城市',
      imageStyle: 'cinematic',
      promptStyle: '3d-render',
    })

    expect(result.imageStyle).toBe('cinematic')
    expect(result.promptStyle).toBe('3d_render')
    expect(result.stageOptions.optimize).toMatchObject({
      style: '3d_render',
    })
  })

  it('接受 prompt-engine 专属参数并映射到 optimize 配置（平台/长度/候选数/自动检测/上下文）', () => {
    const result = normalizeStory2VideoTextParams({
      text: '未来城市',
      story2videoTextConfig: {
        optimize: { platform: 'tongyi', maxLength: 400, numCandidates: 3, autoDetectStyle: false, context: { synopsis: '角色一致性' } },
      },
    })

    expect(result.story2videoTextConfig.optimize).toEqual({
      platform: 'tongyi', style: 'realistic', creativeLevel: 5,
      maxLength: 400, numCandidates: 3, autoDetectStyle: false,
      negativePrompt: '', context: { synopsis: '角色一致性' },
    })
    expect(result.stageOptions.optimize).toEqual({
      platform: 'tongyi', style: 'realistic', creative_level: 5,
      max_length: 400, num_candidates: 3, auto_detect_style: false,
      negative_prompt: '', context: { synopsis: '角色一致性' },
    })
  })

  it('prompt-engine 参数处理：平台/风格非法回退默认（与运行层一致），长度/候选数越界与敏感上下文 fail closed', () => {
    // 旧配置可能保存过非法平台值：配置层与运行层一致回退默认，不抛错（兼容回归防护）
    const fallback = normalizeStory2VideoTextParams({
      text: '非法平台',
      story2videoTextConfig: { optimize: { platform: 'douyin', style: 'not-a-style' } },
    })
    expect(fallback.stageOptions.optimize).toMatchObject({ platform: 'generic', style: 'realistic' })

    expect(() => normalizeStory2VideoTextParams({
      text: '长度越界',
      story2videoTextConfig: { optimize: { maxLength: 20000 } },
    })).toThrow(/optimize.maxLength/)
    expect(() => normalizeStory2VideoTextParams({
      text: '候选越界',
      story2videoTextConfig: { optimize: { numCandidates: 9 } },
    })).toThrow(/optimize.numCandidates/)
    expect(() => normalizeStory2VideoTextParams({
      text: '敏感上下文',
      story2videoTextConfig: { optimize: { context: { api_key: 'secret' } } },
    })).toThrow(/敏感凭据/)
  })

  it('将完整兼容配置映射到对应阶段，并转换 BGM 兼容音量单位', () => {
    const result = normalizeStory2VideoTextParams({
      text: '海上日出',
      autoAdvance: false,
      checkpointPolicy: 'manual_all',
      story2videoTextConfig: {
        version: 1,
        mode: 'text',
        prompt: '海上日出',
        size: '1920x1080',
        seconds: 12,
        split: { language: 'auto', mode: 'precise', maxSentenceLength: 120, targetSeconds: 4, speechRate: 1.2, minWords: 4, maxWords: 30 },
        optimize: { style: 'anime', creativeLevel: 8, negativePrompt: '水印、文字' },
        image: { provider: 'dall-e', model: 'gpt-image-1', style: 'anime', effect: 'pan-left' },
        voice: { provider: 'doubao-tts', model: 'seed-tts-1', id: 'voice-1', speed: 1.3, volume: 0.8, pitch: 2, emotion: 'warm' },
        subtitle: { enabled: true, font: 'Noto Sans SC', size: 'size4', style: 'style2', color: '#ffffff' },
        bgm: { enabled: true, path: 'C:/tmp/story2video/selected-media/bgm.mp3', volume: 7 },
        versions: { generateBase: false, generateMerged: true },
        transition: 'slide-left',
        output: { fps: 24, format: 'webm' },
        publish: { enabled: true, platforms: ['douyin'], title: '日出', content: '海上日出', tags: ['旅行'] },
      },
    })

    expect(result).toMatchObject({
      autoAdvance: false,
      checkpointPolicy: 'manual_all',
      text: '海上日出',
      size: '1920x1080',
      imageProvider: 'dall-e',
      imageModel: 'gpt-image-1',
      voiceProvider: 'doubao-tts',
      voiceModel: 'seed-tts-1',
      bgmVolume: 0.7,
      publishEnabled: true,
      platforms: ['douyin'],
      title: '日出',
      content: '海上日出',
      tags: ['旅行'],
    })
    expect(result.stageOptions.split).toMatchObject({ mode: 'precise', max_sentence_length: 120, target_duration: 4 })
    expect(result.stageOptions.optimize).toEqual({
      platform: 'generic', style: 'anime', creative_level: 8,
      max_length: 300, num_candidates: 1, auto_detect_style: true,
      negative_prompt: '水印、文字',
    })
    expect(result.stageOptions.compose).toMatchObject({
      transition: 'slide-left',
      imageEffect: 'pan-left',
      subtitleStyle: { font: 'Noto Sans SC', size: 'size4', style: 'style2', color: '#ffffff' },
      bgmVolume: 0.7,
      voiceVolume: 0.8,
      resolution: '1920x1080',
      fps: 24,
      format: 'webm',
    })
  })

  it('兼容忽略旧时长、版本、perImageDuration，optimize 补齐 prompt-engine 默认值', () => {
    const result = normalizeStory2VideoTextParams({
      text: '兼容旧配置',
      story2videoTextConfig: { seconds: 12, versions: { generateBase: false, generateMerged: false }, perImageDuration: 4 },
    })

    expect(result.stageOptions.optimize).toMatchObject({
      platform: 'generic', style: 'realistic', max_length: 300, num_candidates: 1, auto_detect_style: true,
    })
    expect(result).not.toHaveProperty('seconds')
    expect(result.story2videoTextConfig).not.toHaveProperty('versions')
    expect(result).not.toHaveProperty('perImageDuration')
    expect(result.story2videoTextConfig).not.toHaveProperty('perImageDuration')
    // 旧 perImageDuration 不再暴露，defaultSceneDuration 保持固定默认 6 作为 compose 回退。
    expect(result.defaultSceneDuration).toBe(6)
    expect(result.stageOptions.compose.defaultSceneDuration).toBe(6)
  })

  it('仅提供版本化配置时使用 prompt 恢复 text 合同', () => {
    const result = normalizeStory2VideoTextParams({
      story2videoTextConfig: {
        version: 1,
        mode: 'text',
        prompt: '从项目配置恢复的文案',
      },
    })

    expect(result).toMatchObject({
      mode: 'text',
      text: '从项目配置恢复的文案',
      story2videoTextConfig: {
        version: 1,
        mode: 'text',
        prompt: '从项目配置恢复的文案',
      },
    })
  })

  it('分镜字数主控：targetCharsPerScene 优先，缺省时由 targetSeconds 换算并夹在 [minWords,maxWords]', () => {
    // 缺省 targetCharsPerScene：targetSeconds=4 → round(4×3.3×1)=13
    const fromSeconds = normalizeStory2VideoTextParams({
      text: '字数换算',
      story2videoTextConfig: { split: { targetSeconds: 4 } },
    })
    expect(fromSeconds.story2videoTextConfig.split.targetCharsPerScene).toBe(13)
    expect(fromSeconds.story2videoTextConfig.split.targetSeconds).toBe(4)
    expect(fromSeconds.stageOptions.split.target_duration).toBe(4)

    // 显式主控优先于 targetSeconds，并经 8002 通道生效：反推 target_duration = round(25/3.3)=8
    const explicit = normalizeStory2VideoTextParams({
      text: '字数主控',
      story2videoTextConfig: { split: { targetSeconds: 10, targetCharsPerScene: 25 } },
    })
    expect(explicit.story2videoTextConfig.split.targetCharsPerScene).toBe(25)
    expect(explicit.story2videoTextConfig.split.targetSeconds).toBe(8)
    expect(explicit.stageOptions.split.target_duration).toBe(8)

    // 换算结果夹在 [max(minWords,1), min(maxWords,200)]，并统一反推 target_duration
    const clampedHigh = normalizeStory2VideoTextParams({
      text: '夹上限',
      story2videoTextConfig: { split: { targetSeconds: 60 } },
    })
    expect(clampedHigh.story2videoTextConfig.split.targetCharsPerScene).toBe(50)
    expect(clampedHigh.story2videoTextConfig.split.targetSeconds).toBe(15)
    expect(clampedHigh.stageOptions.split.target_duration).toBe(15)
    const clampedLow = normalizeStory2VideoTextParams({
      text: '夹下限',
      story2videoTextConfig: { split: { targetSeconds: 1, minWords: 10, maxWords: 50 } },
    })
    expect(clampedLow.story2videoTextConfig.split.targetCharsPerScene).toBe(10)
    expect(clampedLow.stageOptions.split.target_duration).toBe(3)
    // maxWords 配到 500 且 voiceSpeed=2（speechRate 单一来源）时 60s×3.3×2=396，
    // 也不能突破 1..200 契约（双模型审查 W1）
    const capped = normalizeStory2VideoTextParams({
      text: '契约上限',
      voiceSpeed: 2,
      story2videoTextConfig: { split: { targetSeconds: 60, maxWords: 500 } },
    })
    expect(capped.story2videoTextConfig.split.targetCharsPerScene).toBe(200)
    expect(capped.stageOptions.split.target_duration).toBe(30)

    // 保存→重载幂等：以归一化结果再次归一化，chars 与 target_duration 不变（双模型审查 W1）
    const reloaded = normalizeStory2VideoTextParams({ story2videoTextConfig: clampedHigh.story2videoTextConfig })
    expect(reloaded.story2videoTextConfig.split.targetCharsPerScene).toBe(clampedHigh.story2videoTextConfig.split.targetCharsPerScene)
    expect(reloaded.stageOptions.split.target_duration).toBe(clampedHigh.stageOptions.split.target_duration)

    // 显式字数越出 [minWords, maxWords] fail-closed（双模型审查 W2）
    expect(() => normalizeStory2VideoTextParams({
      text: '越界字数',
      story2videoTextConfig: { split: { targetCharsPerScene: 5, minWords: 10, maxWords: 50 } },
    })).toThrow(/targetCharsPerScene/)
  })

  it('语言感知基准语速（Batch 5a）：缺省 baseWordsPerSecond 按 split.language 选择，显式值优先', () => {
    // zh：缺省 bps → 4.5；targetSeconds=4 → round(4×4.5×1)=18
    const zh = normalizeStory2VideoTextParams({
      text: '中文分镜',
      story2videoTextConfig: { split: { language: 'zh', targetSeconds: 4 } },
    })
    expect(zh.story2videoTextConfig.split.baseWordsPerSecond).toBe(4.5)
    expect(zh.story2videoTextConfig.split.targetCharsPerScene).toBe(18)
    expect(zh.story2videoTextConfig.split.targetSeconds).toBe(4)
    expect(zh.stageOptions.split.base_words_per_second).toBe(4.5)
    expect(zh.stageOptions.split.target_duration).toBe(4)

    // en：缺省 bps → 2.8；targetSeconds=6 → round(6×2.8×1)=17
    const en = normalizeStory2VideoTextParams({
      text: 'English scenes',
      story2videoTextConfig: { split: { language: 'en', targetSeconds: 6 } },
    })
    expect(en.story2videoTextConfig.split.baseWordsPerSecond).toBe(2.8)
    expect(en.story2videoTextConfig.split.targetCharsPerScene).toBe(17)

    // auto/未知：回退 3.3（默认行为不变）
    const auto = normalizeStory2VideoTextParams({
      text: '自动识别分镜',
      story2videoTextConfig: { split: { language: 'auto', targetSeconds: 6 } },
    })
    expect(auto.story2videoTextConfig.split.baseWordsPerSecond).toBe(3.3)
    expect(auto.story2videoTextConfig.split.targetCharsPerScene).toBe(20)

    // 显式 baseWordsPerSecond 优先于语言表（renderer 已按语言下发，这里验证不被语言表覆盖）
    const explicit = normalizeStory2VideoTextParams({
      text: '显式语速',
      story2videoTextConfig: { split: { language: 'zh', targetSeconds: 4, baseWordsPerSecond: 3.3 } },
    })
    expect(explicit.story2videoTextConfig.split.baseWordsPerSecond).toBe(3.3)
    expect(explicit.story2videoTextConfig.split.targetCharsPerScene).toBe(13)
  })

  it('speechRate 单一来源：split.speechRate 由 voice.speed 驱动，target_chars_per_scene 透传给本地切分', () => {
    const result = normalizeStory2VideoTextParams({
      text: '语速一致',
      voiceSpeed: 1.5,
      story2videoTextConfig: { split: { targetSeconds: 6, speechRate: 1.2 } },
    })
    expect(result.story2videoTextConfig.voice.speed).toBe(1.5)
    // 显式 split.speechRate=1.2 被 voice.speed=1.5 覆盖（单一来源）
    expect(result.story2videoTextConfig.split.speechRate).toBe(1.5)
    expect(result.stageOptions.split.speech_rate).toBe(1.5)
    // 6s × 3.3 × 1.5 = 29.7 → 30
    expect(result.story2videoTextConfig.split.targetCharsPerScene).toBe(30)
    expect(result.stageOptions.split.target_chars_per_scene).toBe(30)
  })

  it('场景时长模式：默认 follow-audio/6，min-duration 可配，越界与非法枚举拒绝', () => {
    const nested = normalizeStory2VideoTextParams({
      text: '时长模式',
      story2videoTextConfig: { sceneDurationMode: 'min-duration', minSceneDuration: 8 },
    })
    expect(nested.stageOptions.compose).toMatchObject({ sceneDurationMode: 'min-duration', minSceneDuration: 8 })
    expect(nested.story2videoTextConfig).toMatchObject({ sceneDurationMode: 'min-duration', minSceneDuration: 8 })

    expect(() => normalizeStory2VideoTextParams({ text: '非法枚举', story2videoTextConfig: { sceneDurationMode: 'fixed' } }))
      .toThrow(/sceneDurationMode/)
    expect(() => normalizeStory2VideoTextParams({ text: '越界0', story2videoTextConfig: { minSceneDuration: 0 } }))
      .toThrow(/minSceneDuration/)
    expect(() => normalizeStory2VideoTextParams({ text: '越界61', story2videoTextConfig: { minSceneDuration: 61 } }))
      .toThrow(/minSceneDuration/)
    expect(() => normalizeStory2VideoTextParams({ text: '字数越界0', story2videoTextConfig: { split: { targetCharsPerScene: 0 } } }))
      .toThrow(/targetCharsPerScene/)
    expect(() => normalizeStory2VideoTextParams({ text: '字数越界201', story2videoTextConfig: { split: { targetCharsPerScene: 201 } } }))
      .toThrow(/targetCharsPerScene/)
  })

  it('defaultSceneDuration 支持扁平/嵌套别名与越界拒绝，不再是 perImageDuration 用户项', () => {
    const alias = normalizeStory2VideoTextParams({ text: '别名', defaultSceneDuration: 8 })
    expect(alias.defaultSceneDuration).toBe(8)
    expect(alias.stageOptions.compose.defaultSceneDuration).toBe(8)
    expect(alias.story2videoTextConfig).not.toHaveProperty('defaultSceneDuration')

    const nested = normalizeStory2VideoTextParams({
      text: '嵌套',
      story2videoTextConfig: { defaultSceneDuration: 5 },
    })
    expect(nested.defaultSceneDuration).toBe(5)
    expect(nested.stageOptions.compose.defaultSceneDuration).toBe(5)

    expect(() => normalizeStory2VideoTextParams({ text: '越界', defaultSceneDuration: 0 })).toThrow(/defaultSceneDuration/)
    expect(() => normalizeStory2VideoTextParams({ text: '越界', defaultSceneDuration: 61 })).toThrow(/defaultSceneDuration/)
  })

  it.each([
    ['中文', '中'.repeat(6000)],
    ['英文', 'a'.repeat(6000)],
    ['emoji', '😀'.repeat(6000)],
  ])('接受恰好 6000 个 Unicode code point 的%s文案', (_language, text) => {
    expect(Array.from(text)).toHaveLength(6000)

    const result = normalizeStory2VideoTextParams({ text })

    expect(result.text).toBe(text)
    expect(result.story2videoTextConfig.prompt).toBe(text)
  })

  it.each([
    ['中文', '中'.repeat(6001)],
    ['英文', 'a'.repeat(6001)],
    ['emoji', '😀'.repeat(6001)],
  ])('拒绝 6001 个 Unicode code point 的%s文案', (_language, text) => {
    expect(Array.from(text)).toHaveLength(6001)

    expect(() => normalizeStory2VideoTextParams({ text })).toThrow(/6000.*Unicode/i)
  })

  it.each([
    ['720x1280', '9:16'],
    ['1920x1080', '16:9'],
    ['3840x2160', '16:9'],
    ['1080x1920', '9:16'],
    ['1080x1440', '3:4'],
  ])('从输出分辨率推导图片宽高比：%s', (size, expectedAspectRatio) => {
    const result = normalizeStory2VideoTextParams({
      text: '输出比例由最终成片决定。',
      story2videoTextConfig: { size },
    })

    expect(result.story2videoTextConfig.image.aspectRatio).toBe(expectedAspectRatio)
    expect(result.stageOptions.generate_assets.aspectRatio).toBe(expectedAspectRatio)
  })

  it.each([
    ['size1', 'size1'], ['size2', 'size2'], ['size3', 'size3'],
    ['size4', 'size4'], ['size5', 'size5'], ['size6', 'size6'],
  ])('保留字幕字号 %s 的独立合成语义', (size, composeSize) => {
    const result = normalizeStory2VideoTextParams({
      text: '字幕字号测试。',
      story2videoTextConfig: { subtitle: { size } },
    })

    expect(result.stageOptions.compose.subtitleStyle.size).toBe(composeSize)
  })
  it.each([
    [{ inputMode: 'images', images: ['data:image/png;base64,aQ=='] }, '只支持 text'],
    [{ text: '测试', images: {} }, 'images 必须是数组'],
    [{ text: '测试', audio: 'voice.mp3' }, 'audio 必须是数组'],
    [{ text: '测试', video: false }, '只支持 text'],
    [{ story2videoTextConfig: { version: 2, mode: 'text', prompt: '测试' } }, '版本不受支持'],
    [{ story2videoTextConfig: { mode: 'audio', prompt: '测试' } }, '只支持 text'],
    [{ text: '文案 A', story2videoTextConfig: { prompt: '文案 B' } }, '必须一致'],
    [{ text: '   ' }, '文案不能为空'],
    [{ text: '测试', checkpointPolicy: 'unsafe' }, 'checkpointPolicy'],
    [{ text: '测试', story2videoTextConfig: { image: { aspectRatio: 'free-form' } } }, 'image.aspectRatio'],
    [{ text: '测试', story2videoTextConfig: { image: { aspectRatio: '7:11' } } }, 'image.aspectRatio'],
    [{ text: '测试', story2videoTextConfig: { size: '1920x1080', image: { aspectRatio: '9:16' } } }, '必须与输出分辨率匹配'],
    [{ text: '测试', story2videoTextConfig: { bgm: { volume: 11 } } }, 'bgm.volume'],
    [{ text: '测试', story2videoTextConfig: { optimize: { creativeLevel: 0 } } }, '1-10'],
    [{ text: '测试', story2videoTextConfig: { optimize: { negativePrompt: 'x'.repeat(501) } } }, '超过 500 字符'],
  ])('拒绝非法配置且给出明确错误 %#', (input, expected) => {
    expect(() => normalizeStory2VideoTextParams(input)).toThrow(expected)
  })

  it('兼容旧调用传入的空媒体占位', () => {
    const result = normalizeStory2VideoTextParams({
      text: '测试',
      images: [],
      audio: [],
      video: null,
    })

    expect(result).toMatchObject({ inputMode: 'text', images: [], audio: [], video: null })
  })

  it('丢弃未知字段和敏感凭据，不把 Provider Secret 写入运行配置', () => {
    const result = normalizeStory2VideoTextParams({
      text: '测试',
      story2videoTextConfig: {
        apiKey: 'secret',
        accessToken: 'token',
        unknown: { nested: true },
        image: { provider: 'dall-e', apiKey: 'secret-image' },
        voice: { provider: 'doubao-tts', accessToken: 'secret-voice' },
      },
    })

    const serialized = JSON.stringify(result)
    expect(serialized).not.toContain('secret')
    expect(serialized).not.toContain('token')
    expect(result.story2videoTextConfig).not.toHaveProperty('unknown')
  })

  it.each([
    { context: { apiKey: 'secret' } },
    { initialContext: { nested: { accessToken: 'token' } } },
    { context: { provider: { clientSecret: 'secret' } } },
  ])('拒绝运行上下文中的敏感凭据 %#', (contextInput) => {
    expect(() => normalizeStory2VideoTextParams({ text: '测试', ...contextInput })).toThrow('敏感凭据')
  })
  it('将 Story2Video 文案限制为 6000 个 Unicode 字符，版本化 prompt 直传同样受限', () => {
    expect(MAX_STORY2VIDEO_TEXT_UNICODE_CHARS).toBe(6000)
    expect(countStory2VideoTextCharacters('😀'.repeat(6000))).toBe(6000)
    expect(normalizeStory2VideoTextParams({ text: '中'.repeat(6000) }).text).toHaveLength(6000)
    expect(() => normalizeStory2VideoTextParams({ text: 'a'.repeat(6001) })).toThrow('最多 6000')
    expect(() => normalizeStory2VideoTextParams({
      story2videoTextConfig: { version: 1, mode: 'text', prompt: '😀'.repeat(6001) },
    })).toThrow('最多 6000')
  })
})

describe('Story2Video video 混合模式配置归一化（2026-08-11）', () => {
  const base = (video) => ({
    text: '视频+图片轮播混合模式测试文案。',
    story2videoTextConfig: { version: 1, mode: 'text', prompt: '视频+图片轮播混合模式测试文案。', ...(video ? { video } : {}) },
  })

  it('默认 off：不携带 video 段时保持纯图片轮播契约', () => {
    const result = normalizeStory2VideoTextParams(base())
    expect(result.videoMode).toBe('off')
    expect(result.videoConfig).toMatchObject({ mode: 'off', fixedRatio: 25, minRatio: 20, maxRatio: 40, maxScenes: 3 })
    expect(result.story2videoTextConfig.video.mode).toBe('off')
    expect(result.stageOptions.select_video_scenes.video).toMatchObject({ mode: 'off' })
    expect(result.stageOptions.generate_assets.videoMode).toBe('off')
    // 媒体输入 video 字段语义保持不变（text 模式为 null）
    expect(result.video).toBeNull()
  })

  it('fixed 模式：合法比例与 provider/model 归一化', () => {
    const result = normalizeStory2VideoTextParams(base({
      mode: 'fixed',
      provider: 'kling',
      model: 'kling-v1',
      fixedRatio: 30,
    }))
    expect(result.videoMode).toBe('fixed')
    expect(result.videoConfig).toMatchObject({ mode: 'fixed', provider: 'kling', model: 'kling-v1', fixedRatio: 30 })
    expect(result.stageOptions.select_video_scenes.video).toMatchObject({
      mode: 'fixed', provider: 'kling', model: 'kling-v1', fixedRatio: 30,
    })
    expect(result.stageOptions.generate_assets.video).toMatchObject({ provider: 'kling', model: 'kling-v1' })
  })

  it('ai-judged 模式：min/max 区间与 maxScenes 归一化', () => {
    const result = normalizeStory2VideoTextParams(base({
      mode: 'ai-judged',
      minRatio: 20,
      maxRatio: 40,
      maxScenes: 4,
    }))
    expect(result.videoConfig).toMatchObject({ mode: 'ai-judged', minRatio: 20, maxRatio: 40, maxScenes: 4 })
  })

  it('拒绝非法 mode', () => {
    expect(() => normalizeStory2VideoTextParams(base({ mode: 'magic' }))).toThrow('video.mode 值无效')
  })

  it('拒绝越界 fixedRatio', () => {
    expect(() => normalizeStory2VideoTextParams(base({ mode: 'fixed', fixedRatio: 200 }))).toThrow('video.fixedRatio')
    expect(() => normalizeStory2VideoTextParams(base({ mode: 'fixed', fixedRatio: 5 }))).toThrow('video.fixedRatio')
  })

  it('拒绝 minRatio > maxRatio', () => {
    expect(() => normalizeStory2VideoTextParams(base({ mode: 'ai-judged', minRatio: 50, maxRatio: 20 }))).toThrow('video.minRatio 不能大于 video.maxRatio')
  })

  it('拒绝非法 maxScenes（0 / 13）', () => {
    expect(() => normalizeStory2VideoTextParams(base({ maxScenes: 0 }))).toThrow('video.maxScenes')
    expect(() => normalizeStory2VideoTextParams(base({ maxScenes: 13 }))).toThrow('video.maxScenes')
  })

  it('拒绝非法 provider 字符', () => {
    expect(() => normalizeStory2VideoTextParams(base({ provider: 'bad provider!' }))).toThrow('video.provider 格式无效')
  })

  it('未知 video 字段被忽略，不污染归一化结果', () => {
    const result = normalizeStory2VideoTextParams(base({ mode: 'off', foo: 'bar', nested: { x: 1 } }))
    expect(result.story2videoTextConfig.video).not.toHaveProperty('foo')
    expect(result.story2videoTextConfig.video).not.toHaveProperty('nested')
  })

  it('顶层 videoMode/videoProvider 兼容旧扁平参数', () => {
    const result = normalizeStory2VideoTextParams({
      text: '兼容旧参数。',
      videoMode: 'fixed',
      videoProvider: 'ltx',
    })
    expect(result.videoMode).toBe('fixed')
    expect(result.videoConfig.provider).toBe('ltx')
  })
})

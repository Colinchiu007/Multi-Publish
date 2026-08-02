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
        language: 'zh',
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
    }))
    expect(DEFAULT_STORY2VIDEO_TEXT_CONFIG.mode).toBe('text')
    expect(result).not.toHaveProperty('seconds')
    expect(result).not.toHaveProperty('generateBase')
    expect(result).not.toHaveProperty('generateMerged')
    expect(result.story2videoTextConfig).not.toHaveProperty('seconds')
    expect(result.story2videoTextConfig).not.toHaveProperty('versions')
    expect(result.stageOptions.optimize).not.toHaveProperty('platform')
    expect(result.stageOptions.optimize).not.toHaveProperty('num_candidates')
    expect(result.stageOptions.optimize).not.toHaveProperty('auto_detect_style')
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

  it('忽略旧 PromptBridge 专属参数，不把它们伪装为当前 LLM 的可用选项', () => {
    const result = normalizeStory2VideoTextParams({
      text: '未来城市',
      story2videoTextConfig: {
        optimize: { platform: 'douyin', maxLength: 300, numCandidates: 3, autoDetectStyle: false, context: { synopsis: '旧路径' } },
      },
    })

    expect(result.story2videoTextConfig.optimize).toEqual({
      style: 'realistic', creativeLevel: 5, negativePrompt: '',
    })
    expect(result.stageOptions.optimize).toEqual({
      style: 'realistic', creative_level: 5, negative_prompt: '',
    })
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
        perImageDuration: 4,
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
    expect(result.stageOptions.optimize).toEqual({ style: 'anime', creative_level: 8, negative_prompt: '水印、文字' })
    expect(result.stageOptions.compose).toMatchObject({
      transition: 'slide-left',
      imageEffect: 'pan-left',
      subtitleStyle: { font: 'Noto Sans SC', size: 'xl', style: 'style2', color: '#ffffff' },
      bgmVolume: 0.7,
      voiceVolume: 0.8,
      resolution: '1920x1080',
      fps: 24,
      format: 'webm',
    })
  })

  it('兼容忽略旧时长、版本和 PromptBridge 专属字段', () => {
    const result = normalizeStory2VideoTextParams({
      text: '兼容旧配置',
      story2videoTextConfig: { seconds: 12, versions: { generateBase: false, generateMerged: false }, optimize: { platform: 'unknown' } },
    })

    expect(result.stageOptions.optimize).not.toHaveProperty('platform')
    expect(result).not.toHaveProperty('seconds')
    expect(result.story2videoTextConfig).not.toHaveProperty('versions')
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
    [{ text: '测试', story2videoTextConfig: { bgm: { volume: 11 } } }, 'bgm.volume'],
    [{ text: '测试', story2videoTextConfig: { optimize: { style: 'unknown' } } }, '不支持的视觉提示词风格'],
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

// @vitest-environment node
const {
  DEFAULT_STORY2VIDEO_TEXT_CONFIG,
  normalizeStory2VideoTextParams,
} = require('./story2video-text-config')

describe('Story2Video text 参数合同', () => {
  it('使用独立 Story2Video 的 text 默认值并映射到六阶段参数', () => {
    const result = normalizeStory2VideoTextParams({ text: '长安城的灯火。' })

    expect(result).toMatchObject({
      mode: 'text',
      inputMode: 'text',
      text: '长安城的灯火。',
      size: '720x1280',
      seconds: 8,
      resolution: '720x1280',
      defaultSceneDuration: 6,
      imageEffect: 'zoom-in',
      transition: 'fade',
      subtitleEnabled: false,
      bgmPath: null,
      bgmVolume: 0.5,
      generateBase: true,
      generateMerged: true,
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
        platform: 'generic',
        style: 'realistic',
        creative_level: 5,
        num_candidates: 1,
        auto_detect_style: true,
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
      seconds: 8,
    }))
    expect(DEFAULT_STORY2VIDEO_TEXT_CONFIG.mode).toBe('text')
    expect(result.stageOptions.optimize).not.toHaveProperty('max_length')
    expect(result.stageOptions.optimize).not.toHaveProperty('context')
  })

  it('将图片风格与提示词风格隔离，并把兼容值映射为 prompt-engine 合法值', () => {
    const result = normalizeStory2VideoTextParams({
      text: '未来城市',
      imageStyle: 'cinematic',
      promptPlatform: 'douyin',
      promptStyle: '3d-render',
    })

    expect(result.imageStyle).toBe('cinematic')
    expect(result.promptStyle).toBe('3d_render')
    expect(result.stageOptions.optimize).toMatchObject({
      platform: 'generic',
      style: '3d_render',
    })
  })

  it('保留 prompt-engine 对象上下文，并将空 maxLength 视为未设置', () => {
    const context = {
      synopsis: '未来城市中的交通故事',
      setting: '雨夜街道',
      character: { name: '林夏' },
      character_list: [{ name: '林夏' }, { name: '周舟' }],
    }
    const result = normalizeStory2VideoTextParams({
      text: '未来城市',
      story2videoTextConfig: {
        optimize: { context, maxLength: '' },
      },
    })

    expect(result.story2videoTextConfig.optimize.context).toEqual(context)
    expect(result.stageOptions.optimize.context).toEqual(context)
    expect(result.stageOptions.optimize).not.toHaveProperty('max_length')
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
        optimize: { platform: 'douyin', style: 'anime', creativeLevel: 8, numCandidates: 2, autoDetectStyle: false },
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
      seconds: 12,
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
    expect(result.stageOptions.optimize).toMatchObject({ style: 'anime', creative_level: 8, num_candidates: 2, auto_detect_style: false })
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
    [{ text: '测试', story2videoTextConfig: { seconds: 0 } }, 'seconds'],
    [{ text: '测试', story2videoTextConfig: { bgm: { volume: 11 } } }, 'bgm.volume'],
    [{ text: '测试', story2videoTextConfig: { versions: { generateBase: false, generateMerged: false } } }, '至少选择一个视频版本'],
    [{ text: '测试', story2videoTextConfig: { optimize: { platform: 'unknown' } } }, '不支持 prompt-engine 值'],
    [{ text: '测试', story2videoTextConfig: { optimize: { style: 'unknown' } } }, '不支持 prompt-engine 值'],
    [{ text: '测试', story2videoTextConfig: { optimize: { creativeLevel: 0 } } }, '1-10'],
    [{ text: '测试', story2videoTextConfig: { optimize: { numCandidates: 6 } } }, '1-5'],
    [{ text: '测试', story2videoTextConfig: { optimize: { maxLength: 49 } } }, '50-2000'],
    [{ text: '测试', story2videoTextConfig: { optimize: { negativePrompt: 'x'.repeat(501) } } }, '超过 500 字符'],
    [{ text: '测试', story2videoTextConfig: { optimize: { context: { accessToken: 'secret' } } } }, '敏感凭据'],
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
})

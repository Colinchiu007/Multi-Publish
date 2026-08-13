import { describe, expect, it, vi } from 'vitest'

/**
 * video-prompt-engine-contract.test.js — 视频提示词优化引擎契约测试
 * 与图片提示词契约（prompt-engine-contract / story2video-stages 覆盖）刻意分文件。
 * 场景映射：openspec change video-prompt-optimize-engine specs/video-prompt-engine
 *  - 领域与视频平台契约（domain 缺省兼容 / 别名归一 / 非法回退）
 *  - 配置契约边界（creativeLevel/maxLength/numCandidates 收敛、negativePrompt 截断）
 *  - 上下文与一致性（context 透传、敏感键拦截）
 *  - 输出校验 fail closed（error/detail/空串/批量数量/结构化字段收敛）
 */
const {
  VIDEO_PLATFORMS,
  DEFAULT_VIDEO_PLATFORM,
  normalizeVideoDomain,
  normalizeVideoPlatform,
  buildVideoOptimizeRequest,
  buildStandaloneVideoOptimizeRequest,
  isStandaloneVideoEngineEnabled,
  getStandaloneVideoEngineTarget,
  languageFromVideoPlatform,
  languageFromVideoModel,
  normalizeVideoMeta,
  extractOptimizedVideoPrompt,
} = require('./video-prompt-engine-contract')
const PromptBridge = require('./prompt-bridge')

const mockLog = { info: vi.fn(), warn: vi.fn(), error: vi.fn() }

describe('视频平台/领域归一', () => {
  it('契约枚举直通', () => {
    expect(VIDEO_PLATFORMS.has('sora')).toBe(true)
    expect(VIDEO_PLATFORMS.has('generic_video')).toBe(true)
  })

  it('历史别名归一为契约枚举', () => {
    expect(normalizeVideoPlatform('kling-pro')).toBe('kling')
    expect(normalizeVideoPlatform('veo3')).toBe('veo')
    expect(normalizeVideoPlatform('runway-gen4')).toBe('runway')
    expect(normalizeVideoPlatform('sora-v2')).toBe('sora')
    expect(normalizeVideoPlatform('veo-3.1')).toBe('veo')
  })

  it('未知平台回退 generic_video', () => {
    expect(normalizeVideoPlatform('not-a-platform')).toBe(DEFAULT_VIDEO_PLATFORM)
    expect(normalizeVideoPlatform('')).toBe(DEFAULT_VIDEO_PLATFORM)
  })

  it('domain 归一：仅显式 video 进入视频领域', () => {
    expect(normalizeVideoDomain('video')).toBe('video')
    expect(normalizeVideoDomain('image')).toBe('image')
    expect(normalizeVideoDomain(undefined)).toBe('image')
    expect(normalizeVideoDomain('Video')).toBe('video')
  })
})

describe('buildVideoOptimizeRequest', () => {
  it('默认 domain=video、platform=generic_video、边界默认值', () => {
    const req = buildVideoOptimizeRequest('a cat')
    expect(req.domain).toBe('video')
    expect(req.platform).toBe('generic_video')
    expect(req.creative_level).toBe(5)
    expect(req.max_length).toBe(500)
    expect(req.num_candidates).toBe(1)
  })

  it('平台别名归一 + 风格别名归一 + 边界收敛', () => {
    const req = buildVideoOptimizeRequest('a cat', {
      platform: 'veo3',
      style: 'cinematic',
      creativeLevel: 99,
      maxLength: 10,
      numCandidates: 0,
    })
    expect(req.platform).toBe('veo')
    expect(req.style).toBe('photography')
    expect(req.creative_level).toBe(10)
    expect(req.max_length).toBe(50)
    expect(req.num_candidates).toBe(1)
  })

  it('negativePrompt 截断到 500', () => {
    const req = buildVideoOptimizeRequest('x', { negative_prompt: 'a'.repeat(600) })
    expect(req.negative_prompt.length).toBe(500)
  })

  it('context 白名单透传（未知键丢弃），字符串映射 synopsis', () => {
    const req1 = buildVideoOptimizeRequest('x', { context: { full_text: 'abc', narration: 'n' } })
    expect(req1.context).toEqual({ full_text: 'abc' })
    const req2 = buildVideoOptimizeRequest('x', { context: 'story' })
    expect(req2.context).toEqual({ synopsis: 'story' })
  })

  it('context 长度收敛（full_text≤2000、synopsis/character/setting≤500、character_list≤10）', () => {
    const req = buildVideoOptimizeRequest('x', {
      context: {
        full_text: 'a'.repeat(3000),
        synopsis: 'b'.repeat(800),
        setting: 'c'.repeat(600),
        character: 'd'.repeat(600),
        character_list: Array.from({ length: 15 }, (_, i) => '角色' + i),
      },
    })
    expect(req.context.full_text.length).toBe(2000)
    expect(req.context.synopsis.length).toBe(500)
    expect(req.context.setting.length).toBe(500)
    expect(req.context.character.length).toBe(500)
    expect(req.context.character_list).toHaveLength(10)
  })

  it('context 空对象不附加 context 字段', () => {
    const req = buildVideoOptimizeRequest('x', { context: {} })
    expect(req.context).toBeUndefined()
  })

  it('context 含敏感凭据键拒绝（fail closed）', () => {
    expect(() => buildVideoOptimizeRequest('x', { context: { api_key: 'sk-xxx' } })).toThrow(/敏感凭据/)
    expect(() => buildVideoOptimizeRequest('x', { context: { nested: { token: 't' } } })).toThrow(/敏感凭据/)
  })
})

describe('extractOptimizedVideoPrompt', () => {
  it('成功路径：结构化 video 字段提取 + 越界收敛', () => {
    const r = extractOptimizedVideoPrompt({
      optimized_prompt: 'drone shot over city',
      platform: 'kling',
      video: {
        shot: 'wide',
        camera: 'drone',
        motion_intensity: 99,
        scene_transition: 'cut',
        continuity_token: 'c'.repeat(200),
        duration_hint: 5,
      },
    })
    expect(r.ok).toBe(true)
    expect(r.prompt).toBe('drone shot over city')
    expect(r.video.shot).toBe('wide')
    expect(r.video.motion_intensity).toBe(10)
    expect(r.video.continuity_token.length).toBe(100)
    expect(r.video.duration_hint).toBe(5)
  })

  it('error 非空视为失败', () => {
    const r = extractOptimizedVideoPrompt({ optimized_prompt: 'x', error: 'upstream down' })
    expect(r.ok).toBe(false)
    expect(r.error).toContain('视频优化失败')
  })

  it('detail 非空视为 422 拒绝', () => {
    const r = extractOptimizedVideoPrompt({ optimized_prompt: 'x', detail: [{ msg: 'bad enum' }] })
    expect(r.ok).toBe(false)
    expect(r.error).toContain('422')
  })

  it('optimized_prompt 缺失/空串失败', () => {
    expect(extractOptimizedVideoPrompt({}).ok).toBe(false)
    expect(extractOptimizedVideoPrompt({ optimized_prompt: '' }).ok).toBe(false)
  })

  it('响应无 video 字段时 video=null 且 ok', () => {
    const r = extractOptimizedVideoPrompt({ optimized_prompt: 'plain' })
    expect(r.ok).toBe(true)
    expect(r.video).toBeNull()
  })

  it('maxLength 截断并标记 truncated', () => {
    const r = extractOptimizedVideoPrompt({ optimized_prompt: 'abcdefghij' }, { maxLength: 5 })
    expect(r.ok).toBe(true)
    expect(r.prompt).toBe('abcde')
    expect(r.truncated).toBe(true)
  })

  it('motion_intensity 缺失给默认 5', () => {
    const r = extractOptimizedVideoPrompt({ optimized_prompt: 'x', video: { shot: 'close_up' } })
    expect(r.video.motion_intensity).toBe(5)
  })
})

describe('PromptBridge 视频方法', () => {
  function makeBridge () {
    const bridge = new PromptBridge({ log: mockLog })
    bridge.ensureRunning = vi.fn(async () => {})
    bridge._post = vi.fn(async (path, body) => JSON.parse(body))
    return bridge
  }

  it('optimizeVideo 发送 /v1/optimize domain=video + 平台归一', async () => {
    const bridge = makeBridge()
    const res = await bridge.optimizeVideo('a cat', { platform: 'veo3' })
    expect(bridge._post).toHaveBeenCalledTimes(1)
    expect(res.domain).toBe('video')
    expect(res.platform).toBe('veo')
  })

  it('optimizeVideo 接受对象请求（含 prompt）', async () => {
    const bridge = makeBridge()
    const res = await bridge.optimizeVideo({ prompt: 'a cat', platform: 'kling-pro' })
    expect(res.platform).toBe('kling')
    expect(res.domain).toBe('video')
  })

  it('optimizeVideosBatch 发送批量请求且逐项 domain=video', async () => {
    const bridge = makeBridge()
    const res = await bridge.optimizeVideosBatch(['scene one', 'scene two'], { platform: 'sora-v2' })
    expect(bridge._post).toHaveBeenCalledWith('/v1/optimize/batch', expect.any(String), undefined, undefined)
    expect(res.requests).toHaveLength(2)
    expect(res.requests[0].domain).toBe('video')
    expect(res.requests[0].platform).toBe('sora')
    expect(res.requests[1].platform).toBe('sora')
  })
})


describe('normalizeVideoContext（video-content-fidelity S4）', () => {
  const { normalizeVideoContext } = require('./video-prompt-engine-contract')
  it('只保留白名单键并收敛长度', () => {
    const out = normalizeVideoContext({ full_text: 'x'.repeat(3000), bogus: 'y', synopsis: 's', character_list: ['a', 'b', 'c'] })
    expect(Object.keys(out).sort()).toEqual(['character_list', 'full_text', 'synopsis'])
    expect(out.full_text.length).toBe(2000)
    expect(out.bogus).toBeUndefined()
  })
  it('非对象/空返回 undefined', () => {
    expect(normalizeVideoContext(null)).toBeUndefined()
    expect(normalizeVideoContext({})).toBeUndefined()
    expect(normalizeVideoContext('str')).toBeUndefined()
  })
})

describe('独立视频引擎（8020）— video-prompt-engine-enhancement D8', () => {
  describe('buildStandaloneVideoOptimizeRequest', () => {
    it('无 domain 字段；平台/边界归一与 8013 共用', () => {
      const req = buildStandaloneVideoOptimizeRequest('a cat', { platform: 'veo3', creativeLevel: 99, maxLength: 10 })
      expect(req.domain).toBeUndefined()
      expect(req.platform).toBe('veo')
      expect(req.creative_level).toBe(10)
      expect(req.max_length).toBe(50)
      expect(req.num_candidates).toBe(1)
    })

    it('output_language 显式优先（zh/en）', () => {
      expect(buildStandaloneVideoOptimizeRequest('x', { output_language: 'zh' }).output_language).toBe('zh')
      expect(buildStandaloneVideoOptimizeRequest('x', { outputLanguage: 'en' }).output_language).toBe('en')
      expect(buildStandaloneVideoOptimizeRequest('x', { output_language: 'fr' }).output_language).toBe('en')
    })

    it('output_language 缺省按文本自动检测（CJK≥30% → zh）', () => {
      expect(buildStandaloneVideoOptimizeRequest('关羽白马之战，万军之中取上将首级').output_language).toBe('zh')
      expect(buildStandaloneVideoOptimizeRequest('a cat runs in the city').output_language).toBe('en')
      // context 提供中文全文时同样判 zh
      expect(buildStandaloneVideoOptimizeRequest('scene one', { context: { full_text: '三国历史，关羽率军冲锋，旌旗猎猎，尘土飞扬' } }).output_language).toBe('zh')
    })

    it('negative_prompt 截断 / context 白名单 / 敏感键拒绝', () => {
      const req = buildStandaloneVideoOptimizeRequest('x', { negative_prompt: 'a'.repeat(600), context: { full_text: 'abc' } })
      expect(req.negative_prompt.length).toBe(500)
      expect(req.context).toEqual({ full_text: 'abc' })
      expect(() => buildStandaloneVideoOptimizeRequest('x', { context: { api_key: 'sk' } })).toThrow(/敏感凭据/)
    })
  })

  describe('环境开关', () => {
    const saved = process.env.VIDEO_PROMPT_PORT
    afterEach(() => {
      if (saved === undefined) delete process.env.VIDEO_PROMPT_PORT
      else process.env.VIDEO_PROMPT_PORT = saved
      delete process.env.VIDEO_PROMPT_HOST
    })

    it('VIDEO_PROMPT_PORT 合法端口才启用', () => {
      delete process.env.VIDEO_PROMPT_PORT
      expect(isStandaloneVideoEngineEnabled()).toBe(false)
      process.env.VIDEO_PROMPT_PORT = '8020'
      expect(isStandaloneVideoEngineEnabled()).toBe(true)
      expect(getStandaloneVideoEngineTarget()).toEqual({ host: '127.0.0.1', port: '8020' })
      process.env.VIDEO_PROMPT_HOST = '10.0.0.2'
      expect(getStandaloneVideoEngineTarget().host).toBe('10.0.0.2')
    })

    it('非法端口不启用', () => {
      process.env.VIDEO_PROMPT_PORT = 'abc'
      expect(isStandaloneVideoEngineEnabled()).toBe(false)
      process.env.VIDEO_PROMPT_PORT = ''
      expect(isStandaloneVideoEngineEnabled()).toBe(false)
    })
  })

  describe('PromptBridge 独立引擎优先 + 回退', () => {
    const savedPort = process.env.VIDEO_PROMPT_PORT
    afterEach(() => {
      if (savedPort === undefined) delete process.env.VIDEO_PROMPT_PORT
      else process.env.VIDEO_PROMPT_PORT = savedPort
      delete process.env.VIDEO_PROMPT_HOST
    })

    function makeBridge () {
      const bridge = new PromptBridge({ log: mockLog })
      bridge.ensureRunning = vi.fn(async () => {})
      bridge._post = vi.fn(async (path, body) => JSON.parse(body))
      bridge._postStandalone = vi.fn()
      return bridge
    }

    it('启用 8020 时走独立引擎 /v1/video/optimize（无 domain、含 output_language）', async () => {
      process.env.VIDEO_PROMPT_PORT = '8020'
      const bridge = makeBridge()
      bridge._postStandalone.mockResolvedValue({ optimized_prompt: 'ok', language: 'zh' })
      const res = await bridge.optimizeVideo('关羽白马之战', { platform: 'veo3' })
      expect(bridge._postStandalone).toHaveBeenCalledTimes(1)
      expect(bridge._post).not.toHaveBeenCalled()
      const [path, body] = bridge._postStandalone.mock.calls[0]
      expect(path).toBe('/v1/video/optimize')
      const parsed = JSON.parse(body)
      expect(parsed.domain).toBeUndefined()
      expect(parsed.platform).toBe('veo')
      // 语言路由：veo（国外模型）→ en，即使输入为中文（避免中文提示词发给 Veo）
      expect(parsed.output_language).toBe('en')
      expect(res.optimized_prompt).toBe('ok')
    })

    it('独立引擎不可用 → warning + 回退 8013 /v1/optimize（domain=video）', async () => {
      process.env.VIDEO_PROMPT_PORT = '8020'
      const bridge = makeBridge()
      bridge._postStandalone.mockRejectedValue(new Error('ECONNREFUSED'))
      const res = await bridge.optimizeVideo('a cat', { platform: 'kling-pro' })
      expect(bridge._postStandalone).toHaveBeenCalledTimes(1)
      expect(bridge._post).toHaveBeenCalledTimes(1)
      expect(bridge._post.mock.calls[0][0]).toBe('/v1/optimize')
      expect(res.domain).toBe('video')
      expect(res.platform).toBe('kling')
      expect(mockLog.warn).toHaveBeenCalled()
    })

    it('批量：8020 /v1/video/optimize/batch 优先（含 output_language），失败回退 8013 /v1/optimize/batch（无该字段）', async () => {
      process.env.VIDEO_PROMPT_PORT = '8020'
      const bridge = makeBridge()
      // 成功路径：8020 请求带 output_language 自动检测
      let standaloneBody
      bridge._postStandalone.mockImplementation(async (path, body) => {
        expect(path).toBe('/v1/video/optimize/batch')
        standaloneBody = JSON.parse(body)
        return [{ optimized_prompt: 'a' }, { optimized_prompt: 'b' }]
      })
      // 平台未指定（回退 generic_video，不在平台集合）→ 按文本逐条检测 zh/en
      const resOk = await bridge.optimizeVideosBatch(['关羽白马之战', 'a cat'])
      expect(standaloneBody.requests).toHaveLength(2)
      expect(standaloneBody.requests[0].output_language).toBe('zh')
      expect(standaloneBody.requests[1].output_language).toBe('en')
      expect(resOk).toHaveLength(2)
      // 回退路径：8013 请求 domain=video、无 output_language
      bridge._postStandalone.mockRejectedValue(new Error('timeout'))
      const res = await bridge.optimizeVideosBatch(['关羽白马之战', 'a cat'])
      expect(bridge._post.mock.calls[0][0]).toBe('/v1/optimize/batch')
      expect(res.requests).toHaveLength(2)
      expect(res.requests[0].domain).toBe('video')
      expect(res.requests[0].output_language).toBeUndefined()
      expect(res.requests[1].output_language).toBeUndefined()
      // 8013 零回归：回退请求不携带独立引擎新增字段（model/output_language）
      expect(res.requests[0].model).toBeUndefined()
    })

    it('未启用 8020 时直接走 8013（零回归）', async () => {
      delete process.env.VIDEO_PROMPT_PORT
      const bridge = makeBridge()
      const res = await bridge.optimizeVideo('a cat', { platform: 'veo3' })
      expect(bridge._postStandalone).not.toHaveBeenCalled()
      expect(bridge._post).toHaveBeenCalledTimes(1)
      expect(res.platform).toBe('veo')
    })
  })
})

describe('独立引擎语言路由（按目标平台，2026-08-12 增强）', () => {
  it('中文文案 + veo → en（平台集合覆盖文本检测，避免中文提示词发给国外模型）', () => {
    const req = buildStandaloneVideoOptimizeRequest('关羽白马之战，万军之中取上将首级', { platform: 'veo' })
    expect(req.output_language).toBe('en')
  })

  it('中文文案 + seedance → zh（国产模型中文优先）', () => {
    const req = buildStandaloneVideoOptimizeRequest('关羽白马之战，万军之中取上将首级', { platform: 'seedance' })
    expect(req.output_language).toBe('zh')
  })

  it('英文文案 + minimax → zh（国产模型强制中文，模型理解更强）', () => {
    const req = buildStandaloneVideoOptimizeRequest('a cat runs in the city', { platform: 'minimax' })
    expect(req.output_language).toBe('zh')
  })

  it('显式 output_language 覆盖平台映射（用户说了算）', () => {
    expect(buildStandaloneVideoOptimizeRequest('中文文案', { platform: 'veo', output_language: 'zh' }).output_language).toBe('zh')
    expect(buildStandaloneVideoOptimizeRequest('中文文案', { platform: 'seedance', outputLanguage: 'en' }).output_language).toBe('en')
  })

  it('平台别名归一后参与映射（veo3→veo→en、kling-v3→kling→zh）', () => {
    expect(buildStandaloneVideoOptimizeRequest('中文文案', { platform: 'veo3' }).output_language).toBe('en')
    expect(buildStandaloneVideoOptimizeRequest('a cat', { platform: 'kling-v3' }).output_language).toBe('zh')
  })

  it('通用网关 provider：model 关键词兜底（veo→en / hunyuan→zh）', () => {
    expect(buildStandaloneVideoOptimizeRequest('中文文案', { platform: 'openai_compat', model: 'veo-3.1' }).output_language).toBe('en')
    expect(buildStandaloneVideoOptimizeRequest('english text', { platform: 'openai_compat', model: 'hunyuan-video-pro' }).output_language).toBe('zh')
    expect(buildStandaloneVideoOptimizeRequest('中文文案', { platform: 'generic_video', modelName: 'runway-gen4' }).output_language).toBe('en')
  })

  it('未知平台 + 未知 model → 文本 CJK 检测兜底（现状不变）', () => {
    expect(buildStandaloneVideoOptimizeRequest('关羽白马之战', { platform: 'unknown', model: 'some-model' }).output_language).toBe('zh')
    expect(buildStandaloneVideoOptimizeRequest('a cat runs', { platform: 'unknown', model: 'some-model' }).output_language).toBe('en')
  })

  it('model 词边界匹配：swan-video 不命中 wan、wevideo 不命中 veo', () => {
    expect(buildStandaloneVideoOptimizeRequest('中文文案', { platform: 'unknown', model: 'swan-video' }).output_language).toBe('zh')
    expect(languageFromVideoModel('swan-video')).toBe('')
    expect(languageFromVideoModel('wevideo-pro')).toBe('')
    expect(languageFromVideoModel('veo-3.1')).toBe('en')
    expect(languageFromVideoModel('minimax-video-01')).toBe('zh')
  })

  it('model 非标量返回空（不误命中）', () => {
    expect(languageFromVideoModel({ name: 'veo' })).toBe('')
    expect(languageFromVideoModel(['veo'])).toBe('')
    expect(buildStandaloneVideoOptimizeRequest('a cat', { platform: 'unknown', model: { name: 'veo' } }).output_language).toBe('en')
  })

  it('平台与 model 冲突时平台恒胜（veo provider + 国产 model → en）', () => {
    expect(buildStandaloneVideoOptimizeRequest('中文文案', { platform: 'veo', model: 'hunyuan-video-pro' }).output_language).toBe('en')
  })

  it('model 同命中两组关键词时锁 en（en 优先判定，当前集合无交集）', () => {
    expect(languageFromVideoModel('minimax-veo-pro')).toBe('en')
  })

  it('languageFromVideoPlatform / languageFromVideoModel 单元', () => {
    expect(languageFromVideoPlatform('veo')).toBe('en')
    expect(languageFromVideoPlatform('seedance')).toBe('zh')
    expect(languageFromVideoPlatform('generic_video')).toBe('')
    expect(languageFromVideoPlatform('unknown')).toBe('')
    expect(languageFromVideoModel('runway-gen4')).toBe('en')
    expect(languageFromVideoModel('MiniMax-M2.7')).toBe('zh')
    expect(languageFromVideoModel('')).toBe('')
  })
})

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
  VIDEO_ENGINE_LIMITS,
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
  it('prev_final_frame 剥离：8013 兼容后端不携带（仅独立引擎 8020 消费，与 output_language/model 同先例）', () => {
    const req = buildVideoOptimizeRequest('x', { prev_final_frame: 'hero falls to the ground, sword drops beside him' })
    expect(req.prev_final_frame).toBeUndefined()
    const standalone = buildStandaloneVideoOptimizeRequest('x', { prev_final_frame: 'hero falls to the ground, sword drops beside him' })
    expect(standalone.prev_final_frame).toBe('hero falls to the ground, sword drops beside him')
  })

  it('prev_final_frame 非字符串/纯空白丢弃；超长按句截断（8020 归一）', () => {
    expect(buildStandaloneVideoOptimizeRequest('x', { prev_final_frame: 123 }).prev_final_frame).toBeUndefined()
    expect(buildStandaloneVideoOptimizeRequest('x', { prev_final_frame: '   ' }).prev_final_frame).toBeUndefined()
    expect(buildStandaloneVideoOptimizeRequest('x', { prev_final_frame: '' }).prev_final_frame).toBeUndefined()
    // 超 1000 上限：按最后一个句号截断（'abc. ' 段规整，1000 边界恰好句号+空格）
    const head = 'abc. '.repeat(300)
    const long = head + 'camera rests.'
    const req = buildStandaloneVideoOptimizeRequest('x', { prev_final_frame: long })
    expect(req.prev_final_frame.length).toBeLessThanOrEqual(1000)
    expect(req.prev_final_frame.endsWith('.')).toBe(true)
    // 1000 边界落在第二句中间时，必须回溯到第一句句末，而不是硬切断实体
    const firstSentence = 'hero lies beside the red door.'
    const midSentence = 'next sentence keeps describing the hero and a broken sword '.repeat(30)
    const req2 = buildStandaloneVideoOptimizeRequest('x', { prev_final_frame: firstSentence + ' ' + midSentence })
    expect(req2.prev_final_frame).toBe(firstSentence)
    // 单字符退化防护：head 以孤立句号开头且无其他句末标点时，不截到只剩标点
    const req3 = buildStandaloneVideoOptimizeRequest('x', { prev_final_frame: '。' + 'a'.repeat(2000) })
    expect(req3.prev_final_frame).toBe('。' + 'a'.repeat(999))
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

  it('将 PromptBridge 后端来源同步到顶层与 meta，未知来源显式降级', () => {
    const standalone = extractOptimizedVideoPrompt({
      optimized_prompt: 'plain',
      _prompt_engine_backend: 'standalone-8020',
    })
    expect(standalone.engine_source).toBe('standalone-8020')
    expect(standalone.meta.engine_source).toBe('standalone-8020')

    const legacy = extractOptimizedVideoPrompt({
      optimized_prompt: 'plain',
      _prompt_engine_backend: 'legacy-8013',
    })
    expect(legacy.engine_source).toBe('legacy-8013')
    expect(legacy.meta.engine_source).toBe('legacy-8013')

    const unknown = extractOptimizedVideoPrompt({ optimized_prompt: 'plain' })
    expect(unknown.engine_source).toBe('unknown')
    expect(unknown.meta.engine_source).toBe('unknown')
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

  it('positive_constraints 数组透传（lens-discipline）', () => {
    const r = extractOptimizedVideoPrompt({
      optimized_prompt: 'x',
      video: { positive_constraints: ['camera stays at ground level', 'all bodies distinct'] },
    })
    expect(r.ok).toBe(true)
    expect(r.video.positive_constraints).toEqual(['camera stays at ground level', 'all bodies distinct'])
  })

  it('positive_constraints 字符串按换行/分号拆分（双形态）', () => {
    const r = extractOptimizedVideoPrompt({
      optimized_prompt: 'x',
      video: { positive_constraints: 'a; b\nc' },
    })
    expect(r.video.positive_constraints).toEqual(['a', 'b', 'c'])
  })

  it('positive_constraints 越界收敛上限 10 条', () => {
    const many = Array.from({ length: 15 }, (_, i) => 'c' + i)
    const r = extractOptimizedVideoPrompt({ optimized_prompt: 'x', video: { positive_constraints: many } })
    expect(r.video.positive_constraints).toHaveLength(10)
  })

  it('final_frame 透传与超长裁剪', () => {
    const r = extractOptimizedVideoPrompt({ optimized_prompt: 'x', video: { final_frame: 'hero stands still, camera rests, no text' } })
    expect(r.video.final_frame).toBe('hero stands still, camera rests, no text')
    const long = 'a'.repeat(1100)
    const r2 = extractOptimizedVideoPrompt({ optimized_prompt: 'x', video: { final_frame: long } })
    expect(r2.video.final_frame).toHaveLength(1000)
  })

  it('新字段缺失时旧响应零回归（无 positive_constraints/final_frame 不拒绝）', () => {
    const r = extractOptimizedVideoPrompt({ optimized_prompt: 'x', video: { shot: 'wide', duration_hint: 5 } })
    expect(r.ok).toBe(true)
    expect(r.video.positive_constraints).toBeUndefined()
    expect(r.video.final_frame).toBeUndefined()
    expect(r.video.shot).toBe('wide')
  })

  it('8020 独立引擎响应新字段经 extractOptimizedVideoPrompt 透传（双后端共用路径）', () => {
    const r = extractOptimizedVideoPrompt({
      optimized_prompt: 'x',
      video: { positive_constraints: ['strict block'], final_frame: 'end' },
    })
    expect(r.video.positive_constraints).toEqual(['strict block'])
    expect(r.video.final_frame).toBe('end')
  })

  it('positive_constraints 数组含非字符串元素被丢弃（评审 W1）', () => {
    const r = extractOptimizedVideoPrompt({
      optimized_prompt: 'x',
      video: { positive_constraints: ['good', null, undefined, 42, { x: 1 }, ''] },
    })
    expect(r.video.positive_constraints).toEqual(['good'])
  })

  it('final_frame 非字符串/纯空白丢弃（评审 I1）', () => {
    const r = extractOptimizedVideoPrompt({ optimized_prompt: 'x', video: { final_frame: 123 } })
    expect(r.video.final_frame).toBeUndefined()
    const r2 = extractOptimizedVideoPrompt({ optimized_prompt: 'x', video: { final_frame: '   ' } })
    expect(r2.video.final_frame).toBeUndefined()

  })
  it('blocks 骨架回显：12 键白名单 + 值≤4000；非法键/非字符串丢弃（Round3 C）', () => {
    const r = extractOptimizedVideoPrompt({
      optimized_prompt: 'x',
      video: {
        blocks: {
          'SCENE NOTE': 'pickup from previous shot',
          CAMERA: 'low angle, slow push-in',
          'FINAL FRAME': 'hero kneels, rain soaks his coat',
          EVIL_KEY: 'dropped',
          SKIN: 42,
          '': 'blank key dropped',
        },
      },
    })
    expect(r.video.blocks).toEqual({
      'SCENE NOTE': 'pickup from previous shot',
      CAMERA: 'low angle, slow push-in',
      'FINAL FRAME': 'hero kneels, rain soaks his coat',
    })
    // 值超 4000 截断
    const huge = 'x'.repeat(4500)
    const r2 = extractOptimizedVideoPrompt({ optimized_prompt: 'x', video: { blocks: { CAMERA: huge } } })
    expect(r2.video.blocks.CAMERA).toHaveLength(4000)
    // 空/缺失 → 不回显
    const r3 = extractOptimizedVideoPrompt({ optimized_prompt: 'x', video: { blocks: {} } })
    expect(r3.video.blocks).toBeUndefined()
  })
})

describe('PromptBridge 视频方法', () => {
  function makeBridge () {
    const bridge = new PromptBridge({ log: mockLog })
    bridge.modelProviderManager = {
      getDefault: vi.fn(() => ({ id: 'sensenova-llm', name: 'SenseNova', base_url: 'https://token.sensenova.cn/v1', models: ['deepseek-v4-flash'] })),
      getProviderWithKey: vi.fn(() => ({ id: 'sensenova-llm', name: 'SenseNova', base_url: 'https://token.sensenova.cn/v1', models: ['deepseek-v4-flash'], api_key: 'sk-test' })),
    }
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
      expect(req.max_length).toBe(200) // 8020 ge=200，旧断言 50 会在引擎侧 422（评审 W1 修正）
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
      bridge.modelProviderManager = {
        getDefault: vi.fn(() => ({ id: 'sensenova-llm', name: 'SenseNova', base_url: 'https://token.sensenova.cn/v1', models: ['deepseek-v4-flash'] })),
        getProviderWithKey: vi.fn(() => ({ id: 'sensenova-llm', name: 'SenseNova', base_url: 'https://token.sensenova.cn/v1', models: ['deepseek-v4-flash'], api_key: 'sk-test' })),
      }
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
      expect(res._prompt_engine_backend).toBe('standalone-8020')
    })

    it('独立引擎不可用 → warning + 回退 8013 /v1/optimize（domain=video）', async () => {
      process.env.VIDEO_PROMPT_PORT = '8020'
      const bridge = makeBridge()
      bridge._postStandalone.mockRejectedValue(Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' }))
      const res = await bridge.optimizeVideo('a cat', { platform: 'kling-pro' })
      expect(bridge._postStandalone).toHaveBeenCalledTimes(1)
      expect(bridge._post).toHaveBeenCalledTimes(1)
      expect(bridge._post.mock.calls[0][0]).toBe('/v1/optimize')
      expect(res.domain).toBe('video')
      expect(res.platform).toBe('kling')
      expect(res._prompt_engine_backend).toBe('legacy-8013')
      expect(res._prompt_engine_fallback).toBe(true)
      expect(mockLog.warn).toHaveBeenCalled()
    })

    it('独立引擎 HTTP 502 不回退 8013 且保留结构化错误', async () => {
      process.env.VIDEO_PROMPT_PORT = '8020'
      const bridge = makeBridge()
      const responseBody = { detail: '视频模型账号余额不足', error_code: 'QUOTA_EXCEEDED' }
      bridge._postStandalone.mockRejectedValue(Object.assign(new Error('HTTP 502: 视频模型账号余额不足'), {
        name: 'PythonBridgeHttpError',
        isHttpError: true,
        statusCode: 502,
        detail: responseBody.detail,
        responseBody,
      }))
      bridge._post.mockClear()

      await expect(bridge.optimizeVideo('a cat', { platform: 'kling-pro' })).rejects.toMatchObject({
        statusCode: 502,
        detail: responseBody.detail,
        responseBody,
      })
      expect(bridge._post).not.toHaveBeenCalled()
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
      expect(resOk[0]).toMatchObject({ _prompt_engine_backend: 'standalone-8020' })
      expect(resOk[1]).toMatchObject({ _prompt_engine_backend: 'standalone-8020' })
      // 回退路径：8013 请求 domain=video、无 output_language
      bridge._postStandalone.mockRejectedValue(Object.assign(new Error('request timeout'), { code: 'ETIMEDOUT' }))
      const res = await bridge.optimizeVideosBatch(['关羽白马之战', 'a cat'])
      expect(bridge._post.mock.calls[0][0]).toBe('/v1/optimize/batch')
      expect(res.requests).toHaveLength(2)
      expect(res.requests[0].domain).toBe('video')
      expect(res.requests[0].output_language).toBeUndefined()
      expect(res.requests[1].output_language).toBeUndefined()
      // 8013 零回归：回退请求不携带独立引擎新增字段（model/output_language）
      expect(res.requests[0].model).toBeUndefined()
    })

    it('批量响应数组逐项保留 standalone / fallback 后端来源', async () => {
      process.env.VIDEO_PROMPT_PORT = '8020'
      const bridge = makeBridge()
      bridge._postStandalone.mockResolvedValue([{ optimized_prompt: 'standalone-1' }])
      const standalone = await bridge.optimizeVideosBatch(['scene one'])
      expect(standalone).toEqual([expect.objectContaining({
        optimized_prompt: 'standalone-1',
        _prompt_engine_backend: 'standalone-8020',
      })])

      bridge._postStandalone.mockRejectedValue(Object.assign(new Error('request timeout'), { code: 'ETIMEDOUT' }))
      bridge._post.mockResolvedValue([{ optimized_prompt: 'legacy-1' }])
      const fallback = await bridge.optimizeVideosBatch(['scene one'])
      expect(fallback).toEqual([expect.objectContaining({
        optimized_prompt: 'legacy-1',
        _prompt_engine_backend: 'legacy-8013',
        _prompt_engine_fallback: true,
      })])
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

describe('导演工作流字段收敛（video-prompt-higgsfield-mechanics）', () => {
  it('excluded_characters：去空白/大小写敏感去重/空串剔除', () => {
    const out = normalizeVideoMeta({ excluded_characters: ['JAX', ' jax ', ''] })
    expect(out.excluded_characters).toEqual(['JAX', 'jax'])
  })

  it('excluded_characters：字符串按 [\\n;,]+ 分割兼容', () => {
    const out = normalizeVideoMeta({ excluded_characters: 'JAX, Rein; JAX\nROKO' })
    expect(out.excluded_characters).toEqual(['JAX', 'Rein', 'ROKO'])
  })

  it('excluded_characters：对象非法丢弃、超限截断', () => {
    expect(normalizeVideoMeta({ excluded_characters: { a: 1 } }).excluded_characters).toBeUndefined()
    const many = normalizeVideoMeta({ excluded_characters: Array.from({ length: 15 }, (_, i) => 'C' + i) })
    expect(many.excluded_characters).toHaveLength(10)
  })

  it('no_swap_pairs：合法对透传', () => {
    const out = normalizeVideoMeta({ no_swap_pairs: [['ROKO', 'JAX']] })
    expect(out.no_swap_pairs).toEqual([['ROKO', 'JAX']])
  })

  it('no_swap_pairs：任一元素非法整对丢弃', () => {
    const out = normalizeVideoMeta({ no_swap_pairs: [['ROKO', 123], ['ROKO'], ['A', 'B']] })
    expect(out.no_swap_pairs).toEqual([['A', 'B']])
  })

  it('no_swap_pairs：超限截断到 5', () => {
    const out = normalizeVideoMeta({ no_swap_pairs: Array.from({ length: 8 }, (_, i) => ['A' + i, 'B' + i]) })
    expect(out.no_swap_pairs).toHaveLength(5)
  })

  it('color_ratio：合法格式透传', () => {
    expect(normalizeVideoMeta({ color_ratio: '60:30:10' }).color_ratio).toBe('60:30:10')
    expect(normalizeVideoMeta({ color_ratio: '999:1:7' }).color_ratio).toBe('999:1:7')
  })

  it('color_ratio：非法格式丢弃且缺失不填充', () => {
    expect(normalizeVideoMeta({ color_ratio: 'abc' }).color_ratio).toBeUndefined()
    expect(normalizeVideoMeta({ color_ratio: '60:30:10:5' }).color_ratio).toBeUndefined()
    expect(normalizeVideoMeta({ color_ratio: '0:30:10' }).color_ratio).toBeUndefined()
    expect(normalizeVideoMeta({ color_ratio: '60:0:10' }).color_ratio).toBeUndefined()
    expect(normalizeVideoMeta({}).color_ratio).toBeUndefined()
  })

  it('shots[]：合法多切与 beats 透传', () => {
    const shots = [
      { shot: 'wide', camera: 'push_in', duration: 5, beats: [{ time: '0.0-1.0s', action: 'A enters' }] },
      { shot: 'close_up', camera: 'static', duration: 10, beats: [{ time: 'BEAT 1 (0-1s)', action: 'B reacts' }] },
    ]
    const out = normalizeVideoMeta({ shots })
    expect(out.shots).toEqual(shots)
  })

  it('shots[]：超 3 切截断、duration 超限 clamp 15', () => {
    const shots = Array.from({ length: 5 }, (_, i) => ({ shot: 'wide', camera: 'static', duration: 20, beats: [] }))
    const out = normalizeVideoMeta({ shots })
    expect(out.shots).toHaveLength(3)
    expect(out.shots[0].duration).toBe(15)
  })

  it('shots[]：beats 先丢非法再取前 6', () => {
    const beats = [
      { time: '0-1s', action: 'a' },
      { time: '1-2s', action: '' },
      { time: '2-3s', action: 'b' },
      { time: '3-4s', action: 'c' },
      { time: '4-5s', action: 'd' },
      { time: '5-6s', action: 'e' },
      { time: '6-7s', action: 'f' },
    ]
    const out = normalizeVideoMeta({ shots: [{ shot: 'wide', camera: 'static', duration: 7, beats }] })
    expect(out.shots[0].beats).toHaveLength(6)
    expect(out.shots[0].beats[0].action).toBe('a')
    expect(out.shots[0].beats.map(b => b.action)).not.toContain('')
  })

  it('shots[]：单切局部非法整切丢弃、全非法无键', () => {
    const out1 = normalizeVideoMeta({ shots: [{ shot: '', camera: 'static', duration: 5, beats: [] }, { shot: 'wide', camera: 'pan', duration: 3, beats: [] }] })
    expect(out1.shots).toHaveLength(1)
    expect(out1.shots[0].camera).toBe('pan')
    const out2 = normalizeVideoMeta({ shots: [{ shot: 'wide', duration: 5, beats: [] }, { shot: 'x', camera: 'y', beats: 'bad' }] })
    expect(out2.shots).toBeUndefined()
  })

  it('shots[]：非法切不占 3 切上限（第 2 非法仍保留 1/3/4 切）', () => {
    const shots = [
      { shot: 'wide', camera: 'static', duration: 3, beats: [] },
      { shot: '', camera: 'pan', duration: 4, beats: [] },
      { shot: 'close_up', camera: 'push_in', duration: 5, beats: [] },
      { shot: 'aerial', camera: 'drone', duration: 6, beats: [] },
    ]
    const out = normalizeVideoMeta({ shots })
    expect(out.shots.map(s => s.shot)).toEqual(['wide', 'close_up', 'aerial'])
  })

  it('shots[]：duration 非数字/0/负数整切丢弃', () => {
    const out = normalizeVideoMeta({ shots: [
      { shot: 'a', camera: 'static', duration: 'abc', beats: [] },
      { shot: 'b', camera: 'static', duration: 0, beats: [] },
      { shot: 'c', camera: 'static', duration: -1, beats: [] },
      { shot: 'd', camera: 'pan', duration: 2, beats: [] },
    ] })
    expect(out.shots).toHaveLength(1)
    expect(out.shots[0].shot).toBe('d')
  })

  it('shots[]：beats 非对象元素丢弃，不中断整切', () => {
    const out = normalizeVideoMeta({ shots: [{
      shot: 'wide',
      camera: 'static',
      duration: 5,
      beats: ['junk', null, 42, { time: '0-1s', action: 'ok' }],
    }] })
    expect(out.shots[0].beats).toEqual([{ time: '0-1s', action: 'ok' }])
  })

  it('零回归：无新字段时输出与既有字段一致', () => {
    const out = normalizeVideoMeta({ shot: 'wide', camera: 'drone', motion_intensity: 7, scene_transition: 'cut', continuity_token: 'tok', duration_hint: 5 })
    expect(Object.keys(out).sort()).toEqual(['camera', 'continuity_token', 'duration_hint', 'motion_intensity', 'scene_transition', 'shot'])
  })
})

describe('appendVideoTrailer 与平台画像', () => {
  const { PLATFORM_VIDEO_PROFILES, getVideoProfile, appendVideoTrailer } = require('./video-prompt-engine-contract')

  it('seedance 画像四键', () => {
    expect(PLATFORM_VIDEO_PROFILES.seedance).toEqual({ duration: 15, aspect: '21:9', resolution: '1080p', audio: true })
  })

  it('未登记平台回退 generic 四键', () => {
    expect(getVideoProfile('not-a-platform')).toEqual({ duration: 15, aspect: '16:9', resolution: '1080p', audio: false })
  })

  it('默认参数行追加且原字符串不可变', () => {
    const src = 'A hero walks.'
    const out = appendVideoTrailer(src, {})
    expect(out).toBe('A hero walks. Photoreal. NON-IP. 16:9. 15s. SFX only.')
    expect(src).toBe('A hero walks.')
  })

  it('options 覆盖 aspect/duration/audio/nonIp', () => {
    const out = appendVideoTrailer('x', { aspect: '21:9', duration: 10, audio: 'Music', nonIp: false })
    expect(out).toContain('Photoreal. 21:9. 10s. Music only.')
    expect(out).not.toContain('NON-IP')
  })

  it('幂等：已含 NON-IP 不重复追加', () => {
    const src = 'A hero walks. Photoreal. NON-IP. 16:9. 15s. SFX only.'
    expect(appendVideoTrailer(src, {})).toBe(src)
  })

  it('幂等判据词边界：xenon-ip 等子串不误判已含标记（对齐引擎 append_trailer）', () => {
    const out = appendVideoTrailer('xenon-ip contamination in the air', {})
    expect(out).toContain('NON-IP')
  })

  it('duration 整数化对齐引擎 build_tail：5.5 → 5s', () => {
    const out = appendVideoTrailer('x', { duration: 5.5 })
    expect(out).toContain('5s.')
    expect(out).not.toContain('5.5s.')
  })

  it('超长截断保 NON-IP 无残缺段', () => {
    const out = appendVideoTrailer('x'.repeat(95), { maxLength: 100 })
    expect(out.endsWith('NON-IP')).toBe(true)
    expect(out).not.toMatch(/\{\w+\}/)
    expect(out).not.toMatch(/\d+s\.\s*$/)
  })
})

describe('结构完整性校验（截断前）', () => {
  it('声明 excluded_characters 但正文无标记 → 失败', () => {
    const r = extractOptimizedVideoPrompt({ optimized_prompt: 'JAX stands alone', video: { excluded_characters: ['JAX'] } })
    expect(r.ok).toBe(false)
    expect(r.error).toContain('excluded_characters')
  })

  it('仅声明 no_swap_pairs 同样校验', () => {
    const r = extractOptimizedVideoPrompt({ optimized_prompt: 'plain text', video: { no_swap_pairs: [['ROKO', 'JAX']] } })
    expect(r.ok).toBe(false)
    expect(r.error).toContain('no_swap_pairs')
  })

  it('声明与正文一致（[ABSENT] 标记）→ 通过', () => {
    const r = extractOptimizedVideoPrompt({ optimized_prompt: 'hero walks. [ABSENT] JAX stays off-frame', video: { excluded_characters: ['JAX'] } })
    expect(r.ok).toBe(true)
    expect(r.video.excluded_characters).toEqual(['JAX'])
  })

  it('no_swap_pairs 声明且正文含 [ABSENT] 标记（引擎合规输出）→ 通过', () => {
    const r = extractOptimizedVideoPrompt({ optimized_prompt: 'hero walks. [ABSENT] ROKO replaced by JAX', video: { no_swap_pairs: [{ from: 'ROKO', to: 'JAX' }] } })
    expect(r.ok).toBe(true)
    expect(r.video.no_swap_pairs).toEqual([['ROKO', 'JAX']])
  })

  it('no_swap_pairs 引擎对象形态 {from,to} → 收敛为规范二元组', () => {
    const out = normalizeVideoMeta({ no_swap_pairs: [{ from: 'ROKO', to: 'JAX' }, { from: 'A', to: '' }, { from: 1, to: 'B' }, ['C', 'D']] })
    expect(out.no_swap_pairs).toEqual([['ROKO', 'JAX'], ['C', 'D']])
  })

  it('超长截断不误杀：标记在截断区外，校验基于截断前文本', () => {
    const prompt = 'a'.repeat(79) + ' [ABSENT] JAX'
    const r = extractOptimizedVideoPrompt({ optimized_prompt: prompt, video: { excluded_characters: ['JAX'] } }, { maxLength: 80 })
    expect(r.ok).toBe(true)
    expect(r.prompt.length).toBe(80)
    expect(r.truncated).toBe(true)
    expect(r.prompt).not.toContain('[ABSENT]')
  })

  it('未声明新字段零回归：无标记也通过', () => {
    const r = extractOptimizedVideoPrompt({ optimized_prompt: 'plain prompt without markers' })
    expect(r.ok).toBe(true)
  })
})

describe('精修层 max_length 层级语义（R6，按后端能力门控）', () => {
  it('8013：creative_level ≥ 7 未显式传 → 收敛到能力上限 2000', () => {
    const req = buildVideoOptimizeRequest('director shot', { creative_level: 8 })
    expect(req.max_length).toBe(2000)
  })

  it('8020：creative_level ≥ 7 未显式传 → 精修层默认 5000（能力上限 40000 内，不随边界上浮）', () => {
    const req = buildStandaloneVideoOptimizeRequest('director shot', { creative_level: 8 })
    expect(req.max_length).toBe(5000)
  })

  it('creative_level < 7 未显式传 → 8013 保持 500（零回归）', () => {
    expect(buildVideoOptimizeRequest('a cat', { creative_level: 5 }).max_length).toBe(500)
  })

  it('creative_level < 7 未显式传 → 8020 对齐引擎默认 1800（batch 层 100 词下界可达）', () => {
    expect(buildStandaloneVideoOptimizeRequest('a cat', { creative_level: 5 }).max_length).toBe(1800)
  })

  it('显式值优先于层级默认（8013 能力范围内）', () => {
    const req = buildVideoOptimizeRequest('x', { creative_level: 9, max_length: 1500 })
    expect(req.max_length).toBe(1500)
  })

  it('显式值超上限收敛（8013 → 2000 / 8020 → 40000，精修层 5000 词模板预算放行）', () => {
    expect(buildVideoOptimizeRequest('x', { max_length: 99999 }).max_length).toBe(2000)
    expect(buildVideoOptimizeRequest('x', { max_length: 3000 }).max_length).toBe(2000)
    expect(buildStandaloneVideoOptimizeRequest('x', { max_length: 99999 }).max_length).toBe(40000)
    // 精修层真实长模板预算（≈22871 字符导演分镜单）：范围内透传 / 超 videoMaxLengthMax=40000 收敛
    expect(buildStandaloneVideoOptimizeRequest('x', { creative_level: 8, max_length: 18000 }).max_length).toBe(18000)
    expect(buildStandaloneVideoOptimizeRequest('x', { creative_level: 8, max_length: 22000 }).max_length).toBe(22000)
    expect(buildStandaloneVideoOptimizeRequest('x', { creative_level: 8, max_length: 30000 }).max_length).toBe(30000)
    // I3 精确边界：恰好等于上限透传；数字字符串形态走 isExplicit 路径
    expect(buildStandaloneVideoOptimizeRequest('x', { max_length: 40000 }).max_length).toBe(40000)
    expect(buildStandaloneVideoOptimizeRequest('x', { max_length: '18000' }).max_length).toBe(18000)
  })

  it('W2 锚点加锁：videoMaxLengthMax 与 standalone.max 同步（防死锚点漂移）', () => {
    expect(VIDEO_ENGINE_LIMITS.videoMaxLengthRanges.standalone.max).toBe(VIDEO_ENGINE_LIMITS.videoMaxLengthMax)
    expect(VIDEO_ENGINE_LIMITS.videoMaxLengthRanges.standalone.min).toBe(200)
    expect(VIDEO_ENGINE_LIMITS.videoMaxLengthRanges.legacy.max).toBe(2000)
  })

  it('8020 min 边界修复：显式 10 → 200（8020 ge=200）', () => {
    expect(buildStandaloneVideoOptimizeRequest('x', { max_length: 10 }).max_length).toBe(200)
  })

  it('8020：850 字符长 prompt 精修层真实构建 → max_length=5000 且正文不截断', () => {
    const longPrompt = 'A cinematic establishing shot of a ruined city at dusk, embers drifting across broken towers, a lone warrior walking toward the camera, dust and smoke swirling, golden rim light on the horizon, camera slowly dolly-in, dramatic orchestral atmosphere, ' + 'detail texture and volumetric fog, '.repeat(30)
    expect(longPrompt.length).toBeGreaterThan(800)
    const req = buildStandaloneVideoOptimizeRequest(longPrompt, { creative_level: 8 })
    expect(req.max_length).toBe(5000)
    expect(req.prompt).toBe(longPrompt.trim())  // 契约层按 String().trim() 归一
  })

  it('null/空串/纯空白视为未显式传（精修层默认生效）', () => {
    expect(buildVideoOptimizeRequest('x', { creative_level: 8, max_length: null }).max_length).toBe(2000)
    expect(buildVideoOptimizeRequest('x', { creative_level: 8, max_length: '' }).max_length).toBe(2000)
    expect(buildVideoOptimizeRequest('x', { creative_level: 8, max_length: '  ' }).max_length).toBe(2000)
    expect(buildStandaloneVideoOptimizeRequest('x', { creative_level: 8, max_length: '  ' }).max_length).toBe(5000)
  })
})

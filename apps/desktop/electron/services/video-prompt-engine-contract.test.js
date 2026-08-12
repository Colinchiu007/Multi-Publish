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
    expect(bridge._post).toHaveBeenCalledWith('/v1/optimize/batch', expect.any(String))
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

// @vitest-environment node
const PromptBridge = require('./prompt-bridge')

/**
 * 模拟桌面「模型设置」的默认 LLM（含明文 key，解密由 manager 完成）。
 */
function mockLlmManager () {
  return {
    getDefault: vi.fn(() => ({ id: 'sensenova-llm', name: 'SenseNova', base_url: 'https://token.sensenova.cn/v1', models: ['deepseek-v4-flash'] })),
    getProviderWithKey: vi.fn(() => ({ id: 'sensenova-llm', name: 'SenseNova', base_url: 'https://token.sensenova.cn/v1', models: ['deepseek-v4-flash'], api_key: 'sk-test' })),
  }
}

describe('PromptBridge prompt-engine 请求兼容', () => {
  it('批量优化会省略空的可选字段，并把文本上下文转换为 synopsis 对象', async () => {
    const bridge = new PromptBridge({})
    bridge.isRunning = true
    bridge._post = vi.fn(() => Promise.resolve({ code: 0, data: [] }))

    const request = {
      prompt: '城市夜景',
      style: 'realistic',
      creative_level: 1,
      max_length: null,
      context: '一个发生在未来城市的故事',
    }
    await bridge.optimizeBatch([request])

    expect(request).toEqual({
      prompt: '城市夜景',
      style: 'realistic',
      creative_level: 1,
      max_length: null,
      context: '一个发生在未来城市的故事',
    })
    const body = JSON.parse(bridge._post.mock.calls[0][1])
    expect(body.requests[0]).toEqual({
      prompt: '城市夜景',
      style: 'realistic',
      creative_level: 1,
      context: { synopsis: '一个发生在未来城市的故事' },
    })
    expect(body.requests[0]).not.toHaveProperty('max_length')
  })

  it('单个优化同样不会发送 null max_length 或空 context', async () => {
    const bridge = new PromptBridge({})
    bridge.isRunning = true
    bridge._post = vi.fn(() => Promise.resolve({ code: 0, data: {} }))

    await bridge.optimize({ prompt: '山间日出', creative_level: 1, max_length: null, context: '' })

    const body = JSON.parse(bridge._post.mock.calls[0][1])
    expect(body).toEqual({ prompt: '山间日出', creative_level: 1 })
  })

  it('optimize 透传 traceId 且 body 不含 traceId（R1/R3）', async () => {
    const bridge = new PromptBridge({})
    bridge.isRunning = true
    bridge._post = vi.fn(() => Promise.resolve({ code: 0, data: {} }))

    await bridge.optimize({ prompt: '城市夜景', style: 'realistic', creative_level: 1 }, 'run_9')

    expect(bridge._post.mock.calls[0][3]).toBe('run_9')
    const body = JSON.parse(bridge._post.mock.calls[0][1])
    expect(body).toEqual({ prompt: '城市夜景', style: 'realistic', creative_level: 1 })
    expect(body).not.toHaveProperty('traceId')
  })

  it('optimizeVideo 从 options 提取 traceId（字符串 + 对象双形态，R1）', async () => {
    const bridge = new PromptBridge({})
    bridge.isRunning = true
    bridge.modelProviderManager = mockLlmManager()
    bridge._post = vi.fn(() => Promise.resolve({ code: 0, data: {} }))

    await bridge.optimizeVideo('a cat', { platform: 'veo3', traceId: 'run_7' })
    expect(bridge._post.mock.calls[0][3]).toBe('run_7')
    const body = JSON.parse(bridge._post.mock.calls[0][1])
    expect(body).not.toHaveProperty('traceId')
    expect(body.llm).toEqual({
      provider: 'sensenova',
      model: 'deepseek-v4-flash',
      base_url: 'https://token.sensenova.cn/v1',
      api_key: 'sk-test',
    })
    expect(body.caller).toBe('multi-publish-desktop')

    await bridge.optimizeVideo({ prompt: 'b dog', platform: 'kling-pro', traceId: 'run_8' })
    expect(bridge._post.mock.calls[1][3]).toBe('run_8')
    const body2 = JSON.parse(bridge._post.mock.calls[1][1])
    expect(body2).not.toHaveProperty('traceId')
    expect(body2.llm.provider).toBe('sensenova')
    expect(body2.caller).toBe('multi-publish-desktop')
  })

  it('单个和批量优化对非对象输入使用相同的 prompt 兼容规则', async () => {
    const bridge = new PromptBridge({})
    bridge.isRunning = true
    bridge.modelProviderManager = mockLlmManager()
    bridge._post = vi.fn(() => Promise.resolve({ code: 0, data: {} }))

    await bridge.optimize(42)
    await bridge.optimizeBatch([42])

    const single = JSON.parse(bridge._post.mock.calls[0][1])
    expect(single.prompt).toBe('42')
    expect(single.llm.provider).toBe('sensenova')
    expect(single.caller).toBe('multi-publish-desktop')
    expect(JSON.parse(bridge._post.mock.calls[1][1])).toEqual({
      requests: [{
        prompt: '42',
        llm: {
          provider: 'sensenova',
          model: 'deepseek-v4-flash',
          base_url: 'https://token.sensenova.cn/v1',
          api_key: 'sk-test',
        },
        caller: 'multi-publish-desktop',
      }],
    })
  })
  it('发送前归一平台/风格别名（cinematic/dall-e/stable-diffusion），空 style 不发送', async () => {
    const bridge = new PromptBridge({})
    bridge.isRunning = true
    bridge._post = vi.fn(() => Promise.resolve({ code: 0, data: {} }))

    await bridge.optimize({ prompt: '城市夜景', platform: 'dall-e', style: 'cinematic', creative_level: 1 })
    await bridge.optimize({ prompt: '另一个', platform: 'stable-diffusion', style: '', creative_level: 1 })

    expect(JSON.parse(bridge._post.mock.calls[0][1])).toEqual({
      prompt: '城市夜景',
      platform: 'dalle',
      style: 'photography',
      creative_level: 1,
    })
    expect(JSON.parse(bridge._post.mock.calls[1][1])).toEqual({
      prompt: '另一个',
      platform: 'stable_diffusion',
      creative_level: 1,
    })
  })

  it('context 对象含敏感凭据键时 bridge 拒绝发送（纵深防御）', async () => {
    const bridge = new PromptBridge({})
    bridge.isRunning = true
    bridge._post = vi.fn(() => Promise.resolve({ code: 0, data: {} }))

    await expect(bridge.optimize({ prompt: 'x', context: { api_key: 'secret' } }))
      .rejects.toThrow(/敏感凭据/)
    expect(bridge._post).not.toHaveBeenCalled()
  })
})

describe('PromptBridge BYOK llm 注入', () => {
  it('resolveLlmBind：sensenova-llm 映射引擎 sensenova 并携带桌面配置的 base_url/api_key/model', () => {
    const bridge = new PromptBridge({})
    bridge.modelProviderManager = mockLlmManager()
    expect(bridge.resolveLlmBind()).toEqual({
      provider: 'sensenova',
      model: 'deepseek-v4-flash',
      base_url: 'https://token.sensenova.cn/v1',
      api_key: 'sk-test',
    })
  })

  it('resolveLlmBind：deepseek 直接映射引擎 deepseek', () => {
    const bridge = new PromptBridge({})
    bridge.modelProviderManager = {
      getDefault: vi.fn(() => ({ id: 'deepseek', name: 'DeepSeek', models: ['deepseek-v4-flash'] })),
      getProviderWithKey: vi.fn(() => ({ id: 'deepseek', models: ['deepseek-v4-flash'], api_key: 'sk-ds' })),
    }
    expect(bridge.resolveLlmBind()).toEqual({
      provider: 'deepseek',
      model: 'deepseek-v4-flash',
      api_key: 'sk-ds',
    })
  })

  it('resolveLlmBind：其余 OpenAI 兼容供应商一律映射 openai_compat', () => {
    const bridge = new PromptBridge({})
    bridge.modelProviderManager = {
      getDefault: vi.fn(() => ({ id: 'openrouter', name: 'OpenRouter', base_url: 'https://openrouter.ai/api/v1', models: ['claude-sonnet'] })),
      getProviderWithKey: vi.fn(() => ({ id: 'openrouter', base_url: 'https://openrouter.ai/api/v1', models: ['claude-sonnet'], api_key: 'sk-or' })),
    }
    expect(bridge.resolveLlmBind()).toEqual({
      provider: 'openai_compat',
      model: 'claude-sonnet',
      base_url: 'https://openrouter.ai/api/v1',
      api_key: 'sk-or',
    })
  })

  it('resolveLlmBind：多模态默认 LLM 按 capability_models.llm 路由（不取 models[0] TTS 模型）', () => {
    const bridge = new PromptBridge({})
    bridge.modelProviderManager = {
      getDefault: vi.fn(() => ({ id: 'minimax-multimodal', name: 'MiniMax 多模态', models: ['speech-2.8-turbo', 'image-01', 'MiniMax-Hailuo-2.3', 'MiniMax-M2.7'] })),
      getProviderWithKey: vi.fn(() => ({
        id: 'minimax-multimodal',
        base_url: 'https://api.minimax.chat/v1',
        models: ['speech-2.8-turbo', 'image-01', 'MiniMax-Hailuo-2.3', 'MiniMax-M2.7'],
        capability_models: { llm: 'MiniMax-M2.7', tts: 'speech-2.8-turbo', image: 'image-01', video: 'MiniMax-Hailuo-2.3' },
        api_key: 'sk-minimax',
      })),
    }
    expect(bridge.resolveLlmBind()).toEqual({
      provider: 'openai_compat',
      model: 'MiniMax-M2.7',
      base_url: 'https://api.minimax.chat/v1',
      api_key: 'sk-minimax',
    })
  })

  it('resolveLlmBind：多模态 provider 无 capability_models.llm 时回退 models 首个有效模型', () => {
    const bridge = new PromptBridge({})
    bridge.modelProviderManager = {
      getDefault: vi.fn(() => ({ id: 'minimax-multimodal', name: 'MiniMax 多模态', models: ['MiniMax-M2.7'] })),
      getProviderWithKey: vi.fn(() => ({
        id: 'minimax-multimodal',
        models: ['MiniMax-M2.7'],
        capability_models: { tts: 'speech-2.8-turbo' },
        api_key: 'sk-minimax',
      })),
    }
    expect(bridge.resolveLlmBind().model).toBe('MiniMax-M2.7')
  })

  it('resolveLlmBind：无 modelProviderManager 时 fail-closed 抛错', () => {
    const bridge = new PromptBridge({})
    expect(() => bridge.resolveLlmBind()).toThrow(/模型服务未就绪/)
  })

  it('resolveLlmBind：未配置默认 LLM 时抛错引导配置', () => {
    const bridge = new PromptBridge({})
    bridge.modelProviderManager = { getDefault: vi.fn(() => null), getProviderWithKey: vi.fn(() => null) }
    expect(() => bridge.resolveLlmBind()).toThrow(/未配置默认文字推理模型/)
  })

  it('resolveLlmBind：默认 LLM 缺 API Key 时抛错', () => {
    const bridge = new PromptBridge({})
    bridge.modelProviderManager = {
      getDefault: vi.fn(() => ({ id: 'sensenova-llm', name: 'SenseNova', models: ['deepseek-v4-flash'] })),
      getProviderWithKey: vi.fn(() => ({ id: 'sensenova-llm', models: ['deepseek-v4-flash'], api_key: '' })),
    }
    expect(() => bridge.resolveLlmBind()).toThrow(/未配置 API Key/)
  })

  it('resolveLlmBind：默认 LLM 无可用模型时抛错', () => {
    const bridge = new PromptBridge({})
    bridge.modelProviderManager = {
      getDefault: vi.fn(() => ({ id: 'sensenova-llm', models: [] })),
      getProviderWithKey: vi.fn(() => ({ id: 'sensenova-llm', models: [], api_key: 'sk-x' })),
    }
    expect(() => bridge.resolveLlmBind()).toThrow(/未配置可用模型/)
  })

  it('optimize：creative_level>3 注入 llm/caller；无默认 LLM 时拒绝', async () => {
    const bridge = new PromptBridge({})
    bridge.isRunning = true
    bridge.modelProviderManager = mockLlmManager()
    bridge._post = vi.fn(() => Promise.resolve({ code: 0, data: {} }))

    await bridge.optimize({ prompt: 'a majestic cat', platform: 'generic', creative_level: 5 })
    const body = JSON.parse(bridge._post.mock.calls[0][1])
    expect(body.llm.provider).toBe('sensenova')
    expect(body.llm.api_key).toBe('sk-test')
    expect(body.caller).toBe('multi-publish-desktop')

    const bare = new PromptBridge({})
    bare.isRunning = true
    bare._post = vi.fn(() => Promise.resolve({ code: 0, data: {} }))
    await expect(bare.optimize({ prompt: 'x', platform: 'generic', creative_level: 5 }))
      .rejects.toThrow(/模型服务未就绪/)
    expect(bare._post).not.toHaveBeenCalled()
  })

  it('optimize：creative_level<=3 模板直出免 LLM，不注入绑定', async () => {
    const bridge = new PromptBridge({})
    bridge.isRunning = true
    bridge.modelProviderManager = mockLlmManager()
    bridge._post = vi.fn(() => Promise.resolve({ code: 0, data: {} }))

    await bridge.optimize({ prompt: 'a cat', platform: 'generic', creative_level: 1 })
    const body = JSON.parse(bridge._post.mock.calls[0][1])
    expect(body).not.toHaveProperty('llm')
    expect(body).not.toHaveProperty('caller')
  })

  it('optimizeBatch：任一条需要 LLM 时全部注入同一绑定', async () => {
    const bridge = new PromptBridge({})
    bridge.isRunning = true
    bridge.modelProviderManager = mockLlmManager()
    bridge._post = vi.fn(() => Promise.resolve({ code: 0, data: [] }))

    await bridge.optimizeBatch([
      { prompt: 'template', platform: 'generic', creative_level: 1 },
      { prompt: 'scene', domain: 'video', platform: 'generic_video', creative_level: 5 },
    ])
    const body = JSON.parse(bridge._post.mock.calls[0][1])
    expect(body.requests[0].llm.provider).toBe('sensenova')
    expect(body.requests[0].caller).toBe('multi-publish-desktop')
    expect(body.requests[1].llm.provider).toBe('sensenova')
  })

  it('optimizeVideosBatch：legacy 8013 分支每条注入 llm/caller', async () => {
    const bridge = new PromptBridge({})
    bridge.isRunning = true
    bridge.modelProviderManager = mockLlmManager()
    bridge._post = vi.fn(() => Promise.resolve({ code: 0, data: [] }))

    await bridge.optimizeVideosBatch(['scene one', { prompt: 'scene two', platform: 'kling-pro' }])
    const body = JSON.parse(bridge._post.mock.calls[0][1])
    expect(body.requests).toHaveLength(2)
    for (const req of body.requests) {
      expect(req.llm.provider).toBe('sensenova')
      expect(req.caller).toBe('multi-publish-desktop')
    }
  })
})

// @ts-check
/**
 * BasePythonBridge 单元测试
 *
 * 测试策略：mock http 和 child_process，验证基类生命周期逻辑
 * 不实际 spawn 进程或发起网络请求
 */
'use strict'

// Mock logger
__registerMock('../services/logger', {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
})

const { BasePythonBridge } = require('./base-python-bridge')

/**
 * 创建测试用子类实例（不依赖环境变量）
 */
function createTestBridge (overrides) {
  const config = {
    name: 'TestBridge',
    pythonModule: 'test_app.api',
    port: 9999,
    host: '127.0.0.1',
    workDir: '/tmp/test',
    log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    requestTimeout: 5000,
    ...overrides,
  }
  return new BasePythonBridge(config)
}

describe('BasePythonBridge — 构造函数', () => {
  it('1. 正确初始化所有属性', () => {
    const b = createTestBridge()
    expect(b.name).toBe('TestBridge')
    expect(b.pythonModule).toBe('test_app.api')
    expect(b.port).toBe(9999)
    expect(b.host).toBe('127.0.0.1')
    expect(b.workDir).toBe('/tmp/test')
    expect(b.requestTimeout).toBe(5000)
    expect(b.process).toBe(null)
    expect(b.isRunning).toBe(false)
    expect(b.restartCount).toBe(0)
    expect(b.watchdogTimer).toBe(null)
    expect(b.restartTimer).toBe(null)
  })

  it('2. 缺少 log 时回退到 logger 模块', () => {
    const b = new BasePythonBridge({
      name: 'T', pythonModule: 't', port: 1, host: 'h', workDir: '/d',
    })
    expect(b.log).toBeDefined()
    expect(typeof b.log.info).toBe('function')
  })

  it('3. 缺少 requestTimeout 时默认 30000', () => {
    const b = new BasePythonBridge({
      name: 'T', pythonModule: 't', port: 1, host: 'h', workDir: '/d',
      log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    })
    expect(b.requestTimeout).toBe(30000)
  })
})

describe('BasePythonBridge — start()', () => {
  it('4. isRunning=true 时直接返回（不重复启动）', async () => {
    const b = createTestBridge()
    b.isRunning = true
    b._launchProcess = vi.fn()
    b._waitForHealthy = vi.fn()
    b._startWatchdog = vi.fn()
    await b.start()
    expect(b._launchProcess).not.toHaveBeenCalled()
  })

  it('4a. 健康的外部服务存在时附加而不重复 spawn', async () => {
    const b = createTestBridge()
    b.attach = vi.fn(() => Promise.resolve(true))
    b._launchProcess = vi.fn()
    b._waitForHealthy = vi.fn()
    b._startWatchdog = vi.fn()

    await b.start()

    expect(b.attach).toHaveBeenCalledTimes(1)
    expect(b._launchProcess).not.toHaveBeenCalled()
    expect(b._waitForHealthy).not.toHaveBeenCalled()
    expect(b._startWatchdog).toHaveBeenCalledTimes(1)
  })
})

describe('BasePythonBridge — attach()', () => {
  it('5. isRunning=true 时直接返回 true', async () => {
    const b = createTestBridge()
    b.isRunning = true
    const result = await b.attach()
    expect(result).toBe(true)
  })

  it('6. healthCheck 成功时设置 isRunning=true', async () => {
    const b = createTestBridge()
    b.healthCheck = vi.fn(() => Promise.resolve(true))
    const result = await b.attach()
    expect(result).toBe(true)
    expect(b.isRunning).toBe(true)
  })

  it('7. healthCheck 失败时返回 false 且 isRunning 保持 false', async () => {
    const b = createTestBridge()
    b.healthCheck = vi.fn(() => Promise.resolve(false))
    const result = await b.attach()
    expect(result).toBe(false)
    expect(b.isRunning).toBe(false)
  })
})

describe('BasePythonBridge — _post()', () => {
  it('8. isRunning=false 时调用 ensureRunning 尝试懒启动', async () => {
    const b = createTestBridge()
    b.ensureRunning = vi.fn(() => Promise.reject(new Error('lazy-start failed')))
    await expect(b._post('/test', '{}')).rejects.toThrow('lazy-start failed')
    expect(b.ensureRunning).toHaveBeenCalledTimes(1)
  })

  it('8a. isRunning=false 但懒启动成功后正常发请求', async () => {
    const b = createTestBridge()
    // ensureRunning 成功后设置 isRunning=true
    b.ensureRunning = vi.fn(async () => { b.isRunning = true })
    // mock http
    const http = require('http')
    const mockReq = { on: vi.fn(), write: vi.fn(), end: vi.fn(), destroy: vi.fn() }
    const mockRes = { on: vi.fn((ev, cb) => { if (ev === 'end') setTimeout(cb, 0) }) }
    const origRequest = http.request
    http.request = vi.fn((opts, cb) => { setTimeout(() => cb(mockRes), 0); return mockReq })
    try {
      const result = await b._post('/test', '{"a":1}')
      expect(b.ensureRunning).toHaveBeenCalledTimes(1)
      expect(b.isRunning).toBe(true)
      expect(mockReq.write).toHaveBeenCalled()
    } finally { http.request = origRequest }
  })

  it('9. isRunning=true 时发起 HTTP 请求（mock http）', async () => {
    const b = createTestBridge()
    b.isRunning = true
    // mock http.request
    const http = require('http')
    const mockReq = {
      on: vi.fn(),
      write: vi.fn(),
      end: vi.fn(),
      destroy: vi.fn(),
    }
    const mockRes = {
      on: vi.fn((event, cb) => {
        if (event === 'end') setTimeout(() => cb(), 0)
      }),
    }
    const origRequest = http.request
    http.request = vi.fn((opts, cb) => {
      setTimeout(() => cb(mockRes), 0)
      return mockReq
    })
    try {
      const result = await b._post('/test', '{"a":1}')
      expect(http.request).toHaveBeenCalled()
      expect(mockReq.write).toHaveBeenCalledWith('{"a":1}')
      expect(mockReq.end).toHaveBeenCalled()
    } finally {
      http.request = origRequest
    }
  })
})

  it('11a. traceId 存在时写 X-Request-Id 头并记 traceId 日志（R1）', async () => {
    const b = createTestBridge()
    b.isRunning = true
    const http = require('http')
    const mockReq = { on: vi.fn(), write: vi.fn(), end: vi.fn(), destroy: vi.fn() }
    const mockRes = { on: vi.fn((event, cb) => { if (event === 'end') setTimeout(() => cb(), 0) }) }
    const origRequest = http.request
    let reqOpts
    http.request = vi.fn((opts, cb) => { reqOpts = opts; setTimeout(() => cb(mockRes), 0); return mockReq })
    try {
      await b._post('/test', '{"a":1}', undefined, 'run_123_abcd')
      expect(reqOpts.headers['X-Request-Id']).toBe('run_123_abcd')
      expect(reqOpts.headers['Content-Type']).toBe('application/json')
      expect(b.log.info).toHaveBeenCalledWith('TestBridge', 'POST /test traceId=run_123_abcd')
    } finally { http.request = origRequest }
  })

  it('11b. 未提供 traceId 时不写 X-Request-Id 头也不记 traceId 日志（R1 无头态）', async () => {
    const b = createTestBridge()
    b.isRunning = true
    const http = require('http')
    const mockReq = { on: vi.fn(), write: vi.fn(), end: vi.fn(), destroy: vi.fn() }
    const mockRes = { on: vi.fn((event, cb) => { if (event === 'end') setTimeout(() => cb(), 0) }) }
    const origRequest = http.request
    let reqOpts
    http.request = vi.fn((opts, cb) => { reqOpts = opts; setTimeout(() => cb(mockRes), 0); return mockReq })
    try {
      await b._post('/test', '{"a":1}')
      expect(reqOpts.headers['X-Request-Id']).toBeUndefined()
      expect(b.log.info).not.toHaveBeenCalledWith('TestBridge', expect.stringContaining('traceId='))
    } finally { http.request = origRequest }
  })

describe('BasePythonBridge — stop()', () => {
  it('10. process=null 时直接返回', async () => {
    const b = createTestBridge()
    await b.stop()
    expect(b.isRunning).toBe(false)
  })

  it('10a. 停止已附加的外部服务时清理本地运行状态', async () => {
    const b = createTestBridge()
    b.isRunning = true
    b.watchdogTimer = setTimeout(() => {}, 100000)

    await b.stop()

    expect(b.process).toBe(null)
    expect(b.isRunning).toBe(false)
    expect(b.watchdogTimer).toBe(null)
  })

  it('11. stop 清理状态（process/isRunning/watchdog）', async () => {
    const b = createTestBridge()
    b.process = { pid: 12345, kill: vi.fn() }
    b.isRunning = true
    b.watchdogTimer = setTimeout(() => {}, 100000)
    b.restartTimer = setTimeout(() => {}, 100000)
    // mock spawnSync 避免 Windows taskkill 实际执行
    const childProcess = require('child_process')
    const origSpawnSync = childProcess.spawnSync
    childProcess.spawnSync = vi.fn()
    try {
      await b.stop()
      expect(b.process).toBe(null)
      expect(b.isRunning).toBe(false)
      expect(b.watchdogTimer).toBe(null)
      expect(b.restartTimer).toBe(null)
    } finally {
      childProcess.spawnSync = origSpawnSync
    }
  })
})

describe('BasePythonBridge — ensureRunning() 懒启动', () => {
  it('17. isRunning=true 时直接返回不尝试启动', async () => {
    const b = createTestBridge()
    b.isRunning = true
    b.start = vi.fn()
    await b.ensureRunning()
    expect(b.start).not.toHaveBeenCalled()
  })

  it('18. isRunning=false 时调用 start() 并重置 restartCount', async () => {
    const b = createTestBridge()
    b.isRunning = false
    b.restartCount = 3
    b.start = vi.fn(async () => { b.isRunning = true })
    await b.ensureRunning()
    expect(b.start).toHaveBeenCalledTimes(1)
    expect(b.restartCount).toBe(0)
    expect(b.isRunning).toBe(true)
  })

  it('19. start() 失败时抛出异常并设置 _starting=null', async () => {
    const b = createTestBridge()
    b.isRunning = false
    b.start = vi.fn(() => Promise.reject(new Error('spawn failed')))
    await expect(b.ensureRunning()).rejects.toThrow('spawn failed')
    expect(b._starting).toBe(null)
  })

  it('20. 并发调用共享同一个 _starting Promise', async () => {
    const b = createTestBridge()
    b.isRunning = false
    let resolveStart
    b.start = vi.fn(() => new Promise(r => { resolveStart = r }))
    const p1 = b.ensureRunning()
    const p2 = b.ensureRunning()
    // 两个调用共享同一个 _starting
    resolveStart()
    b.isRunning = true
    await Promise.all([p1, p2])
    // start 只被调用一次
    expect(b.start).toHaveBeenCalledTimes(1)
  })

  it('21. _post 中 lazy-start 失败时错误消息包含 lazy-start failed', async () => {
    const b = createTestBridge()
    b.isRunning = false
    b.start = vi.fn(() => Promise.reject(new Error('ModuleNotFoundError')))
    await expect(b._post('/test', '{}')).rejects.toThrow('lazy-start failed')
  })
})

describe('BasePythonBridge — 子类继承验证', () => {
  it('12. SplitterBridge 继承 BasePythonBridge 且有 split 方法', () => {
    const SplitterBridge = require('./splitter-bridge')
    const b = new SplitterBridge({})
    expect(b instanceof BasePythonBridge).toBe(true)
    expect(b.name).toBe('SplitterBridge')
    expect(b.pythonModule).toBe('splitter.api.rest_api')
    expect(typeof b.split).toBe('function')
    expect(typeof b.start).toBe('function')
    expect(typeof b.stop).toBe('function')
    expect(typeof b.attach).toBe('function')
    expect(typeof b.healthCheck).toBe('function')
  })

  it('13. PromptBridge 继承 BasePythonBridge 且有 optimize/optimizeBatch 方法', () => {
    const PromptBridge = require('./prompt-bridge')
    const b = new PromptBridge({})
    expect(b instanceof BasePythonBridge).toBe(true)
    expect(b.name).toBe('PromptBridge')
    expect(b.pythonModule).toBe('prompt_engine.api')
    expect(typeof b.optimize).toBe('function')
    expect(typeof b.optimizeBatch).toBe('function')
    expect(typeof b.start).toBe('function')
    expect(typeof b.stop).toBe('function')
    expect(typeof b.attach).toBe('function')
    expect(typeof b.healthCheck).toBe('function')
  })

  it('14. SplitterBridge.split 调用 ensureRunning + _post 并传递正确路径', async () => {
    const SplitterBridge = require('./splitter-bridge')
    const b = new SplitterBridge({})
    b.isRunning = true
    b.ensureRunning = vi.fn(async () => {})
    b._post = vi.fn(() => Promise.resolve({ ok: true }))
    await b.split('hello world')
    expect(b.ensureRunning).toHaveBeenCalled()
    expect(b._post).toHaveBeenCalledWith('/v1/split', expect.any(String), undefined, undefined)
    const body = b._post.mock.calls[0][1]
    expect(JSON.parse(body).text).toBe('hello world')
  })

  function mockLlmManager () {
    return {
      getDefault: vi.fn(() => ({ id: 'sensenova-llm', name: 'SenseNova', base_url: 'https://token.sensenova.cn/v1', models: ['deepseek-v4-flash'] })),
      getProviderWithKey: vi.fn(() => ({ id: 'sensenova-llm', name: 'SenseNova', base_url: 'https://token.sensenova.cn/v1', models: ['deepseek-v4-flash'], api_key: 'sk-test' })),
    }
  }

  it('15. PromptBridge.optimize 调用 ensureRunning + _post 并传递正确路径', async () => {
    const PromptBridge = require('./prompt-bridge')
    const b = new PromptBridge({})
    b.modelProviderManager = mockLlmManager()
    b.isRunning = true
    b.ensureRunning = vi.fn(async () => {})
    b._post = vi.fn(() => Promise.resolve({ ok: true }))
    await b.optimize({ prompt: 'a cat' })
    expect(b.ensureRunning).toHaveBeenCalled()
    expect(b._post).toHaveBeenCalledWith('/v1/optimize', expect.any(String), undefined, undefined)
    const body = b._post.mock.calls[0][1]
    expect(JSON.parse(body).prompt).toBe('a cat')
  })

  it('15b. PromptBridge.optimize 空/纯推理错误不触发 CLI 兜底，透传 error 供回退原文', async () => {
    const PromptBridge = require('./prompt-bridge')
    const b = new PromptBridge({})
    b.modelProviderManager = mockLlmManager()
    b.isRunning = true
    b.ensureRunning = vi.fn(async () => {})
    b._post = vi.fn(() => Promise.reject(new Error('LLM调用失败: LLM 返回了空内容或仅包含推理内容，未生成有效优化词')))
    b._cliFallbackSingle = vi.fn(async () => ({ shouldNotReach: true }))
    const result = await b.optimize({ prompt: 'a cat' })
    expect(b._cliFallbackSingle).not.toHaveBeenCalled()
    expect(result.error).toMatch(/空内容|仅包含推理内容|未生成有效优化词/)
  })

  it('15c. PromptBridge.optimize 其他 HTTP 错误仍走 CLI 兜底', async () => {
    const PromptBridge = require('./prompt-bridge')
    const b = new PromptBridge({})
    b.modelProviderManager = mockLlmManager()
    b.isRunning = true
    b.ensureRunning = vi.fn(async () => {})
    b._post = vi.fn(() => Promise.reject(new Error('ECONNREFUSED 127.0.0.1:8013')))
    b._cliFallbackSingle = vi.fn(async () => ({ optimized_prompt: 'cli result' }))
    const result = await b.optimize({ prompt: 'a cat' })
    expect(b._cliFallbackSingle).toHaveBeenCalled()
    expect(result.optimized_prompt).toBe('cli result')
  })

  it('16. PromptBridge.optimizeBatch 标准化字符串数组为对象数组', async () => {
    const PromptBridge = require('./prompt-bridge')
    const b = new PromptBridge({})
    b.modelProviderManager = mockLlmManager()
    b.isRunning = true
    b.ensureRunning = vi.fn(async () => {})
    b._post = vi.fn(() => Promise.resolve({ ok: true }))
    await b.optimizeBatch(['prompt1', 'prompt2'])
    const body = b._post.mock.calls[0][1]
    const parsed = JSON.parse(body)
    expect(parsed.requests.map(r => r.prompt)).toEqual(['prompt1', 'prompt2'])
    // BYOK：批量请求统一注入调用方默认 LLM 绑定 + caller 标识
    expect(parsed.requests[0]).toMatchObject({
      llm: { provider: 'sensenova', model: 'deepseek-v4-flash', api_key: 'sk-test', caller: 'multi-publish-desktop' },
    })
  })

  // ─── 回归测试：PromptBridge 启动命令正确性 ──────────────
  it('13b. PromptBridge pythonModule 指向可启动的包路径', () => {
    const PromptBridge = require('./prompt-bridge')
    const b = new PromptBridge({})
    // pythonModule 必须是支持 python -m 启动的包路径
    // 不应是 .rest 这种无 __main__ 的子模块
    expect(b.pythonModule).toBe('prompt_engine.api')
    expect(b.pythonModule).not.toContain('.rest')
  })

  it('13c. SplitterBridge pythonModule 保持不变', () => {
    const SplitterBridge = require('./splitter-bridge')
    const b = new SplitterBridge({})
    expect(b.pythonModule).toBe('splitter.api.rest_api')
  })

})

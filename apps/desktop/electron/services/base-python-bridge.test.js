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
  it('8. isRunning=false 时 reject', async () => {
    const b = createTestBridge()
    await expect(b._post('/test', '{}')).rejects.toThrow('TestBridge is not running')
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

describe('BasePythonBridge — stop()', () => {
  it('10. process=null 时直接返回', async () => {
    const b = createTestBridge()
    await b.stop()
    expect(b.isRunning).toBe(false)
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

  it('14. SplitterBridge.split 调用 _post 并传递正确路径', async () => {
    const SplitterBridge = require('./splitter-bridge')
    const b = new SplitterBridge({})
    b.isRunning = true
    b._post = vi.fn(() => Promise.resolve({ ok: true }))
    await b.split('hello world')
    expect(b._post).toHaveBeenCalledWith('/v1/split', expect.any(String))
    const body = b._post.mock.calls[0][1]
    expect(JSON.parse(body).text).toBe('hello world')
  })

  it('15. PromptBridge.optimize 调用 _post 并传递正确路径', async () => {
    const PromptBridge = require('./prompt-bridge')
    const b = new PromptBridge({})
    b.isRunning = true
    b._post = vi.fn(() => Promise.resolve({ ok: true }))
    await b.optimize({ prompt: 'a cat' })
    expect(b._post).toHaveBeenCalledWith('/v1/optimize', expect.any(String))
    const body = b._post.mock.calls[0][1]
    expect(JSON.parse(body).prompt).toBe('a cat')
  })

  it('16. PromptBridge.optimizeBatch 标准化字符串数组为对象数组', async () => {
    const PromptBridge = require('./prompt-bridge')
    const b = new PromptBridge({})
    b.isRunning = true
    b._post = vi.fn(() => Promise.resolve({ ok: true }))
    await b.optimizeBatch(['prompt1', 'prompt2'])
    const body = b._post.mock.calls[0][1]
    const parsed = JSON.parse(body)
    expect(parsed.requests).toEqual([{ prompt: 'prompt1' }, { prompt: 'prompt2' }])
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
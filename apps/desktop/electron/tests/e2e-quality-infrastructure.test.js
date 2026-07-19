// @ts-check
import { afterEach, describe, expect, it, vi } from 'vitest'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'

const e2eRunner = require('../../tests/e2e/helpers/run-all')
const routeSuite = require('../../tests/e2e/helpers/route-functional-suite')
const integrationFlows = require('../../tests/e2e/helpers/integration-flows')
const { FunctionalRunner } = require('../../tests/e2e/helpers/functional-runner')

const desktopRoot = path.resolve(__dirname, '../..')
const projectRoot = path.resolve(desktopRoot, '../..')
const fixturePath = path.join(desktopRoot, 'tests/e2e/fixtures/model-providers.json')
const accountFixturePath = path.join(desktopRoot, 'tests/e2e/fixtures/accounts.json')
const ipcMockPath = path.join(desktopRoot, 'tests/e2e/helpers/ipc-mock.js')

function makeReport() {
  return {
    checks: { total: 1, passed: 1, failed: 0 },
    consoleErrors: [],
    pageErrors: [],
  }
}

function loadProviderMock() {
  const modelProviders = JSON.parse(fs.readFileSync(fixturePath, 'utf8'))
  const sandbox = {
    window: { __fixtures: { modelProviders } },
    console,
    Date,
    Promise,
    setTimeout,
    clearTimeout,
  }
  vm.createContext(sandbox)
  vm.runInContext(fs.readFileSync(ipcMockPath, 'utf8'), sandbox)
  return sandbox.window
}

describe('E2E 统一入口门禁', () => {
  afterEach(() => {
    delete process.env.E2E_CONCURRENCY
  })

  it.each(['abc', '0', '-1', '1.5', 'Infinity'])('拒绝非法或非正并发值 %s', (value) => {
    expect(() => e2eRunner.parseConcurrency(value)).toThrow(/E2E_CONCURRENCY/)
  })

  it.each(['1', '2', '18'])('接受正整数并发值 %s', (value) => {
    expect(e2eRunner.parseConcurrency(value)).toBe(Number(value))
  })

  it('未配置并发值时默认串行，避免多浏览器重复刷新耗尽资源', () => {
    expect(e2eRunner.parseConcurrency()).toBe(1)
  })

  it('执行器不会绕过非法并发配置', async () => {
    process.env.E2E_CONCURRENCY = '0'
    await expect(e2eRunner.runWithConcurrency(['home'], vi.fn())).rejects.toThrow(/E2E_CONCURRENCY/)
  })

  it('未知运行模式必须在入口失败', async () => {
    expect(() => e2eRunner.validateMode('typo')).toThrow(/未知 E2E 模式/)
    await expect(e2eRunner.main('typo')).rejects.toThrow(/未知 E2E 模式/)
  })

  it('空执行结果和预期数量不符必须失败', () => {
    expect(e2eRunner.hasFailures({}, 1)).toBe(true)
    expect(e2eRunner.hasFailures({ home: makeReport() }, 2)).toBe(true)
    expect(e2eRunner.hasFailures({ home: makeReport() }, 1)).toBe(false)
  })

  it('各执行模式声明固定的预期报告数量', () => {
    expect(e2eRunner.expectedResultCount('routes')).toBe(18)
    expect(e2eRunner.expectedResultCount('flows')).toBe(6)
    expect(e2eRunner.expectedResultCount('all')).toBe(24)
    expect(e2eRunner.expectedResultCount('report')).toBe(0)
  })
})

describe('根脚本入口门禁', () => {
  it('源代码测试文件不得被 .gitignore 静默排除', () => {
    const ignoredFiles = execFileSync(
      'git',
      [
        'ls-files', '--others', '--ignored', '--exclude-standard', '--',
        ':(glob)apps/desktop/electron/**/*.test.js',
        ':(glob)apps/desktop/src/**/*.test.js',
        ':(glob)apps/desktop/tests/**/*.test.js',
        ':(glob)packages/*/src/**/*.test.js',
        ':(glob)packages/*/test/**/*.test.js',
        ':(glob)packages/*/tests/**/*.test.js',
      ],
      { cwd: projectRoot, encoding: 'utf8' },
    )
      .split(/\r?\n/)
      .filter(Boolean)

    expect(ignoredFiles).toEqual([])
  })

  it('package.json 中直接调用的 Node 脚本必须真实存在', () => {
    const packageJson = JSON.parse(fs.readFileSync(path.join(projectRoot, 'package.json'), 'utf8'))
    const missing = []

    for (const [name, command] of Object.entries(packageJson.scripts || {})) {
      const matches = command.matchAll(/(?:^|&&|\|\|)\s*node\s+([^\s&|]+\.js)/g)
      for (const match of matches) {
        const relativePath = match[1].replace(/^['"]|['"]$/g, '')
        if (!fs.existsSync(path.resolve(projectRoot, relativePath))) {
          missing.push({ name, relativePath })
        }
      }
    }

    expect(missing).toEqual([])
  })

  it('桌面测试脚本引用的 Vitest 配置必须真实存在', () => {
    const packageJson = JSON.parse(fs.readFileSync(path.join(desktopRoot, 'package.json'), 'utf8'))
    const missing = []

    for (const [name, command] of Object.entries(packageJson.scripts || {})) {
      const matches = command.matchAll(/(?:--config|-c)\s+([^\s&|]+\.js)/g)
      for (const match of matches) {
        const relativePath = match[1].replace(/^['"]|['"]$/g, '')
        if (!fs.existsSync(path.resolve(desktopRoot, relativePath))) {
          missing.push({ name, relativePath })
        }
      }
    }

    expect(missing).toEqual([])
  })

  it('循环依赖门禁不得吞掉失败退出码', () => {
    const packageJson = JSON.parse(fs.readFileSync(path.join(projectRoot, 'package.json'), 'utf8'))

    expect(packageJson.scripts['check:circular']).not.toMatch(/\|\||non-blocking|WARN/)
  })

  it('依赖检查门禁不得吞掉失败退出码', () => {
    const packageJson = JSON.parse(fs.readFileSync(path.join(projectRoot, 'package.json'), 'utf8'))

    expect(packageJson.scripts['check:deps']).not.toMatch(/\|\||non-blocking|WARN/)
  })

  it.each(['build.yml', 'electron-ci.yml'])('%s 的依赖检查失败必须阻止流水线', (workflow) => {
    const source = fs.readFileSync(path.join(projectRoot, '.github/workflows', workflow), 'utf8')
    const dependencyStep = source.match(/- name: Dependency check[\s\S]*?(?=\n\s+- name:|$)/)?.[0] || ''

    expect(dependencyStep).not.toContain('continue-on-error')
    expect(dependencyStep).toContain('npm run check:deps')
  })
})

describe('覆盖率与变异测试门禁', () => {
  it('Stryker 使用 Windows 兼容的原地模式并覆盖核心重构文件', () => {
    const config = JSON.parse(fs.readFileSync(path.join(projectRoot, 'stryker.conf.json'), 'utf8'))

    expect(config.inPlace).toBe(true)
    expect(config.mutate).toEqual(expect.arrayContaining([
      'apps/desktop/electron/core/**/*.js',
      'apps/desktop/electron/bootstrap/**/*.js',
      'apps/desktop/electron/bootstrap.js',
      'apps/desktop/electron/main.js',
      'apps/desktop/electron/window.js',
      'apps/desktop/electron/shutdown.js',
      'packages/shared-utils/src/scheduler.js',
      '!**/*.test.js',
      '!**/*.spec.js',
    ]))
  })

  it('Stryker 专用配置不再排除已经验证可运行的有效测试套件', () => {
    const configSource = fs.readFileSync(path.join(desktopRoot, 'vitest.stryker.config.js'), 'utf8')
    const validSuites = [
      'ai-generator.test.js',
      'api-platform-adapter.test.js',
      'composition-manager.test.js',
      'pipeline-engine.test.js',
      'service-bus-plugin-registry.test.js',
      'stage-executor-publish.test.js',
      'stage-executor.test.js',
      'video-engine.test.js',
    ]

    for (const suite of validSuites) expect(configSource).not.toContain(`electron/tests/${suite}`)
  })
})

describe('路由通用扫描', () => {
  it('合法重定向按目标路由等待应用就绪', async () => {
    const runner = new FunctionalRunner()
    runner.page = { goto: vi.fn().mockResolvedValue(undefined) }
    runner.waitForAppReady = vi.fn().mockResolvedValue(undefined)

    await runner.goto('/create/pipeline', { expectedRoute: '/create' })

    expect(runner.waitForAppReady).toHaveBeenCalledWith('/create')
  })

  it('重置路由使用唯一地址完成且仅完成一次全页导航', async () => {
    const runner = new FunctionalRunner()
    runner.goto = vi.fn().mockResolvedValue(undefined)
    runner.waitForAppReady = vi.fn().mockResolvedValue(undefined)
    runner.page = {
      goto: vi.fn().mockResolvedValue(undefined),
      reload: vi.fn().mockResolvedValue(undefined),
    }

    await runner.resetToRoute('/create/pipeline', { expectedRoute: '/create' })

    expect(runner.goto).not.toHaveBeenCalled()
    expect(runner.page.goto).toHaveBeenCalledWith(
      'http://127.0.0.1:5174/?__e2e_reset=1#/create/pipeline',
      { waitUntil: 'domcontentloaded', timeout: 20000 },
    )
    expect(runner.page.reload).not.toHaveBeenCalled()
    expect(runner.waitForAppReady).toHaveBeenCalledWith('/create')
  })

  it('扫描任何控件前先完整重置到定义路由', async () => {
    const emptyCollection = {
      evaluateAll: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
    }
    const r = {
      checks: [],
      goto: vi.fn().mockResolvedValue(undefined),
      resetToRoute: vi.fn().mockResolvedValue(undefined),
      page: { locator: vi.fn(() => emptyCollection) },
    }

    await routeSuite.auditInitialControls(r, { route: '/accounts' })

    expect(r.resetToRoute).toHaveBeenCalledWith('/accounts', { expectedRoute: '/accounts' })
    expect(r.page.locator.mock.invocationCallOrder[0]).toBeGreaterThan(r.resetToRoute.mock.invocationCallOrder[0])
  })

  it('每个初始按钮都在重置后的页面状态中单独执行', async () => {
    const button = {
      count: vi.fn().mockResolvedValue(1),
      isDisabled: vi.fn().mockResolvedValue(false),
      click: vi.fn().mockResolvedValue(undefined),
    }
    const buttons = {
      evaluateAll: vi.fn().mockResolvedValue([{ index: 0, text: '打开弹窗', disabled: false }]),
      filter: vi.fn().mockReturnValue({ nth: vi.fn().mockReturnValue(button) }),
    }
    const emptyCollection = {
      evaluateAll: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
    }
    const r = {
      checks: [],
      goto: vi.fn().mockResolvedValue(undefined),
      resetToRoute: vi.fn().mockResolvedValue(undefined),
      page: {
        locator: vi.fn((selector) => selector === '.cohere-main button' ? buttons : emptyCollection),
      },
    }

    await routeSuite.auditInitialControls(r, { route: '/accounts' })

    expect(r.resetToRoute).toHaveBeenCalledWith('/accounts', { expectedRoute: '/accounts' })
    expect(button.click).toHaveBeenCalledTimes(1)
  })

  it('任一初始可编辑字段失败时扫描失败并保留字段详情', async () => {
    const descriptors = [
      { index: 0, tag: 'input', type: 'text', visible: true, disabled: false, placeholder: '标题', name: 'title', testid: 'title' },
      { index: 1, tag: 'textarea', type: '', visible: true, disabled: false, placeholder: '正文', name: 'content', testid: 'content' },
    ]
    const fields = [
      { fill: vi.fn().mockResolvedValue(undefined) },
      { fill: vi.fn().mockRejectedValue(new Error('字段被遮挡')) },
    ]
    const collection = {
      evaluateAll: vi.fn().mockResolvedValue(descriptors),
      nth: vi.fn((index) => fields[index]),
    }
    const r = {
      checks: [],
      page: { locator: vi.fn(() => collection) },
    }

    const result = await routeSuite.auditInitialFields(r)

    expect(result.passed).toBe(false)
    expect(result.details).toMatchObject({ fieldCount: 2, editableCount: 2, exercised: 1 })
    expect(result.details.failures).toEqual([
      expect.objectContaining({ index: 1, type: '', placeholder: '正文', error: '字段被遮挡' }),
    ])
    expect(r.checks.at(-1)).toMatchObject({
      name: '全部初始可编辑表单字段完成输入扫描',
      passed: false,
    })
  })
})

describe('模型服务商 E2E 契约', () => {
  it('fixture 和创建响应全面使用 snake_case', async () => {
    const modelProviders = JSON.parse(fs.readFileSync(fixturePath, 'utf8'))
    for (const provider of modelProviders.providers) {
      expect(Object.keys(provider).every((key) => /^[a-z][a-z0-9_]*$/.test(key))).toBe(true)
      expect(provider).not.toHaveProperty('createdAt')
      expect(provider).not.toHaveProperty('isDefault')
      expect(provider).not.toHaveProperty('isPreset')
    }

    const mockWindow = loadProviderMock()
    const response = await mockWindow.electronAPI.modelProviderCreate({
      name: '自定义服务商',
      category: 'llm',
      base_url: 'https://example.com/v1',
      api_key: 'sk-test',
    })

    expect(response.code).toBe(0)
    expect(response.data).toMatchObject({ is_default: false, is_preset: false })
    expect(response.data.created_at).toEqual(expect.any(String))
    expect(Object.keys(response.data).every((key) => /^[a-z][a-z0-9_]*$/.test(key))).toBe(true)
    expect(response.data).not.toHaveProperty('isDefault')
    expect(response.data).not.toHaveProperty('createdAt')
  })

  it('设为默认后重读列表时只有目标服务商是默认项', async () => {
    const mockWindow = loadProviderMock()

    await mockWindow.electronAPI.modelProviderSetDefault('llm', 'preset_anthropic')
    const response = await mockWindow.electronAPI.modelProviderList('llm')
    const defaults = response.data.filter((provider) => provider.is_default)

    expect(defaults).toHaveLength(1)
    expect(defaults[0].id).toBe('preset_anthropic')
    const presets = await mockWindow.electronAPI.modelProviderPresets('llm')
    expect(presets.data.length).toBeGreaterThan(0)
    expect(presets.data.every((provider) => provider.is_preset)).toBe(true)
  })

  it('Flow 3 根据重读列表验证唯一默认项', async () => {
    const r = makeFlow3Runner({
      providers: [
        { id: 'preset_openai', category: 'llm', is_default: true },
        { id: 'preset_anthropic', category: 'llm', is_default: true },
      ],
      configuredCalls: 1,
    })

    await integrationFlows.flows['flow-3'].exercise(r)

    expect(r.checks.find((check) => check.name.includes('唯一默认服务商'))).toMatchObject({ passed: false })
  })

  it('Flow 3 的 AI 配置检查不能在零次 IPC 调用时硬编码通过', async () => {
    const r = makeFlow3Runner({
      providers: [{ id: 'preset_anthropic', category: 'llm', is_default: true }],
      configuredCalls: 0,
    })

    await integrationFlows.flows['flow-3'].exercise(r)

    expect(r.checks.find((check) => check.name.includes('AI 服务商'))).toMatchObject({ passed: false })
  })

  it('Flow 3 等待 AI 面板可见和配置 IPC 后通过正常路径', async () => {
    const r = makeFlow3Runner({
      providers: [{ id: 'preset_anthropic', category: 'llm', is_default: true }],
      configuredCalls: 1,
    })

    await integrationFlows.flows['flow-3'].exercise(r)

    expect(r.checks.find((check) => check.name.includes('AI 写作面板'))).toMatchObject({
      passed: true,
      details: { aiPanelOpened: true, aiPanelVisible: true },
    })
    expect(r.checks.find((check) => check.name.includes('AI 服务商'))).toMatchObject({ passed: true })
  })
})

describe('账号 E2E 契约', () => {
  it('账号 fixture 全面使用 snake_case 时间字段', () => {
    const accounts = JSON.parse(fs.readFileSync(accountFixturePath, 'utf8')).accounts

    expect(accounts.length).toBeGreaterThan(0)
    for (const account of accounts) {
      expect(account).toHaveProperty('created_at')
      expect(account).not.toHaveProperty('createdAt')
    }
  })

  it('新增账号响应与生产序列化字段一致', async () => {
    const mockWindow = loadProviderMock()
    const response = await mockWindow.electronAPI.accountAdd('weibo')

    expect(response).toMatchObject({ code: 0 })
    expect(response.data).toHaveProperty('created_at')
    expect(response.data).not.toHaveProperty('createdAt')
  })
})

describe('平台定义 E2E 契约', () => {
  it('IPC mock 与生产 platform:definitions 返回结构一致', async () => {
    const mockWindow = loadProviderMock()
    const response = await mockWindow.electronAPI.getPlatformDefinitions()

    expect(response).toMatchObject({
      code: 0,
      data: {
        names: expect.any(Object),
        icons: expect.any(Object),
        content_categories: expect.any(Object),
      },
    })
    expect(response.data.names.wechat_mp).toBe('微信公众号')
    expect(response.data.icons.douyin).toBe('🎵')
  })
})

function makeFlow3Runner({ providers, configuredCalls }) {
  const clickable = {
    count: vi.fn().mockResolvedValue(1),
    isVisible: vi.fn().mockResolvedValue(true),
    click: vi.fn().mockResolvedValue(undefined),
  }
  const page = {
    evaluate: vi.fn(async (callback) => {
      const source = String(callback)
      if (source.includes('modelProviderSetDefault')) return { code: 0 }
      if (source.includes('modelProviderList')) return { code: 0, data: providers }
      return null
    }),
    locator: vi.fn((selector) => {
      if (selector === '.provider-card') return { count: vi.fn().mockResolvedValue(1) }
      if (selector === 'body') return { innerText: vi.fn().mockResolvedValue('AI 辅助写作') }
      return { first: vi.fn(() => clickable) }
    }),
  }
  return {
    page,
    checks: [],
    goto: vi.fn().mockResolvedValue(undefined),
    waitForTimeout: vi.fn().mockResolvedValue(undefined),
    getIpcCalls: vi.fn(async (method) => {
      if (method === 'modelProviderSetDefault') return 1
      if (method === 'modelProviderIsConfigured') return configuredCalls
      if (method === 'aiListProviders') return configuredCalls
      return 0
    }),
  }
}

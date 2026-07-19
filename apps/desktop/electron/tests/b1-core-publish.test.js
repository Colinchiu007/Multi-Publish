import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const testDir = path.dirname(fileURLToPath(import.meta.url))
const specPath = path.resolve(testDir, '../../tests/e2e/specs/b1-core-publish.js')

describe('B1 核心发布 E2E runner', () => {
  it('仅在命令行入口执行，并导出 main、run 与发布场景', () => {
    const source = fs.readFileSync(specPath, 'utf8')

    expect(source).toContain('if (require.main === module)')
    expect(source).toMatch(/module\.exports\s*=\s*\{[^}]*main[^}]*run[^}]*testPublish/s)
  })
})

const { main, run, testPublish } = require(specPath)

function passingReport(overrides = {}) {
  return {
    checks: { total: 1, passed: 1, failed: 0 },
    consoleErrors: [],
    pageErrors: [],
    ...overrides,
  }
}

function createLifecycleRunner(report = passingReport(), overrides = {}) {
  return {
    launch: vi.fn(async () => {}),
    generateReport: vi.fn(() => report),
    saveReport: vi.fn(() => 'b1-report.json'),
    close: vi.fn(async () => {}),
    ...overrides,
  }
}

const quietLogger = {
  log: vi.fn(),
  error: vi.fn(),
}

function createPublishRunner(options = {}) {
  const state = {
    filled: {},
    ipcCalls: [],
    publishClicks: 0,
    selectedPlatform: false,
    failNextPublish: false,
    result: null,
    expectedTexts: [],
  }

  function locatorFor(selector) {
    const locator = {
      first() {
        return locator
      },
      async count() {
        return selector.includes('label.cohere-toggle') ? 0 : 1
      },
      async click() {
        if (selector.includes('.el-checkbox-group .el-checkbox')) {
          state.selectedPlatform = true
          return
        }
        if (!selector.includes('button:has-text("一键发布")')) return

        state.publishClicks += 1
        if (options.incrementPublishCalls !== false) {
          const payload = {
            title: state.filled['input[placeholder="请输入文章标题"]'],
            content: state.filled['.article-editor .ql-editor'],
          }
          if (options.cyclicPayload === true) payload.self = payload
          state.ipcCalls.push({ method: 'publishBatch', args: [['wechat_mp'], payload] })
        }
        state.result = state.failNextPublish ? 'failure' : 'success'
        state.failNextPublish = false
      },
      async fill(value) {
        state.filled[selector] = value
      },
      async waitFor() {
        if (selector.includes('cohere-tag-success') && state.result !== 'success') {
          throw new Error('缺少发布成功业务结果')
        }
        if (selector.includes('cohere-tag-danger') && state.result !== 'failure') {
          throw new Error('缺少发布失败业务结果')
        }
      },
    }
    return locator
  }

  const runner = {
    page: {
      waitForFunction: vi.fn(async () => {}),
      locator: vi.fn(locatorFor),
      $$eval: vi.fn(async () => []),
      $$: vi.fn(async () => []),
    },
    goto: vi.fn(async () => {}),
    expectText: vi.fn(async (text) => {
      state.expectedTexts.push(text)
      return true
    }),
    listButtons: vi.fn(async () => []),
    screenshot: vi.fn(async () => {}),
    expectNoConsoleError: vi.fn(async () => true),
    getIpcCalls: vi.fn(async (method) => {
      if (method) return state.ipcCalls.filter((call) => call.method === method).length
      return state.ipcCalls.slice()
    }),
    failNextIpc: vi.fn(async (method) => {
      if (method === 'publishBatch') state.failNextPublish = true
    }),
  }

  return { runner, state }
}

describe('B1 run 退出契约', () => {
  it('路由异常返回非零，并始终保存报告和关闭 runner', async () => {
    const routeError = new Error('路由加载失败')
    const runner = createLifecycleRunner()
    runner.goto = vi.fn(async () => { throw routeError })

    const exitCode = await run({
      runner,
      scenarios: [async (activeRunner) => activeRunner.goto('/broken')],
      logger: quietLogger,
    })

    expect(exitCode).toBe(1)
    expect(runner.saveReport).toHaveBeenCalledOnce()
    expect(runner.close).toHaveBeenCalledOnce()
  })

  it.each([
    ['检查失败', passingReport({ checks: { total: 2, passed: 1, failed: 1 } })],
    ['console error', passingReport({ consoleErrors: [{ text: '渲染错误' }] })],
    ['page error', passingReport({ pageErrors: [{ message: '页面崩溃' }] })],
  ])('%s 返回非零', async (_label, report) => {
    const runner = createLifecycleRunner(report)

    const exitCode = await run({
      runner,
      scenarios: [async () => {}],
      logger: quietLogger,
    })

    expect(exitCode).toBe(1)
  })

  it('保存报告失败仍会关闭 runner，并返回非零', async () => {
    const runner = createLifecycleRunner(passingReport(), {
      saveReport: vi.fn(() => { throw new Error('报告磁盘不可写') }),
    })

    await expect(run({
      runner,
      scenarios: [async () => {}],
      logger: quietLogger,
    })).resolves.toBe(1)
    expect(runner.saveReport).toHaveBeenCalledOnce()
    expect(runner.close).toHaveBeenCalledOnce()
  })

  it('生成报告失败仍会尝试保存报告和关闭 runner', async () => {
    const runner = createLifecycleRunner(passingReport(), {
      generateReport: vi.fn(() => { throw new Error('报告生成失败') }),
    })

    await expect(run({
      runner,
      scenarios: [async () => {}],
      logger: quietLogger,
    })).resolves.toBe(1)
    expect(runner.generateReport).toHaveBeenCalledOnce()
    expect(runner.saveReport).toHaveBeenCalledOnce()
    expect(runner.close).toHaveBeenCalledOnce()
  })

  it('main 将 run 的失败状态写入进程退出码', async () => {
    const processRef = {}
    const runner = createLifecycleRunner(
      passingReport({ checks: { total: 1, passed: 0, failed: 1 } }),
    )

    await expect(main({
      runner,
      scenarios: [async () => {}],
      logger: quietLogger,
      processRef,
    })).resolves.toBe(1)
    expect(processRef.exitCode).toBe(1)
  })
})

describe('B1 发布场景', () => {
  it('通过 UI 连续验证发布成功和业务失败，并记录可 JSON 序列化的 IPC 载荷', async () => {
    const { runner, state } = createPublishRunner()

    await testPublish(runner)

    expect(state.selectedPlatform).toBe(true)
    expect(state.publishClicks).toBe(2)
    expect(state.ipcCalls).toHaveLength(2)
    expect(() => JSON.stringify(state.ipcCalls.map((call) => call.args))).not.toThrow()
    expect(state.filled['input[placeholder="请输入文章标题"]']).toBe('E2E 测试标题')
    expect(state.filled['.article-editor .ql-editor']).toContain('E2E 测试正文')
    expect(state.expectedTexts).toEqual(expect.arrayContaining(['发布成功', '发布失败', 'B1 注入发布失败']))
    expect(runner.failNextIpc).toHaveBeenCalledWith('publishBatch', 'B1 注入发布失败')
  })

  it('IPC 调用次数未增加时拒绝假绿', async () => {
    const { runner } = createPublishRunner({ incrementPublishCalls: false })

    await expect(testPublish(runner)).rejects.toThrow(/publishBatch/)
  })

  it('IPC 载荷无法 JSON 序列化时拒绝假绿', async () => {
    const { runner } = createPublishRunner({ cyclicPayload: true })

    await expect(testPublish(runner)).rejects.toThrow(/circular|JSON|序列化/i)
  })
})


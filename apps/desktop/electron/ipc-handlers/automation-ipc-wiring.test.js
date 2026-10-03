/**
 * automation-ipc-wiring.test.js — 自动化 IPC 装配链回归锁（2026-10-03）
 *
 * 事故（用户实测报错）：新建自动化任务时
 *   `Error invoking remote method 'automation:create': Error: No handler registered for 'automation:create'`
 *
 * 根因：`phase1-context.js` 从未 `container.get('automationScheduler')`，也没有把它
 * 放进 `context.services` 导出清单。于是 `phase5-ipc.js` 解构出 undefined，
 * `ipc-handlers/automation.js` 走到「依赖缺失 → 静默 return」分支，
 * **一个 handler 都不注册** —— 渲染层拿到的是 Electron 原生的
 * "No handler registered"，里面没有任何「真正原因是依赖没接上」的线索。
 *
 * 本文件锁两件事：
 * ① 装配链：context.services 必须带 automationScheduler（结构锁 + 行为锁）
 * ② 不再静默：依赖缺失时仍注册通道，并返回可读的 reason（不再退化成原生报错）
 *
 * 为什么既有测试没抓到：`phase5-ipc.test.js` 是 mock deps 直接喂给 handler，
 * 绕过了真实装配链；`ipc-handlers.test.js` 也用桩。全仓没有一条覆盖
 * 「容器 → context → handlerDependencies」这条真实链路。
 */

const path = require('path')
const fs = require('fs')

// 本文件在 apps/desktop/electron/ipc-handlers/ → 上两级到 apps/desktop/
const ROOT = path.resolve(__dirname, '../..')
const PHASE1 = path.join(ROOT, 'electron/bootstrap/phase1-context.js')
const PHASE5 = path.join(ROOT, 'electron/bootstrap/phase5-ipc.js')
const HANDLER = path.join(ROOT, 'electron/ipc-handlers/automation.js')
const CONTAINER = path.join(ROOT, 'electron/core/container.setup.js')

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8')
}

describe('自动化 IPC 装配链 · 结构锁', () => {
  it('container 注册了 automationScheduler', () => {
    const src = read('electron/core/container.setup.js')
    expect(src).toMatch(/container\.register\(\s*["']automationScheduler["']/)
  })

  it('container 的 assertRequired 含 automationScheduler', () => {
    const src = read('electron/core/container.setup.js')
    expect(src).toMatch(/assertRequired\([\s\S]*?["']automationScheduler["']/)
  })

  it('phase1-context 从容器取到 automationScheduler', () => {
    const src = fs.readFileSync(PHASE1, 'utf8')
    expect(src).toMatch(/const\s+automationScheduler\s*=\s*container\.get\(\s*['"]automationScheduler['"]\s*\)/)
  })

  it('phase1-context 把它导出进 context.services', () => {
    const src = fs.readFileSync(PHASE1, 'utf8')
    const servicesBlock = src.slice(src.indexOf('services: {'))
    expect(servicesBlock).toMatch(/automationScheduler/)
  })

  it('phase5-ipc 把它传进 handlerDependencies', () => {
    const src = fs.readFileSync(PHASE5, 'utf8')
    // 解构来源 + handlerDependencies 两处都要有，缺任一侧都是断线
    expect(src).toMatch(/^\s*automationScheduler,\s*$/m)
    const depBlock = src.slice(src.indexOf('const handlerDependencies'))
    expect(depBlock).toMatch(/automationScheduler/)
  })
})

describe('自动化 IPC · 依赖缺失不再静默', () => {
  function createIpcMainStub() {
    const handlers = new Map()
    return {
      handle: (channel, fn) => handlers.set(channel, fn),
      handlers,
    }
  }

  function loadHandler() {
    // vitest 环境下没有 require.resolve，用相对路径 + 缓存清理拿当前源码
    delete require.cache[require('path').resolve(__dirname, 'automation.js')]
    return require('./automation')
  }

  it('automationScheduler 缺失时仍注册全部通道（不退化成 No handler registered）', async () => {
    const registerHandlers = loadHandler()

    const ipcMain = createIpcMainStub()
    const logged = []
    registerHandlers(ipcMain, {
      automationScheduler: null,
      log: { warn: (...a) => logged.push(['warn', ...a]), error: (...a) => logged.push(['error', ...a]) },
    })

    const expected = [
      'automation:list', 'automation:create', 'automation:update',
      'automation:remove', 'automation:run-now',
    ]
    for (const channel of expected) {
      expect(ipcMain.handlers.has(channel), `通道 ${channel} 应已注册`).toBe(true)
    }

    // 调用应返回可读错误，而不是抛 "No handler registered"
    const res = await ipcMain.handlers.get('automation:create')({}, { name: 'x' })
    expect(res.code).toBe(-1)
    expect(res.reason).toBe('service-unavailable')
    expect(res.message).toMatch(/未就绪/)
    expect(logged.some((l) => l[0] === 'error')).toBe(true)
  })

  it('正常注入时五个通道全部可用', async () => {
    const registerHandlers = loadHandler()

    const ipcMain = createIpcMainStub()
    const scheduler = {
      list: () => [{ id: 'a', name: '任务A' }],
      create: (p) => ({ ok: true, task: { ...p, id: 'new' } }),
      update: (id, p) => ({ ok: true, task: { id, ...p } }),
      remove: () => ({ ok: true }),
      runNow: async () => ({ ok: true, status: 'completed' }),
    }
    registerHandlers(ipcMain, { automationScheduler: scheduler, log: { warn() {}, error() {} } })

    const list = await ipcMain.handlers.get('automation:list')()
    expect(list.code).toBe(0)
    expect(list.data.tasks).toHaveLength(1)

    const created = await ipcMain.handlers.get('automation:create')({}, { name: '新建任务' })
    expect(created.ok).toBe(true)
  })
})

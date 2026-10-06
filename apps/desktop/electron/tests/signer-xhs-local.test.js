// @ts-check
/**
 * 小红书签名本地化 —— XYW_ 纯算法直出（2026-10-06）
 *
 * 背景：xiaohongshu 原先与 kuaishou 共用「隐藏 sandbox BrowserWindow 注入
 * EXTRACTOR_SCRIPT 抽签」的链路（signer-assembly.js 的 assembly.sign），
 * 且 BRIDGE_COMMANDS 标 verified=false（设计注释写「x-s 依赖外包签名服务，
 * 本波只留 provider 槽不激活链」）—— 即该链路从未真正启用。
 *
 * 2026-10-06 实证结论：x-s 的 XYW_ 形态是 **纯 AES-128-CBC**（对照
 * Cloxl/xhshow，MIT；Go 版 tamnd/xiaohongshu-cli 独立复现同一常量），
 * 不依赖浏览器里的 mnsv2/VM 环境。既然如此，就不必再开隐藏窗口
 * （那正是本仓 wechat_mp / baijiahao 原生崩溃的触发面）。
 *
 * 本模块把 xiaohongshu 的求签改为**进程内本地算法**：
 *   - 不创建 BrowserWindow ⇒ 不引入新的原生崩溃面
 *   - 不受 verified 闸门约束（该闸门管的是「浏览器抽签」这条链）
 *   - 与 kuaishou 保持同一 BRIDGE_COMMANDS 契约，发布链调用方式不变
 */
import { describe, it, expect, vi } from 'vitest'

const modulePath = '../signer'

function loadSigner () {
  // vitest 环境下 require.resolve 对相对 CJS 路径不可靠，直接静态加载
  return require('../signer/signer-assembly')
}

describe('signer: xiaohongshu 本地 XYW 算法（不经隐藏浏览器）', () => {
  it('BRIDGE_COMMANDS 声明 xiaohongshu 为本地算法形态（localAlgorithm），不再依赖浏览器链', () => {
    const s = loadSigner()
    const cmd = s.BRIDGE_COMMANDS.find(c => c[1] === 'xiaohongshu')
    expect(cmd).toBeTruthy()
    expect(cmd[0]).toBe('xiaohongshu.x-s-browser')   // 对外命令名保持不变，发布链零改动
    expect(cmd[3]).toBe('localAlgorithm')             // 标记：走本地算法而非浏览器抽签
  })

  it('本地求签返回 XYW_ 形态签名，且不触发任何 BrowserWindow 创建', async () => {
    const s = loadSigner()
    const createWindow = vi.fn(() => { throw new Error('xiaohongshu 签名不得创建 BrowserWindow') })
    // 注入假 assembly：若实现误走浏览器链，这里会被调用并抛错
    const assembly = { sign: vi.fn(), prewarm: vi.fn(), getOrCreatePage: vi.fn(createWindow) }
    const registered = []
    const manager = {
      registerCommand: vi.fn((c) => registered.push(c)),
      registerIpcHandlers: vi.fn(),
      markVerified: vi.fn(),
      invokeSign: vi.fn(),
      _setSignFn: vi.fn((fn) => { manager._fn = fn }),
    }
    const provider = { setBridge: vi.fn(), registerCommands: vi.fn(), verify: vi.fn() }
    const ipcMain = { handle: vi.fn() }

    s.registerSignerAssembly({
      manager, provider, ipcMain, assembly,
      log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
      isTrustedSender: () => true,
    })

    const out = await manager._fn('xiaohongshu.x-s-browser', {
      accountId: 'xhs-acc-1',
      fullUri: 'https://edith.xiaohongshu.com/web_api/sns/v2/note',
      cookie: 'a1=199ebeb1b46cum7cffi8zj6bxe1man1so5fb8wb3630000412513; web_session=abc',
      method: 'POST',
      payload: { title: 't' },
    })

    expect(typeof out).toBe('string')
    expect(out.startsWith('XYW_')).toBe(true)
    // 关键安全不变量：绝不创建窗口
    expect(createWindow).not.toHaveBeenCalled()
    expect(assembly.sign).not.toHaveBeenCalled()
  })

  it('缺 a1 时 fail-closed（不得退回占位签名）', async () => {
    const s = loadSigner()
    const manager = {
      registerCommand: vi.fn(), registerIpcHandlers: vi.fn(), markVerified: vi.fn(), invokeSign: vi.fn(),
      _setSignFn: vi.fn((fn) => { manager._fn = fn }),
    }
    s.registerSignerAssembly({
      manager,
      provider: { setBridge: vi.fn(), registerCommands: vi.fn(), verify: vi.fn() },
      ipcMain: { handle: vi.fn() },
      assembly: { sign: vi.fn(), prewarm: vi.fn(), getOrCreatePage: vi.fn() },
      log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
      isTrustedSender: () => true,
    })

    // signFn 对未激活形态是同步抛错（与浏览器链的 Promise 语义不同）
    expect(() => manager._fn('xiaohongshu.x-s-browser', {
      accountId: 'xhs-acc-1',
      fullUri: 'https://edith.xiaohongshu.com/web_api/sns/v2/note',
      cookie: 'web_session=abc',
    })).toThrow(/a1/i)
  })

  it('未知命令仍 fail-closed（不得放行）', async () => {
    const s = loadSigner()
    const manager = {
      registerCommand: vi.fn(), registerIpcHandlers: vi.fn(), markVerified: vi.fn(), invokeSign: vi.fn(),
      _setSignFn: vi.fn((fn) => { manager._fn = fn }),
    }
    s.registerSignerAssembly({
      manager,
      provider: { setBridge: vi.fn(), registerCommands: vi.fn(), verify: vi.fn() },
      ipcMain: { handle: vi.fn() },
      assembly: { sign: vi.fn(), prewarm: vi.fn(), getOrCreatePage: vi.fn() },
      log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
      isTrustedSender: () => true,
    })

    expect(() => manager._fn('totally.unknown', {})).toThrow(/unlisted command/i)
  })
})
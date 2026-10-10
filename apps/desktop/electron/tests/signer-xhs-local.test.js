// @ts-check
/**
 * 小红书签名形态切换测试（2026-10-09，note-406-signature-report.md）
 *
 * 背景：真机取证证明 note 端点要求 XYS_ 代签名（Base64 JSON 信封，页内
 * window._webmsxyw 生成）；本地 XYW_ AES 形态被 406 拒绝。BRIDGE_COMMANDS
 * 的 xiaohongshu 形态由 localAlgorithm 切回 browser。
 *
 * 本文件锁三条契约：
 *   1. 声明形态 = browser，命令名不变（发布链零改动）
 *   2. signFn 对 xiaohongshu 委托 assembly.sign（payload 透传 accountId/fullUri）
 *   3. 缺 accountId 时由 assembly 侧 fail-closed（missing sessionKey），不退占位签名
 * XYS_ extractor 脚本本身的契约另见 signer-xhs-extractor.test.js。
 */
import { describe, it, expect, vi } from 'vitest'

const modulePath = '../signer'

function loadSigner () {
  // vitest 环境下 require.resolve 对相对 CJS 路径不可靠，直接静态加载
  return require('../signer/signer-assembly')
}

describe('signer: xiaohongshu 签名形态切换（localAlgorithm → browser，2026-10-09）', () => {
  it('BRIDGE_COMMANDS 声明 xiaohongshu 为 browser 形态，命令名不变（发布链零改动）', () => {
    const s = loadSigner()
    const cmd = s.BRIDGE_COMMANDS.find(c => c[1] === 'xiaohongshu')
    expect(cmd).toBeTruthy()
    expect(cmd[0]).toBe('xiaohongshu.x-s-browser')   // 对外命令名保持不变，发布链零改动
    expect(cmd[3]).toBe('browser')                    // 2026-10-09 切回浏览器抽签（XYS_ 代签名）
  })

  it('signFn 对 xiaohongshu 委托 assembly.sign，payload 透传 accountId/fullUri', async () => {
    const s = loadSigner()
    const assembly = { sign: vi.fn(async () => 'XYW_sig-from-page'), prewarm: vi.fn(), getOrCreatePage: vi.fn() }
    const manager = {
      registerCommand: vi.fn(), registerIpcHandlers: vi.fn(), markVerified: vi.fn(), invokeSign: vi.fn(),
      _setSignFn: vi.fn((fn) => { manager._fn = fn }),
    }
    s.registerSignerAssembly({
      manager,
      provider: { setBridge: vi.fn(), registerCommands: vi.fn(), verify: vi.fn() },
      ipcMain: { handle: vi.fn() },
      assembly,
      log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
      isTrustedSender: () => true,
    })

    const payload = {
      accountId: 'xhs-acc-1',
      fullUri: 'https://edith.xiaohongshu.com/web_api/sns/v2/note',
      cookie: 'a1=199ebeb1b46cum7cffi8zj6bxe1man1so5fb8wb3630000412513; web_session=abc',
      method: 'POST',
      payload: { title: 't' },
    }
    const out = await manager._fn('xiaohongshu.x-s-browser', payload)

    expect(assembly.sign).toHaveBeenCalledTimes(1)
    const ctx = assembly.sign.mock.calls[0][0]
    expect(ctx.command).toBe('xiaohongshu.x-s-browser')
    expect(ctx.platform).toBe('xiaohongshu')
    expect(ctx.sessionKey).toBe('xhs-acc-1')
    expect(ctx.payload.fullUri).toBe(payload.fullUri)
    expect(typeof out).toBe('string')
  })

  it('缺 accountId 时由 assembly 侧 fail-closed（missing sessionKey，不得退回占位签名）', async () => {
    const s = loadSigner()
    // 模拟真实 assembly.sign 契约：内部先 getOrCreatePage（sessionKey 缺失即抛）
    const assembly = {
      sign: vi.fn(async (ctx) => {
        if (!ctx.sessionKey) throw new Error('missing sessionKey for platform "xiaohongshu"（多账号必须按账号隔离签名页，fail-closed）')
        return 'sig'
      }),
      prewarm: vi.fn(),
      getOrCreatePage: vi.fn(),
    }
    const manager = {
      registerCommand: vi.fn(), registerIpcHandlers: vi.fn(), markVerified: vi.fn(), invokeSign: vi.fn(),
      _setSignFn: vi.fn((fn) => { manager._fn = fn }),
    }
    s.registerSignerAssembly({
      manager,
      provider: { setBridge: vi.fn(), registerCommands: vi.fn(), verify: vi.fn() },
      ipcMain: { handle: vi.fn() },
      assembly,
      log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
      isTrustedSender: () => true,
    })

    await expect(manager._fn('xiaohongshu.x-s-browser', {
      fullUri: 'https://edith.xiaohongshu.com/web_api/sns/v2/note',
      cookie: 'web_session=abc',
    })).rejects.toThrow(/sessionKey/i)
    // signFn 必须真的把请求交给 assembly.sign（fail-closed 由 assembly 契约兜底），
    // 而不是在 signFn 层静默吞掉 accountId 缺失
    expect(assembly.sign).toHaveBeenCalledTimes(1)
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

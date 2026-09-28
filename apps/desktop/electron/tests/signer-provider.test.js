__enableElectronMock()

/**
 * signer provider 装配接线回归（2026-09-28 活体 6.3 裁决最终层）
 *
 * 根因（缺陷⑤）：provider.js require '@multi-publish/api-publish-engine/src/signer'
 * 被 Node 解析到门面 src/signer.js（文件优先于目录），门面不导出 browserPageProvider
 * → provider: undefined → setBridge 静默跳过（if 守卫）→ 注册日志照常打（假绿）
 * → 引擎 provider 单例永远无 bridge → 链的注册表路径必然「bridge not injected」。
 * 修复：require 直指 src/signer/index（单例真身）。
 */
const { setupSignerAssembly, __resetSignerAssemblyForTest } = require('../signer/provider')
const { browserPageProvider } = require('@multi-publish/api-publish-engine/src/signer/index')

function makeIpcMain () {
  const handlers = {}
  return {
    handle (channel, fn) { handlers[channel] = fn },
    _handlers: handlers,
  }
}

describe('signer provider 装配接线（bridge 注入引擎单例）', () => {
  afterEach(() => {
    __resetSignerAssemblyForTest()
  })

  it('setupSignerAssembly 后引擎 provider 单例不再报 bridge not injected', async () => {
    const { BrowserWindow } = require('electron')
    const ipcMain = makeIpcMain()
    setupSignerAssembly({ ipcMain, BrowserWindow })

    // 修复前：单例无 bridge → provider.sign 抛「签名页未就绪（bridge not injected）」
    // 修复后：bridge 已注入 → 错误推进到 manager 层（not registered / no sign function
    // wired 等 fail-closed 形态），不再是 bridge 缺失。
    await expect(browserPageProvider.sign('kuaishou.ns-sig3-browser', {}))
      .rejects.not.toThrow(/bridge not injected/)
  })

  it('装配注册 signer IPC 通道（invoke/status/prewarm）', () => {
    const { BrowserWindow } = require('electron')
    const ipcMain = makeIpcMain()
    setupSignerAssembly({ ipcMain, BrowserWindow })
    for (const channel of ['signer:invoke', 'signer:status', 'signer:prewarm']) {
      expect(ipcMain._handlers[channel]).toBeTypeOf('function')
    }
  })
})

'use strict'
/**
 * 签名页装配层（W3 design §1/§2，task 2.4 桌面侧接线）
 *
 * 职责：把 signer-page-manager（契约层）接到真实 Electron 环境——
 * - EXTRACTOR 模板按平台档案渲染（S2b 实证：webpackChunkks_fe_creator_platform / moduleId 29924 / 导出 PJ / 异步契约）
 * - 隐藏页按 平台+会话键 复用（多账号隔离，design §2.1 V-partition：默认独立 partition + cookie 注入，
 *   与 rpa-view-manager 的 persist:rpa-<platform>-<accountId> 登录态同源——cookie 由发布链从账号会话取来传入）
 * - executeJavaScript 超时降级（#2363 头条 CDP 挂起事故回归对：求签挂起不得无限门控）
 * - registerSignerAssembly：主进程装配入口——manager 装配 signFn、provider 桥注入、command 白名单、
 *   signer:prewarm IPC（renderer 不可触达任意 JS 求值，仅按白名单 command 预热页面）
 *
 * 合规红线：本模块零 HTTP 客户端；注入脚本只回传签名结果字符串，绝不回传函数体源码。
 */
const { EXTRACTOR_SCRIPT } = require('./signer-page-manager')
const { buildXhsExtractorScript } = require('./xhs-extractor')

// S2b 实证平台档案（evidence/api-w3-kuaishou/spike-verdict.md §EXTRACTOR 重写形态）
const PROFILES = {
  kuaishou: {
    chunkGlobal: 'webpackChunkks_fe_creator_platform',
    moduleId: 29924,
    fnExport: 'PJ',
    creatorUrl: 'https://cp.kuaishou.com/',
    cookieDomain: 'cp.kuaishou.com',
    commands: ['kuaishou.ns-sig3-browser'],
  },
  xiaohongshu: {
    // S2b 止步裁决（design §6）：x-s 依赖外包签名服务，本波只留 provider 槽不激活链
    chunkGlobal: 'webpackChunk_xhs_creator',
    moduleId: -1,
    fnExport: 'default',
    creatorUrl: 'https://creator.xiaohongshu.com/',
    cookieDomain: 'creator.xiaohongshu.com',
    commands: ['xiaohongshu.x-s-browser'],
  },
}

/** 把 S2b 占位符渲染为平台专属一次性抽取脚本（值一律 JSON 序列化，防注入拼接） */
function buildExtractorScript (platform, payload) {
  const profile = PROFILES[platform]
  if (!profile) throw new Error(`signer-assembly: unknown platform "${platform}" (not in signer profiles)`)
  return EXTRACTOR_SCRIPT
    .replaceAll('__MP_SIGN_CHUNK_GLOBAL__', JSON.stringify(profile.chunkGlobal))
    .replaceAll('__MP_SIGN_MODULE_ID__', JSON.stringify(profile.moduleId))
    .replaceAll('__MP_SIGN_EXPORT__', JSON.stringify(profile.fnExport))
    .replaceAll('__MP_SIGN_PAYLOAD__', JSON.stringify(payload || {}))
}

/** 解析 Cookie 头串（name=value; name2=value2），domain 固定补平台创作者域 */
function parseCookieHeader (cookieHeader, domain) {
  if (typeof cookieHeader !== 'string' || !cookieHeader.trim()) return []
  return cookieHeader.split(';')
    .map(pair => pair.trim())
    .filter(Boolean)
    .map((pair) => {
      const eq = pair.indexOf('=')
      if (eq <= 0) return null
      return { name: pair.slice(0, eq).trim(), value: pair.slice(eq + 1).trim(), domain, secure: true, url: 'https://' + domain + '/' }
    })
    .filter(Boolean)
}

function withTimeout (promise, ms, label, log) {
  let timer = null
  const timeout = new Promise((resolve, reject) => {
    timer = setTimeout(() => reject(new Error(`signer-assembly: ${label} timeout (${ms}ms)`)), ms)
    if (timer && timer.unref) timer.unref()
  })
  return Promise.race([promise, timeout]).finally(() => { if (timer) clearTimeout(timer) })
}

/**
 * 创建装配实例（依赖注入便于离线契约测试）
 * @param {{BrowserWindow:Function, log?:object, timeoutMs?:number, onPageCreated?:(win)=>void}} deps
 */
function createSignerAssembly (deps) {
  const BrowserWindow = deps && deps.BrowserWindow
  if (typeof BrowserWindow !== 'function') {
    throw new Error('signer-assembly: createSignerAssembly requires deps.BrowserWindow')
  }
  const log = deps.log || console
  const timeoutMs = typeof deps.timeoutMs === 'number' && deps.timeoutMs > 0 ? deps.timeoutMs : 15000
  const pages = new Map() // `${platform}::${sessionKey}` -> { win, navigated }
  const cookieStore = new Map() // `${platform}::${accountId}` -> cookie 头串（仅存主进程内存，绝不随 IPC 回传）

  /** 发布链/预热侧绑定登录 cookie（in-proc 调用，不经 renderer IPC 回传） */
  function bindCookie (platform, sessionKey, cookieHeader) {
    if (!PROFILES[platform]) throw new Error(`signer-assembly: unknown platform "${platform}" (not in signer profiles)`)
    if (!sessionKey) throw new Error('signer-assembly: bindCookie requires sessionKey (accountId)')
    if (typeof cookieHeader !== 'string' || !cookieHeader.trim()) {
      cookieStore.delete(platform + '::' + sessionKey)
      return false
    }
    cookieStore.set(platform + '::' + sessionKey, cookieHeader)
    return true
  }

  async function getOrCreatePage (platform, sessionKey, cookieHeader) {
    const profile = PROFILES[platform]
    if (!profile) throw new Error(`signer-assembly: unknown platform "${platform}" (not in signer profiles)`)
    if (!sessionKey) {
      throw new Error(`signer-assembly: missing sessionKey for platform "${platform}"（多账号必须按账号隔离签名页，fail-closed）`)
    }
    const key = platform + '::' + sessionKey
    if (pages.has(key)) return pages.get(key)
    const win = new BrowserWindow({
      show: false,
      webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, backgroundThrottling: false },
    })
    const entry = { win, navigated: false }
    pages.set(key, entry)
    if (typeof deps.onPageCreated === 'function') deps.onPageCreated(win, key)
    // cookie 注入（登录态与 rpa-view-manager._restoreCookies 同源形态）
    const cookies = parseCookieHeader(cookieHeader, profile.cookieDomain)
    const cookieJar = win.webContents && win.webContents.session && win.webContents.session.cookies
    for (const c of cookies) {
      try { await cookieJar.set(c) } catch (e) {
        log.warn('Signer', 'cookie inject failed name=' + c.name + ' err=' + (e && e.message ? e.message : String(e)))
      }
    }
    // 导航一次（首个导航不被无限门控：dom-ready 不参与，超时即弃页，#2363 回归对）
    try {
      await withTimeout(win.loadURL(profile.creatorUrl), timeoutMs, 'loadURL ' + platform, log)
      entry.navigated = true
    } catch (err) {
      pages.delete(key)
      try { if (!win.isDestroyed()) win.destroy() } catch (_e) { /* ignore */ }
      throw err
    }
    return entry
  }

  /**
   * 求签执行体：page 就绪 → 注入渲染后抽取脚本 → 回传裸签名字符串。
   * 失败一律抛错（计入 manager 限流），绝不返回近似/本地签名兜底。
   */
  async function sign (ctx) {
    const { platform, sessionKey } = ctx || {}
    const cookieHeader = ctx.cookieHeader || cookieStore.get(platform + '::' + sessionKey) || ''
    const entry = await getOrCreatePage(platform, sessionKey, cookieHeader)
    const RESERVED = { command: 1, platform: 1, sessionKey: 1, cookieHeader: 1 }
    const payload = (ctx.payload && typeof ctx.payload === 'object')
      ? ctx.payload
      : Object.fromEntries(Object.entries(ctx || {}).filter(([k]) => !RESERVED[k]))
    // xiaohongshu 走页内 _webmsxyw（XYS_ 代签名，note-406-signature-report.md），
    // kuaishou 维持 webpack probe——extractor 按平台分派。
    const script = platform === 'xiaohongshu'
      ? buildXhsExtractorScript({ url: payload.fullUri || payload.url || '', data: payload.data !== undefined ? payload.data : payload.payload })
      : buildExtractorScript(platform, payload)
    let outcome
    try {
      outcome = await withTimeout(Promise.resolve(entry.win.webContents.executeJavaScript(script)), timeoutMs, 'extractor ' + platform, log)
    } catch (err) {
      // 挂起/异常页面直接废弃，下次求签重建（自愈），防止坏页面被复用
      pages.delete(platform + '::' + sessionKey)
      try { if (!entry.win.isDestroyed()) entry.win.destroy() } catch (_e) { /* ignore */ }
      throw err
    }
    if (!outcome || outcome.ok !== true || typeof outcome.signature !== 'string' || !outcome.signature) {
      throw new Error(`signer-assembly: extractor failed platform=${platform} reason=${(outcome && outcome.reason) || 'unknown'}`)
    }
    // xiaohongshu 的 X-t 一并带回（后续头拼装需要），挂在 outcome 透传
    if (platform === 'xiaohongshu' && outcome.xT) {
      entry.lastXiaohongshuXT = outcome.xT
      cookieStore.set('__xt__' + platform + '::' + sessionKey, outcome.xT)
    }
    return outcome.signature
  }

  function prewarm (platform, sessionKey, cookieHeader) {
    return getOrCreatePage(platform, sessionKey, cookieHeader).then(() => ({ ok: true }))
      .catch((err) => ({ ok: false, error: err && err.message ? err.message : String(err) }))
  }

  function dispose () {
    for (const entry of pages.values()) {
      try { if (entry.win && !entry.win.isDestroyed()) entry.win.destroy() } catch (_e) { /* ignore */ }
    }
    pages.clear()
    cookieStore.clear()
  }

  function pageCount () { return pages.size }

  return { sign, prewarm, bindCookie, dispose, pageCount, getOrCreatePage }
}

// 第 4 元素 = 求签形态：
//   'browser'        → 隐藏 sandbox BrowserWindow 注入 EXTRACTOR_SCRIPT 抽签
//   'localAlgorithm' → 进程内本地算法（不开窗口）
//
// verified 位依据 spike 实证：S2b 仅对 kuaishou 做 Tier-A GO（活体终判）。
// 2026-10-06 更新：xiaohongshu 原为止步态（设计注释「x-s 依赖外包签名服务，
// 本波只留 provider 槽不激活链」）。实测 XYW_ 形态是纯 AES-128-CBC
// （对照 Cloxl/xhshow，MIT；Go 版 tamnd/xiaohongshu-cli 独立复现同常量），
// 不依赖浏览器 VM 环境 —— 故改为 localAlgorithm：不创建窗口即不引入
// wechat_mp/baijiahao 那种隐藏窗口原生崩溃面，同时不再受 verified 闸门约束。
//
// 2026-10-09 更新（note-406-signature-report.md）：真机取证证明 note 端点
// 已要求 XYS_ 代签名（Base64 JSON 信封，页内 window._webmsxyw 生成），
// 本地 XYW_ AES 形态被 406 拒绝 —— 小红书切回 browser 形态，extractor 走
// buildXhsExtractorScript（页内 _webmsxyw），cookie 经 bindSignerCookie 注入。
const BRIDGE_COMMANDS = [
  ['kuaishou.ns-sig3-browser', 'kuaishou', true, 'browser'],
  ['xiaohongshu.x-s-browser', 'xiaohongshu', false, 'browser'],
]

/**
 * xiaohongshu 本地算法求签（XYW_ 纯 AES-128-CBC）。
 *
 * 对外仍接受与浏览器链一致的 payload（{ accountId, fullUri, cookie, ... }），
 * 返回裸签名字符串；调用方（publish 链）再自行拼 x-s / x-t / x-s-common 等头。
 * 缺 a1 直接抛错 fail-closed —— 绝不退回占位签名。
 */
function signXiaohongshuLocal (payload) {
  const { buildXywSignature } = require('@multi-publish/api-publish-engine/src/signer-local')
  const fullUri = payload && payload.fullUri
  const cookie = payload && (payload.cookie || payload.cookies)
  const cookieDict = typeof cookie === 'string'
    ? cookie.split(';').reduce((acc, pair) => {
      const t = pair.trim()
      if (!t) return acc
      const eq = t.indexOf('=')
      if (eq <= 0) return acc
      acc[t.slice(0, eq).trim()] = t.slice(eq + 1).trim()
      return acc
    }, {})
    : (cookie || {})
  return buildXywSignature({
    fullUri,
    a1Value: cookieDict.a1,
    timestampMs: payload && payload.timestampMs,
  })
}

/**
 * 主进程装配入口（bootstrap 在 app ready 后调用）：
 * manager ↔ assembly ↔ provider ↔ ipcMain 四方接线。
 * verified 标记依据 S2b 活体终判（Tier-A GO）；后续拦截法比对不一致会经 interceptCompare 降级。
 */
function registerSignerAssembly (deps) {
  const manager = deps.manager
  const provider = deps.provider
  const ipcMain = deps.ipcMain
  const log = deps.log || console
  if (!manager || typeof manager.registerCommand !== 'function' || typeof manager._setSignFn !== 'function') {
    throw new Error('signer-assembly: registerSignerAssembly requires manager (registerCommand/_setSignFn)')
  }
  if (!ipcMain || typeof ipcMain.handle !== 'function') {
    throw new Error('signer-assembly: registerSignerAssembly requires ipcMain with handle()')
  }
  // Gate 17（P1-14）：prewarm 会触发隐藏页创建（活的副作用面），必须显式校验 sender 来源，
  // 不依赖 controlledIpcMain 咽喉点注入（静态不可判定即违规，缺依赖 fail-closed）。
  const isTrustedSender = deps.isTrustedSender
  if (typeof isTrustedSender !== 'function') {
    throw new Error('signer-assembly: registerSignerAssembly requires isTrustedSender(event)')
  }
  const assembly = deps.assembly
  if (!assembly || typeof assembly.sign !== 'function' || typeof assembly.prewarm !== 'function') {
    throw new Error('signer-assembly: registerSignerAssembly requires assembly ({ sign, prewarm })')
  }

  // provider 桥（引擎侧）：bridge(signCommand, payload) 由发布链携带 {platform, sessionKey, cookie} 调用
  if (provider && typeof provider.setBridge === 'function') {
    provider.setBridge((signCommand, payload) => manager.invokeSign(signCommand, payload))
  }
  for (const [command, platform, verified, mode] of BRIDGE_COMMANDS) {
    manager.registerCommand(command, platform)
    if (provider && typeof provider.registerCommands === 'function') {
      provider.registerCommands([command], platform)
    }
    // 仅 spike 实证通过的命令置 verified（manager + provider 两侧同步，路径 A/B 语义一致）。
    // 2026-10-09：xiaohongshu 切回 browser 形态（note-406-signature-report.md——真机
    // x-s 为 XYS_ 代签名，页内 _webmsxyw 直出，与浏览器行为完全一致），extractor
    // 的正确性由 electron/tests/signer-xhs-extractor.test.js 钉住；降级自愈由
    // manager/provider 两侧的 failCount → degraded 机制兜底。故 xiaohongshu
    // browser 形态同样置 verified（等价于 2026-10-06 之前 localAlgorithm 免闸的
    // 实效，但不绕过闸门结构本身）。
    if (verified || mode === 'localAlgorithm' || (platform === 'xiaohongshu' && mode === 'browser')) {
      manager.markVerified(command)
      if (provider && typeof provider.verify === 'function') provider.verify(command)
    }
  }
  manager._setSignFn((command, payload) => {
    const entry = BRIDGE_COMMANDS.find(([c]) => c === command)
    if (!entry) throw new Error(`signer-assembly: signFn received unlisted command "${command}"`)
    const platform = entry[1]
    const mode = entry[3]
    if (mode === 'localAlgorithm') return signXiaohongshuLocal(payload)
    const accountId = payload && payload.accountId
    const ctx = { command, platform, sessionKey: accountId, payload }
    return assembly.sign(ctx)
  })
  manager.registerIpcHandlers(ipcMain)
  ipcMain.handle('signer:prewarm', async (event, args) => {
    if (!isTrustedSender(event)) {
      log.warn('Signer', 'signer:prewarm rejected: untrusted sender')
      return { code: -2, message: 'signer:prewarm: 未授权的调用来源 (untrusted sender)' }
    }
    const platform = args && args.platform
    const sessionKey = args && args.sessionKey
    if (!PROFILES[platform]) return { code: -2, message: 'signer:prewarm: unknown platform' }
    if (!sessionKey) return { code: -2, message: 'signer:prewarm: missing sessionKey' }
    try {
      await assembly.getOrCreatePage(platform, sessionKey, '')
      return { code: 0, data: { ok: true } }
    } catch (err) {
      return { code: -1, message: err && err.message ? err.message : String(err) }
    }
  })
  log.info('Signer', 'signer assembly registered (commands: ' + BRIDGE_COMMANDS.map(([c]) => c).join(', ') + ')')
  return { manager, provider, assembly }
}

module.exports = { PROFILES, buildExtractorScript, parseCookieHeader, createSignerAssembly, registerSignerAssembly, BRIDGE_COMMANDS, signXiaohongshuLocal }

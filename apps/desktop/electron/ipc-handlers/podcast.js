// @ts-check
/**
 * podcast IPC handlers — 播客 RSS 频道的主进程入口
 *
 * 本层只做三件事，不承载业务逻辑：
 *   1. 入参解构与类型守卫（越早拒绝越省资源，且在产生副作用前失败）
 *   2. 调用 PodcastChannelService，并把领域错误映射成 UI 可消费的形状
 *   3. 返回 envelope 的键名严格对齐渲染层合同（见下「通道合同」）
 *
 * 通道合同（渲染层按同一份合同并行开发，**键名逐字不得改**）：
 *   podcast:channel:get     → { code, data: { channel } }
 *   podcast:channel:save    → { code, data: { channel } }
 *   podcast:episode:list    → { code, data: { episodes } }
 *   podcast:episode:save    → { code, data: { episode } }
 *   podcast:episode:remove  → { code, data: { removed } }
 *   podcast:feed:build      → { code, data: { path, itemCount, bytes } }
 *   podcast:feed:verify     → { code, data: { issues, checks, itemCount } }
 *   podcast:endpoints:list  → { code, data: { endpoints } }
 * 校验失败：{ code: EC.VALIDATION_ERROR, message, issues }——issues 是引擎的结构化码数组，
 * 文案由渲染层按 code 出（本层不回传用户未发布的标题/音频地址，也不回传 xml 正文）。
 *
 * ⛔ 这里没有「发布到播客平台」的通道：小宇宙等是 RSS 聚合端，feed 地址由用户一次性提交。
 * 本模块不参与 publish-capabilities / platform-definitions / publishMode 的任何判定。
 */

const EC = require('../core/error-codes').ERROR
const { withSenderCheck } = require('./helpers')

/**
 * 入参解包：同时接受「对象本体」与 `{ <key>: 对象 }` 两种载荷形状。
 *
 * 为什么两套都收：渲染层与本层是并行开发的，载荷形状没有第三种东西（如类型定义）能锁住。
 * 只认一种时，另一种会在运行时变成「频道标题不能为空」这种**看起来像用户填错**的假校验错误，
 * 排查方向完全被带偏。解包只判形状，不做任何字段校验（字段校验的唯一实现在引擎）。
 * @param {any} payload
 * @param {string} key
 */
function unwrapObject (payload, key) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null
  // 合同键存在但形状不对（数组 / null / 标量）→ 判缺失：让服务出 CHANNEL_MISSING，
  // 而不是把外层壳当载荷交给引擎，后者会报出「标题不能为空」这种像用户填错的假校验错误。
  if (key in payload) {
    const inner = payload[key]
    return inner && typeof inner === 'object' && !Array.isArray(inner) ? inner : null
  }
  return payload
}

/** 领域错误 → IPC envelope。不同排查方向的错误不得合并成一句话。 */
function toIpcError (err) {
  const issues = err && Array.isArray(err.issues) ? err.issues : null
  if (issues) {
    return { code: EC.VALIDATION_ERROR, message: (err && err.message) || '校验未通过', issues }
  }
  const code = err && err.code
  if (code === 'PODCAST_EPISODE_NOT_FOUND') {
    return { code: EC.NOT_FOUND, message: (err && err.message) || '单集不存在' }
  }
  if (code === 'PODCAST_STORE_CORRUPT' || code === 'PODCAST_STORE_UNAVAILABLE' || code === 'PODCAST_EPISODES_FULL' || code === 'PODCAST_EPISODE_INVALID') {
    return { code: EC.VALIDATION_ERROR, message: (err && err.message) || '频道数据不可写' }
  }
  return { code: EC.REQUEST_ERROR, message: (err && err.message) || '操作失败' }
}

function registerHandlers (ipcMain, deps) {
  const log = (deps && deps.log) || require('../services/logger')

  // 服务实例惰性解析：注册动作本身不得触碰 userData 目录（测试环境同样走这条注册路径）。
  /** @type {any} */
  let service = deps && deps.podcastChannelService ? deps.podcastChannelService : null
  function getService () {
    if (service) return service
    const PodcastChannelService = require('../services/podcast-channel-service')
    service = new PodcastChannelService({
      userDataDir: deps && deps.podcastUserDataDir,
      logger: log,
      // headImpl 必须由调用方显式注入；缺省即跳过网络检查（禁止默认发真实出站）
      headImpl: deps && deps.podcastHeadImpl,
    })
    return service
  }

  // ⛔ 通道名必须在下方 8 个注册点各自写成字符串字面量，不得收回本 helper
  // 或以循环注册：electron/tests/ipc-contract.test.js 的合同是按**源码字面量**抓取
  // preload 的 invoke 通道与主进程 handler 做双向对账的，间接注册会让整条通道
  // 从对账里消失（表现为「preload 有 8 个通道没有 handler」，而运行时其实一切正常）。
  // 另注：本文件注释内**禁止**出现 `ipcMain.handle(` 紧跟引号的写法——
  // .github/scripts/check-ipc-bridge.js 的 RE1 不区分注释与代码，会把注释里的示例
  // 当成真实注册过的通道，导致「Handler 已注册但 preload.js 未暴露」的假缺口。
  const guarded = (label, fn) => withSenderCheck(async (_event, payload) => {
    try {
      const data = await fn(payload)
      return { code: 0, data }
    } catch (e) {
      // 只记通道名与错误消息：引擎消息仅含校验码，不含用户文本
      log.warn('[ipc:podcast] ' + label + ': ' + ((e && e.message) || String(e)))
      return toIpcError(e)
    }
  })

  ipcMain.handle('podcast:channel:get', guarded('channel:get', () => ({ channel: getService().getChannel() })))

  ipcMain.handle('podcast:channel:save', guarded('channel:save', (payload) => {
    // 缺参同样交给服务判：saveChannel(null) 走引擎的 CHANNEL_MISSING，
    // 于是「没传对象」和「传了但不合格」共用**一份**校验实现，不在本层另写 issue 字面量。
    return { channel: getService().saveChannel(unwrapObject(payload, 'channel')) }
  }))

  ipcMain.handle('podcast:episode:list', guarded('episode:list', () => ({ episodes: getService().listEpisodes() })))

  ipcMain.handle('podcast:episode:save', guarded('episode:save', (payload) => (
    { episode: getService().saveEpisode(unwrapObject(payload, 'episode')) }
  )))

  ipcMain.handle('podcast:episode:remove', guarded('episode:remove', (payload) => {
    const id = typeof payload === 'string' ? payload
      : (payload && typeof payload.id === 'string' ? payload.id : '')
    if (!id.trim()) {
      const e = new Error('缺少参数 id')
      e.code = 'PODCAST_EPISODE_INVALID'
      throw e
    }
    // 必须看服务判定结果：id 不存在时恒回 removed:true 会让 UI 显示「已删除」而库里纹丝不动
    if (!getService().removeEpisode(id)) {
      const e = new Error('单集不存在')
      e.code = 'PODCAST_EPISODE_NOT_FOUND'
      throw e
    }
    return { removed: true }
  }))

  ipcMain.handle('podcast:feed:build', guarded('feed:build', () => {
    const r = getService().buildFeed()
    return { path: r.path, itemCount: r.itemCount, bytes: r.bytes }
  }))

  ipcMain.handle('podcast:feed:verify', guarded('feed:verify', async () => {
    const r = await getService().verifyFeed()
    return { issues: r.issues, checks: r.checks, itemCount: r.itemCount }
  }))

  ipcMain.handle('podcast:endpoints:list', guarded('endpoints:list', () => ({ endpoints: getService().listEndpoints() })))
}

module.exports = registerHandlers
module.exports.unwrapObject = unwrapObject
module.exports.toIpcError = toIpcError

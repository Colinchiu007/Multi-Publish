'use strict'
/**
 * 发布请求代理接线（把账号级代理带进 API 轨）
 *
 * 为什么需要：平台链以 `fs.readFileSync(taskData.video.path)` 读文件、
 * 以 axios 收发请求，**全程不经过 Electron 的 BrowserWindow session**。
 * 因此桌面侧 `rpa-view-manager._configureProxy()` 里的 `session.setProxy()`
 * 对 API 轨无效——这正是该处同时写下了
 *   `hasAccountProxy ⇒ 关闭 API 轨、强制退回 RPA` 的原因（宁可慢也不假装走了代理）。
 *
 * 本模块只做一件事：把**调用方传入的代理配置**转成 HTTP(S) agent，塞进
 * `opts.clients.agents`，链的构造器（6 条链里 5 条已支持，快手本次补齐）
 * 会把它交给 `createHttpClient({ agents })`。
 *
 * ⚠️ **本模块不改变「配了代理就走 RPA」那个闸门**——那会改变已有账号的发布轨
 * （RPA → API），属于行为变更，须由实际账号实测代理下 API 轨稳定后再单独放开。
 * 这里只把能力备好，默认不生效（opts.proxy 不传即完全不介入）。
 */
const { createProxyAgent } = require('./proxy-manager')

/**
 * 给发布请求的 opts 挂上代理 agent（不传 proxy 则原样返回，零侵入）。
 *
 * @param {object} opts   发布 opts（会被就地补一个 clients.agents）
 * @param {object} [proxy] 代理配置 { protocol?, host, port, username?, password? }
 * @returns {object} 同一个 opts
 */
function attachProxyAgents (opts, proxy) {
  if (!proxy || !proxy.host || !proxy.port) return opts
  const target = opts || {}
  const agents = createProxyAgent(proxy)
  if (!agents) return target
  // clients 会被各适配器的 _chain(cookie, clients) 用 Object.assign 摊进链构造参数，
  // 键名与链构造器声明的 `agents` 对齐。
  target.clients = Object.assign({}, target.clients, { agents })
  return target
}

/** 判断某个代理配置是否可用（有 host 与 port 才算）。供调用方提前分流，避免白跑一趟。 */
function hasUsableProxy (proxy) {
  return Boolean(proxy && proxy.host && proxy.port)
}

module.exports = { attachProxyAgents, hasUsableProxy }

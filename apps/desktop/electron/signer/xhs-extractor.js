'use strict'
/**
 * 小红书 XYS_ 页内签名 extractor（note-406-signature-report.md 的修复实现）。
 *
 * 背景：真机 x-s 是 Base64 JSON 信封（signSvn/signType/appId/signVersion/payload），
 * 由创作者页全局函数 window._webmsxyw(url, data) 生成；本地 signer-local 的
 * XYW_ AES 定长块是旧协议仿制，对 note 端点已被 406 拒绝。
 *
 * 与 kuaishou 的 webpack probe extractor 不同：本脚本不探测 webpack chunk，
 * 直接调用页面全局函数——失败时返回结构化 { ok:false, reason } 而非 reject，
 * 便于签名页管理器按 failCount 降级（MAX_FAILS_BEFORE_DEGRADED）。
 *
 * 合规边界：只回传签名字符串（X-s/X-t），不回传页面 DOM/cookie——
 * 与 signer-assembly「只回签名、不回源码」的既有约束一致。
 */

/**
 * 构建页内执行的 extractor 脚本。
 * @param {{url: string, data?: object}} payload - 待签名的请求路径与载荷
 * @returns {string} 可在页面上下文 new Function 执行的异步 IIFE 源码
 */
function buildXhsExtractorScript (payload) {
  const url = (payload && payload.url) || ''
  const data = (payload && payload.data) === undefined ? null : (payload && payload.data)
  return `(async function () {
  try {
    if (typeof window._webmsxyw !== 'function') return { ok: false, reason: 'no-webms-fn' };
    var ret = await window._webmsxyw(${JSON.stringify(url)}, ${JSON.stringify(data)});
    if (!ret || typeof ret !== 'object') return { ok: false, reason: 'bad-shape' };
    var sig = ret['X-s'] !== undefined ? ret['X-s'] : ret['x-s'];
    var xT = ret['X-t'] !== undefined ? ret['X-t'] : ret['x-t'];
    if (typeof sig !== 'string' || !sig) return { ok: false, reason: 'x-s-missing' };
    return { ok: true, signature: sig, xT: xT === undefined || xT === null ? '' : String(xT) };
  } catch (e) {
    return { ok: false, reason: 'threw: ' + ((e && e.message) || String(e)).slice(0, 120) };
  }
})()`
    .replaceAll('__XHS_URL__', JSON.stringify(url))
    .replaceAll('__XHS_DATA__', JSON.stringify(data))
}

module.exports = { buildXhsExtractorScript }

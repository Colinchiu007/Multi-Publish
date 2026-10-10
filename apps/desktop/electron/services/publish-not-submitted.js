// @ts-check
/**
 * 「可确证未送出」判定（publish-frequency-policy-v2 P0-1 的细粒度补点）
 *
 * 背景：执行器层（bootstrap.js）只能区分「进入 publish() 之前 / 之内」。进入之后的失败默认
 * 按**已提交**处理（保守）。但其中有一族失败是**可以证明平台写操作从未发生**的 ——
 * 登录态失效 / 凭证缺失 —— 它们本不该吃掉整个间隔窗口。
 *
 * ⚠️ 标记错误的方向性后果不对称，必须记牢：
 *   · 把「已送出」误标为「未送出」 ⇒ 回滚窗口 ⇒ 早于窗口的重复发布（**危险侧**）
 *   · 把「未送出」漏标       ⇒ 多等一个窗口                  （安全侧）
 * 所以判据是**封闭词表**，每条都必须能说明「它为什么必然发生在平台写之前」，
 * 且**不得**收录泛化错误（如「API 发布失败」「网络超时」—— 前者可能发生在提交之后）。
 *
 * 契约（消费方为 task-queue._maybeRollback 与 bootstrap.js 执行器）：
 *   命中 ⇒ 在 Error 实例上置 `definitelyNotSent = true`（不改变 message、不吞错误）
 */

/**
 * 封闭词表。新增条目必须同时给出「发生在平台写之前」的机制性理由。
 * @type {ReadonlyArray<{ re: RegExp, why: string }>}
 */
const NOT_SENT_SIGNATURES = Object.freeze([
  {
    re: /not logged in/i,
    why: 'RPA 各平台在导航到发布页后先判登录态并 early-return，发生在任何表单填充/提交之前',
  },
  {
    re: /未登录|登录失效|登录超时|请重新登录|请先登录/,
    why: '同上；公众号后台 SPA 的「登录超时」也在进入编辑器之前拦截',
  },
  {
    re: /Cookie 缺失|凭证不可用|凭证缺失/,
    why: 'API 直连轨在 cookie 为空时于发出任何请求之前抛出（publisher-router ApiPublisher）',
  },
  {
    re: /风控挂起|RiskSuspended/,
    why: '风控挂起由执行器在派发之前拦截，未进入任何平台请求（与进入 publish() 之前的失败同族，此处收录只为闭合词表）',
  },
])

/**
 * 判断一段错误文本是否属于「可确证未送出」族。
 * @param {string} text
 * @returns {boolean}
 */
function isProvablyNotSubmitted (text) {
  if (typeof text !== 'string' || !text) return false
  return NOT_SENT_SIGNATURES.some((s) => s.re.test(text))
}

/**
 * 命中词表时在错误对象上打标。
 * 返回值语义是**「判定文本命中词表」**，不是「已成功写属性」—— 传字符串时无法写属性
 * （字符串不可变），但判定结果照样为 true，调用方可据此决定自己的处理。
 * 不修改 message、不吞错误、不抛：调用方随后照常 throw 同一个对象。
 * @param {Error|object|string} err
 * @param {string} [text] - 判定文本；缺省取 err.message（err 本身是字符串时就取它）
 * @returns {boolean} 是否命中「可确证未送出」词表
 */
function markDefinitelyNotSent (err, text) {
  const probe = typeof text === 'string' && text
    ? text
    : (typeof err === 'string' ? err : (err && err.message) || '')
  if (!isProvablyNotSubmitted(probe)) return false
  if (err && typeof err === 'object') err.definitelyNotSent = true
  return true
}

/** 供结构锁/文档使用：导出词表（只读） */
function listSignatures () {
  return NOT_SENT_SIGNATURES.map((s) => ({ source: s.re.source, why: s.why }))
}

module.exports = { isProvablyNotSubmitted, markDefinitelyNotSent, listSignatures, NOT_SENT_SIGNATURES }

/**
 * 登录态（status）归一化判定 —— 单一实现。
 *
 * 与「启用态 is_active」（utils/account-active.js）严格正交：这里回答「这个账号现在还登录着吗」，
 * 那里回答「这个账号允许用于发布吗」，两者互不派生。
 *
 * 为什么必须有单一实现：卡片展示层（AccountManagementCard）与账号页行为层（Accounts）曾各写一份
 * status 判定，展示层做 `trim().toLowerCase()`、行为层写严格 `=== 'expired'` —— 于是「卡片显示已失效」
 * 与「点卡片仍按已登录恢复旧凭证」可以同时成立，用户看到的是失效徽章，行为上却带着旧身份 Cookie 进
 * 登录页（2026-09-30 公众号二维码加载失败事故的直接成因之一）。搬到这里后两处共用同一份归一化。
 *
 * 词表口径（不要凭字面直觉增删）：
 * - `active` / `online` → online；`expired` → expired；`unverified` → unverified；
 *   `error` / `failed` / `failure` → error。
 * - 刻意不含 `inactive` / `offline`：那是历史上「启用态被写进 status」撞车写坏的脏值，
 *   此前被映射为「已登录」等于把概念混用固化成契约，现统一落到 unknown 兜底。
 *
 * @param {object} account 账号对象
 * @returns {'online'|'expired'|'unverified'|'error'|'unknown'}
 */
export function accountStatusKind (account) {
  const status = String(account?.status || '').trim().toLowerCase()
  if (status === 'active' || status === 'online') return 'online'
  if (status === 'expired') return 'expired'
  // 未确认：检测过但拿不到正向/负向结论（如视频号禁止 DOM 检测、HTTP 判定不确定）。
  // 不能落到 unknown，否则与「从未检测」共用一种视觉语义，掩盖检测发生过这一事实。
  if (status === 'unverified') return 'unverified'
  if (status === 'error' || status === 'failed' || status === 'failure') return 'error'
  return 'unknown'
}

/**
 * 以账号身份打开平台页时，是否必须走干净会话（不恢复凭证 + 清空分区残留 Cookie）。
 *
 * 背景：旧身份 Cookie（微信 wxuin 等，有效期可到 2027）会被服务端判定为「身份 Cookie ↔ 登录态」不符，
 * 在 scanloginqrcode?action=getqrcode 环节返回 200 空体（真码 ~7.6KB）→ 页面显示「二维码加载失败」
 * （2026-09-16 CDP 取证）。也就是说：对失效账号，「恢复凭证免登录」恰好堵死了它自己唯一的自救路径。
 *
 * 两个输入，缺一不可：
 * 1. `status === 'expired'`（经归一化）—— 库里已落库的失效态；
 * 2. `confirmedExpiredIds` 命中 —— 本轮检测刚确认失效但尚未回写 status（单条 checkLogin 只写
 *    checkedExpiredIds，batchCheck 仅在返回带 loginStatus 时才改写）。少了这一路，「刚点完验证就点
 *    卡片」仍会带着旧凭证进登录页，事故原地复发。
 *
 * @param {object} account 账号对象
 * @param {Set<string>|null} [confirmedExpiredIds] 本轮已确认失效的账号 id 集合
 * @returns {boolean}
 */
export function needsCleanLoginSession (account, confirmedExpiredIds) {
  if (account?.id !== undefined && account?.id !== null && confirmedExpiredIds?.has?.(account.id)) return true
  return accountStatusKind(account) === 'expired'
}

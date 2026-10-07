/**
 * 任务投影：队列内部对「任务」只保留**一份**字段清单。
 *
 * 背景（R14，2026-10-07 真机 E2E 抓出）：
 *   本文件原先在三处各写了一份**手抄字段白名单** —— `_add`（入队）、
 *   `getPendingTasks()`（待派发快照）、`serialize()`（崩溃恢复的 running/delayed）。
 *   平台侧定时新增的 `publishTime` 只被加进了调度器与 batch-manager 的调用侧，
 *   **三处白名单一处都没加** ⇒ 字段在入队瞬间即被丢弃。
 *
 *   后果：publisher 拿到的 `task.publishTime` 恒为 undefined ⇒
 *   `buildPublishArticle` 置 `article.publishTime = null` ⇒
 *   所有「带定时意图就 fail-closed」的守卫都判定为「非定时」。
 *   而 `publishMode:'scheduled'` 活着（所以发布历史显示「定时发布」）——
 *   正是「以为已排期、实际已发出」的完整成因，且任何只看 publisher 入参的测试都抓不到。
 *
 * 改法：字段清单收敛到本文件唯一实现，`_add` 与三个快照路径共用。
 * 今后新增任务字段只需改这里一处；`task-queue-publish-time.test.js` 的反证用例
 * 会锁住「publishMode 与 publishTime 必须同时存在于投影里」。
 */

/**
 * 排队中 / 持久化快照里要保留的任务字段。
 * ⚠️ 与 publishMode 并列——历史上正是只加了 publishMode。
 */
function projectTask (t, extra) {
  return {
    id: t.id,
    platform: t.platform,
    article: t.article,
    owner_subject: t.owner_subject,
    batchId: t.batchId || null,
    accountId: t.accountId || null,
    // 发布模式（'scheduled' = 定时派发）与平台侧排期时间：两者必须成对存在。
    // publishMode 只影响历史记录的展示，publishTime 才决定发布器会不会
    // 带上平台的定时字段——只保前者会让 UI 显示「定时发布」而内容立即发出。
    publishMode: t.publishMode || null,
    publishTime: t.publishTime ?? null,
    retry: t.retry,
    timeout: t.timeout,
    retriesLeft: t.retriesLeft,
    retryOf: t.retryOf || null,
    createdAt: t.createdAt,
    ...extra
  }
}

module.exports = { projectTask }
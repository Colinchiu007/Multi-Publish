/**
 * R14 回归锁：任务队列不得丢弃平台侧定时的核心字段 publishTime。
 *
 * 真机 E2E 事实（2026-10-07）：
 *   排期到 30 天后提交，平台侧返回「提交成功」，本地记 status=executed、
 *   发布历史标「定时发布」—— 但内容被**立即发布**。
 *
 *   根因不在发布器，而在队列入口：`TaskQueue._add` 用**显式字段白名单**重建
 *   entry（id / platform / article / owner_subject / batchId / accountId /
 *   publishMode / retry / timeout / …），`publishTime` 不在其中 ⇒ 入队即丢弃。
 *   下游全链路于是都读到 undefined：
 *     executor → publisher.publish(task)
 *       → buildPublishArticle：`publishTime: task?.publishTime || null`
 *       → rpaViewManager.publish(platform, article)
 *       → publishToutiao：`const scheduled = Boolean(article.publishTime)` ⇒ false
 *   于是所有「带定时意图就 fail-closed」的守卫都判定为「非定时」，永不触发。
 *
 * 为什么既有测试抓不到：它们从「publisher 收到什么」这一层开始断言，
 * 而 publishTime 在**更上游**的队列边界就没了。本文件从入队边界锁。
 */

const fs = require('node:fs')
const path = require('node:path')
const TaskQueue = require('../src/task-queue')

describe('TaskQueue —— 平台侧定时字段不得在队列边界丢失（R14）', () => {
  it('入队后 entry 仍带 publishTime（白名单回归锁）', () => {
    const queue = new TaskQueue()
    queue.pause()
    queue.add({
      platform: 'toutiao',
      article: { title: 'T', content: '正文', accountId: 'acc-1' },
      publishMode: 'scheduled',
      publishTime: '2026-11-06T17:43'
    })
    const [entry] = queue.getPendingTasks()
    expect(entry.publishMode).toBe('scheduled')
    expect(entry.publishTime).toBe('2026-11-06T17:43')
  })

  it('publishTime 与 publishMode 成对存在（历史上正是只加了 publishMode）', () => {
    const queue = new TaskQueue()
    queue.pause()
    queue.add({
      platform: 'toutiao',
      article: { title: 'T', content: '正文' },
      publishMode: 'scheduled',
      publishTime: '2026-11-06T17:43'
    })
    const [entry] = queue.getPendingTasks()
    // 只要 publishMode 在、publishTime 不在 —— 就是本次事故的形态
    expect(entry.publishMode).not.toBeNull()
    expect(entry.publishTime).not.toBeNull()
  })

  it('立即发布时 publishTime 为 null（不排期 ≠ 排期被丢弃）', () => {
    const queue = new TaskQueue()
    queue.pause()
    queue.add({ platform: 'toutiao', article: { title: 'T', content: '正文' } })
    const [entry] = queue.getPendingTasks()
    expect(entry.publishMode).toBeNull()
    expect(entry.publishTime).toBeNull()
  })

  it('执行器拿到的 task 仍带 publishTime（publisher 实际读的就是它）', async () => {
    const queue = new TaskQueue()
    const seen = []
    queue.setExecutor(async (task) => { seen.push(task); return { success: true } })
    queue.add({
      platform: 'toutiao',
      article: { title: 'T', content: '正文', accountId: 'acc-1' },
      publishMode: 'scheduled',
      publishTime: '2026-11-06T17:43'
    })
    await new Promise((r) => setTimeout(r, 80))
    expect(seen.length).toBe(1)
    expect(seen[0].publishTime).toBe('2026-11-06T17:43')
    expect(seen[0].publishMode).toBe('scheduled')
  })

  it('反证：_add 的白名单字面量里必须同时出现 publishMode 与 publishTime', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'task-queue.js'), 'utf8')
    const start = src.indexOf('_add (task, ownerSubject)')
    const end = src.indexOf('this._queue.push(entry)')
    expect(start).toBeGreaterThan(-1)
    expect(end).toBeGreaterThan(start)
    const block = src.slice(start, end)
    expect(block).toMatch(/publishMode:\s*task\.publishMode/)
    expect(block).toMatch(/publishTime:\s*task\.publishTime/)
  })
})
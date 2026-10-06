'use strict'
/**
 * hot-topics-article-publish-driver.js
 *
 * 热门选题「批量图文发布」真实 E2E（CDP 驱动已运行的 Electron 实例）。
 *
 * 覆盖链路（对齐 HotTopics.vue + Publish.vue 的真实 UI 契约）：
 *   热门选题页 → 勾选最新 N 条 → 点【一键发布】→ 发布去向弹窗选【直接发图文】
 *   → 自动调用改写引擎（aiRewrite mode=create）逐条改写并存草稿
 *   → 等待队列终态 → 逐条走 publish:batch 发布到全部可用平台
 *   → 轮询 queue:history 至终态，汇总每平台结果。
 *
 * 与 hot-topics-one-click-video-driver.js 的差别：那条走【生成视频】+故事讲述流水线；
 * 本条走【一键发布】→【直接发图文】→ 改写引擎 + 图文发布。
 *
 * 传输层：apps/desktop/tests/e2e/lib/cdp-client.js（WebSocket 直连 CDP）。
 *
 * 环境变量：
 *   E2E_CDP_URL        CDP 端点（默认 http://127.0.0.1:9279）
 *   E2E_VITE_ORIGIN    renderer 源（默认 http://127.0.0.1:5231）
 *   E2E_TOPIC_COUNT    选题条数（默认 3）
 *   E2E_LABEL          运行标签（输出文件名前缀，默认 ha）
 *   E2E_OUT_DIR        输出目录（默认 <worktree>/e2e-output/<label>）
 *   E2E_REWRITE_TIMEOUT_MS 单条改写等待上限（默认 10 分钟）
 *   E2E_PUBLISH_TIMEOUT_MS 发布终态等待上限（默认 20 分钟）
 *   E2E_PUBLISH_PLATFORMS 逗号分隔平台白名单（缺省全平台）
 */
const fs = require('fs')
const path = require('path')
const { CdpClient, sleep } = require('./lib/cdp-client')

const CDP_URL = process.env.E2E_CDP_URL || 'http://127.0.0.1:9279'
const VITE_ORIGIN = process.env.E2E_VITE_ORIGIN || 'http://127.0.0.1:5231'
const CDP_PORT = Number(CDP_URL.replace(/^https?:\/\//, '').split(':')[1] || 9279)
const TOPIC_COUNT = Number(process.env.E2E_TOPIC_COUNT || 3)
const LABEL = process.env.E2E_LABEL || 'ha'
const OUT_DIR = process.env.E2E_OUT_DIR || path.resolve(__dirname, '..', '..', '..', '..', 'e2e-output', LABEL)
const REWRITE_TIMEOUT_MS = Number(process.env.E2E_REWRITE_TIMEOUT_MS || 10 * 60 * 1000)
const PUBLISH_TIMEOUT_MS = Number(process.env.E2E_PUBLISH_TIMEOUT_MS || 20 * 60 * 1000)
const PUBLISH_PLATFORMS = (process.env.E2E_PUBLISH_PLATFORMS || '').split(',').map((s) => s.trim()).filter(Boolean)

const report = {
  label: LABEL,
  startedAt: new Date().toISOString(),
  identity: null,
  accounts: [],
  topics: [],
  rewrite: [],
  publish: [],
  errors: [],
  status: 'running',
}
const log = (...a) => console.log('[ha-driver]', ...a)

/** 读取列表前 N 条（含复选框 testid 与标题） */
const readTopicsExpr = (n) => `
(() => {
  const items = Array.from(document.querySelectorAll('[data-testid="hot-topic-item"]'))
  return items.slice(0, ${n}).map((el, i) => {
    const chk = el.querySelector('input[data-testid^="hot-topic-check-"]')
    const txt = el.querySelector('.topic-text')
    return {
      index: i + 1,
      id: chk ? chk.getAttribute('data-testid').replace('hot-topic-check-', '') : null,
      topic: txt ? txt.textContent.trim() : '',
    }
  })
})()`

/** 勾选一条 */
const checkTopicExpr = (id) => `
(() => {
  const el = document.querySelector('[data-testid="hot-topic-check-${id}"]')
  if (!el) return { ok: false, reason: 'checkbox-missing' }
  if (el.checked) return { ok: true, already: true }
  el.click()
  return { ok: true }
})()`

/** 点击批量条上的【一键发布】主按钮 */
const clickPublishBtnExpr = `
(() => {
  const bar = document.querySelector('[data-testid="hot-topics-batch-bar"]')
  if (!bar) return { ok: false, reason: 'batch-bar-missing' }
  const btns = Array.from(bar.querySelectorAll('.batch-actions button'))
  const primary = btns.find(b => /cohere-btn-primary/.test(b.className))
  if (!primary) return { ok: false, reason: 'publish-btn-missing' }
  if (primary.disabled) return { ok: false, reason: 'publish-btn-disabled' }
  primary.click()
  return { ok: true }
})()`

/** 队列进度快照（DOM 真源：逐条状态 + 进度文案） */
const QUEUE_STATE_EXPR = `
(() => {
  const prog = document.querySelector('[data-testid="hot-topics-publish-progress"]')
  if (!prog) return { present: false }
  const items = Array.from(prog.querySelectorAll('.progress-item')).map(el => ({
    topic: (el.querySelector('.pi-topic') || {}).textContent || '',
    status: (el.querySelector('.pi-status') || {}).textContent || '',
    cls: el.className || '',
  }))
  const done = !!prog.querySelector('.publish-done')
  return { present: true, items, done, text: (prog.textContent || '').replace(/\\s+/g, ' ').slice(0, 400) }
})()`

async function main () {
  fs.mkdirSync(OUT_DIR, { recursive: true })
  let cdp = null
  let failed = false
  try {
    cdp = await CdpClient.attach(CDP_PORT, VITE_ORIGIN, { retries: 10, backoffMs: 3000 })
    log('CDP 已接入:', cdp.target.url)

    report.identity = await cdp.evaluate(`window.electronAPI.identityGetState().then(r => r.data || r).catch(e => ({ error: String(e) }))`)
    const accounts = await cdp.evaluate(`window.electronAPI.listAccounts().then(r => (r.data||[]).map(a => ({
      id: a.id, platform: a.platform, status: a.status, has_cookies: a.has_cookies, nickname: a.nickname }))).catch(() => [])`)
    report.accounts = accounts
    log('identity=' + (report.identity && report.identity.status) + ' accounts=' + JSON.stringify(accounts.map(a => a.platform + ':' + a.status)))
    if (!report.identity || report.identity.status !== 'authenticated') {
      throw new Error('身份态非 authenticated，图文改写会被许可证门禁拒绝')
    }
    const usable = accounts.filter((a) => a.status === 'active' && a.has_cookies !== false)
    if (!usable.length) throw new Error('无可用 active 账号，图文无法发布')

    // 进入热门选题页
    await cdp.evaluate(`(window.location.hash = '#/hot-topics', 'ok')`)
    await cdp.waitFor(`/#\\/hot-topics/.test(location.hash)`, { timeout: 30000, label: 'route hot-topics' })
    await cdp.waitFor(
      `document.querySelectorAll('[data-testid="hot-topic-item"]').length > 0 || !!document.querySelector('[data-testid="hot-topics-empty"]')`,
      { timeout: 120000, label: 'topics rendered' })

    const topics = await cdp.evaluate(readTopicsExpr(TOPIC_COUNT))
    report.topics = topics
    log('选题数=' + topics.length)
    if (!topics.length) throw new Error('热门选题列表为空')

    // 逐条勾选
    for (const t of topics) {
      const r = await cdp.evaluate(checkTopicExpr(t.id))
      if (!r || !r.ok) { report.errors.push('#' + t.index + ' 勾选失败 ' + (r && r.reason)); continue }
      await sleep(400)
    }
    const selectedCount = await cdp.evaluate(`Array.from(document.querySelectorAll('input[data-testid^="hot-topic-check-"]')).filter(e => e.checked).length`)
    log('已勾选 =', selectedCount)
    if (selectedCount < topics.length) {
      throw new Error('勾选数不足：' + selectedCount + '/' + topics.length)
    }

    // 点【一键发布】→ 发布去向弹窗选【直接发图文】
    const clicked = await cdp.evaluate(clickPublishBtnExpr)
    if (!clicked || !clicked.ok) throw new Error('点击【一键发布】失败：' + (clicked && clicked.reason))
    await cdp.waitFor(`!!document.querySelector('[data-testid="publish-dest-modal"]')`, { timeout: 30000, label: 'dest modal' })
    const chose = await cdp.evaluate(`
    (() => {
      const btn = document.querySelector('[data-testid="publish-dest-article"]')
      if (!btn) return { ok: false, reason: 'article-banner-missing' }
      btn.click()
      return { ok: true }
    })()`)
    if (!chose || !chose.ok) throw new Error('选择【直接发图文】失败：' + (chose && chose.reason))
    log('已选择【直接发图文】，等待改写引擎逐条改写 ...')

    // 等待队列进入 done（全部终态）
    const deadline = Date.now() + REWRITE_TIMEOUT_MS
    let queueState = null
    let lastLog = 0
    while (Date.now() < deadline) {
      queueState = await cdp.evaluate(QUEUE_STATE_EXPR).catch(() => null)
      if (queueState && queueState.present && queueState.done) break
      if (queueState && Date.now() - lastLog > 15000) {
        lastLog = Date.now()
        const marks = (queueState.items || []).map((i) => i.topic.slice(0, 12) + '=' + (i.cls.replace('progress-item', '').trim() || 'pending')).join(' | ')
        log('改写进度:', marks || '(空)')
      }
      await sleep(5000)
    }
    if (!queueState || !queueState.done) {
      report.errors.push('改写队列未在时限内完成: ' + JSON.stringify(queueState).slice(0, 300))
      throw new Error('改写队列超时未完成')
    }
    log('改写队列完成:', queueState.text.slice(0, 200))

    // 收集草稿（hot-topics 源、按更新时间倒序取前 N 条）
    const drafts = await cdp.evaluate(`window.electronAPI.draftList().then(r => ((r && r.data) || [])
      .filter(d => d && d.source === 'hot-topics')
      .sort((a, b) => new Date(b.updatedAt || b.createdAt || 0) - new Date(a.updatedAt || a.createdAt || 0))
      .slice(0, ${topics.length})
      .map(d => ({ id: d.id, title: d.title, contentChars: Array.from(String(d.content || '')).length, createdAt: d.createdAt })))
      .catch(e => ({ error: String(e) }))`)
    if (!Array.isArray(drafts)) throw new Error('草稿读取失败: ' + JSON.stringify(drafts).slice(0, 200))
    log('取到 hot-topics 草稿 =', drafts.length)
    report.rewrite = drafts.map((d, i) => ({ index: i + 1, ...d }))
    if (!drafts.length) throw new Error('无 hot-topics 草稿产出，改写链路未真正落库')

    // 逐条发布：图文（无 video_path）
    const targets = usable
      .filter((a) => (PUBLISH_PLATFORMS.length ? PUBLISH_PLATFORMS.includes(a.platform) : true))
      .map((a) => ({ platform: a.platform, accountId: a.id }))
    if (!targets.length) throw new Error('过滤后无可用发布目标')
    log('发布目标 =', JSON.stringify(targets.map((t) => t.platform)))

    for (const d of drafts) {
      const full = await cdp.evaluate(`window.electronAPI.draftList().then(r => ((r && r.data) || []).find(x => x.id === ${JSON.stringify(d.id)}) || null).catch(() => null)`)
      const title = String((full && full.title) || d.title || '').slice(0, 60)
      const content = String((full && full.content) || '').trim()
      const item = { draftId: d.id, title, contentChars: Array.from(content).length, status: 'pending', targets: targets.map(t => t.platform) }
      report.publish.push(item)
      if (!title) { item.status = 'skipped'; item.error = '标题为空'; continue }

      // 图文平台（小红书/快手/抖音/头条）需至少 1 张图：复用 cover:generate-ai（含本地标题卡兜底）
      const IMAGE_TEXT = ['xiaohongshu', 'kuaishou', 'douyin', 'toutiao']
      let imagePath = null
      if (targets.some((t) => IMAGE_TEXT.includes(t.platform))) {
        const cover = await cdp.evaluate(`window.electronAPI.generateAiCover
          ? window.electronAPI.generateAiCover({ prompt: ${JSON.stringify(title)}, ratio: '3:4' }).then(r => (r && r.code === 0 && r.data && r.data.coverPath) || null).catch(() => null)
          : (window.electronAPI.generateCover ? window.electronAPI.generateCover({ prompt: ${JSON.stringify(title)}, ratio: '3:4' }).then(r => (r && r.code === 0 && r.data && r.data.coverPath) || null).catch(() => null) : null)`)
        if (cover) { imagePath = cover; log('#' + d.id + ' 封面兜底生成 =', cover.slice(-60)) }
        else { report.errors.push('#' + d.id + ' 封面兜底生成失败（图文平台可能因缺图失败）') }
      }

      const article = { title, content, tags: [], aiGenerated: true }
      if (imagePath) { article.image_files = [{ path: imagePath }]; article.images = [imagePath] }

      try {
        const resp = await cdp.evaluate(`window.electronAPI.publishBatch(${JSON.stringify(targets)}, ${JSON.stringify(article)})`)
        if (!resp || resp.code !== 0 || !resp.data || !Array.isArray(resp.data.taskIds)) {
          throw new Error('publishBatch 失败: ' + JSON.stringify(resp).slice(0, 300))
        }
        item.taskIds = resp.data.taskIds
        log('#' + d.id + ' 发布入队 taskIds=' + item.taskIds.join(','))

        const pubDeadline = Date.now() + PUBLISH_TIMEOUT_MS
        while (Date.now() < pubDeadline) {
          const hist = await cdp.evaluate(`window.electronAPI.getQueueHistory().then(r => (r && r.data) || []).catch(() => [])`)
          const tasks = (Array.isArray(hist) ? hist : []).filter((t) => item.taskIds.includes(t.id))
          item.tasks = tasks.map((t) => ({
            id: t.id, platform: t.platform, accountId: t.accountId, status: t.status,
            error: t.error ? String(t.error).slice(0, 300) : undefined,
            resultUrl: (t.result && (t.result.url || t.result.link)) || undefined,
          }))
          const terminal = ['success', 'failed', 'cancelled']
          if (tasks.length >= item.taskIds.length && tasks.every((t) => terminal.includes(t.status))) break
          await sleep(5000)
        }
        const ok = (item.tasks || []).filter((t) => t.status === 'success')
        item.status = ok.length === item.taskIds.length ? 'published' : (ok.length ? 'partial' : 'failed')
        log('#' + d.id + ' 发布终态 ' + item.status + ' (' + ok.length + '/' + item.taskIds.length + ')')
      } catch (e) {
        item.status = 'error'
        item.error = e && e.message ? e.message : String(e)
        report.errors.push('#' + d.id + ' publish: ' + item.error)
        log('#' + d.id + ' 发布失败：' + item.error)
      }
    }

    report.finishedAt = new Date().toISOString()
    const anyPublished = report.publish.some((p) => p.status === 'published' || p.status === 'partial')
    report.status = anyPublished ? 'ok' : 'failed'
  } catch (err) {
    failed = true
    report.status = 'failed'
    report.errors.push(err && err.stack ? err.stack : String(err))
    console.error('E2E_FAILED ' + (err && err.stack ? err.stack : err))
  } finally {
    fs.writeFileSync(path.join(OUT_DIR, LABEL + '-article-report.json'), JSON.stringify(report, null, 2))
    if (cdp) cdp.close()
    console.log('REPORT_DIR=' + OUT_DIR)
    console.log('DRAFTS=' + report.rewrite.length)
    console.log('PUBLISH_OK=' + report.publish.filter((p) => p.status === 'published' || p.status === 'partial').length)
    console.log('STATUS=' + report.status)
    process.exit(failed || report.status !== 'ok' ? 1 : 0)
  }
}

main()

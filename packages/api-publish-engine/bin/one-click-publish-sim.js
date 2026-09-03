#!/usr/bin/env node
/**
 * 一键发布全流程模拟 — 百家号 + 快手
 *
 * 模拟完整的发布流程，使用真实数据结构和 mock HTTP 响应。
 * 当真实 Cookie 可用时，替换 COOKIE 变量即可进行真平台发布。
 */
const BaijiahaoAdapter = require('./src/adapters/baijiahao')
const KuaishouAdapter = require('./src/adapters/kuaishou')
const fs = require('fs')
const path = require('path')
const os = require('os')

// ========== 配置区（替换为真实 Cookie 即可真平台发布）==========
const CONFIG = {
  bjCookie: process.env.BJ_COOKIE || 'BAIDUID=REPLACE_ME; BDUSS=REPLACE_ME',
  ksCookie: process.env.KS_COOKIE || 'kuaishou.web.cp.api_ph=REPLACE_ME',
  videoPath: process.env.VIDEO_PATH || null,
  aiGenerated: process.env.NO_AI !== '1',
  timeout: 600000,
}

// ========== 视频文案（约 100 字）==========
const PUBLISH_CONTENT = {
  title: 'AI 改变生活的 5 种方式',
  content: '人工智能不再是科幻电影里的概念，它已经悄悄融入了我们的日常。早上醒来，智能音箱播报天气和新闻；出门时，导航自动规划最优路线避开拥堵；工作中，AI 帮我们整理文档、生成报表；晚上回家，推荐算法为你挑好最适合的电影。医疗领域，AI 辅助医生更早发现病变；教育领域，个性化学习方案让每个孩子都能因材施教。未来已来，你准备好了吗？',
  tags: ['人工智能', '科技改变生活', 'AI应用', '未来科技', '数字化转型'],
}

// ========== 结果记录 ==========
const results = []

function log(level, msg) {
  const ts = new Date().toISOString().slice(11, 19)
  console.log(`[${ts}] [${level}] ${msg}`)
}

function createTestVideo() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'one-click-publish-'))
  const videoPath = path.join(tmpDir, 'ai-changes-life.mp4')
  // 创建最小有效 MP4（仅用于测试上传流程）
  const header = Buffer.from('00000018667479706d703432000000006d70343269736f6d0000000866726565', 'hex')
  fs.writeFileSync(videoPath, Buffer.concat([header, Buffer.alloc(2 * 1024 * 1024)]))
  return { videoPath, tmpDir }
}

// ========== 百家号发布 ==========
async function publishToBaijiahao(videoPath) {
  log('INFO', '========== 百家号发布开始 ==========')
  const adapter = new BaijiahaoAdapter()
  const startTime = Date.now()

  // Mock HTTP（替换为真实 Cookie 时删除 mock）
  const calls = []
  adapter.http.post = async (url, body, opts) => {
    calls.push({ url, body: String(body || '').slice(0, 200) })
    if (url.includes('preuploadVideo')) return { data: { upload_key: 'KEY_SIM' } }
    if (url.includes('compuploadVideo')) return { data: { mediaId: 'MEDIA_SIM', bos_url: 'https://bos.example.com/v.mp4' } }
    if (url.includes('uploadVideo')) return { data: { code: 0, uploadId: 'UP_SIM' } }
    if (url.includes('video/process')) return { data: { data: { editVideo: { coverImage: 'https://cover.example.com/c.jpg' } } } }
    if (url.includes('article/publish')) return { data: { errno: 0, ret: { id: 'ARTICLE_SIM_' + Date.now() } } }
    return { data: {} }
  }
  adapter.http.get = async (url) => {
    if (url.includes('source=inner')) return { data: 'var BJH__INIT__AUTH__ = "TOKEN_SIM";' }
    if (url.includes('appinfo')) return { data: { data: { user: { app_id: 'APP_SIM' } } } }
    return { data: {} }
  }

  const taskData = {
    ...PUBLISH_CONTENT,
    aiGenerated: CONFIG.aiGenerated,
    video: { path: videoPath, duration: 30, width: 1920, height: 1080 },
  }

  try {
    const result = await adapter.execute(taskData, CONFIG.bjCookie, { timeout: CONFIG.timeout })
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)
    if (result.success) {
      log('OK', `百家号发布成功！耗时 ${elapsed}s，作品 ID: ${result.publishId}`)
      results.push({ platform: 'baijiahao', success: true, publishId: result.publishId, elapsed })
    } else {
      log('FAIL', `百家号发布失败：${result.error}`)
      results.push({ platform: 'baijiahao', success: false, error: result.error, elapsed })
    }
    return result
  } catch (e) {
    log('ERROR', `百家号异常：${e.message}`)
    results.push({ platform: 'baijiahao', success: false, error: e.message })
    return { success: false, error: e.message }
  }
}

// ========== 快手发布 ==========
async function publishToKuaishou() {
  log('INFO', '========== 快手发布开始 ==========')
  const adapter = new KuaishouAdapter()
  const startTime = Date.now()

  // Mock HTTP（替换为真实 Cookie 时删除 mock）
  adapter.http.post = async (url, body) => {
    if (url.includes('upload/finish')) return { data: { result: 1, code: 200, id: 'KS_SIM_' + Date.now() } }
    return { data: {} }
  }

  const postData = adapter.buildPostData({
    ...PUBLISH_CONTENT,
    aiGenerated: CONFIG.aiGenerated,
  })

  try {
    const result = await adapter.publish(CONFIG.ksCookie, postData)
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)
    if (result.success) {
      log('OK', `快手发布成功！耗时 ${elapsed}s，作品 ID: ${result.publishId}`)
      results.push({ platform: 'kuaishou', success: true, publishId: result.publishId, elapsed })
    } else {
      log('FAIL', `快手发布失败：${result.error}`)
      results.push({ platform: 'kuaishou', success: false, error: result.error, elapsed })
    }
    return result
  } catch (e) {
    log('ERROR', `快手异常：${e.message}`)
    results.push({ platform: 'kuaishou', success: false, error: e.message })
    return { success: false, error: e.message }
  }
}

// ========== 主流程 ==========
async function main() {
  log('INFO', '一键发布开始')
  log('INFO', `AI 声明: ${CONFIG.aiGenerated ? 'AI 生成' : '人工创作'}`)
  log('INFO', `标题: ${PUBLISH_CONTENT.title}`)
  log('INFO', `标签: ${PUBLISH_CONTENT.tags.join(', ')}`)

  const videoPath = CONFIG.videoPath || createTestVideo().videoPath
  log('INFO', `视频: ${videoPath} (${(fs.statSync(videoPath).size / 1024 / 1024).toFixed(1)}MB)`)

  // 并行发布
  const [bjResult, ksResult] = await Promise.allSettled([
    publishToBaijiahao(videoPath),
    publishToKuaishou(),
  ])

  // 汇总
  log('INFO', '========== 发布结果汇总 ==========')
  const successCount = results.filter(r => r.success).length
  log('INFO', `成功: ${successCount}/2`)
  for (const r of results) {
    const icon = r.success ? '✅' : '❌'
    const detail = r.success ? `作品 ID: ${r.publishId}` : `错误: ${r.error}`
    log('INFO', `  ${icon} ${r.platform}: ${detail} (${r.elapsed || 'N/A'}s)`)
  }

  // 清理临时文件
  if (!CONFIG.videoPath) {
    try { fs.rmSync(path.dirname(videoPath), { recursive: true, force: true }) } catch (_) {}
  }

  process.exit(successCount === 2 ? 0 : 1)
}

main()

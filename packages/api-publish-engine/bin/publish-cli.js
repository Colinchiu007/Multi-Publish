#!/usr/bin/env node
/**
 * 多平台一键发布 CLI — 独立脚本
 *
 * 用法：
 *   node publish-cli.js --platform baijiahao --cookie "BAIDUID=...; BDUSS=..." --video ./video.mp4 --title "标题" --content "内容"
 *
 * 支持平台：baijiahao, kuaishou
 * 默认 AI 生成声明；--no-ai 可切换为人工创作
 */
const BaijiahaoAdapter = require('./src/adapters/baijiahao')
const KuaishouAdapter = require('./src/adapters/kuaishou')

const args = process.argv.slice(2)
function getArg(name) {
  const i = args.indexOf(name)
  return i >= 0 && i + 1 < args.length ? args[i + 1] : null
}
function hasFlag(name) { return args.includes(name) }

const platform = getArg('--platform') || getArg('-p')
const cookie = getArg('--cookie') || getArg('-c')
const videoPath = getArg('--video') || getArg('-v')
const title = getArg('--title') || getArg('-t') || '未命名视频'
const content = getArg('--content') || getArg('--desc') || ''
const tags = (getArg('--tags') || '').split(',').filter(Boolean)
const aiGenerated = !hasFlag('--no-ai')

if (!platform || !cookie || !videoPath) {
  console.error('用法: node publish-cli.js --platform <平台> --cookie "<Cookie>" --video <路径> [--title 标题] [--content 内容] [--tags 标签1,标签2] [--no-ai]')
  console.error('平台: baijiahao | kuaishou')
  process.exit(1)
}

const fs = require('fs')
const path = require('path')
if (!fs.existsSync(videoPath)) {
  console.error('视频文件不存在: ' + videoPath)
  process.exit(1)
}

async function main() {
  const adapter = platform === 'kuaishou'
    ? new KuaishouAdapter()
    : new BaijiahaoAdapter()

  console.log(`[${platform}] 开始发布: ${title}`)
  console.log(`[${platform}] AI 声明: ${aiGenerated ? 'AI 生成' : '人工创作'}`)
  console.log(`[${platform}] 视频: ${videoPath} (${(fs.statSync(videoPath).size / 1024 / 1024).toFixed(1)}MB)`)

  const startTime = Date.now()

  try {
    // 探测视频宽高
    const { execFileSync } = require('child_process')
    let width = 1920, height = 1080, duration = 30
    try {
      const ffprobe = require('./node_modules/.bin/ffprobe') || 'ffprobe'
      const info = JSON.parse(execFileSync('ffprobe', [
        '-v', 'quiet', '-print_format', 'json', '-show_streams', videoPath
      ], { timeout: 10000 }).toString())
      const v = info.streams.find(s => s.codec_type === 'video')
      if (v) { width = v.width || 1920; height = v.height || 1080; duration = parseFloat(v.duration) || 30 }
    } catch (_) { /* 使用默认值 */ }

    const taskData = {
      title,
      content,
      tags,
      aiGenerated,
      video: { path: videoPath, duration, width, height },
    }

    const result = await adapter.execute(taskData, cookie, { timeout: 600000 })

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)
    if (result.success) {
      console.log(`✅ [${platform}] 发布成功！耗时 ${elapsed}s`)
      console.log(`   作品 ID: ${result.publishId}`)
      console.log(`   链接: ${result.url || 'N/A'}`)
    } else {
      console.error(`❌ [${platform}] 发布失败（${elapsed}s）: ${result.error}`)
      process.exit(1)
    }
  } catch (e) {
    console.error(`❌ [${platform}] 异常: ${e.message}`)
    process.exit(1)
  }
}

main()

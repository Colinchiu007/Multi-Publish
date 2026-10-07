/**
 * creator-adapter-live.js — 对**应用真正使用的** adapter 做真实 API 验证
 *
 * 为什么需要它：P0 冒烟（creator_p0_smoke.py）直接调依赖包的
 * YouTubeCollector._fetch()，验证的是**依赖库**的行为；而应用走的是
 * creator-collector.resolveChannelId()（自行用 forHandle/forUsername 解析）。
 * 两者结论可以完全不同——依赖库 @handle 会静默返回别的频道，adapter 不会。
 * 只重测依赖库等于反复确认一个已知问题，却没验证我们自己的修复。
 *
 * 用法：set YOUTUBE_API_KEY=<key> && node scripts/creator-adapter-live.js
 */
'use strict'

const path = require('path')
const https = require('https')
const ROOT = path.resolve(__dirname, '..')
const {
  resolveChannelId, CREATOR_INPUT_ERRORS, YOUTUBE_API_BASE,
} = require(path.join(ROOT, 'electron/services/creator-collector'))

const API_KEY = process.env.YOUTUBE_API_KEY || ''
const EXPECTED = 'UC_x5XG1OV2P6uZZ5FSM9Ttw'

/** 真实 HTTP，但保留 status 以便失败分级能被复现（不是只抛异常） */
function httpGet (url, params) {
  const qs = Object.entries(params || {}).map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&')
  const full = `${url}?${qs}`
  return new Promise((resolve, reject) => {
    https.get(full, (res) => {
      let raw = ''
      res.on('data', (d) => { raw += d })
      res.on('end', () => {
        let json = null
        try { json = JSON.parse(raw) } catch (_) { /* 非 JSON 交由状态码分级 */ }
        if (res.statusCode >= 400) {
          const e = new Error(`HTTP ${res.statusCode}`)
          e.response = { status: res.statusCode, data: json }
          reject(e); return
        }
        resolve(json)
      })
    }).on('error', reject)
  })
}

const CASES = [
  ['裸频道 ID（零请求）', EXPECTED, EXPECTED],
  ['完整 URL + /channel/UC…', `https://www.youtube.com/channel/${EXPECTED}`, EXPECTED],
  ['完整 URL + @handle', 'https://www.youtube.com/@GoogleDevelopers', EXPECTED],
  ['裸串 @handle（先补 scheme）', '@GoogleDevelopers', EXPECTED],
  ['裸串域名 + @handle', 'youtube.com/@GoogleDevelopers', EXPECTED],
  ['完整 URL + /c/', 'https://www.youtube.com/c/GoogleDevelopers', EXPECTED],
  ['完整 URL + /user/', 'https://www.youtube.com/user/GoogleDevelopers', EXPECTED],
]

const NEGATIVE = [
  ['作品链接明确报错', 'https://www.youtube.com/watch?v=abc', CREATOR_INPUT_ERRORS.NOT_A_CHANNEL],
  ['播放列表明确报错', 'https://www.youtube.com/playlist?list=PL1', CREATOR_INPUT_ERRORS.NOT_A_CHANNEL],
  ['非 YouTube 域名报错', 'https://v.douyin.com/abc/', CREATOR_INPUT_ERRORS.INVALID_INPUT],
  ['空输入报错', '', CREATOR_INPUT_ERRORS.INVALID_INPUT],
]

async function main () {
  if (!API_KEY) {
    console.error('未设置 YOUTUBE_API_KEY')
    process.exit(2)
  }
  let failed = 0

  for (const [label, input, expected] of CASES) {
    try {
      const got = await resolveChannelId(input, { apiKey: API_KEY, httpGet })
      const ok = got === expected
      if (!ok) failed += 1
      console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}  -> ${got}${ok ? '' : `  (期望 ${expected})`}`)
    } catch (e) {
      failed += 1
      console.log(`FAIL  ${label}  -> 抛错 ${e.code || e.name}: ${String(e.message).slice(0, 90)}`)
    }
  }

  for (const [label, input, expectedCode] of NEGATIVE) {
    try {
      await resolveChannelId(input, { apiKey: API_KEY, httpGet })
      failed += 1
      console.log(`FAIL  ${label}  -> 本应报错却放行了`)
    } catch (e) {
      const ok = e.code === expectedCode
      if (!ok) failed += 1
      console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}  -> ${e.code}`)
    }
  }

  // 不存在的频道：必须 fail-closed，绝不回退到用输入当 ID
  try {
    const got = await resolveChannelId('https://www.youtube.com/@this-handle-should-not-exist-9z8x7c6v', { apiKey: API_KEY, httpGet })
    failed += 1
    console.log(`FAIL  不存在的频道 fail-closed  -> 竟返回 ${got}`)
  } catch (e) {
    const ok = e.code === CREATOR_INPUT_ERRORS.CHANNEL_NOT_FOUND
    if (!ok) failed += 1
    console.log(`${ok ? 'PASS' : 'FAIL'}  不存在的频道 fail-closed  -> ${e.code}`)
  }

  console.log('\n' + (failed === 0
    ? '结论: adapter 全部通过 —— 依赖库的 @handle 缺陷已被 adapter 兜住。'
    : `结论: ${failed} 项失败`))
  process.exit(failed === 0 ? 0 : 1)
}

main().catch((e) => { console.error('未捕获异常:', e && e.message); process.exit(3) })
const WebSocket = require('ws')
const fs = require('fs')
const http = require('http')
const path = require('path')

const OUT_DIR = 'D:/Data/projects/Multi-Publish/.ccg/tasks/video-clone-real-agv-e2e'
const TEST_VIDEO = 'D:/Data/projects/mp-worktrees/mp-restart/test-video.mp4'

async function main() {
  // 获取主页面 WS 端点
  const endpoints = await new Promise((resolve, reject) => {
    http.get('http://localhost:11202/json', (res) => {
      let data = ''
      res.on('data', c => data += c)
      res.on('end', () => resolve(JSON.parse(data)))
    }).on('error', reject)
  })
  
  const mainPage = endpoints.find(e => !e.url.includes('devtools'))
  console.log('MAIN_PAGE:', mainPage.url)
  
  const ws = new WebSocket(mainPage.webSocketDebuggerUrl)
  let msgId = 0
  const callbacks = new Map()
  
  ws.on('message', (data) => {
    const msg = JSON.parse(data.toString())
    const cb = callbacks.get(msg.id)
    if (cb) { cb(msg.result || msg.error); callbacks.delete(msg.id) }
  })
  
  await new Promise(r => ws.on('open', r))
  console.log('WS_CONNECTED')
  
  function send(method, params = {}) {
    return new Promise((resolve) => {
      const id = ++msgId
      callbacks.set(id, resolve)
      ws.send(JSON.stringify({ id, method, params }))
    })
  }
  
  // 先检查页面 URL 和 API 可用性
  const checkUrl = await send('Runtime.evaluate', { expression: "window.location.href", returnByValue: true })
  console.log('PAGE_URL:', checkUrl.result && checkUrl.result.value)
  
  const checkApi = await send('Runtime.evaluate', { 
    expression: "typeof window.electronAPI === 'object' && typeof window.electronAPI.videoClone === 'object' && typeof window.electronAPI.videoClone.run === 'function'",
    returnByValue: true
  })
  console.log('API_AVAILABLE:', checkApi.result && checkApi.result.value)
  
  if (!checkApi.result || !checkApi.result.value) {
    console.log('ERROR: API 不可用')
    ws.close()
    return
  }
  
  // 触发视频克隆
  const t0 = Date.now()
  console.log('CALLING video-clone:run...')
  const code = `
    (async () => {
      try {
        const result = await window.electronAPI.videoClone.run({
          source: { type: 'local', path: '${TEST_VIDEO.replace(/\\/g, '\\\\')}' },
          options: { target: 'P1', mode: 'structure', replicationLevel: 'L1', failOnLowSimilarity: false }
        })
        return JSON.stringify({
          code: result.code,
          ok: result.data && result.data.ok,
          runId: result.data && result.data.runId,
          errorCode: result.data && result.data.error && result.data.error.errorCode,
          errorMsg: result.data && result.data.error && result.data.error.message,
          outputPath: result.data && result.data.artifacts && result.data.artifacts.output && result.data.artifacts.output.path,
          outputSize: result.data && result.data.artifacts && result.data.artifacts.output && result.data.artifacts.output.sizeBytes,
          durationSec: result.data && result.data.artifacts && result.data.artifacts.output && result.data.artifacts.output.durationSec,
          similarityVerdict: result.data && result.data.similarity && result.data.similarity.verdict,
          degraded: result.data && result.data.similarity && result.data.similarity.warnings && result.data.similarity.warnings.degradedAssets,
          sceneCount: result.data && result.data.artifacts && result.data.artifacts.assets && result.data.artifacts.assets.scenes && result.data.artifacts.assets.scenes.length,
          sceneKinds: result.data && result.data.artifacts && result.data.artifacts.assets && result.data.artifacts.assets.scenes && result.data.artifacts.assets.scenes.map(s => s.kind)
        })
      } catch (e) {
        return JSON.stringify({ catchError: e.message, stack: (e.stack || '').substring(0, 300) })
      }
    })()
  `
  const r = await send('Runtime.evaluate', { expression: code, awaitPromise: true, returnByValue: true, timeout: 600000 })
  const elapsed = Date.now() - t0
  console.log('ELAPSED_MS:', elapsed)
  const val = r.result && r.result.value
  console.log('RESULT:', JSON.stringify(val, null, 2))
  
  if (val) {
    const parsed = JSON.parse(val)
    if (parsed.ok) {
      console.log('E2E_REAL_AGV_PASS')
      if (parsed.outputPath) {
        console.log('OUTPUT_PATH:', parsed.outputPath)
        console.log('OUTPUT_SIZE:', parsed.outputSize)
        console.log('DURATION:', parsed.durationSec)
        console.log('SCENE_KINDS:', parsed.sceneKinds)
        console.log('DEGRADED:', parsed.degraded)
      }
    } else {
      console.log('E2E_REAL_AGV_FAIL')
      console.log('ERROR:', parsed.errorCode, parsed.errorMsg)
    }
  }
  ws.close()
}
main().catch(e => console.error('ERROR', e.message))

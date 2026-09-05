const WebSocket = require('ws')
const fs = require('fs')
const http = require('http')
const path = require('path')

const OUT_DIR = 'D:/Data/projects/Multi-Publish/.ccg/tasks/video-clone-real-agv-e2e'
const TEST_VIDEO = 'D:/Data/projects/Multi-Publish/.ccg/tasks/video-clone-real-url-e2e/multi-scene-src.mp4'

async function main() {
  // 获取WS端点
  const endpoints = await new Promise((resolve, reject) => {
    http.get('http://localhost:11202/json', (res) => {
      let data = ''
      res.on('data', c => data += c)
      res.on('end', () => resolve(JSON.parse(data)))
    }).on('error', reject)
  })
  
  const ws = new WebSocket(endpoints[0].webSocketDebuggerUrl)
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
  
  // 先检查 API 是否可用
  const checkApi = await send('Runtime.evaluate', { 
    expression: "typeof window.electronAPI === 'object' && typeof window.electronAPI.videoClone === 'object' && typeof window.electronAPI.videoClone.run === 'function'",
    returnByValue: true
  })
  console.log('API_AVAILABLE:', checkApi.result && checkApi.result.value)
  
  if (!checkApi.result || !checkApi.result.value) {
    // 检查实际 API 暴露名
    const keys = await send('Runtime.evaluate', { 
      expression: "Object.keys(window).filter(k => k.includes('electron') || k.includes('API') || k.includes('publish') || k.includes('clone'))",
      returnByValue: true
    })
    console.log('API_KEYS:', JSON.stringify(keys.result && keys.result.value))
    ws.close()
    return
  }
  
  // 触发视频克隆
  const t0 = Date.now()
  const code = `
    (async () => {
      const result = await window.electronAPI.videoClone.run({
        source: { type: 'local', path: '${TEST_VIDEO.replace(/\\/g, '\\\\')}' },
        options: { target: 'P1', mode: 'structure', replicationLevel: 'L1', failOnLowSimilarity: false }
      })
      return JSON.stringify({
        ok: result.code === 0 && result.data && result.data.ok,
        runId: result.data && result.data.runId,
        durationSec: result.data && result.data.report && result.data.report.meta && result.data.report.meta.durationSec,
        outputPath: result.data && result.data.artifacts && result.data.artifacts.output && result.data.artifacts.output.path,
        outputSize: result.data && result.data.artifacts && result.data.artifacts.output && result.data.artifacts.output.sizeBytes,
        error: result.data && result.data.error,
        similarityVerdict: result.data && result.data.similarity && result.data.similarity.verdict,
        degraded: result.data && result.data.similarity && result.data.similarity.warnings && result.data.similarity.warnings.degradedAssets
      })
    })()
  `
  console.log('CALLING video-clone:run...')
  const result = await send('Runtime.evaluate', { expression: code, awaitPromise: true, returnByValue: true, timeout: 600000 })
  const elapsed = Date.now() - t0
  console.log('ELAPSED_MS:', elapsed)
  console.log('RESULT:', JSON.stringify(result.result && result.result.value, null, 2))
  
  const data = result.result && result.result.value
  if (data && data.outputPath) {
    // 检查视频文件是否存在
    const exists = await send('Runtime.evaluate', {
      expression: `(() => { try { const fs = require('fs'); return fs.existsSync('${data.outputPath.replace(/\\/g, '\\\\')}') ? 'EXISTS' : 'NOT_FOUND' } catch(e) { return 'ERR:' + e.message } })()`,
      returnByValue: true
    })
    console.log('FILE:', exists.result && exists.result.value)
  }
  
  ws.close()
  console.log('DONE')
}
main().catch(e => console.error('ERROR', e.message))

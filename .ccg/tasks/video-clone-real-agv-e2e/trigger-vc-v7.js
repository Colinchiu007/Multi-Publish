const WebSocket = require('ws')
const fs = require('fs')
const http = require('http')

const TEST_VIDEO = 'D:/Data/projects/mp-worktrees/mp-restart/test-video.mp4'

async function main() {
  const endpoints = await new Promise((resolve, reject) => {
    http.get('http://localhost:11202/json', (res) => {
      let data = ''
      res.on('data', c => data += c)
      res.on('end', () => resolve(JSON.parse(data)))
    }).on('error', reject)
  })
  
  console.log('PAGES:', endpoints.length)
  for (const e of endpoints) console.log('  ', e.title, '|', e.url.substring(0, 80))
  
  const mainPage = endpoints.find(e => !e.url.includes('devtools') && e.url.includes('127.0.0.1'))
  if (!mainPage) { console.log('NO MAIN PAGE'); return }
  
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
  
  const hasApi = await send('Runtime.evaluate', { expression: "typeof window.electronAPI === 'object' && typeof window.electronAPI.videoClone === 'object' && typeof window.electronAPI.videoClone.run === 'function'", returnByValue: true })
  console.log('HAS_API:', hasApi.result && hasApi.result.value)
  
  if (!hasApi.result || !hasApi.result.value) {
    console.log('API not ready')
    ws.close()
    return
  }
  
  const t0 = Date.now()
  console.log('CALLING video-clone:run...')
  const code = `
    (async () => {
      try {
        const result = await window.electronAPI.videoClone.run({
          source: { type: 'local', path: '${TEST_VIDEO.replace(/\\/g, '\\\\')}' },
          options: { target: 'P1', mode: 'structure', replicationLevel: 'L1', failOnLowSimilarity: false }
        })
        const out = result.data && result.data.artifacts && result.data.artifacts.output
        const assets = result.data && result.data.artifacts && result.data.artifacts.assets
        return JSON.stringify({
          code: result.code,
          ok: result.data && result.data.ok,
          runId: result.data && result.data.runId,
          errorCode: result.data && result.data.error && result.data.error.errorCode,
          errorMsg: result.data && result.data.error && result.data.error.message,
          outputPath: out && out.path,
          outputSize: out && out.sizeBytes,
          durationSec: out && out.durationSec,
          similarityVerdict: result.data && result.data.similarity && result.data.similarity.verdict,
          degraded: result.data && result.data.similarity && result.data.similarity.warnings && result.data.similarity.warnings.degradedAssets,
          sceneCount: assets && assets.scenes && assets.scenes.length,
          sceneKinds: assets && assets.scenes && assets.scenes.map(s => s.kind),
          firstSceneDegraded: assets && assets.scenes && assets.scenes[0] && assets.scenes[0].degraded,
          firstSceneSource: assets && assets.scenes && assets.scenes[0] && assets.scenes[0].source
        })
      } catch (e) {
        return JSON.stringify({ catchError: e.message })
      }
    })()
  `
  const r = await send('Runtime.evaluate', { expression: code, awaitPromise: true, returnByValue: true, timeout: 600000 })
  const elapsed = Date.now() - t0
  console.log('ELAPSED_MS:', elapsed)
  const val = r.result && r.result.value
  console.log('RESULT:', JSON.stringify(val, null, 2))
  ws.close()
}
main().catch(e => console.error('ERROR', e.message))

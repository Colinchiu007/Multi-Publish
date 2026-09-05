const WebSocket = require('ws')
const fs = require('fs')
const http = require('http')

const TEST_VIDEO = 'D:/Data/projects/mp-worktrees/mp-restart/test-video.mp4'
const OUT_DIR = 'D:/Data/projects/Multi-Publish/.ccg/tasks/video-clone-real-agv-e2e'

async function main() {
  const endpoints = await new Promise((resolve, reject) => {
    http.get('http://localhost:11202/json', (res) => {
      let data = ''
      res.on('data', c => data += c)
      res.on('end', () => resolve(JSON.parse(data)))
    }).on('error', reject)
  })
  
  const mainPage = endpoints.find(e => !e.url.includes('devtools'))
  if (!mainPage) { console.log('NO_PAGE'); return }
  console.log('PAGE:', mainPage.url)
  
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
  
  // 异步触发，不等待结果
  const code = `
    (() => {
      const startTime = Date.now()
      window.electronAPI.videoClone.run({
        source: { type: 'local', path: '${TEST_VIDEO.replace(/\\/g, '\\\\')}' },
        options: { target: 'P1', mode: 'structure', replicationLevel: 'L1', failOnLowSimilarity: false }
      }).then(result => {
        const out = result.data && result.data.artifacts && result.data.artifacts.output
        const assets = result.data && result.data.artifacts && result.data.artifacts.assets
        const evidence = {
          triggeredAt: new Date().toISOString(),
          elapsedMs: Date.now() - startTime,
          code: result.code,
          ok: result.data && result.data.ok,
          runId: result.data && result.data.runId,
          errorCode: result.data && result.data.error && result.data.error.errorCode,
          errorMsg: result.data && result.data.error && result.data.error.message,
          outputPath: out && out.path,
          outputSize: out && out.sizeBytes,
          durationSec: out && out.durationSec,
          fps: out && out.fps,
          width: out && out.width, height: out && out.height,
          similarityVerdict: result.data && result.data.similarity && result.data.similarity.verdict,
          degraded: result.data && result.data.similarity && result.data.similarity.warnings && result.data.similarity.warnings.degradedAssets,
          sceneCount: assets && assets.scenes && assets.scenes.length,
          sceneKinds: assets && assets.scenes && assets.scenes.map(s => s.kind),
          firstSceneDegraded: assets && assets.scenes && assets.scenes[0] && assets.scenes[0].degraded,
          firstSceneSource: assets && assets.scenes && assets.scenes[0] && assets.scenes[0].source
        }
        // 写入 evidence 文件供后续检查
        const fs = require('fs')
        fs.writeFileSync('${OUT_DIR.replace(/\\/g, '\\\\')}\\\\evidence-agv.json', JSON.stringify(evidence, null, 2))
      }).catch(e => {
        const fs = require('fs')
        fs.writeFileSync('${OUT_DIR.replace(/\\/g, '\\\\')}\\\\evidence-agv.json', JSON.stringify({ error: e.message, stack: (e.stack || '').substring(0,1000) }, null, 2))
      })
      return 'FIRED'
    })()
  `
  const r = await send('Runtime.evaluate', { expression: code, returnByValue: true, timeout: 10000 })
  console.log('TRIGGER:', r.result && r.result.value)
  ws.close()
}
main().catch(e => console.error('ERROR', e.message))

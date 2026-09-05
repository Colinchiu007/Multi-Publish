const WebSocket = require('ws')
const http = require('http')

async function main() {
  const endpoints = await new Promise((resolve, reject) => {
    http.get('http://localhost:11202/json', (res) => {
      let data = ''
      res.on('data', c => data += c)
      res.on('end', () => resolve(JSON.parse(data)))
    }).on('error', reject)
  })
  
  const mainPage = endpoints.find(e => !e.url.includes('devtools'))
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
  
  // 检查当前页面
  const url = await send('Runtime.evaluate', { expression: "window.location.href", returnByValue: true })
  console.log('URL:', url.result && url.result.value)
  
  // 快速测试：只检查 deps 中 assetGenerator 是否可用
  const code = `
    (async () => {
      // 不做完整流水线，只测试 generateVideo 是否可用
      const result = await window.electronAPI.videoClone.run({
        source: { type: 'local', path: 'D:/Data/projects/mp-worktrees/mp-restart/test-video.mp4' },
        options: { target: 'P1', mode: 'structure', replicationLevel: 'L1', failOnLowSimilarity: false }
      })
      const out = result.data && result.data.artifacts && result.data.artifacts.output
      const assets = result.data && result.data.artifacts && result.data.artifacts.assets
      return JSON.stringify({
        code: result.code, ok: result.data && result.data.ok,
        sceneKinds: assets && assets.scenes && assets.scenes.map(s => s.kind),
        firstSceneDegraded: assets && assets.scenes && assets.scenes[0] && assets.scenes[0].degraded,
        firstSceneSource: assets && assets.scenes && assets.scenes[0] && assets.scenes[0].source
      })
    })()
  `
  const r = await send('Runtime.evaluate', { expression: code, awaitPromise: true, returnByValue: true, timeout: 600000 })
  console.log('RESULT:', r.result && r.result.value)
  ws.close()
}
main().catch(e => console.error('ERROR', e.message))

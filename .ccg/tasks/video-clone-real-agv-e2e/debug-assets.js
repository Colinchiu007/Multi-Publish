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
  
  // 直接调用 generateVideo 看失败原因
  const code = `
    (async () => {
      try {
        // 通过 Vue component 拿 container 里的 assetGenerator
        const vueApp = document.querySelector('#app').__vue_app__
        const vm = vueApp._instance && vueApp._instance.proxy
        // 直接调用 electronAPI 中 publish 的底层方法
        // 先从 preload 拿一个能直接调 ipcRenderer 的 API 探底
        const testResult = await window.electronAPI.videoClone.run({
          source: { type: 'local', path: '${TEST_VIDEO.replace(/\\/g, '\\\\')}' },
          options: { target: 'P1', mode: 'structure', replicationLevel: 'L1', failOnLowSimilarity: false }
        })
        return JSON.stringify({
          code: testResult.code,
          ok: testResult.data && testResult.data.ok,
          artifactsKeys: testResult.data && testResult.data.artifacts ? Object.keys(testResult.data.artifacts) : null,
          assetsKeys: testResult.data && testResult.data.artifacts && testResult.data.artifacts.assets ? Object.keys(testResult.data.artifacts.assets) : null,
          assetsDegraded: testResult.data && testResult.data.artifacts && testResult.data.artifacts.assets && testResult.data.artifacts.assets.degraded,
          sceneCount: testResult.data && testResult.data.artifacts && testResult.data.artifacts.assets && testResult.data.artifacts.assets.scenes && testResult.data.artifacts.assets.scenes.length,
          firstScene: testResult.data && testResult.data.artifacts && testResult.data.artifacts.assets && testResult.data.artifacts.assets.scenes && testResult.data.artifacts.assets.scenes[0] && JSON.stringify(testResult.data.artifacts.assets.scenes[0]).substring(0, 400),
          reportMeta: testResult.data && testResult.data.report && testResult.data.report.meta && JSON.stringify(testResult.data.report.meta).substring(0, 200)
        })
      } catch (e) {
        return JSON.stringify({ catchError: e.message })
      }
    })()
  `
  const r = await send('Runtime.evaluate', { expression: code, awaitPromise: true, returnByValue: true, timeout: 600000 })
  console.log('RESULT:', r.result && r.result.value)
  ws.close()
}
main().catch(e => console.error('ERROR', e.message))

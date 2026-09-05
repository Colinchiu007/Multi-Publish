const WebSocket = require('ws')
const fs = require('fs')
const http = require('http')

async function main() {
  const endpoints = await new Promise((resolve, reject) => {
    http.get('http://localhost:11202/json', (res) => {
      let data = ''
      res.on('data', c => data += c)
      res.on('end', () => resolve(JSON.parse(data)))
    }).on('error', reject)
  })
  
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
  
  // 通过 preload 调用 IPC，看能否拿到更多信息
  // 先检查 electronAPI 中是否有 publish（里面可能有 assetGenerator 信息）
  const code = `
    (async () => {
      try {
        // 直接调用 videoClone.run，看 result 中是否有更多信息
        const result = await window.electronAPI.videoClone.run({
          source: { type: 'local', path: 'D:/Data/projects/mp-worktrees/mp-restart/test-video.mp4' },
          options: { target: 'P1', mode: 'structure', replicationLevel: 'L1', failOnLowSimilarity: false }
        })
        return JSON.stringify({
          code: result.code,
          dataKeys: result.data ? Object.keys(result.data) : null,
          errorCode: result.data && result.data.error && result.data.error.errorCode,
          errorMsg: result.data && result.data.error && result.data.error.message
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

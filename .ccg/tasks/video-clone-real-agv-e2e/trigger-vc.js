const WebSocket = require('ws')
const fs = require('fs')
const http = require('http')

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
  
  // 通过 IPC 调用 video-clone:run 或在 renderer 中触发
  const code = `
    (async () => {
      const result = await window.electronAPI.invoke('video-clone:run', {
        source: { type: 'local', path: 'D:/Data/projects/Multi-Publish/.ccg/tasks/video-clone-real-url-e2e/multi-scene-src.mp4' },
        options: { target: 'P1', mode: 'structure', replicationLevel: 'L1', failOnLowSimilarity: false }
      })
      return JSON.stringify({ code: result.code, ok: result.data && result.data.ok, runId: result.data && result.data.runId, error: result.data && result.data.error })
    })()
  `
  const result = await send('Runtime.evaluate', { expression: code, awaitPromise: true, returnByValue: true })
  console.log('RESULT:', JSON.stringify(result, null, 2))
  ws.close()
}
main().catch(e => console.error('ERROR', e.message))

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
  
  // 检查当前页面和 senderFrame
  const url = await send('Runtime.evaluate', { expression: "window.location.href", returnByValue: true })
  console.log('PAGE_URL:', url.result && url.result.value)
  
  // 尝试直接调用 IPC handler（绕过 senderCheck）
  // 通过 preload 暴露的 API
  const code = `
    (async () => {
      try {
        const result = await window.electronAPI.videoClone.run({
          source: { type: 'local', path: '${TEST_VIDEO.replace(/\\/g, '\\\\')}' },
          options: { target: 'P1', mode: 'structure', replicationLevel: 'L1', failOnLowSimilarity: false }
        })
        return JSON.stringify({ code: result.code, ok: result.data && result.data.ok, error: result.data && result.data.error && (result.data.error.code || JSON.stringify(result.data.error).substring(0, 200)), runId: result.data && result.data.runId })
      } catch (e) {
        return JSON.stringify({ catchError: e.message })
      }
    })()
  `
  console.log('CALLING...')
  const r = await send('Runtime.evaluate', { expression: code, awaitPromise: true, returnByValue: true, timeout: 600000 })
  console.log('RESULT:', r.result && r.result.value)
  ws.close()
}
main().catch(e => console.error('ERROR', e.message))

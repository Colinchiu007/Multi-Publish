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
  
  const code = `
    (async () => {
      try {
        const result = await window.electronAPI.videoClone.run({
          source: { type: 'local', path: '${TEST_VIDEO.replace(/\\/g, '\\\\')}' },
          options: { target: 'P1', mode: 'structure', replicationLevel: 'L1', failOnLowSimilarity: false }
        })
        return JSON.stringify({
          type: 'success',
          resultCode: result.code,
          resultDataOk: result.data && result.data.ok,
          resultDataKeys: result.data ? Object.keys(result.data) : null,
          resultDataErrorKeys: result.data && result.data.error ? Object.keys(result.data.error) : null,
          resultDataErrorJSON: result.data && result.data.error ? JSON.stringify(result.data.error).substring(0, 500) : null,
          outputPath: result.data && result.data.artifacts && result.data.artifacts.output && result.data.artifacts.output.path
        })
      } catch (e) {
        return JSON.stringify({ type: 'error', message: e.message, stack: (e.stack || '').substring(0, 500) })
      }
    })()
  `
  console.log('CALLING...')
  const r = await send('Runtime.evaluate', { expression: code, awaitPromise: true, returnByValue: true, timeout: 600000 })
  const val = r.result && r.result.value
  console.log('RESULT:', JSON.stringify(val, null, 2))
  ws.close()
}
main().catch(e => console.error('ERROR', e.message))

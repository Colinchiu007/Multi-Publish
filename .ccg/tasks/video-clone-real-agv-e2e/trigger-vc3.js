const WebSocket = require('ws')
const fs = require('fs')
const http = require('http')
const path = require('path')

const TEST_VIDEO = 'D:/Data/projects/Multi-Publish/.ccg/tasks/video-clone-real-url-e2e/multi-scene-src.mp4'

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
      const result = await window.electronAPI.videoClone.run({
        source: { type: 'local', path: '${TEST_VIDEO.replace(/\\/g, '\\\\')}' },
        options: { target: 'P1', mode: 'structure', replicationLevel: 'L1', failOnLowSimilarity: false }
      })
      return JSON.stringify({
        code: result.code,
        ok: result.data && result.data.ok,
        runId: result.data && result.data.runId,
        errorMessage: result.data && result.data.error && result.data.error.message,
        errorCode: result.data && result.data.error && (result.data.error.code || result.data.error.errorCode),
        stages: result.data && result.data.report ? 'has_report' : 'no_report',
        outputPath: result.data && result.data.artifacts && result.data.artifacts.output && result.data.artifacts.output.path,
        outputSize: result.data && result.data.artifacts && result.data.artifacts.output && result.data.artifacts.output.sizeBytes,
        rawKeys: result.data ? Object.keys(result.data) : [],
        rawErrorKeys: result.data && result.data.error ? Object.keys(result.data.error) : [],
        rawErrorJSON: result.data && result.data.error ? JSON.stringify(result.data.error).substring(0, 500) : 'no_error'
      })
    })()
  `
  console.log('CALLING...')
  const r = await send('Runtime.evaluate', { expression: code, awaitPromise: true, returnByValue: true, timeout: 600000 })
  console.log(JSON.stringify(r.result && r.result.value, null, 2))
  ws.close()
}
main().catch(e => console.error('ERROR', e.message))

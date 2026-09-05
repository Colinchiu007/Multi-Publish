const WebSocket = require('ws')
const path = require('path')
const fs = require('fs')

async function main() {
  // 先获取 WebSocket 端点
  const http = require('http')
  const endpoints = await new Promise((resolve, reject) => {
    http.get('http://localhost:11202/json', (res) => {
      let data = ''
      res.on('data', c => data += c)
      res.on('end', () => resolve(JSON.parse(data)))
    }).on('error', reject)
  })
  console.log('ENDPOINTS:', endpoints.length, 'pages')
  
  const wsUrl = endpoints[0].webSocketDebuggerUrl
  console.log('WS_URL:', wsUrl)
  
  const ws = new WebSocket(wsUrl)
  let msgId = 0
  const callbacks = new Map()
  
  ws.on('message', (data) => {
    const msg = JSON.parse(data.toString())
    const cb = callbacks.get(msg.id)
    if (cb) { cb(msg.result); callbacks.delete(msg.id) }
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
  
  // 导航
  const result = await send('Runtime.evaluate', { expression: 'window.location.hash = "#/create"; window.location.hash' })
  console.log('NAV:', result && result.result && result.result.value)
  
  await new Promise(r => setTimeout(r, 3000))
  
  // 截图
  const screenshot = await send('Page.captureScreenshot', {})
  if (screenshot && screenshot.data) {
    const buf = Buffer.from(screenshot.data, 'base64')
    const outPath = 'D:/Data/projects/Multi-Publish/.ccg/tasks/video-clone-real-agv-e2e/app-screen.png'
    fs.writeFileSync(outPath, buf)
    console.log('SCREENSHOT saved:', outPath, '(', buf.length, 'bytes)')
  }
  
  ws.close()
  console.log('DONE')
}
main().catch(e => console.error('ERROR', e.message))

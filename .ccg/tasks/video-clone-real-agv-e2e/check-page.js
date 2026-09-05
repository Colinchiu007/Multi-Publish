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
  
  console.log('PAGES:', endpoints.length)
  for (const e of endpoints) {
    console.log('  ', e.title, '|', e.url)
  }
  
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
  
  // 获取当前页面 URL 和标题
  const url = await send('Runtime.evaluate', { expression: "window.location.href", returnByValue: true })
  const title = await send('Runtime.evaluate', { expression: "document.title", returnByValue: true })
  const hasApp = await send('Runtime.evaluate', { expression: "!!document.querySelector('#app')", returnByValue: true })
  console.log('URL:', url.result && url.result.value)
  console.log('TITLE:', title.result && title.result.value)
  console.log('HAS_APP:', hasApp.result && hasApp.result.value)
  
  // 如果页面是 chrome-error，尝试导航到主页
  if (url.result && url.result.value && url.result.value.includes('chrome-error')) {
    console.log('Navigating to home...')
    await send('Page.navigate', { url: 'http://127.0.0.1:5174/' })
    await new Promise(r => setTimeout(r, 5000))
    const newUrl = await send('Runtime.evaluate', { expression: "window.location.href", returnByValue: true })
    const newHasApp = await send('Runtime.evaluate', { expression: "!!document.querySelector('#app')", returnByValue: true })
    console.log('NEW_URL:', newUrl.result && newUrl.result.value)
    console.log('NEW_HAS_APP:', newHasApp.result && newHasApp.result.value)
  }
  
  ws.close()
}
main().catch(e => console.error('ERROR', e.message))

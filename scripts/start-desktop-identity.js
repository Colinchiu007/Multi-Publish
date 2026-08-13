// @ts-check
/** start-desktop-identity.js — 经 CDP 读取登录态（供 start-desktop.ps1 调用） */
'use strict'
const http = require('http')

function getJson(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let d = ''
      res.on('data', (c) => (d += c))
      res.on('end', () => { try { resolve(JSON.parse(d)) } catch (e) { reject(e) } })
    }).on('error', reject)
  })
}

async function main() {
  const targets = await getJson('http://127.0.0.1:9222/json/list')
  const page = targets.find((t) => t.type === 'page' && t.url.startsWith('http://127.0.0.1:5174'))
  if (!page) { console.log('NO_PAGE'); return }
  const ws = new WebSocket(page.webSocketDebuggerUrl)
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej })
  const result = await new Promise((resolve, reject) => {
    const id = 1
    const timer = setTimeout(() => reject(new Error('timeout')), 15000)
    ws.onmessage = (ev) => { const msg = JSON.parse(ev.data); if (msg.id === id) { clearTimeout(timer); resolve(msg) } }
    ws.send(JSON.stringify({ id, method: 'Runtime.evaluate', params: { expression: '(async () => JSON.stringify(await window.electronAPI.identityGetState()))()', awaitPromise: true, returnByValue: true } }))
  })
  if (result.result && result.result.result) console.log(result.result.result.value)
  else console.log('IDENTITY_UNAVAILABLE')
  ws.close()
}

main().catch((e) => { console.log('IDENTITY_ERR ' + e.message); process.exit(0) })

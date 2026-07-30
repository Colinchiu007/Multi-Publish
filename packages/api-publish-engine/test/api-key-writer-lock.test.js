'use strict'

const assert = require('assert').strict
const fs = require('fs')
const http = require('http')
const os = require('os')
const path = require('path')
const { PublishApiServer } = require('../src/publish-api-server')

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => resolve(server.address().port))
  })
}

function close(server) {
  if (!server || !server.listening) return Promise.resolve()
  return new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) reject(error)
      else resolve()
    })
  })
}

async function main() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'api-key-writer-lock-'))
  const keysPath = path.join(root, 'api-keys.json')
  const first = new PublishApiServer({ dryRun: true, autoMigrate: false, keysPath })
  const second = new PublishApiServer({ dryRun: true, autoMigrate: false, keysPath })

  try {
    await first.start(0)
    await assert.rejects(
      second.start(0),
      error => error && error.code === 'API_KEY_WRITER_LOCKED',
      '同一 API Key 持久卷必须拒绝第二个 writer',
    )

    await first.stop()
    await second.start(0)
    assert.ok(second._server.address().port > 0, '原 writer 停止后允许新实例接管')
    await second.stop()

    const duplicate = new PublishApiServer({ dryRun: true, autoMigrate: false, keysPath })
    await duplicate.start(0)
    const originalServer = duplicate._server
    try {
      await assert.rejects(
        duplicate.start(0),
        error => error && error.code === 'API_SERVER_ALREADY_STARTED',
        '同一实例重复启动必须明确拒绝',
      )
    } finally {
      const currentServer = duplicate._server
      await duplicate.stop()
      if (currentServer !== originalServer) await close(originalServer)
    }

    const occupied = http.createServer()
    const occupiedPort = await listen(occupied)
    const failed = new PublishApiServer({ dryRun: true, autoMigrate: false, keysPath })
    const successor = new PublishApiServer({ dryRun: true, autoMigrate: false, keysPath })
    try {
      await assert.rejects(
        failed.start(occupiedPort),
        error => error && error.code === 'EADDRINUSE',
        '监听失败必须保留原始错误码',
      )
      await successor.start(0)
      assert.ok(successor._server.address().port > 0, '监听失败释放锁后允许新实例接管')
    } finally {
      await failed.stop()
      await successor.stop()
      await close(occupied)
    }

    const interrupted = new PublishApiServer({ dryRun: true, autoMigrate: false, keysPath })
    try {
      const interruptedStart = interrupted.start(0)
      await interrupted.stop()
      await interruptedStart
      assert.strictEqual(interrupted._server, null, '启动期间 stop 返回后不能遗留监听 server')
    } finally {
      await interrupted.stop()
    }

    const afterInterrupted = new PublishApiServer({ dryRun: true, autoMigrate: false, keysPath })
    try {
      await afterInterrupted.start(0)
      assert.ok(afterInterrupted._server.address().port > 0, '启动期间停止必须释放 writer lock')
    } finally {
      await afterInterrupted.stop()
    }
  } finally {
    await first.stop()
    await second.stop()
    fs.rmSync(root, { recursive: true, force: true })
  }
}

main().catch(error => {
  console.error(error)
  process.exitCode = 1
})

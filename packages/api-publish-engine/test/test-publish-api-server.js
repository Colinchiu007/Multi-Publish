'use strict'

const crypto = require('crypto')
const fs = require('fs')
const os = require('os')
const path = require('path')

const { PublishApiServer } = require('../src/publish-api-server')

class TestPublishApiServer extends PublishApiServer {
  constructor(options = {}) {
    const ownsStore = !options.keysPath
    const storeRoot = ownsStore
      ? path.join(os.tmpdir(), `multi-publish-api-server-${process.pid}-${crypto.randomUUID()}`)
      : null
    const keysPath = ownsStore ? path.join(storeRoot, 'api-keys.json') : options.keysPath

    super({ ...options, keysPath })
    this._testStoreRoot = storeRoot
  }

  async stop() {
    try {
      await super.stop()
    } finally {
      if (this._testStoreRoot) {
        fs.rmSync(this._testStoreRoot, { recursive: true, force: true })
        this._testStoreRoot = null
      }
    }
  }
}

module.exports = { TestPublishApiServer }

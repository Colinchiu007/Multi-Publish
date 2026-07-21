const assert = require('assert')
const fs = require('fs')
const http = require('http')
const os = require('os')
const path = require('path')
const { PublishApiServer } = require('../src/publish-api-server')

function request(port, token) {
  return new Promise((resolve, reject) => {
    const req = http.get({
      hostname: '127.0.0.1', port, path: '/api/v1/platforms',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    }, (res) => {
      let data = ''
      res.on('data', (chunk) => { data += chunk })
      res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(data) }))
    })
    req.on('error', reject)
  })
}

function requestJson(port, method, requestPath, token, body) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: '127.0.0.1', port, method, path: requestPath,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    }, (res) => {
      let data = ''
      res.on('data', (chunk) => { data += chunk })
      res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(data) }))
    })
    req.on('error', reject)
    if (body) req.write(JSON.stringify(body))
    req.end()
  })
}

async function runServer(identityAuthRequired) {
  const server = new PublishApiServer({
    dryRun: true,
    apiKey: 'legacy-key',
    autoMigrate: false,
    identityAuthRequired,
    logtoVerifier: {
      verify: async () => {
        throw Object.assign(new Error('not a jwt'), { code: 'AUTH_TOKEN_INVALID', status: 401 })
      },
    },
  })
  await server.start(0)
  return server
}

async function main() {
  const optional = await runServer(false)
  try {
    const port = optional._server.address().port
    assert.strictEqual((await request(port)).status, 401, '可选模式也不能匿名访问')
    assert.strictEqual((await request(port, 'legacy-key')).status, 200, '可选模式允许受限 API Key 回滚')
    assert.strictEqual((await request(port, 'bad-key')).status, 401)
  } finally {
    await optional.stop()
  }

  const required = await runServer(true)
  try {
    assert.strictEqual((await request(required._server.address().port, 'legacy-key')).status, 401,
      '强制模式不能降级到 API Key')
  } finally {
    await required.stop()
  }

  const unmanagedConfiguredKey = 'unmanaged-configured-key'
  const unmanagedKeysPath = path.join(os.tmpdir(), `multi-publish-unmanaged-key-${process.pid}-${Date.now()}.json`)
  const unmanagedSchedulePath = path.join(os.tmpdir(), `multi-publish-unmanaged-schedule-${process.pid}-${Date.now()}.json`)
  const unmanagedOptions = {
    dryRun: true,
    apiKey: unmanagedConfiguredKey,
    autoMigrate: false,
    keysPath: unmanagedKeysPath,
    enableSchedule: true,
    scheduleFile: unmanagedSchedulePath,
    identityAuthRequired: false,
  }
  const unmanagedConfigured = new PublishApiServer(unmanagedOptions)
  await unmanagedConfigured.start(0)
  let unmanagedScheduleId
  try {
    const response = await requestJson(
      unmanagedConfigured._server.address().port,
      'POST',
      '/api/v1/schedule',
      unmanagedConfiguredKey,
      { platforms: ['zhihu'], title: 'unmanaged owner', scheduledAt: new Date(Date.now() + 86400000).toISOString() },
    )
    assert.strictEqual(response.status, 200, '静态 Key 的 legacy 请求兼容路径仍可创建定时任务')
    unmanagedScheduleId = response.body.entry.id
  } finally {
    await unmanagedConfigured.stop()
  }
  const unmanagedRestarted = new PublishApiServer(unmanagedOptions)
  await unmanagedRestarted.start(0)
  try {
    const restoredEntry = unmanagedRestarted._scheduler.get(unmanagedScheduleId)
    assert(restoredEntry, '未托管静态 Key 的历史任务必须在重启后恢复')
    await unmanagedRestarted._scheduler._execute(restoredEntry)
    assert.strictEqual(restoredEntry.status, 'failed')
    assert.strictEqual(restoredEntry.error, 'SCHEDULE_OWNER_INVALID',
      '未托管配置 Key 不能仅凭静态配置恢复历史定时任务权限')
    assert.strictEqual(restoredEntry.results, null)
  } finally {
    await unmanagedRestarted.stop()
    for (const file of [unmanagedKeysPath, `${unmanagedKeysPath}.tmp`, unmanagedSchedulePath, `${unmanagedSchedulePath}.tmp`]) {
      if (fs.existsSync(file)) fs.unlinkSync(file)
    }
  }

  const corruptConfiguredKey = 'corrupt-store-configured-key'
  const corruptKeysPath = path.join(os.tmpdir(), `multi-publish-corrupt-key-${process.pid}-${Date.now()}.json`)
  const corruptContent = '{invalid-json'
  fs.writeFileSync(corruptKeysPath, corruptContent, 'utf8')
  const corruptConfigured = new PublishApiServer({
    dryRun: true,
    apiKey: corruptConfiguredKey,
    autoMigrate: false,
    keysPath: corruptKeysPath,
  })
  await corruptConfigured.start(0)
  try {
    const response = await request(corruptConfigured._server.address().port, corruptConfiguredKey)
    assert.strictEqual(response.status, 503, 'API Key 存储损坏时静态 Key 必须 fail closed')
    assert.strictEqual(response.body.message, 'API_KEY_STORE_UNAVAILABLE')
    assert.strictEqual(fs.readFileSync(corruptKeysPath, 'utf8'), corruptContent,
      '认证失败不能覆盖损坏的 Key 存储')
  } finally {
    await corruptConfigured.stop()
  }
  assert.throws(
    () => new PublishApiServer({ dryRun: true, apiKey: corruptConfiguredKey, keysPath: corruptKeysPath }),
    (error) => error && error.code === 'API_KEY_STORE_UNAVAILABLE',
    '自动迁移不能覆盖损坏的 Key 存储',
  )
  for (const file of [corruptKeysPath, `${corruptKeysPath}.tmp`]) {
    if (fs.existsSync(file)) fs.unlinkSync(file)
  }

  const keysPath = path.join(os.tmpdir(), `multi-publish-logto-optional-${process.pid}-${Date.now()}.json`)
  const isolated = new PublishApiServer({
    dryRun: true,
    autoMigrate: false,
    identityAuthRequired: false,
    keysPath,
    logtoVerifier: {
      verify: async () => {
        throw Object.assign(new Error('not a jwt'), { code: 'AUTH_TOKEN_INVALID', status: 401 })
      },
    },
  })
  const keyA = isolated._keyManager.createKey('same-name', ['*']).key
  const keyB = isolated._keyManager.createKey('same-name', ['*']).key
  await isolated.start(0)
  try {
    const port = isolated._server.address().port
    const authA = await isolated._checkAuth({
      url: '/api/v1/plan', headers: { authorization: `Bearer ${keyA}` },
    }, 'publish:submit')
    const authB = await isolated._checkAuth({
      url: '/api/v1/plan', headers: { authorization: `Bearer ${keyB}` },
    }, 'publish:submit')
    assert.match(authA.ownerSubject, /^api-key:[a-f0-9]{64}$/)
    assert.notStrictEqual(authA.ownerSubject, authB.ownerSubject, '同名 API Key 也必须拥有不同租户')
    assert.strictEqual(await isolated._authorizeScheduledEntry({ ownerSubject: authA.ownerSubject }), true,
      '灰度模式下 API Key 创建的定时任务仍可执行')

    const createdA = await requestJson(port, 'POST', '/api/v1/plan', keyA, { name: 'A', items: [{ platform: 'zhihu' }] })
    const createdB = await requestJson(port, 'POST', '/api/v1/plan', keyB, { name: 'B', items: [{ platform: 'douyin' }] })
    assert.deepStrictEqual([createdA.status, createdB.status], [200, 200])
    const listA = await requestJson(port, 'GET', '/api/v1/plan', keyA)
    const listB = await requestJson(port, 'GET', '/api/v1/plan', keyB)
    assert.deepStrictEqual(listA.body.plans.map((plan) => plan.name), ['A'])
    assert.deepStrictEqual(listB.body.plans.map((plan) => plan.name), ['B'])
    const crossDelete = await requestJson(port, 'POST', '/api/v1/plan/delete', keyA, { id: createdB.body.plan.id })
    assert.strictEqual(crossDelete.status, 404, 'API Key 不能删除其他 Key 的计划')
  } finally {
    await isolated.stop()
    if (fs.existsSync(keysPath)) fs.unlinkSync(keysPath)
    if (fs.existsSync(`${keysPath}.tmp`)) fs.unlinkSync(`${keysPath}.tmp`)
  }

  const configuredKey = 'legacy-configured-key-for-restart'
  const configuredKeysPath = path.join(os.tmpdir(), `multi-publish-configured-key-${process.pid}-${Date.now()}.json`)
  const configuredOptions = {
    dryRun: true,
    identityAuthRequired: false,
    apiKey: configuredKey,
    keysPath: configuredKeysPath,
    logtoVerifier: {
      verify: async () => {
        throw Object.assign(new Error('not a jwt'), { code: 'AUTH_TOKEN_INVALID', status: 401 })
      },
    },
  }
  const firstConfigured = new PublishApiServer(configuredOptions)
  await firstConfigured.start(0)
  try {
    assert.strictEqual((await request(firstConfigured._server.address().port, configuredKey)).status, 200)
    const persistedConfigured = fs.readFileSync(configuredKeysPath, 'utf8')
    assert(!persistedConfigured.includes(configuredKey), '配置文件不能保存 API Key 明文')
  } finally {
    await firstConfigured.stop()
  }
  const restartedConfigured = new PublishApiServer(configuredOptions)
  await restartedConfigured.start(0)
  try {
    assert.strictEqual((await request(restartedConfigured._server.address().port, configuredKey)).status, 200,
      '配置型 API Key 重启后仍必须有效')
    assert.strictEqual(restartedConfigured._keyManager.revokeKey(configuredKey), true)
    assert.strictEqual((await request(restartedConfigured._server.address().port, configuredKey)).status, 401,
      '已撤销的配置型 API Key 不能通过静态 fallback')
  } finally {
    await restartedConfigured.stop()
    if (fs.existsSync(configuredKeysPath)) fs.unlinkSync(configuredKeysPath)
    if (fs.existsSync(`${configuredKeysPath}.tmp`)) fs.unlinkSync(`${configuredKeysPath}.tmp`)
  }

  const scheduledKeysPath = path.join(os.tmpdir(), `multi-publish-scheduled-key-${process.pid}-${Date.now()}.json`)
  const scheduleFile = path.join(os.tmpdir(), `multi-publish-scheduled-entry-${process.pid}-${Date.now()}.json`)
  const scheduledOptions = {
    dryRun: true,
    autoMigrate: false,
    enableSchedule: true,
    keysPath: scheduledKeysPath,
    scheduleFile,
    identityAuthRequired: false,
    logtoVerifier: {
      verify: async () => {
        throw Object.assign(new Error('not a jwt'), { code: 'AUTH_TOKEN_INVALID', status: 401 })
      },
    },
  }
  const scheduledFirst = new PublishApiServer(scheduledOptions)
  const scheduledKey = scheduledFirst._keyManager.createKey('scheduled-owner', ['publish:submit']).key
  await scheduledFirst.start(0)
  let scheduledId
  try {
    const response = await requestJson(scheduledFirst._server.address().port, 'POST', '/api/v1/schedule', scheduledKey, {
      platforms: ['zhihu'],
      title: 'revoked owner task',
      scheduledAt: new Date(Date.now() + 86400000).toISOString(),
    })
    assert.strictEqual(response.status, 200)
    scheduledId = response.body.entry.id
    assert.strictEqual(scheduledFirst._keyManager.revokeKey(scheduledKey), true)
  } finally {
    await scheduledFirst.stop()
  }

  const scheduledRestarted = new PublishApiServer(scheduledOptions)
  await scheduledRestarted.start(0)
  try {
    const restoredEntry = scheduledRestarted._scheduler.get(scheduledId)
    assert(restoredEntry, '定时任务必须在重启后恢复')
    await scheduledRestarted._scheduler._execute(restoredEntry)
    assert.strictEqual(restoredEntry.status, 'failed', '已撤销 API Key 的历史定时任务不能执行')
    assert.strictEqual(restoredEntry.error, 'SCHEDULE_OWNER_REVOKED')
    assert.strictEqual(restoredEntry.results, null)

    const noLogto = new PublishApiServer({ autoMigrate: false, keysPath: scheduledKeysPath })
    await assert.rejects(
      noLogto._authorizeScheduledEntry({ ownerSubject: `api-key:${require('crypto').createHash('sha256').update(scheduledKey).digest('hex')}` }),
      (error) => error && error.code === 'SCHEDULE_OWNER_REVOKED',
      '未启用 Logto 时也不能绕过 API Key 撤销状态',
    )
  } finally {
    await scheduledRestarted.stop()
    for (const file of [scheduledKeysPath, `${scheduledKeysPath}.tmp`, scheduleFile, `${scheduleFile}.tmp`]) {
      if (fs.existsSync(file)) fs.unlinkSync(file)
    }
  }

  console.log('  ✅ Logto optional/required 灰度状态机')
}

main().catch((error) => {
  console.error(`  ❌ Logto optional auth: ${error.stack || error.message}`)
  process.exitCode = 1
})

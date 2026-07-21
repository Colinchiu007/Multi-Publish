const assert = require('assert')
const fs = require('fs')
const http = require('http')
const path = require('path')
const { spawnSync } = require('child_process')
const test = require('node:test')

function startFixtureServer({ ready = true, invalidReadyJson = false, onMe } = {}) {
  const server = http.createServer((request, response) => {
    const origin = `http://127.0.0.1:${server.address().port}`
    response.setHeader('Content-Type', 'application/json')
    if (request.url === '/oidc/.well-known/openid-configuration') {
      response.end(JSON.stringify({ issuer: `${origin}/oidc`, jwks_uri: `${origin}/oidc/jwks` }))
    } else if (request.url === '/oidc/jwks') {
      response.end(JSON.stringify({ keys: [{ kty: 'RSA', kid: 'fixture', alg: 'RS256' }] }))
    } else if (request.url === '/api/v1/health') {
      response.end(JSON.stringify({ status: 'ok' }))
    } else if (request.url === '/api/v1/ready') {
      response.statusCode = ready ? 200 : 503
      response.end(invalidReadyJson ? '{invalid' : JSON.stringify({ status: ready ? 'ready' : 'not_ready' }))
    } else if (request.url === '/api/v1/me') {
      if (onMe) onMe(request)
      response.end(JSON.stringify({ user: { id: 'fixture-user' } }))
    } else {
      response.statusCode = 404
      response.end('{}')
    }
  })
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)))
}

test('生产运维 CLI', async (t) => {
  await t.test('Runbook 与部署 README 的命令路径和工作目录一致', () => {
    const repositoryRoot = path.resolve(__dirname, '../../..')
    const runbook = fs.readFileSync(path.join(repositoryRoot, '01-docs/RUNBOOK-LOGTO-PRODUCTION.md'), 'utf8')
    const deployReadme = fs.readFileSync(path.join(repositoryRoot, 'deploy/logto/README.md'), 'utf8')

    assert.doesNotMatch(runbook, /cd deploy\/logto[\s\S]*node packages\/api-publish-engine/)
    assert.match(runbook, /docker compose -f deploy\/logto\/docker-compose\.yml/)
    assert.match(deployReadme, /node \.\.\/\.\.\/packages\/api-publish-engine\/scripts\/validate-production-config\.js/)
    assert.match(deployReadme, /node \.\.\/\.\.\/packages\/api-publish-engine\/scripts\/migrate-postgres\.js/)
    assert.match(deployReadme, /node \.\.\/\.\.\/packages\/api-publish-engine\/scripts\/production-smoke\.js/)
    assert.match(runbook, /set RESTORE_STATE_FILE=/)
    assert.match(runbook, /postgres-restore\.js --state-file "%RESTORE_STATE_FILE%" --confirm-logto-database/)
    assert.match(runbook, /postgres-restore\.js --verify-state --state-file "%RESTORE_STATE_FILE%"/)
    assert.match(runbook, /psql.*两个隔离目标.*业务对象/s)
    assert.match(runbook, /\.in-progress.*\.failed.*禁止切换/s)
    assert.match(runbook, /销毁两个隔离目标数据库.*重新创建/s)
  })

  await t.test('smoke 对本地 OIDC、JWKS、health 和 ready 做真实 HTTP 检查', async () => {
    const { runSmokeChecks } = require('../scripts/production-smoke')
    const server = await startFixtureServer()
    const origin = `http://127.0.0.1:${server.address().port}`
    try {
      const result = await runSmokeChecks({ logto: origin, api: origin, timeoutMs: 1000 })
      assert.strictEqual(result.status, 'passed')
      assert.deepStrictEqual(result.checks.map((entry) => entry.name), [
        'logto.discovery', 'logto.jwks', 'api.health', 'api.ready',
      ])
    } finally {
      await new Promise((resolve) => server.close(resolve))
    }
  })

  await t.test('ready=503 时 smoke 返回 failed', async () => {
    const { runSmokeChecks } = require('../scripts/production-smoke')
    const server = await startFixtureServer({ ready: false })
    const origin = `http://127.0.0.1:${server.address().port}`
    try {
      const result = await runSmokeChecks({ logto: origin, api: origin, timeoutMs: 1000 })
      assert.strictEqual(result.status, 'failed')
      assert(result.checks.some((entry) => entry.code === 'API_READY_NOT_READY'))
    } finally {
      await new Promise((resolve) => server.close(resolve))
    }
  })

  await t.test('公网 HTTP Logto/API 地址在发起请求前被拒绝', async () => {
    const { runSmokeChecks } = require('../scripts/production-smoke')

    const logtoResult = await runSmokeChecks({ logto: 'http://id.example.com' })
    assert(logtoResult.checks.some((entry) => entry.code === 'LOGTO_ENDPOINT_HTTPS_REQUIRED'))
    const apiResult = await runSmokeChecks({ api: 'http://api.example.com' })
    assert(apiResult.checks.some((entry) => entry.code === 'API_ENDPOINT_HTTPS_REQUIRED'))
  })

  await t.test('非法 JSON 会失败，可选 token 会验证 /me 且输出可序列化', async () => {
    const { runSmokeChecks } = require('../scripts/production-smoke')
    const requests = []
    const invalidServer = await startFixtureServer({ invalidReadyJson: true })
    const invalidOrigin = `http://127.0.0.1:${invalidServer.address().port}`
    try {
      const invalid = await runSmokeChecks({ logto: invalidOrigin, api: invalidOrigin, timeoutMs: 1000 })
      assert.strictEqual(invalid.status, 'failed')
      assert(invalid.checks.some((entry) => entry.code === 'API_READY_NOT_READY'))
    } finally {
      await new Promise((resolve) => invalidServer.close(resolve))
    }

    const server = await startFixtureServer({ onMe: (request) => requests.push(request.headers) })
    const origin = `http://127.0.0.1:${server.address().port}`
    try {
      const result = await runSmokeChecks({ logto: origin, api: origin, token: 'fixture-token', deviceId: 'fixture-device-0001', timeoutMs: 1000 })
      assert.strictEqual(result.status, 'passed')
      assert.strictEqual(JSON.parse(JSON.stringify(result)).checks.at(-1).name, 'api.me')
      assert.strictEqual(requests[0].authorization, 'Bearer fixture-token')
      assert.strictEqual(requests[0]['x-device-id'], 'fixture-device-0001')
    } finally {
      await new Promise((resolve) => server.close(resolve))
    }
  })

  await t.test('配置 CLI 缺关键变量时非零退出且不输出环境变量值', () => {
    const script = path.resolve(__dirname, '../scripts/validate-production-config.js')
    const secret = 'must-not-appear-in-output'
    const result = spawnSync(process.execPath, [script, '--phase', 'shadow'], {
      encoding: 'utf8',
      env: { ...process.env, NODE_ENV: 'production', LOGTO_WEBHOOK_SIGNING_KEY: secret },
    })
    assert.strictEqual(result.status, 1)
    assert.strictEqual(`${result.stdout}${result.stderr}`.includes(secret), false)
    assert.match(result.stdout, /BUSINESS_DATABASE_URL_INVALID/)
  })

  await t.test('migration CLI 参数解析不回显数据库 URL', () => {
    const { parseArgs } = require('../scripts/migrate-postgres')
    const options = parseArgs(['--dry-run'])
    assert.strictEqual(options.dryRun, true)
    assert.strictEqual(options.error, null)
    assert.strictEqual(Object.prototype.hasOwnProperty.call(options, 'databaseUrl'), false)
    assert.strictEqual(parseArgs(['--directory', './migrations']).error, 'MIGRATION_DIRECTORY_FORBIDDEN')
    assert.strictEqual(parseArgs(['--unknown']).error, 'MIGRATION_ARGUMENT_INVALID')
  })
})

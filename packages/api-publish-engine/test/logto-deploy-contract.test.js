const assert = require('assert')
const { spawnSync } = require('child_process')
const fs = require('fs')
const path = require('path')
const yaml = require('js-yaml')

function stageDockerRunner(dockerfile, repositoryRoot) {
  const runner = dockerfile.split(/FROM\s+\S+\s+AS\s+runner\s*/i)[1]
  assert(runner, 'Dockerfile 必须包含 runner stage')
  const stagingRoot = fs.mkdtempSync(path.join(repositoryRoot, '.publish-api-runner-'))
  const copies = [...runner.matchAll(/^COPY\s+(?!.*--from=)(?:--chown=\S+\s+)?(\S+)\s+(\S+)\s*$/gm)]
  assert(copies.length > 0, 'runner stage 必须包含本地 COPY 指令')

  for (const [, source, destination] of copies) {
    const sourcePath = path.resolve(repositoryRoot, source)
    assert(fs.existsSync(sourcePath), `Docker COPY 源不存在：${source}`)
    const relativeDestination = destination.replace(/^\.\//, '').replace(/^\/app\/?/, '')
    fs.cpSync(sourcePath, path.join(stagingRoot, relativeDestination), { recursive: true })
  }
  return stagingRoot
}

const composePath = path.resolve(__dirname, '../../../deploy/logto/docker-compose.yml')
const compose = yaml.load(fs.readFileSync(composePath, 'utf8'))
const ports = compose?.services?.logto?.ports

assert.deepStrictEqual(ports, [
  '127.0.0.1:3001:3001',
  '127.0.0.1:3002:3002',
])
assert.match(compose.services.postgres.environment.POSTGRES_PASSWORD, /\$\{LOGTO_DB_PASSWORD:\?/)
assert.strictEqual(compose.services.logto.environment.TRUST_PROXY_HEADER, '${LOGTO_TRUST_PROXY_HEADER:-0}')
const deployEnv = fs.readFileSync(path.resolve(__dirname, '../../../deploy/logto/.env.example'), 'utf8')
assert.match(deployEnv, /^LOGTO_TRUST_PROXY_HEADER=0$/m)

const apiEnv = fs.readFileSync(path.resolve(__dirname, '../../../deploy/logto/api.env.example'), 'utf8')
for (const variable of [
  'NODE_ENV', 'HOST', 'IDENTITY_AUTH_ENABLED', 'IDENTITY_AUTH_REQUIRED',
  'BUSINESS_DATABASE_AUTO_MIGRATE', 'BUSINESS_DATABASE_MIGRATIONS_DIR', 'LOGTO_ENDPOINT', 'LOGTO_API_RESOURCE',
  'BUSINESS_DATABASE_URL', 'LOGTO_WEBHOOK_SIGNING_KEY', 'ENTITLEMENT_KEY_ID',
  'ENTITLEMENT_PRIVATE_KEY',
]) {
  assert.match(apiEnv, new RegExp(`^${variable}=`, 'm'))
}
assert.match(apiEnv, /^BUSINESS_DATABASE_AUTO_MIGRATE=false$/m)
assert.match(apiEnv, /^HOST=0\.0\.0\.0$/m)
assert.doesNotMatch(apiEnv, /^PUBLISH_API_HOST_PORT=/m)

const apiCompose = yaml.load(fs.readFileSync(path.resolve(__dirname, '../docker-compose.yml'), 'utf8'))
assert.strictEqual(apiCompose.services['publish-api'].build.context, '../..')
assert.strictEqual(apiCompose.services['publish-api'].build.dockerfile, 'packages/api-publish-engine/Dockerfile')
assert.deepStrictEqual(apiCompose.services['publish-api'].ports, [
  '127.0.0.1:3030:3000',
])
const apiVolumes = apiCompose.services['publish-api'].volumes
assert.deepStrictEqual(apiVolumes, [
  {
    type: 'bind',
    source: './config',
    target: '/app/packages/api-publish-engine/config',
    bind: { create_host_path: false },
  },
  {
    type: 'bind',
    source: './data',
    target: '/app/data',
    bind: { create_host_path: false },
  },
], 'Compose 必须拒绝自动创建 root-owned 持久化目录，并挂载到真实读写路径')
const composeHealthcheck = apiCompose.services['publish-api'].healthcheck.test.join(' ')
assert.match(composeHealthcheck, /http:\/\/127\.0\.0\.1:3000\/api\/v1\/ready/)
assert.doesNotMatch(composeHealthcheck, /http:\/\/localhost:3000\/api\/v1\/ready/)
assert.match(composeHealthcheck, /\/api\/v1\/ready/)
assert.doesNotMatch(composeHealthcheck, /\/api\/v1\/health/)
for (const required of [
  'NODE_ENV=production',
  'MULTI_PUBLISH_PLUGINS_DIR=/app/data/plugins',
  'IDENTITY_AUTH_ENABLED=${IDENTITY_AUTH_ENABLED:?请设置 IDENTITY_AUTH_ENABLED}',
  'BUSINESS_DATABASE_AUTO_MIGRATE=false',
  'BUSINESS_DATABASE_URL=${BUSINESS_DATABASE_URL:?请设置 BUSINESS_DATABASE_URL}',
  'LOGTO_ENDPOINT=${LOGTO_ENDPOINT:?请设置 LOGTO_ENDPOINT}',
  'LOGTO_API_RESOURCE=${LOGTO_API_RESOURCE:?请设置 LOGTO_API_RESOURCE}',
]) {
  assert(apiCompose.services['publish-api'].environment.includes(required))
}
const dockerfile = fs.readFileSync(path.resolve(__dirname, '../Dockerfile'), 'utf8')
const packageManifest = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../package.json'), 'utf8'))
assert(packageManifest.files.includes('upload/'), 'API 发布包必须包含 upload/ 运行时目录')
assert.match(dockerfile, /COPY package\.json package-lock\.json/)
assert.match(dockerfile, /--workspace @multi-publish\/api-publish-engine/)
assert.match(dockerfile, /COPY --chown=publishapi:publishapi migrations\/postgresql \.\/migrations\/postgresql/)
assert.match(dockerfile, /COPY --chown=publishapi:publishapi packages\/api-publish-engine\/scripts \.\/packages\/api-publish-engine\/scripts/)
assert.match(dockerfile, /ENV NODE_ENV=production/)
assert.match(dockerfile, /http:\/\/127\.0\.0\.1:\$\{PORT\}\/api\/v1\/ready/)
assert.doesNotMatch(dockerfile, /http:\/\/localhost:\$\{PORT\}\/api\/v1\/ready/)
assert.match(dockerfile, /HEALTHCHECK[\s\S]*\/api\/v1\/ready/)
assert.doesNotMatch(dockerfile, /HEALTHCHECK[\s\S]*\/api\/v1\/health/)

const repositoryRoot = path.resolve(__dirname, '../../..')
const stagingRoot = stageDockerRunner(dockerfile, repositoryRoot)
try {
  const stagedEntry = path.join(stagingRoot, 'packages/api-publish-engine/src/index.js')
  const stagedPackageJson = path.join(stagingRoot, 'packages/api-publish-engine/package.json')
  const nodePath = [path.join(repositoryRoot, 'node_modules'), process.env.NODE_PATH]
    .filter(Boolean)
    .join(path.delimiter)
  const dependencyGuard = `
    const Module = require('module')
    const path = require('path')
    const entry = ${JSON.stringify(stagedEntry)}
    const packageJsonPath = ${JSON.stringify(stagedPackageJson)}
    const packageRoot = path.dirname(packageJsonPath)
    const dependencies = new Set(Object.keys(require(packageJsonPath).dependencies || {}))
    const originalLoad = Module._load
    Module._load = function guardedLoad(request, parent, isMain) {
      const parentFilename = parent && parent.filename
      const ownedParent = parentFilename === entry ||
        (parentFilename && parentFilename.startsWith(packageRoot + path.sep))
      const requestRoot = request.startsWith('@')
        ? request.split('/').slice(0, 2).join('/')
        : request.split('/')[0]
      const builtin = request.startsWith('node:') ||
        Module.builtinModules.includes(request) ||
        Module.builtinModules.includes(requestRoot)
      const bare = !request.startsWith('.') && !path.isAbsolute(request)
      if (ownedParent && bare && !builtin && !dependencies.has(requestRoot)) {
        throw new Error('UNDECLARED_RUNTIME_DEPENDENCY:' + requestRoot)
      }
      return originalLoad.call(this, request, parent, isMain)
    }
    require(entry)
  `
  const load = spawnSync(process.execPath, ['-e', dependencyGuard], {
    encoding: 'utf8',
    env: { ...process.env, NODE_PATH: nodePath },
    timeout: 30000,
    windowsHide: true,
  })
  assert.strictEqual(load.status, 0, `Docker runner require 链加载失败：\n${load.stderr || load.stdout}`)
} finally {
  fs.rmSync(stagingRoot, { recursive: true, force: true })
}
assert.match(dockerfile, /COPY --chown=publishapi:publishapi packages\/api-publish-engine\/upload \.\/packages\/api-publish-engine\/upload/)

const runbook = fs.readFileSync(path.resolve(__dirname, '../../../01-docs/RUNBOOK-LOGTO-PRODUCTION.md'), 'utf8')
assert.match(runbook, /install -d -m 0750 -o 1001 -g 1001[\s\S]*packages\/api-publish-engine\/config[\s\S]*packages\/api-publish-engine\/data\/plugins/)
assert.match(runbook, /publish-api --port 3000/)
assert.match(runbook, /production-smoke\.js --logto https:\/\/id\.example\.com --api http:\/\/127\.0\.0\.1:3000/)
assert.match(runbook, /docker compose -f packages\/api-publish-engine\/docker-compose\.yml[\s\S]*production-smoke\.js --logto https:\/\/id\.example\.com --api http:\/\/127\.0\.0\.1:3030/)

console.log('  ✅ Logto Compose 与业务 API 生产配置合同完整且不包含默认密钥')

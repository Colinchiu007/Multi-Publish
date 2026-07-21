const assert = require('assert')
const fs = require('fs')
const path = require('path')
const yaml = require('js-yaml')

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

const apiCompose = yaml.load(fs.readFileSync(path.resolve(__dirname, '../docker-compose.yml'), 'utf8'))
assert.strictEqual(apiCompose.services['publish-api'].build.context, '../..')
assert.strictEqual(apiCompose.services['publish-api'].build.dockerfile, 'packages/api-publish-engine/Dockerfile')
assert.deepStrictEqual(apiCompose.services['publish-api'].ports, ['127.0.0.1:3000:3000'])
const apiVolumes = apiCompose.services['publish-api'].volumes
assert(apiVolumes.includes(
  './config:/app/packages/api-publish-engine/config',
), 'Compose 必须把配置目录挂载到 API 实际读写的 config 路径')
assert(!apiVolumes.includes('./config:/app/config'), 'Compose 不得挂载到无消费者的 /app/config')
const composeHealthcheck = apiCompose.services['publish-api'].healthcheck.test.join(' ')
assert.match(composeHealthcheck, /\/api\/v1\/ready/)
assert.doesNotMatch(composeHealthcheck, /\/api\/v1\/health/)
for (const required of [
  'NODE_ENV=production',
  'IDENTITY_AUTH_ENABLED=${IDENTITY_AUTH_ENABLED:?请设置 IDENTITY_AUTH_ENABLED}',
  'BUSINESS_DATABASE_AUTO_MIGRATE=false',
  'BUSINESS_DATABASE_URL=${BUSINESS_DATABASE_URL:?请设置 BUSINESS_DATABASE_URL}',
  'LOGTO_ENDPOINT=${LOGTO_ENDPOINT:?请设置 LOGTO_ENDPOINT}',
  'LOGTO_API_RESOURCE=${LOGTO_API_RESOURCE:?请设置 LOGTO_API_RESOURCE}',
]) {
  assert(apiCompose.services['publish-api'].environment.includes(required))
}
const dockerfile = fs.readFileSync(path.resolve(__dirname, '../Dockerfile'), 'utf8')
assert.match(dockerfile, /COPY package\.json package-lock\.json/)
assert.match(dockerfile, /--workspace @multi-publish\/api-publish-engine/)
assert.match(dockerfile, /COPY --chown=publishapi:publishapi migrations\/postgresql \.\/migrations\/postgresql/)
assert.match(dockerfile, /COPY --chown=publishapi:publishapi packages\/api-publish-engine\/scripts \.\/packages\/api-publish-engine\/scripts/)
assert.match(dockerfile, /ENV NODE_ENV=production/)
assert.match(dockerfile, /HEALTHCHECK[\s\S]*\/api\/v1\/ready/)
assert.doesNotMatch(dockerfile, /HEALTHCHECK[\s\S]*\/api\/v1\/health/)

console.log('  ✅ Logto Compose 与业务 API 生产配置合同完整且不包含默认密钥')

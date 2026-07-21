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

console.log('  ✅ Logto Compose 默认仅绑定本机且不包含默认数据库密码')

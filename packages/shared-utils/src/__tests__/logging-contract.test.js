import { describe, it, expect } from 'vitest'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'

/**
 * logging-contract 防漂移门禁（审计 P2 #14 日志合同）
 *
 * 只断言「同源性与常量一致性」，行为细节由各设施既有测试覆盖：
 * - 3 处 JS 脱敏实现（desktop / shared-utils / api-publish-engine）必须保持 5 组模式同源
 * - 各设施保留/截断常量必须与 01-docs/LOGGING-CONTRACT.md 记载一致
 * - 强制日志点证据（retry/circuit/webhook/API 5xx/douyin 元信息）存在
 *
 * 文档与代码任一单边修改都会让本测试失败，防止合同漂移。
 */

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..')

function read (rel) {
  const abs = path.join(repoRoot, rel)
  if (!fs.existsSync(abs)) throw new Error('logging-contract 测试依赖文件缺失: ' + abs)
  return fs.readFileSync(abs, 'utf8')
}

const desktopLogger = read('apps/desktop/electron/services/logger.js')
const sharedLogger = read('packages/shared-utils/src/logger.js')
const apiRedact = read('packages/api-publish-engine/src/log-redact.js')
const pythonSetup = read('packages/python-backend/src/multi_publish/core/logging_setup.py')
const douyin = read('packages/python-backend/src/multi_publish/publishers/douyin.py')
const contractDoc = read('01-docs/LOGGING-CONTRACT.md')
const retryMiddleware = read('packages/api-publish-engine/src/retry-middleware.js')
const webhookManager = read('packages/api-publish-engine/src/webhook-manager.js')
const publishApiServer = read('packages/api-publish-engine/src/publish-api-server.js')
const composeApi = read('packages/api-publish-engine/docker-compose.yml')
const composeLogto = read('deploy/logto/docker-compose.yml')
const composeMonitor = read('deploy/logto/docker-compose.monitoring.yml')

// 5 组脱敏模式的稳定字面量标记（与 3 处实现中的正则字面量一致）。
// 用 String.fromCharCode(92) 构造反斜杠，规避字符串字面量转义被工具链吞掉的歧义。
const BS = String.fromCharCode(92)
const PATTERN_MARKERS = [
  'Bearer' + BS + 's+',
  'api[_-]?key|access_token|refresh_token|password|secret|authorization|cookie',
  BS + 'b(api[_-]?key|access_token|refresh_token|password|secret|cookie)' + BS + 's*=' + BS + 's*',
  'sk-[A-Za-z0-9_-]{4}',
  'eyJ[A-Za-z0-9_-]{8,}'
]
describe('logging-contract 防漂移门禁', () => {
  it('3 处 JS 脱敏实现保持 5 组模式同源', () => {
    const implementations = [
      ['desktop logger', desktopLogger],
      ['shared-utils logger', sharedLogger],
      ['api-publish-engine log-redact', apiRedact]
    ]
    for (const [name, src] of implementations) {
      for (const marker of PATTERN_MARKERS) {
        expect(src, `${name} 缺失脱敏模式 ${marker}`).toContain(marker)
      }
      // 替换串同源：仅模式相同还不够，脱敏结果也必须一致
      for (const replacement of ["'Bearer ***'", "'$1***'", "'$1=***'", "'eyJ***'"]) {
        expect(src, `${name} 缺失替换串 ${replacement}`).toContain(replacement)
      }
    }
  })

  it('desktop logger 保留/截断常量与合同一致', () => {
    expect(desktopLogger).toMatch(/500 \* 1024 \* 1024/)
    expect(desktopLogger).toMatch(/retentionDays = 30/)
    expect(desktopLogger).toMatch(/MAX_MESSAGE_LENGTH = 4096/)
    expect(contractDoc).toContain('500MB')
    expect(contractDoc).toContain('30 天')
    expect(contractDoc).toContain('4096')
  })

  it('shared-utils logger 5MB 轮转与合同一致', () => {
    expect(sharedLogger).toMatch(/5 \* 1024 \* 1024/)
    expect(contractDoc).toContain('5MB')
  })

  it('python loguru 3MB/15天/gz 与合同一致', () => {
    expect(pythonSetup).toMatch(/rotation="3 MB"/)
    expect(pythonSetup).toMatch(/retention="15 days"/)
    expect(pythonSetup).toMatch(/compression="gz"/)
    expect(contractDoc).toContain('3MB')
    expect(contractDoc).toContain('15 天')
  })

  it('容器 json-file 50m×5 与合同一致（api/logto/monitoring 三个 compose）', () => {
    const composes = [
      ['api-publish-engine', composeApi],
      ['logto', composeLogto],
      ['monitoring', composeMonitor]
    ]
    for (const [name, src] of composes) {
      expect(src, name + ' compose 缺 max-size').toContain('max-size: "50m"')
      expect(src, name + ' compose 缺 max-file').toContain('max-file: "5"')
    }
    expect(contractDoc).toContain('50m')
  })


  it('各设施 level 枚举与默认级别与合同一致', () => {
    // L1 桌面：DEBUG<INFO<WARN<ERROR，默认 INFO（LOG_LEVEL env 可覆盖）
    expect(desktopLogger).toMatch(/DEBUG: 0, INFO: 1, WARN: 2, ERROR: 3/)
    expect(desktopLogger).toMatch(/LOG_LEVEL \|\| 'INFO'/)
    // L2 shared-utils：debug/info/warn/error，默认 debug
    expect(sharedLogger).toMatch(/debug: 0, info: 1, warn: 2, error: 3/)
    expect(sharedLogger).toMatch(/LOG_LEVEL \|\| 'debug'/)
    // L5 Python：默认 INFO
    expect(pythonSetup).toMatch(/level: str = "INFO"/)
    // 合同文档一致
    expect(contractDoc).toContain('DEBUG < INFO < WARN < ERROR')
  })

  it('强制日志点证据存在（retry/circuit/webhook/API 5xx/douyin 元信息）', () => {
    expect(retryMiddleware).toMatch(/circuit opened key=/)
    expect(retryMiddleware).toMatch(/retry attempt=/)
    expect(webhookManager).toMatch(/_log\.warn/)
    expect(publishApiServer).toMatch(/redactText/)
    expect(douyin).toMatch(/has_data|has_upload_url/)
    // A1 回归：禁止 token 明文进日志
    expect(douyin).not.toMatch(/json\.dumps\(upload_token/)
  })
})

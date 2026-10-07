const {
  buildDiagnosticReport,
  claimsExpired,
  classifyNetworkError,
  describeErrorChain,
  isNetworkError,
  isSessionRejected,
  logIdentityFailure,
  networkErrorCode,
  toDiagnosticText,
} = require('./auth-diagnostics')

describe('auth-diagnostics', () => {
  it('网络类错误判定穿透 cause 链', () => {
    const error = new Error('wrapper')
    error.cause = Object.assign(new Error('fetch failed'), { code: 'ECONNREFUSED' })
    expect(isNetworkError(error)).toBe(true)
    expect(isNetworkError(new Error('upstream 503'))).toBe(false)
  })

  // 回归保护：TLS/证书类漏判会让 getAccessToken 跳过 offline_authenticated
  // 离线宽限，直接落到 status:'error' 兜底（auth-service.js:101-106）。
  it.each([
    'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
    'CERT_HAS_EXPIRED',
    'ERR_TLS_CERT_ALTNAME_INVALID',
    'DEPTH_ZERO_SELF_SIGNED_CERT',
    'SELF_SIGNED_CERT_IN_CHAIN',
    'EPROTO',
    'ERR_SSL_WRONG_VERSION_NUMBER',
    'UND_ERR_SOCKET',
  ])('%s 判定为网络类（证书问题在本机网络环境，可恢复）', (code) => {
    expect(isNetworkError(Object.assign(new Error('fetch failed'), { code }))).toBe(true)
  })

  it.each([
    ['ENOTFOUND', 'dns'],
    ['EAI_AGAIN', 'dns'],
    ['ETIMEDOUT', 'timeout'],
    ['ECONNREFUSED', 'connection'],
    ['UND_ERR_SOCKET', 'connection'],
    ['UNABLE_TO_VERIFY_LEAF_SIGNATURE', 'tls'],
    ['CERT_HAS_EXPIRED', 'tls'],
    ['EPROTO', 'tls'],
  ])('%s 细分为 %s', (code, expected) => {
    expect(classifyNetworkError(Object.assign(new Error('fetch failed'), { code }))).toBe(expected)
  })

  it('细分判定同样穿透 cause 链', () => {
    const error = new Error('wrapper')
    error.cause = Object.assign(new Error('self-signed cert'), { code: 'UNABLE_TO_VERIFY_LEAF_SIGNATURE' })
    expect(classifyNetworkError(error)).toBe('tls')
  })

  it('非网络错误不被误判为 tls', () => {
    expect(classifyNetworkError(new Error('upstream 503'))).not.toBe('tls')
    expect(isNetworkError(new Error('upstream 503'))).toBe(false)
  })

  it('会话被拒判定穿透 cause 链', () => {
    const error = new Error('wrapper')
    error.cause = Object.assign(new Error('token revoked'), { code: 'invalid_grant' })
    expect(isSessionRejected(error)).toBe(true)
    expect(isSessionRejected(new Error('unlink denied'))).toBe(false)
  })

  it('claimsExpired 仅在 exp 有效且已过期时为真', () => {
    expect(claimsExpired({ exp: 100 }, 200)).toBe(true)
    expect(claimsExpired({ exp: 300 }, 200)).toBe(false)
    expect(claimsExpired({}, 200)).toBe(false)
    expect(claimsExpired(null, 200)).toBe(false)
  })

  it('describeErrorChain 输出 code: message 链', () => {
    const error = Object.assign(new Error('登录失败'), { code: 'IDENTITY_SIGN_IN_FAILED' })
    error.cause = new Error('unlink denied')
    expect(describeErrorChain(error)).toBe('IDENTITY_SIGN_IN_FAILED: 登录失败 <- Error: unlink denied')
    expect(describeErrorChain(null)).toBe('')
  })

  it('logIdentityFailure 记录 scope 与 cause 链，且日志异常不外抛', () => {
    const warn = vi.fn()
    logIdentityFailure({ warn }, 'tokenStorage.clear', Object.assign(new Error('unlink denied'), { code: 'EPERM' }))
    expect(warn).toHaveBeenCalledWith('Identity', 'tokenStorage.clear failed: EPERM: unlink denied', {})
    expect(warn).toHaveBeenCalledTimes(1)

    expect(() => logIdentityFailure(null, 'signIn', new Error('ignored'))).not.toThrow()
    expect(warn).toHaveBeenCalledTimes(1)

    const throwing = { warn: vi.fn(() => { throw new Error('logger down') }) }
    expect(() => logIdentityFailure(throwing, 'signIn', new Error('boom'))).not.toThrow()
    expect(throwing.warn).toHaveBeenCalledTimes(1)
  })
})

describe('诊断报告（用户一键复制外发）', () => {
  // 报告会被用户粘进 issue / 客服工单 / 聊天窗口，
  // 任何未脱敏的令牌外泄都是安全事故，故这些断言是回归红线。
  it.each([
    ['access_token=eyJhbGciOiJIUzI1NiJ9.abc.def'],
    ['refresh_token: rt-8f3a9c2e1b'],
    ['Authorization: Bearer eyJ0eXAiOiJKV1Qi.zzz'],
    ['password=hunter2'],
    ['app_secret=sk-proj-123'],
    ['cookie=session_abc123'],
    ['id_token=gid__abc'],
  ])('脱敏 %s 中的凭证', (raw) => {
    const out = toDiagnosticText(raw)
    const secret = raw.split(/[:=]/).pop().trim()
    expect(out).not.toContain(secret)
    expect(out).toContain('***')
  })

  it('独立 Bearer 形态也打码', () => {
    expect(toDiagnosticText('header was Bearer eyJ.SIGNATURE')).not.toContain('SIGNATURE')
  })

  it('超长内容被封顶', () => {
    expect(toDiagnosticText('x'.repeat(5000), 100).length).toBeLessThanOrEqual(101)
  })

  it('保留 cause 链根因码（TLS 特征码只存在于链上，丢了就无法排障）', () => {
    const err = new Error('fetch failed')
    err.code = 'IDENTITY_NETWORK_UNAVAILABLE'
    err.cause = Object.assign(new Error('self-signed cert'), { code: 'UNABLE_TO_VERIFY_LEAF_SIGNATURE' })
    const report = buildDiagnosticReport({ error: err, status: 'offline_authenticated' })
    expect(report.text).toContain('UNABLE_TO_VERIFY_LEAF_SIGNATURE')
  })

  it('嵌套 cause 中的令牌不外泄', () => {
    const err = new Error('request failed')
    err.cause = Object.assign(new Error('401'), { code: 'invalid_grant', access_token: 'SUPERSECRET123' })
    const report = buildDiagnosticReport({ error: err, status: 'error' })
    expect(report.text).not.toContain('SUPERSECRET123')
  })

  it('空环境字段不产生空行', () => {
    const report = buildDiagnosticReport({ error: null, status: 'error', env: { emptyValue: '' } })
    expect(report.text).not.toContain('emptyValue')
  })

  it('无 error 时仍返回可读结构', () => {
    const report = buildDiagnosticReport({})
    expect(typeof report.text).toBe('string')
    expect(report.text.length).toBeGreaterThan(0)
    for (const [k, v] of report.fields) {
      expect(typeof k).toBe('string')
      expect(typeof v).toBe('string')
    }
  })
})

describe('网络失败细分码', () => {
  // 单一 IDENTITY_NETWORK_UNAVAILABLE 覆盖所有网络失败 → 用户永远只看到
  // 笼统的「稍后重试」，而 TLS/DNS/超时需要的建议完全不同。
  it.each([
    ['UNABLE_TO_VERIFY_LEAF_SIGNATURE', 'IDENTITY_NETWORK_TLS_BLOCKED'],
    ['SELF_SIGNED_CERT_IN_CHAIN', 'IDENTITY_NETWORK_TLS_BLOCKED'],
    ['EPROTO', 'IDENTITY_NETWORK_TLS_BLOCKED'],
    ['ENOTFOUND', 'IDENTITY_NETWORK_DNS_FAILED'],
    ['EAI_AGAIN', 'IDENTITY_NETWORK_DNS_FAILED'],
    ['ETIMEDOUT', 'IDENTITY_NETWORK_TIMEOUT'],
    ['UND_ERR_HEADERS_TIMEOUT', 'IDENTITY_NETWORK_TIMEOUT'],
    ['ECONNREFUSED', 'IDENTITY_NETWORK_UNAVAILABLE'],
    ['ECONNRESET', 'IDENTITY_NETWORK_UNAVAILABLE'],
  ])('%s → %s', (code, expected) => {
    expect(networkErrorCode(Object.assign(new Error('request failed'), { code }))).toBe(expected)
  })

  it.each(['upstream 503', 'token revoked', 'unlink denied'])('非网络错误 %s 返回 null', (msg) => {
    expect(networkErrorCode(new Error(msg))).toBeNull()
  })

  it('细分码与 UI 文案键一一登记（漏登记会回落到笼统文案）', () => {
    const src = require('node:fs').readFileSync(
      require('node:path').join(__dirname, '..', '..', '..', 'src', 'utils', 'identity-error-messages.js'),
      'utf8',
    )
    for (const code of Object.values(require('./auth-diagnostics').NETWORK_ERROR_CODES)) {
      expect(src, `错误码 ${code} 未在 identity-error-messages.js 登记`).toContain(code)
    }
  })
})

describe('identity errors', () => {
  it('保留 IdentityError 的结构和可选 cause', () => {
    const { IdentityError } = require('./identity-errors')
    const cause = new Error('根因')
    const error = new IdentityError('IDENTITY_TEST', '用户可见消息', cause)

    expect(error).toBeInstanceOf(Error)
    expect(error.name).toBe('IdentityError')
    expect(error.code).toBe('IDENTITY_TEST')
    expect(error.message).toBe('IDENTITY_TEST: 用户可见消息')
    expect(error.cause).toBe(cause)
    expect(new IdentityError('IDENTITY_TEST', '无根因')).not.toHaveProperty('cause')
  })

  it('转换错误时保留已有身份错误并规范化其他输入', () => {
    const { IdentityError, toIdentityError } = require('./identity-errors')
    const existing = new IdentityError('IDENTITY_EXISTING', '已有错误')
    const native = new Error('原生错误')

    expect(toIdentityError(existing, 'IDENTITY_FALLBACK')).toBe(existing)
    expect(toIdentityError(native, 'IDENTITY_NATIVE')).toMatchObject({
      name: 'IdentityError',
      code: 'IDENTITY_NATIVE',
      message: 'IDENTITY_NATIVE: 原生错误',
      cause: native,
    })
    expect(toIdentityError('字符串错误', 'IDENTITY_STRING')).toMatchObject({
      name: 'IdentityError',
      code: 'IDENTITY_STRING',
      message: 'IDENTITY_STRING: 字符串错误',
    })
  })

  it('导出完整的错误 API', () => {
    const errors = require('./identity-errors')
    expect(errors).toHaveProperty('IdentityError')
    expect(errors).toHaveProperty('toIdentityError')
  })
})

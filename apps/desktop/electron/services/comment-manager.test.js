import { afterEach, describe, expect, it, vi } from 'vitest'

__enableElectronMock()

const credentialStore = {
  loadCredential: vi.fn(),
}
__registerMock('./credential-store', credentialStore)
__registerMock('./logger', { info: vi.fn(), warn: vi.fn(), error: vi.fn() })
__registerMock('@multi-publish/api-publish-engine/src/comment-service', {
  CommentMessageService: class {},
  CommentProvider: class {},
  EchoReplyGenerator: class {},
  TemplateReplyGenerator: class {},
})

const CommentManager = require('./comment-manager')

describe('CommentManager owner 隔离', () => {
  afterEach(() => {
    credentialStore.loadCredential.mockReset()
  })

  it('同一账号 ID 按当前 owner 读取各自凭证', () => {
    let currentOwner = 'user-a'
    credentialStore.loadCredential.mockImplementation((_accountId, _userDataDir, owner) => ({
      cookies: [{ name: 'session', value: owner }],
    }))
    const manager = new CommentManager()
    manager.setOwnerSubjectProvider(() => currentOwner)

    expect(manager.resolveCookieHeader('shared')).toBe('session=user-a')
    currentOwner = 'user-b'
    expect(manager.resolveCookieHeader('shared')).toBe('session=user-b')
    expect(credentialStore.loadCredential).toHaveBeenNthCalledWith(
      1,
      'shared',
      expect.any(String),
      'user-a',
    )
    expect(credentialStore.loadCredential).toHaveBeenNthCalledWith(
      2,
      'shared',
      expect.any(String),
      'user-b',
    )
  })

  it('身份 provider 存在但缺少 sub 时拒绝读取凭证', () => {
    const manager = new CommentManager()
    manager.setOwnerSubjectProvider(() => null)

    expect(() => manager.resolveCookieHeader('shared')).toThrow('登录会话缺少用户标识')
    expect(credentialStore.loadCredential).not.toHaveBeenCalled()
  })

  it('未配置身份服务时保留 legacy 凭证读取兼容性', () => {
    credentialStore.loadCredential.mockReturnValue({
      cookies: [{ name: 'session', value: 'legacy' }],
    })
    const manager = new CommentManager()

    expect(manager.resolveCookieHeader('shared')).toBe('session=legacy')
    expect(credentialStore.loadCredential).toHaveBeenCalledWith(
      'shared',
      expect.any(String),
      undefined,
    )
  })
})

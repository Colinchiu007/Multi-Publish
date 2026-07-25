import { describe, expect, it } from 'vitest'

import {
  normalizeProxyConfig,
  toElectronProxyRules,
  toPublicProxyConfig,
} from './proxy-config'

describe('账号代理配置', () => {
  it('归一化支持 HTTP、HTTPS 和 SOCKS5 代理', () => {
    expect(normalizeProxyConfig({
      host: 'proxy.example.com',
      port: '1080',
      type: 'socks5',
      username: 'account',
      password: 'secret',
    })).toEqual({
      host: 'proxy.example.com',
      port: 1080,
      type: 'socks5',
      username: 'account',
      password: 'secret',
    })

    expect(toElectronProxyRules({ host: '127.0.0.1', port: 8080, type: 'http' }))
      .toBe('http://127.0.0.1:8080')
    expect(toElectronProxyRules({ host: 'proxy.example.com', port: 443, type: 'https' }))
      .toBe('https://proxy.example.com:443')
  })

  it.each([
    [{ host: 'http://proxy.example.com', port: 8080, type: 'http' }],
    [{ host: 'proxy.example.com/path', port: 8080, type: 'http' }],
    [{ host: 'proxy.example.com', port: 0, type: 'http' }],
    [{ host: 'proxy.example.com', port: 8080, type: 'ftp' }],
    [{ host: 'proxy.example.com', port: 8080, type: 'http', username: 'name@bad' }],
  ])('拒绝会污染 Electron proxyRules 的配置: %o', (config) => {
    expect(() => normalizeProxyConfig(config)).toThrow()
  })

  it('公开状态脱敏主机和认证信息，绝不暴露用户名或密码', () => {
    const publicConfig = toPublicProxyConfig({
      host: '192.168.10.20',
      port: 8080,
      type: 'http',
      username: 'account',
      password: 'secret',
    })

    expect(publicConfig).toEqual({
      configured: true,
      type: 'http',
      hostMasked: '192.168.*.*',
      port: 8080,
      hasAuthentication: true,
    })
    expect(JSON.stringify(publicConfig)).not.toContain('account')
    expect(JSON.stringify(publicConfig)).not.toContain('secret')
  })
})

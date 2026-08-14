import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { isTokenExpired, useAuthStore } from '../src/stores/auth'

function b64url(str) {
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function makeToken(payload) {
  const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
  const body = b64url(JSON.stringify(payload))
  return `${header}.${body}.${b64url('signature')}`
}

function futureExp() {
  return Math.floor(Date.now() / 1000) + 3600
}

function pastExp() {
  return Math.floor(Date.now() / 1000) - 3600
}

describe('isTokenExpired', () => {
  it('已过期 token 判定为过期', () => {
    expect(isTokenExpired(makeToken({ sub: 'admin', exp: pastExp() }))).toBe(true)
  })

  it('未过期 token 判定为有效', () => {
    expect(isTokenExpired(makeToken({ sub: 'admin', exp: futureExp() }))).toBe(false)
  })

  it('损坏 token 判定为无效', () => {
    expect(isTokenExpired('not-a-jwt')).toBe(true)
    expect(isTokenExpired('a.b.c')).toBe(true)
  })

  it('无 exp 字段的 token 不拦截（交由后端判定，兼容旧 token）', () => {
    expect(isTokenExpired(makeToken({ sub: 'admin' }))).toBe(false)
  })
})

describe('authStore.init 对过期/损坏 token 的处理', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
  })

  it('过期 token → 视为未登录并清理 localStorage', () => {
    localStorage.setItem('ops_token', JSON.stringify({
      token: makeToken({ sub: 'admin', exp: pastExp() }),
      username: 'admin',
      role: 'admin',
    }))
    const store = useAuthStore()
    expect(store.isLoggedIn).toBe(false)
    expect(localStorage.getItem('ops_token')).toBeNull()
  })

  it('有效 token → 保持登录态并恢复用户信息', () => {
    localStorage.setItem('ops_token', JSON.stringify({
      token: makeToken({ sub: 'admin', exp: futureExp() }),
      username: 'admin',
      role: 'admin',
    }))
    const store = useAuthStore()
    expect(store.isLoggedIn).toBe(true)
    expect(store.username).toBe('admin')
    expect(store.role).toBe('admin')
    expect(localStorage.getItem('ops_token')).not.toBeNull()
  })

  it('损坏的本地存储 → 视为未登录并清理', () => {
    localStorage.setItem('ops_token', '{broken-json')
    const store = useAuthStore()
    expect(store.isLoggedIn).toBe(false)
    expect(localStorage.getItem('ops_token')).toBeNull()
  })

  it('无 token → 未登录', () => {
    const store = useAuthStore()
    expect(store.isLoggedIn).toBe(false)
  })
})

import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { createApiClient } from '../src/api/http'
import { useAuthStore } from '../src/stores/auth'

function makeToken(exp) {
  const b64url = (str) => btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
  const body = b64url(JSON.stringify({ sub: 'admin', role: 'admin', exp }))
  return `${header}.${body}.${b64url('signature')}`
}

function jsonAdapter(status) {
  return async (config) => {
    const response = {
      data: { detail: 'test' },
      status,
      statusText: status === 401 ? 'Unauthorized' : 'Internal Server Error',
      headers: {},
      config,
    }
    // 自定义 adapter 不走 axios 内置 validateStatus，模拟真实行为：>=400 抛错
    if (status >= 400) throw { response, config, isAxiosError: true }
    return response
  }
}

describe('createApiClient', () => {
  beforeEach(() => {
    localStorage.clear()
    window.location.hash = ''
    setActivePinia(createPinia())
  })

  it('请求拦截器自动注入 Bearer token', async () => {
    const token = makeToken(Math.floor(Date.now() / 1000) + 3600)
    localStorage.setItem('ops_token', JSON.stringify({
      token,
      username: 'admin',
      role: 'admin',
    }))
    let captured = null
    const api = createApiClient({
      adapter: async (config) => {
        captured = config
        return { data: {}, status: 200, statusText: 'OK', headers: {}, config }
      },
    })
    await api.get('/prompt-eval/cases')
    expect(captured.headers.Authorization).toBe(`Bearer ${token}`)
  })

  it('401 响应 → 清理登录态并跳转登录页', async () => {
    localStorage.setItem('ops_token', JSON.stringify({
      token: makeToken(Math.floor(Date.now() / 1000) + 3600),
      username: 'admin',
      role: 'admin',
    }))
    const store = useAuthStore()
    expect(store.isLoggedIn).toBe(true)

    const api = createApiClient({ adapter: jsonAdapter(401) })
    await expect(api.get('/prompt-eval/cases')).rejects.toBeTruthy()

    expect(store.isLoggedIn).toBe(false)
    expect(localStorage.getItem('ops_token')).toBeNull()
    expect(window.location.hash).toBe('#/login')
  })

  it('非 401 错误 → 不清理登录态、不跳转', async () => {
    localStorage.setItem('ops_token', JSON.stringify({
      token: makeToken(Math.floor(Date.now() / 1000) + 3600),
      username: 'admin',
      role: 'admin',
    }))
    const store = useAuthStore()
    const api = createApiClient({ adapter: jsonAdapter(500) })
    await expect(api.get('/prompt-eval/cases')).rejects.toBeTruthy()

    expect(store.isLoggedIn).toBe(true)
    expect(localStorage.getItem('ops_token')).not.toBeNull()
    expect(window.location.hash).not.toBe('#/login')
  })
})

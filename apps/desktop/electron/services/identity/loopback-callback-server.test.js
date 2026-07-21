const http = require('http')

describe('LoopbackCallbackServer', () => {
  it('只接受一次合法 callback，并拒绝非 callback 路径', async () => {
    const { LoopbackCallbackServer } = require('./loopback-callback-server')
    const expectedState = 'expected-state-1234567890'
    const server = new LoopbackCallbackServer({ port: 0, timeoutMs: 1000, expectedState })
    const callback = server.waitForCallback()
    const port = await server.start()

    const request = (path) => new Promise((resolve, reject) => {
      const req = http.get({ hostname: '127.0.0.1', port, path }, (res) => {
        res.resume()
        res.on('end', () => resolve(res.statusCode))
      })
      req.on('error', reject)
    })

    await expect(request('/other')).resolves.toBe(404)
    await expect(request('/auth/callback?code=abc&state=wrong-state')).resolves.toBe(400)
    await expect(request('/auth/callback?code=abc')).resolves.toBe(400)
    await expect(request(`/auth/callback?state=${expectedState}`)).resolves.toBe(400)
    await expect(request(`/auth/callback?code=abc&error=denied&state=${expectedState}`)).resolves.toBe(400)
    await expect(request(`/auth/callback?code=abc&state=${expectedState}`)).resolves.toBe(200)
    await expect(callback).resolves.toContain('code=abc')
    await expect(request(`/auth/callback?code=second&state=${expectedState}`)).rejects.toBeDefined()
    await server.stop()
  })

  it('拒绝错误 Host，且不消费等待中的合法 callback', async () => {
    const { LoopbackCallbackServer } = require('./loopback-callback-server')
    const expectedState = 'expected-state-abcdefghij'
    const server = new LoopbackCallbackServer({ port: 0, timeoutMs: 1000, expectedState })
    const callback = server.waitForCallback()
    const port = await server.start()

    const request = (host) => new Promise((resolve, reject) => {
      const req = http.get({
        hostname: '127.0.0.1', port,
        path: `/auth/callback?code=abc&state=${expectedState}`,
        headers: { Host: host },
      }, (res) => {
        res.resume()
        res.on('end', () => resolve(res.statusCode))
      })
      req.on('error', reject)
    })

    await expect(request('localhost:16526')).resolves.toBe(400)
    await expect(request(`127.0.0.1:${port}`)).resolves.toBe(200)
    await expect(callback).resolves.toContain('state=expected-state')
  })

  it('超时后关闭服务并返回明确错误', async () => {
    const { LoopbackCallbackServer } = require('./loopback-callback-server')
    const server = new LoopbackCallbackServer({ port: 0, timeoutMs: 10, expectedState: 'expected-state-timeout12' })
    const callback = server.waitForCallback()
    await server.start()
    await expect(callback).rejects.toMatchObject({ code: 'IDENTITY_CALLBACK_TIMEOUT' })
    await expect(server.stop()).resolves.toBeUndefined()
  })

  it('并发合法 callback 只消费一个授权码', async () => {
    const { LoopbackCallbackServer } = require('./loopback-callback-server')
    const expectedState = 'expected-state-concurrent'
    const server = new LoopbackCallbackServer({ port: 16526, expectedState })
    const firstResponse = createDeferredResponse()
    const secondResponse = createDeferredResponse()
    server._server = { address: () => ({ port: 16526 }), listening: false }

    server._handleRequest(
      { method: 'GET', headers: { host: '127.0.0.1:16526' }, url: `/auth/callback?code=first&state=${expectedState}` },
      firstResponse,
    )
    server._handleRequest(
      { method: 'GET', headers: { host: '127.0.0.1:16526' }, url: `/auth/callback?code=second&state=${expectedState}` },
      secondResponse,
    )

    expect(firstResponse.statusCode).toBe(200)
    expect(secondResponse.statusCode).toBe(409)
    firstResponse.finish()
    await expect(server.waitForCallback()).resolves.toContain('code=first')
  })
})

function createDeferredResponse() {
  let callback
  return {
    statusCode: null,
    writeHead(statusCode) { this.statusCode = statusCode },
    end(_body, done) { callback = done },
    finish() { if (callback) callback() },
  }
}

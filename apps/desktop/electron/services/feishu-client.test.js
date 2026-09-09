// @ts-check
/**
 * feishu-client.test.js — FeishuClient 单测
 *
 * 用 vi.spyOn(https, 'request') 拦截内置模块（vi.mock 对 require('https')
 * 的内置模块不生效），模拟飞书 HTTP 响应。
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { EventEmitter } from 'events'
import https from 'https'

const state = {
  responses: [],
  error: null,
  lastUrl: null,
  lastOptions: null,
  lastBody: null,
}

function installMockRequest () {
  vi.spyOn(https, 'request').mockImplementation((url, options, cb) => {
    state.lastUrl = url
    state.lastOptions = options
    const res = new EventEmitter()
    process.nextTick(() => {
      cb(res)
      const payload = state.responses.shift()
      if (payload !== undefined) {
        res.emit('data', typeof payload === 'string' ? payload : JSON.stringify(payload))
      }
      res.emit('end')
    })
    const req = new EventEmitter()
    req.write = vi.fn((d) => { state.lastBody = d })
    req.end = vi.fn()
    if (state.error) {
      process.nextTick(() => req.emit('error', new Error(state.error)))
    }
    return req
  })
}

let FeishuClient
beforeEach(async () => {
  state.responses.length = 0
  state.error = null
  state.lastUrl = null
  state.lastOptions = null
  state.lastBody = null
  vi.restoreAllMocks()
  installMockRequest()
  const mod = await import('./feishu-client')
  FeishuClient = mod.FeishuClient
})

describe('FeishuClient', () => {
  it('构造并缓存 token（过期前 5 分钟不重复请求）', async () => {
    state.responses.push({ code: 0, tenant_access_token: 't1', expire: 7200 })
    const client = new FeishuClient({ appId: 'app', appSecret: 'sec' })
    const t1 = await client._getToken()
    expect(t1).toBe('t1')
    expect(https.request).toHaveBeenCalledTimes(1)
    expect(JSON.parse(state.lastBody)).toEqual({ app_id: 'app', app_secret: 'sec' })

    const t2 = await client._getToken()
    expect(t2).toBe('t1')
    expect(https.request).toHaveBeenCalledTimes(1)
  })

  it('token 过期后刷新', async () => {
    state.responses.push({ code: 0, tenant_access_token: 't1', expire: 1 })
    const client = new FeishuClient({ appId: 'app', appSecret: 'sec' })
    await client._getToken()
    client._tokenExpiresAt = Date.now() - 1000
    state.responses.push({ code: 0, tenant_access_token: 't2', expire: 7200 })
    const t2 = await client._getToken()
    expect(t2).toBe('t2')
    expect(https.request).toHaveBeenCalledTimes(2)
  })

  it('鉴权失败抛错', async () => {
    state.responses.push({ code: 10003, msg: 'invalid app_secret' })
    const client = new FeishuClient({ appId: 'app', appSecret: 'bad' })
    await expect(client._getToken()).rejects.toThrow(/invalid app_secret/)
  })

  it('testConnection 成功返回 true', async () => {
    state.responses.push({ code: 0, tenant_access_token: 't1', expire: 7200 })
    const client = new FeishuClient({ appId: 'app', appSecret: 'sec' })
    await expect(client.testConnection()).resolves.toBe(true)
  })

  it('createDocument 返回 document_id', async () => {
    state.responses.push({ code: 0, tenant_access_token: 't1', expire: 7200 })
    state.responses.push({ code: 0, data: { document: { document_id: 'doc123' } } })
    const client = new FeishuClient({ appId: 'app', appSecret: 'sec' })
    const docId = await client.createDocument('标题')
    expect(docId).toBe('doc123')
    expect(state.lastUrl).toContain('/open-apis/docx/v1/documents')
    expect(state.lastOptions.headers.Authorization).toBe('Bearer t1')
    expect(JSON.parse(state.lastBody)).toEqual({ title: '标题' })
  })

  it('createDocument 业务失败抛错', async () => {
    state.responses.push({ code: 0, tenant_access_token: 't1', expire: 7200 })
    state.responses.push({ code: 99991663, msg: 'permission denied' })
    const client = new FeishuClient({ appId: 'app', appSecret: 'sec' })
    await expect(client.createDocument('x')).rejects.toThrow(/permission denied/)
  })

  it('appendContent 发送文本块', async () => {
    state.responses.push({ code: 0, tenant_access_token: 't1', expire: 7200 })
    state.responses.push({ code: 0, data: { children: [] } })
    const client = new FeishuClient({ appId: 'app', appSecret: 'sec' })
    const r = await client.appendContent('doc1', 'block1', '正文内容')
    expect(r.code).toBe(0)
    expect(state.lastUrl).toContain('/open-apis/docx/v1/documents/doc1/blocks/block1/children')
    const body = JSON.parse(state.lastBody)
    expect(body.children[0].block_type).toBe(2)
    expect(body.children[0].text.elements[0].text_run.content).toBe('正文内容')
  })

  it('网络错误 reject', async () => {
    state.error = 'ECONNRESET'
    const client = new FeishuClient({ appId: 'app', appSecret: 'sec' })
    await expect(client._getToken()).rejects.toThrow(/ECONNRESET/)
  })
})

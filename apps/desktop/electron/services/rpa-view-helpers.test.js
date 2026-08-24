// @ts-check
const helpersMixin = require('./rpa-view-helpers')

describe('rpa-view-helpers — 发布网络证据采集', () => {
  it('仅保留脱敏响应摘要和解析后的证据，不保留原始响应体或 query', async () => {
    let messageHandler
    const debuggerApi = {
      attach: vi.fn().mockResolvedValue(undefined),
      detach: vi.fn().mockResolvedValue(undefined),
      on: vi.fn((_event, handler) => { messageHandler = handler }),
      removeListener: vi.fn(),
      sendCommand: vi.fn(async (method) => {
        if (method === 'Network.getResponseBody') {
          return { body: JSON.stringify({ data: { mediaId: 'media-1234', token: 'secret-token', content: '用户发布正文' } }) }
        }
        return {}
      }),
    }
    const win = { webContents: { debugger: debuggerApi } }
    const capture = await helpersMixin._startPublishNetworkCapture.call({}, win, {
      parseResponseBody: (body) => {
        const parsed = JSON.parse(body)
        return { publishIds: [parsed.data.mediaId] }
      },
    })

    await messageHandler({}, 'Network.responseReceived', {
      requestId: 'request-1',
      response: {
        url: 'https://publish.example.test/api/publish?access_token=secret-token',
        status: 200,
        mimeType: 'application/json',
      },
    })
    await messageHandler({}, 'Network.loadingFinished', { requestId: 'request-1' })
    const records = await capture.stop()
    const serialized = JSON.stringify({ records, evidence: capture.evidence })

    expect(records).toEqual([{
      endpoint: 'https://publish.example.test/api/publish',
      status: 200,
      mimeType: 'application/json',
    }])
    expect(capture.evidence).toEqual([{ publishIds: ['media-1234'] }])
    expect(serialized).not.toContain('secret-token')
    expect(serialized).not.toContain('用户发布正文')
    expect(serialized).not.toContain('access_token')
  })
})

// @ts-check
// @vitest-environment node
const { createPromptEvalApi } = require('./prompt-eval')

function makeIpc () {
  const calls = []
  return {
    calls,
    invoke: (channel, ...args) => {
      calls.push({ channel, args })
      return Promise.resolve('ok-' + channel)
    },
  }
}

describe('preload prompt-eval api', () => {
  it('暴露 6 个方法且通道名正确', () => {
    const ipc = makeIpc()
    const api = createPromptEvalApi(ipc)
    for (const key of ['promptEvalRun', 'promptEvalList', 'promptEvalGet', 'promptEvalDelete', 'promptEvalAnalyze', 'promptEvalDimensions']) {
      expect(typeof api[key]).toBe('function')
    }
  })

  it('promptEvalRun 透传请求到 prompt-eval:run', async () => {
    const ipc = makeIpc()
    const api = createPromptEvalApi(ipc)
    const req = { mediaType: 'image', items: [] }
    await api.promptEvalRun(req)
    expect(ipc.calls[0]).toEqual({ channel: 'prompt-eval:run', args: [req] })
  })
})

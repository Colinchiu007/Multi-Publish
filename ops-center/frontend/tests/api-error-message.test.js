import { describe, expect, it } from 'vitest'
import { apiErrorMessage } from '../src/api/http'

describe('apiErrorMessage', () => {
  it('传输层失败（无 response）→ 返回可操作提示，不展示裸 Network Error', () => {
    const msg = apiErrorMessage({ message: 'Network Error' })
    expect(msg).not.toBe('Network Error')
    expect(msg).toContain('无法连接后端服务')
    expect(msg).toContain('uvicorn main:app --port 8010')
  })

  it('HTTP 错误携带 detail → 优先展示后端 detail', () => {
    const msg = apiErrorMessage({ response: { data: { detail: '未配置可用的图片生成模型' } } })
    expect(msg).toBe('未配置可用的图片生成模型')
  })

  it('HTTP 错误无 detail → 回退到 axios message', () => {
    const msg = apiErrorMessage({ response: { data: '' }, message: 'Request failed with status code 500' })
    expect(msg).toBe('Request failed with status code 500')
  })

  it('HTTP 错误无 detail 且无 message → 回退到 fallback', () => {
    const msg = apiErrorMessage({ response: { data: '' } }, '自定义兜底')
    expect(msg).toBe('自定义兜底')
  })

  it('空错误对象 → 回退到默认 fallback', () => {
    const msg = apiErrorMessage(undefined)
    expect(msg).toBe('操作失败，请稍后重试')
  })
})

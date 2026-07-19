import { describe, expect, it } from 'vitest'

const adapter = require('../services/api-platform-adapter')

describe('APIPlatformAdapter 公共合同', () => {
  it('导出 publishViaApi 异步发布入口', () => {
    expect(adapter.publishViaApi).toBeTypeOf('function')
  })

  it('导出 isApiPlatform 平台能力判断入口', () => {
    expect(adapter.isApiPlatform).toBeTypeOf('function')
    expect(adapter.isApiPlatform('__unsupported_platform__')).toBe(false)
  })

  it('导出 getApiPlatforms 且返回平台名称数组', () => {
    expect(adapter.getApiPlatforms).toBeTypeOf('function')
    expect(adapter.getApiPlatforms()).toEqual(expect.any(Array))
    expect(adapter.getApiPlatforms().every((platform) => typeof platform === 'string')).toBe(true)
  })
})

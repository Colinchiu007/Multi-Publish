import { describe, expect, it } from 'vitest'
import router from './index'

describe('应用路由', () => {
  it('发布导航默认指向发布记录，编辑器保持独立入口', () => {
    expect(router.resolve('/publish/history').name).toBe('PublishHistory')
    expect(router.resolve('/publish').name).toBe('Publish')
  })
})

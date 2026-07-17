// @ts-check
/**
 * RpaViewManager 平台 mixin 结构回归测试
 */
const fs = require('fs')

describe('rpa-view-platforms — 结构约束', () => {
  it('wechat_mp 发布方法只定义一次，避免 pending stub 覆盖风险', () => {
    const source = fs.readFileSync(require.resolve('./rpa-view-platforms'), 'utf-8')
    const definitions = source.match(/async\s+_publish_wechat_mp\s*\(/g) || []

    expect(definitions).toHaveLength(1)
    expect(source).not.toContain('wechat_mp RPA pending')
  })
})

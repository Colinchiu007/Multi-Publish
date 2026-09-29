// @vitest-environment node
const { isRiskBlocked } = require('./publish-risk')

describe('publish-risk.isRiskBlocked', () => {
  it('识别常见风控信号为命中', () => {
    const hits = ['触发风控，请稍后再试', 'risk control detected', '需要滑块验证', 'captcha required', '操作频繁，请 60 分钟后再试', 'code 10000015 verify', '安全验证未通过']
    for (const m of hits) expect(isRiskBlocked(m)).toBe(true)
  })

  it('P0-2 词表增强：识别参考产品取证的风控特征串', () => {
    // 参考产品 4.13.19 -110 码族的触发条件（canvas illegal 为抖音/西瓜特征串）
    const hits = ['canvas illegal', 'Canvas Illegal: 请先到创作者中心发布一篇内容', '官方检测到您的账号存在风险，请先前往创作者中心发布作品']
    for (const m of hits) expect(isRiskBlocked(m)).toBe(true)
  })

  it('普通发布失败判为非命中', () => {
    const misses = ['平台 Cookie 缺失（账号未登录）', '缺少视频文件路径', '网络超时', '服务异常请稍后重试', '']
    for (const m of misses) expect(isRiskBlocked(m)).toBe(false)
  })

  it('非字符串输入安全返回 false', () => {
    expect(isRiskBlocked(null)).toBe(false)
    expect(isRiskBlocked(undefined)).toBe(false)
    expect(isRiskBlocked(601)).toBe(false)
    expect(isRiskBlocked({})).toBe(false)
  })
})

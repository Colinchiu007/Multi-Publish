// @ts-nocheck
// TDD —— platform-schedule-create：创建定时任务的前置校验（纯函数）

const { assertSchedulableInput } = require('../platform-schedule-create')

const NOW = Date.parse('2026-10-07T00:00:00.000Z')
const HOUR = 60 * 60 * 1000
const future = (ms) => new Date(NOW + ms).toISOString()

describe('platform-schedule-create —— 创建前校验', () => {
  describe('入参类型校验', () => {
    it.each([
      [null, '任务参数必须是对象'],
      [undefined, '任务参数必须是对象'],
      ['str', '任务参数必须是对象'],
      [[], '任务参数必须是对象'],
    ])('非法入参 %p 抛错', (input, message) => {
      expect(() => assertSchedulableInput(input, NOW)).toThrow(message)
    })

    it('platform 非空串校验', () => {
      expect(() => assertSchedulableInput({ article: {}, publishTime: future(HOUR) }, NOW))
        .toThrow('platform 必须是非空字符串')
      expect(() => assertSchedulableInput({ platform: '  ', article: {}, publishTime: future(HOUR) }, NOW))
        .toThrow('platform 必须是非空字符串')
    })

    it('article 必须是对象', () => {
      expect(() => assertSchedulableInput({ platform: 'toutiao', publishTime: future(HOUR) }, NOW))
        .toThrow('article 必须是对象')
      expect(() => assertSchedulableInput({ platform: 'toutiao', article: [], publishTime: future(HOUR) }, NOW))
        .toThrow('article 必须是对象')
    })

    it('publishTime 必须有效且在未来', () => {
      expect(() => assertSchedulableInput({ platform: 'toutiao', article: {}, publishTime: 'nope' }, NOW))
        .toThrow('publishTime 必须是有效的未来时间')
      expect(() => assertSchedulableInput({ platform: 'toutiao', article: {}, publishTime: future(-1) }, NOW))
        .toThrow('publishTime 必须是有效的未来时间')
    })
  })

  describe('平台能力门禁', () => {
    it('不支持平台侧定时的平台在写入前就被阻断', () => {
      expect(() => assertSchedulableInput({
        platform: 'zhihu', article: {}, publishTime: future(2 * HOUR)
      }, NOW)).toThrow(/zhihu.*不支持平台侧定时/)
    })

    it('未知平台 fail-closed（绝不默认支持）', () => {
      expect(() => assertSchedulableInput({
        platform: 'totally-unknown', article: {}, publishTime: future(2 * HOUR)
      }, NOW)).toThrow(/不支持平台侧定时/)
    })

    it('已取证平台通过', () => {
      const result = assertSchedulableInput({
        platform: 'toutiao', article: { title: 'A' }, publishTime: future(2 * HOUR)
      }, NOW)
      expect(result.capability.mode).toBe('api')
      expect(result.platform).toBe('toutiao')
    })
  })

  describe('平台时间窗口', () => {
    it('短于平台最小提前量（头条 5 分钟）被拒', () => {
      expect(() => assertSchedulableInput({
        platform: 'toutiao', article: {}, publishTime: future(60 * 1000)
      }, NOW)).toThrow(/5/)
    })

    it('超过平台最大跨度（头条 30 天）被拒', () => {
      expect(() => assertSchedulableInput({
        platform: 'toutiao', article: {}, publishTime: future(365 * 24 * HOUR)
      }, NOW)).toThrow(/30/)
    })

    it('窗口内的时间通过', () => {
      expect(() => assertSchedulableInput({
        platform: 'toutiao', article: {}, publishTime: future(3 * 24 * HOUR)
      }, NOW)).not.toThrow()
    })
  })
})
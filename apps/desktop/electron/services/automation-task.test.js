/**
 * automation-task.test.js — 自动化任务校验与触发点计算
 *
 * 主线：① 校验逐条出声 ② 触发点跨天/跨周/边界正确 ③ 不做过期补触发
 */
const {
  normalizeTrigger,
  validateAutomationTask,
  normalizeAutomationTasks,
  nextTriggerAt,
  describeTrigger,
  INTERVAL_MIN_MINUTES,
} = require('./automation-task')

// 固定时钟：2026-10-03 是周六
const NOW = new Date(2026, 9, 3, 14, 30, 0, 0)

describe('自动化任务 · 触发器校验', () => {
  it('四种类型全部接受', () => {
    expect(normalizeTrigger({ type: 'onAppStart' }).ok).toBe(true)
    expect(normalizeTrigger({ type: 'daily', time: '09:00' }).ok).toBe(true)
    expect(normalizeTrigger({ type: 'weekly', weekdays: [1, 3], time: '09:00' }).ok).toBe(true)
    expect(normalizeTrigger({ type: 'interval', minutes: 30 }).ok).toBe(true)
  })

  it('时间格式非法 → reason=trigger:time', () => {
    expect(normalizeTrigger({ type: 'daily', time: '25:00' }).reason).toBe('trigger:time')
    expect(normalizeTrigger({ type: 'daily', time: '9:00' }).reason).toBe('trigger:time')
    expect(normalizeTrigger({ type: 'daily', time: '' }).reason).toBe('trigger:time')
  })

  it('weekly 必须有 weekdays 且落在 1-7', () => {
    expect(normalizeTrigger({ type: 'weekly', weekdays: [], time: '09:00' }).reason).toBe('trigger:weekdays')
    expect(normalizeTrigger({ type: 'weekly', weekdays: [0, 8], time: '09:00' }).reason).toBe('trigger:weekdays')
    // 去重 + 排序
    expect(normalizeTrigger({ type: 'weekly', weekdays: [5, 1, 5], time: '09:00' }).trigger.weekdays).toEqual([1, 5])
  })

  it('interval 必须在 5-1440 分钟', () => {
    expect(normalizeTrigger({ type: 'interval', minutes: 1 }).reason).toBe('trigger:minutes')
    expect(normalizeTrigger({ type: 'interval', minutes: 2000 }).reason).toBe('trigger:minutes')
    expect(normalizeTrigger({ type: 'interval', minutes: INTERVAL_MIN_MINUTES }).ok).toBe(true)
  })
})

describe('自动化任务 · 任务校验', () => {
  it('名称：空 / 超长 / 重复 逐条出声', () => {
    expect(validateAutomationTask({ name: '  ', triggers: [{ type: 'onAppStart' }] }).reason).toBe('name:empty')
    expect(validateAutomationTask({ name: 'a'.repeat(41), triggers: [{ type: 'onAppStart' }] }).reason).toBe('name:tooLong')
    const r = validateAutomationTask(
      { name: '已有', triggers: [{ type: 'onAppStart' }] },
      { existing: [{ id: 'x', name: '已有' }] },
    )
    expect(r.reason).toBe('name:duplicate')
    // 编辑自身不算重复
    expect(validateAutomationTask(
      { id: 'x', name: '已有', triggers: [{ type: 'onAppStart' }] },
      { existing: [{ id: 'x', name: '已有' }] },
    ).ok).toBe(true)
  })

  it('触发器：空 / 同类型重复 / 超 5 个', () => {
    expect(validateAutomationTask({ name: 'a', triggers: [] }).reason).toBe('triggers:empty')
    expect(validateAutomationTask({ name: 'a', triggers: [{ type: 'daily', time: '09:00' }, { type: 'daily', time: '10:00' }] }).reason).toBe('triggers:duplicateType')
    expect(validateAutomationTask({ name: 'a', triggers: Array(6).fill({ type: 'onAppStart' }) }).reason).toBe('triggers:tooMany')
  })

  it('多个不同类型触发器可同时有效', () => {
    const r = validateAutomationTask({
      name: '混合',
      triggers: [{ type: 'onAppStart' }, { type: 'daily', time: '09:00' }, { type: 'interval', minutes: 60 }],
    })
    expect(r.ok).toBe(true)
    expect(r.task.triggers).toHaveLength(3)
  })

  it('失败策略默认 skip，非法值回落 skip；maxRetries 夹到 0-3', () => {
    expect(validateAutomationTask({ name: 'a', triggers: [{ type: 'onAppStart' }] }).task.failurePolicy).toBe('skip')
    expect(validateAutomationTask({ name: 'a', triggers: [{ type: 'onAppStart' }], failurePolicy: 'abort' }).task.failurePolicy).toBe('abort')
    expect(validateAutomationTask({ name: 'a', triggers: [{ type: 'onAppStart' }], failurePolicy: 'nope' }).task.failurePolicy).toBe('skip')
    expect(validateAutomationTask({ name: 'a', triggers: [{ type: 'onAppStart' }], maxRetries: 99 }).task.maxRetries).toBe(3)
    expect(validateAutomationTask({ name: 'a', triggers: [{ type: 'onAppStart' }], maxRetries: -1 }).task.maxRetries).toBe(0)
  })
})

describe('自动化任务 · 归一化（读取侧）', () => {
  it('触发器全废的任务被丢弃并记 triggers（不留僵尸任务）', () => {
    const r = normalizeAutomationTasks([
      { id: 'a', name: '坏的', triggers: [{ type: 'daily', time: '99:99' }] },
      { id: 'b', name: '好的', triggers: [{ type: 'onAppStart' }] },
    ])
    expect(r.tasks).toHaveLength(1)
    expect(r.tasks[0].name).toBe('好的')
    expect(r.dropped.some((d) => d.reason === 'triggers')).toBe(true)
  })

  it('超 20 条截断并记 limit', () => {
    const raw = Array.from({ length: 25 }, (_, i) => ({ id: `t${i}`, name: `n${i}`, triggers: [{ type: 'onAppStart' }] }))
    const r = normalizeAutomationTasks(raw)
    expect(r.tasks).toHaveLength(20)
    expect(r.dropped.some((d) => d.reason === 'limit')).toBe(true)
  })

  it('非数组 → invalidShape', () => {
    expect(normalizeAutomationTasks('oops').invalidShape).toBe(true)
    expect(normalizeAutomationTasks(null).invalidShape).toBe(true)
  })
})

describe('自动化任务 · 触发点计算', () => {
  it('daily 今天未到 → 今天；已过 → 明天', () => {
    const future = nextTriggerAt({ type: 'daily', time: '18:00' }, NOW)
    expect(new Date(future).getHours()).toBe(18)
    expect(new Date(future).getDate()).toBe(3)

    const past = nextTriggerAt({ type: 'daily', time: '08:00' }, NOW)
    expect(new Date(past).getDate()).toBe(4) // 跨天
    expect(new Date(past).getHours()).toBe(8)
  })

  it('weekly 跳到下一個匹配日（2026-10-03 周六）', () => {
    // 只选周一 → 下一次是 10-05
    const at = nextTriggerAt({ type: 'weekly', weekdays: [1], time: '09:00' }, NOW)
    const d = new Date(at)
    expect(d.getDay()).toBe(1)
    expect(d.getDate()).toBe(5)

    // 选周六且时间已过 → 下周六 10-10
    const sat = nextTriggerAt({ type: 'weekly', weekdays: [6], time: '09:00' }, NOW)
    expect(new Date(sat).getDate()).toBe(10)

    // 选周六且时间未到 → 今天
    const satLater = nextTriggerAt({ type: 'weekly', weekdays: [6], time: '23:00' }, NOW)
    expect(new Date(satLater).getDate()).toBe(3)
  })

  it('interval 首次立即，之后按上次触发时间递推', () => {
    expect(nextTriggerAt({ type: 'interval', minutes: 30 }, NOW)).toBe(NOW.getTime())
    const last = NOW.getTime()
    expect(nextTriggerAt({ type: 'interval', minutes: 30, _lastFiredAt: last }, NOW))
      .toBe(last + 30 * 60 * 1000)
  })

  it('onAppStart 不进定时队列（返回 null）', () => {
    expect(nextTriggerAt({ type: 'onAppStart' }, NOW)).toBe(null)
  })

  it('非法触发器返回 null，不抛错', () => {
    expect(nextTriggerAt({ type: 'nope' }, NOW)).toBe(null)
    expect(nextTriggerAt(null, NOW)).toBe(null)
  })
})

describe('自动化任务 · 触发摘要', () => {
  it('describeTrigger 四种文案', () => {
    expect(describeTrigger({ type: 'onAppStart' })).toBe('启动触发')
    expect(describeTrigger({ type: 'daily', time: '09:00' })).toBe('每天 09:00')
    expect(describeTrigger({ type: 'weekly', weekdays: [1, 3], time: '09:00' })).toBe('每周一、三 09:00')
    expect(describeTrigger({ type: 'interval', minutes: 30 })).toBe('每 30 分钟')
    expect(describeTrigger(null)).toBe('')
  })
})

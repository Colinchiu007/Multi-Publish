// @ts-check
/**
 * 归属三态判定的唯一实现锁（QM-6 后端轴 FB5）。
 *
 * 本仓曾有三份逐字同逻辑的 getOwnerSubject（publish.js / account.js / 新增 IPC 时又写一份）。
 * 同一判定抄三处，将来只改一处就会让同页不同 IPC 的口径分叉，而这类分叉在单测里各自都自洽。
 * 现在：判定只有一份（helpers.resolveIpcOwnerSubject），两个调用点必须转发；
 * 这里的「行为真值表」跑的就是那唯一一份，结构断言防止第四份出现。
 */
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const { resolveIpcOwnerSubject } = require('./helpers')

const service = (sub) => ({ getState: () => ({ user: sub === null ? null : { sub } }) })
const throwing = { getState: () => { throw new Error('identity down') } }

describe('resolveIpcOwnerSubject 三态真值表', () => {
  it('身份服务缺席 → undefined（legacy 档，不是错误）', () => {
    expect(resolveIpcOwnerSubject(null)).toBeUndefined()
    expect(resolveIpcOwnerSubject(undefined)).toBeUndefined()
  })

  it('身份服务在但拿不到 sub → null（调用方必须 fail closed，不得当成 legacy）', () => {
    expect(resolveIpcOwnerSubject(service(null))).toBeNull()
    expect(resolveIpcOwnerSubject({ getState: () => ({}) })).toBeNull()
    expect(resolveIpcOwnerSubject({ getState: () => ({ user: { sub: '   ' } }) })).toBeNull()
    expect(resolveIpcOwnerSubject({ getState: () => ({ user: { sub: 42 } }) })).toBeNull()
    expect(resolveIpcOwnerSubject(throwing)).toBeNull()
  })

  it('拿到 sub → 去空白后的字符串', () => {
    expect(resolveIpcOwnerSubject(service('user-A'))).toBe('user-A')
    expect(resolveIpcOwnerSubject(service('  user-B  '))).toBe('user-B')
  })
})

describe('调用点必须转发唯一实现', () => {
  const read = f => fs.readFileSync(path.resolve(__dirname, f), 'utf8')

  it('publish.js / account.js 不再自带 getState 判定，且都引用 helpers 的实现', () => {
    for (const f of ['./publish.js', './account.js']) {
      const src = read(f)
      expect(src.length, f + ' 读取失败').toBeGreaterThan(1000)
      expect(src, f + ' 仍自带 identityService.getState() 判定').not.toContain('identityService.getState()')
      expect(src, f + ' 未引用唯一实现').toContain('resolveIpcOwnerSubject')
    }
  })

  it('helpers.js 里该判定的实现有且只有一处', () => {
    const src = read('./helpers.js')
    expect((src.match(/function resolveIpcOwnerSubject/g) || [])).toHaveLength(1)
  })
})

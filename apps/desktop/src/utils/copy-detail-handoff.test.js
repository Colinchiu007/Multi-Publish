import { describe, it, expect, beforeEach } from 'vitest'
import {
  setCopyDetailHandoff,
  takeCopyDetailHandoff,
  clearCopyDetailHandoff,
  COPY_DETAIL_HANDOFF_KEY,
  COPY_DETAIL_ORIGINS,
} from './copy-detail-handoff'

describe('copy-detail-handoff — setCopyDetailHandoff', () => {
  beforeEach(() => { clearCopyDetailHandoff() })

  it('合法载荷写入并返回 true', () => {
    expect(setCopyDetailHandoff({ content: '正文内容', title: '标题', origin: 'collect', sourceId: 'c1' })).toBe(true)
    expect(sessionStorage.getItem(COPY_DETAIL_HANDOFF_KEY)).toBeTruthy()
  })

  it('content 为空（空串/纯空白/null）拒绝写入', () => {
    expect(setCopyDetailHandoff({ content: '', origin: 'collect', sourceId: 'c1' })).toBe(false)
    expect(setCopyDetailHandoff({ content: '   \n  ', origin: 'collect', sourceId: 'c1' })).toBe(false)
    expect(setCopyDetailHandoff({ content: null, origin: 'collect', sourceId: 'c1' })).toBe(false)
    expect(setCopyDetailHandoff(null)).toBe(false)
    expect(sessionStorage.getItem(COPY_DETAIL_HANDOFF_KEY)).toBeNull()
  })

  it('origin 不在白名单拒绝写入', () => {
    expect(setCopyDetailHandoff({ content: 'x', origin: 'evil', sourceId: 'c1' })).toBe(false)
    expect(setCopyDetailHandoff({ content: 'x', origin: '', sourceId: 'c1' })).toBe(false)
    expect(setCopyDetailHandoff({ content: 'x', origin: undefined, sourceId: 'c1' })).toBe(false)
    expect(sessionStorage.getItem(COPY_DETAIL_HANDOFF_KEY)).toBeNull()
  })

  it('白名单包含四来源', () => {
    expect(COPY_DETAIL_ORIGINS).toEqual(expect.arrayContaining(['collect', 'rewrite', 'draft', 'video']))
    expect(COPY_DETAIL_ORIGINS).toHaveLength(4)
  })

  it('同键重复写入覆盖旧载荷', () => {
    setCopyDetailHandoff({ content: '第一篇', origin: 'collect', sourceId: 'a' })
    setCopyDetailHandoff({ content: '第二篇', origin: 'rewrite', sourceId: 'b' })
    const payload = takeCopyDetailHandoff()
    expect(payload.content).toBe('第二篇')
    expect(payload.origin).toBe('rewrite')
  })
})

describe('copy-detail-handoff — takeCopyDetailHandoff（读后即焚）', () => {
  beforeEach(() => { clearCopyDetailHandoff() })

  it('读取后清除，二次读取为 null', () => {
    setCopyDetailHandoff({ content: '正文', origin: 'draft', sourceId: 'd1' })
    const first = takeCopyDetailHandoff()
    expect(first).toMatchObject({ content: '正文', origin: 'draft', sourceId: 'd1' })
    expect(takeCopyDetailHandoff()).toBeNull()
    expect(sessionStorage.getItem(COPY_DETAIL_HANDOFF_KEY)).toBeNull()
  })

  it('无载荷返回 null', () => {
    expect(takeCopyDetailHandoff()).toBeNull()
  })

  it('存储内容损坏（非法 JSON）返回 null 并清键', () => {
    sessionStorage.setItem(COPY_DETAIL_HANDOFF_KEY, 'not-json{{{')
    expect(takeCopyDetailHandoff()).toBeNull()
    expect(sessionStorage.getItem(COPY_DETAIL_HANDOFF_KEY)).toBeNull()
  })

  it('存储内容为非对象（数字）返回 null', () => {
    sessionStorage.setItem(COPY_DETAIL_HANDOFF_KEY, '42')
    expect(takeCopyDetailHandoff()).toBeNull()
  })
})

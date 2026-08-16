import { describe, expect, it } from 'vitest'
import {
  HISTORY_TIME_KEYS,
  RESUME_BLOCKING_ERROR_PATTERN,
  collectContentPolicySceneNumbers,
  contentPolicyScenes,
  filterHistoryByStatus,
  historyEffectiveTime,
  policySceneQuery,
  sortHistoryByEffectiveTime,
} from './history-utils'

describe('history-utils', () => {
  it('uses the first valid candidate time and rejects null/invalid values', () => {
    expect(HISTORY_TIME_KEYS).toEqual([
      'updatedAt', 'updated_at', 'completedAt', 'completed_at',
      'endedAt', 'ended_at', 'createdAt', 'created_at',
    ])
    expect(historyEffectiveTime({ updatedAt: null, ended_at: '2026-08-15T10:00:00Z' }))
      .toBe(Date.parse('2026-08-15T10:00:00Z'))
    expect(historyEffectiveTime({ updatedAt: 'not-a-date', created_at: 1700000000000 }))
      .toBe(1700000000000)
    expect(historyEffectiveTime({ updatedAt: null, createdAt: '' })).toBe(0)
  })

  it('treats epoch 0 as a valid effective time and normalizes finite epoch seconds', () => {
    expect(historyEffectiveTime({ updatedAt: 0, created_at: 1700000000000 })).toBe(0)
    expect(historyEffectiveTime({ updatedAt: '1970-01-01T00:00:00Z', created_at: 1700000000000 })).toBe(0)
    expect(historyEffectiveTime({ updatedAt: 1700000000 })).toBe(1700000000000)
    expect(historyEffectiveTime({ updatedAt: 1700000000000 })).toBe(1700000000000)
  })

  it('sorts descending without mutating input and uses stable tie breakers', () => {
    const items = [
      { id: 'b', updatedAt: '2026-08-15T10:00:00Z', createdAt: '2026-08-14T10:00:00Z' },
      { id: 'a', updatedAt: '2026-08-15T10:00:00Z', createdAt: '2026-08-14T11:00:00Z' },
      { id: 'old', updatedAt: '2026-08-14T10:00:00Z' },
      { id: 'missing' },
    ]
    const sorted = sortHistoryByEffectiveTime(items)
    expect(sorted.map(item => item.id)).toEqual(['a', 'b', 'old', 'missing'])
    expect(items.map(item => item.id)).toEqual(['b', 'a', 'old', 'missing'])
  })

  it('filters exact status and keeps the same ordering contract', () => {
    const items = [
      { id: 'failed', status: 'failed', updatedAt: '2026-08-15T12:00:00Z' },
      { id: 'paused', status: 'paused', updatedAt: '2026-08-15T11:00:00Z' },
      { id: 'running', status: 'running', updatedAt: '2026-08-15T10:00:00Z' },
    ]
    expect(filterHistoryByStatus(items, 'paused').map(item => item.id)).toEqual(['paused'])
    expect(filterHistoryByStatus(items, 'all').map(item => item.id)).toEqual(['failed', 'paused', 'running'])
  })
  it('RESUME_BLOCKING_ERROR_PATTERN 统一命中连字符/空格/下划线/无分隔符变体', () => {
    for (const text of ['content-policy', 'content policy', 'content_policy', 'contentpolicy', 'needs_user_input', '可能需要修改文案', '内容政策', '该失败需要人工处理（内容政策），请修改文案后重新启动']) {
      expect(RESUME_BLOCKING_ERROR_PATTERN.test(text)).toBe(true)
    }
    expect(RESUME_BLOCKING_ERROR_PATTERN.test('provider timeout')).toBe(false)
    expect(RESUME_BLOCKING_ERROR_PATTERN.test('Image #5 aborted')).toBe(false)
  })

  it('contentPolicyScenes 混合失败只提取政策场景并压缩连续区间', () => {
    const error = 'Asset scene generation failed: 69/77 scenes have both image and audio. ' +
      'Image #5: Image provider "minimax-multimodal" failed: This operation was aborted; ' +
      'Image #15: Image provider "minimax-multimodal" failed: This operation was aborted; ' +
      'Image #49: Image generation requires user input after content-policy review; ' +
      'Image #73: Image generation requires user input after content-policy review; ' +
      'Image #74: Image generation requires user input after content-policy review; ' +
      'Image #75: Image generation requires user input after content-policy review; ' +
      'Image #76: Image generation requires user input after content-policy review; ' +
      'Image #77: Image generation requires user input after content-policy review'
    expect(contentPolicyScenes(error)).toBe('#49、#73-77')
  })

  it('contentPolicyScenes 覆盖中文「内容政策」变体（与门控正则同源）', () => {
    expect(contentPolicyScenes('Image #5: 内容政策拦截; Image #6: 内容政策拦截')).toBe('#5-6')
    expect(contentPolicyScenes('Image #5: 该失败需要人工处理（内容政策），请修改文案后重新启动')).toBe('#5')
  })

  it('contentPolicyScenes 覆盖下划线/空格/中文变体并去重', () => {
    expect(contentPolicyScenes('Image #3: content_policy review; Image #3: needs_user_input; Image #4: 可能需要修改文案'))
      .toBe('#3-4')
    expect(contentPolicyScenes('Image #7: content policy blocked; Image #9: content policy blocked; Image #8: needs_user_input'))
      .toBe('#7-9')
  })

  it('contentPolicyScenes 英文 locale 使用逗号分隔', () => {
    expect(contentPolicyScenes('Image #49: content-policy review; Image #73: content-policy review; Image #74: content-policy review', 'en'))
      .toBe('#49, #73-74')
  })

  it('contentPolicyScenes 无政策场景命中返回空串', () => {
    expect(contentPolicyScenes('Image #5: Image provider failed: This operation was aborted')).toBe('')
    expect(contentPolicyScenes('provider timeout')).toBe('')
    expect(contentPolicyScenes('')).toBe('')
    expect(contentPolicyScenes(null)).toBe('')
    expect(contentPolicyScenes(undefined)).toBe('')
  })

  it('collectContentPolicySceneNumbers 升序去重返回场景号数组', () => {
    const error = 'Image #49: content-policy review; Image #73: content-policy review; ' +
      'Image #74: content-policy review; Image #49: content_policy review; Image #5: aborted'
    expect(collectContentPolicySceneNumbers(error)).toEqual([49, 73, 74])
    expect(collectContentPolicySceneNumbers('provider timeout')).toEqual([])
    expect(collectContentPolicySceneNumbers('')).toEqual([])
    expect(collectContentPolicySceneNumbers(null)).toEqual([])
  })

  it('policySceneQuery 输出逗号分隔展开串，无命中返回空串', () => {
    const error = 'Image #49: content-policy review; Image #73: content-policy review; ' +
      'Image #74: content-policy review; Image #76: 内容政策拦截'
    expect(policySceneQuery(error)).toBe('49,73,74,76')
    expect(policySceneQuery('Image #5: aborted')).toBe('')
    expect(policySceneQuery(undefined)).toBe('')
  })
})

import { describe, expect, it } from 'vitest'
import {
  CONTENT_POLICY_ERROR_PATTERN,
  HISTORY_STATUSES,
  HISTORY_TIME_KEYS,
  RESUME_BLOCKING_ERROR_PATTERN,
  collectContentPolicySceneNumbers,
  contentPolicyScenes,
  filterHistoryByStatus,
  historyEffectiveTime,
  historyStatusCounts,
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
      { id: 'interrupted', status: 'interrupted', updatedAt: '2026-08-15T10:30:00Z' },
      { id: 'running', status: 'running', updatedAt: '2026-08-15T10:00:00Z' },
    ]
    expect(filterHistoryByStatus(items, 'paused').map(item => item.id)).toEqual(['paused'])
    // 中断任务不得混入已暂停：paused 过滤必须精确匹配状态
    expect(filterHistoryByStatus(items, 'paused').map(item => item.id)).not.toContain('interrupted')
    expect(filterHistoryByStatus(items, 'interrupted').map(item => item.id)).toEqual(['interrupted'])
    expect(filterHistoryByStatus(items, 'all').map(item => item.id)).toEqual(['failed', 'paused', 'interrupted', 'running'])
  })

  it('状态清单与计数合同包含 interrupted（已中断 ≠ 已暂停，2026-08-20 状态语义修订）', () => {
    expect(HISTORY_STATUSES).toEqual(['all', 'running', 'paused', 'interrupted', 'failed', 'completed', 'cancelled'])
    const counts = historyStatusCounts([
      { id: 'a', status: 'interrupted' },
      { id: 'b', status: 'paused' },
      { id: 'c', status: 'failed' },
    ])
    expect(counts).toEqual({ all: 3, running: 0, paused: 1, interrupted: 1, failed: 1, completed: 0, cancelled: 0 })
  })
  it('RESUME_BLOCKING_ERROR_PATTERN 门控统一命中内容政策与空结果变体', () => {
    for (const text of ['content-policy', 'content policy', 'content_policy', 'contentpolicy', 'needs_user_input', '可能需要修改文案', '内容政策', '该失败需要人工处理（内容政策），请修改文案后重新启动', 'Image generation repeatedly returned no result (service fluctuation or account issue); adjust the scene prompt and retry, or check the provider account', '图片生成多次未返回结果（可能是内容安全策略或服务波动）']) {
      expect(RESUME_BLOCKING_ERROR_PATTERN.test(text)).toBe(true)
    }
    expect(RESUME_BLOCKING_ERROR_PATTERN.test('provider timeout')).toBe(false)
    expect(RESUME_BLOCKING_ERROR_PATTERN.test('Image #5 aborted')).toBe(false)
  })

  it('CONTENT_POLICY_ERROR_PATTERN 仅命中内容政策子集，不含空结果短语（2026-08-16 复审解耦）', () => {
    for (const text of ['content-policy', 'content policy', 'content_policy', 'contentpolicy', 'needs_user_input', '可能需要修改文案', '内容政策', 'Image generation requires user input after content-policy review']) {
      expect(CONTENT_POLICY_ERROR_PATTERN.test(text)).toBe(true)
    }
    for (const text of ['Image generation repeatedly returned no result (service fluctuation or account issue); adjust the scene prompt and retry, or check the provider account', '图片生成多次未返回结果（可能是内容安全策略或服务波动）', 'provider timeout']) {
      expect(CONTENT_POLICY_ERROR_PATTERN.test(text)).toBe(false)
    }
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

  it('contentPolicyScenes 覆盖中文「内容政策」变体（场景提取使用内容政策子集）', () => {
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

  it('contentPolicyScenes 不把空结果失败提取为政策场景（2026-08-16 复审回归）', () => {
    const emptyResultError = 'Image #7: Image generation repeatedly returned no result (service fluctuation or account issue); adjust the scene prompt and retry, or check the provider account; ' +
      'Image #8: 图片生成多次未返回结果（可能是内容安全策略或服务波动）'
    expect(contentPolicyScenes(emptyResultError)).toBe('')
    // 同一错误仍被门控正则判为不可原样恢复
    expect(RESUME_BLOCKING_ERROR_PATTERN.test(emptyResultError)).toBe(true)
  })
})

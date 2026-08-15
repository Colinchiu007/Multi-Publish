import { describe, expect, it } from 'vitest'
import {
  HISTORY_TIME_KEYS,
  filterHistoryByStatus,
  historyEffectiveTime,
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
})

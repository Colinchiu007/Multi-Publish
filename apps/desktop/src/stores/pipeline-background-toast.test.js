// @ts-check
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  pipelineBackgroundToastVisible,
  showPipelineBackgroundToast,
  hidePipelineBackgroundToast,
} from './pipeline-background-toast'

describe('pipeline-background-toast store', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    hidePipelineBackgroundToast()
  })
  afterEach(() => {
    hidePipelineBackgroundToast()
    vi.useRealTimers()
  })

  it('show sets visible immediately and auto-hides after duration', () => {
    expect(pipelineBackgroundToastVisible.value).toBe(false)
    showPipelineBackgroundToast(4000)
    expect(pipelineBackgroundToastVisible.value).toBe(true)
    vi.advanceTimersByTime(3999)
    expect(pipelineBackgroundToastVisible.value).toBe(true)
    vi.advanceTimersByTime(1)
    expect(pipelineBackgroundToastVisible.value).toBe(false)
  })

  it('repeated show resets the timer (no early hide from first trigger)', () => {
    showPipelineBackgroundToast(4000)
    vi.advanceTimersByTime(3000)
    showPipelineBackgroundToast(4000)
    // 距第一次触发 4s（第一次定时器已过期），但第二次才过 1s → 仍可见
    vi.advanceTimersByTime(1000)
    expect(pipelineBackgroundToastVisible.value).toBe(true)
    vi.advanceTimersByTime(3000)
    expect(pipelineBackgroundToastVisible.value).toBe(false)
  })

  it('hide clears timer and hides immediately', () => {
    showPipelineBackgroundToast(4000)
    expect(pipelineBackgroundToastVisible.value).toBe(true)
    hidePipelineBackgroundToast()
    expect(pipelineBackgroundToastVisible.value).toBe(false)
    // 定时器已被清除：推进后不会再次改变状态
    vi.advanceTimersByTime(10000)
    expect(pipelineBackgroundToastVisible.value).toBe(false)
  })
})

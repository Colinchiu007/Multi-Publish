import { describe, expect, it } from 'vitest'

import {
  STORY2VIDEO_NOTIFICATION_KEYS,
  countUnicodeCodePoints,
  formatStory2VideoNotification,
} from './story2video-notifications'

describe('Story2Video notification messages', () => {
  it('exposes stable message keys for renderer notifications', () => {
    expect(STORY2VIDEO_NOTIFICATION_KEYS).toMatchObject({
      MODEL_CONFIGURATION_REQUIRED: 'story2video.model_configuration_required',
      ACCESS_DENIED: 'story2video.access_denied',
      ORCHESTRATION_FAILED: 'story2video.orchestration_failed',
      TEXT_INPUT_ONLY: 'story2video.text_input_only',
      UNKNOWN_ERROR: 'story2video.unknown_error',
    })

    expect(new Set(Object.values(STORY2VIDEO_NOTIFICATION_KEYS)).size)
      .toBe(Object.values(STORY2VIDEO_NOTIFICATION_KEYS).length)
  })

  it('defaults known notifications to Chinese and exposes their code point count', () => {
    const notification = formatStory2VideoNotification({
      messageKey: STORY2VIDEO_NOTIFICATION_KEYS.MODEL_CONFIGURATION_REQUIRED,
    })

    expect(notification).toEqual({
      messageKey: STORY2VIDEO_NOTIFICATION_KEYS.MODEL_CONFIGURATION_REQUIRED,
      message: '未找到需要的相关模型，请在设置中添加模型',
      codePointCount: countUnicodeCodePoints('未找到需要的相关模型，请在设置中添加模型'),
    })
  })

  it('uses a friendly Chinese message without rendering technical failure details', () => {
    const notification = formatStory2VideoNotification({
      messageKey: STORY2VIDEO_NOTIFICATION_KEYS.ORCHESTRATION_FAILED,
      messageParams: { reason: 'FetchError: token=secret' },
    })

    expect(notification).toEqual({
      messageKey: STORY2VIDEO_NOTIFICATION_KEYS.ORCHESTRATION_FAILED,
      message: 'Story2Video 暂时无法完成生成，请稍后再试。',
      codePointCount: countUnicodeCodePoints('Story2Video 暂时无法完成生成，请稍后再试。'),
    })
    expect(notification.message).not.toContain('secret')
  })

  it.each(['en', 'en-US'])('renders English for the %s locale', locale => {
    const notification = formatStory2VideoNotification({
      messageKey: STORY2VIDEO_NOTIFICATION_KEYS.ORCHESTRATION_FAILED,
      messageParams: { reason: 'Audio generation failed' },
    }, locale)

    expect(notification).toEqual({
      messageKey: STORY2VIDEO_NOTIFICATION_KEYS.ORCHESTRATION_FAILED,
      message: 'Story2Video could not finish generation right now. Please try again shortly.',
      codePointCount: countUnicodeCodePoints('Story2Video could not finish generation right now. Please try again shortly.'),
    })
  })

  it('replaces an unknown technical error instead of exposing it verbatim', () => {
    const rawError = 'FetchError: POST http://127.0.0.1:9123/internal failed (token=secret)'
    const notification = formatStory2VideoNotification({ message: rawError }, 'en-US')

    expect(notification).toEqual({
      messageKey: STORY2VIDEO_NOTIFICATION_KEYS.UNKNOWN_ERROR,
      message: 'Story2Video could not complete the request. Please try again.',
      codePointCount: countUnicodeCodePoints('Story2Video could not complete the request. Please try again.'),
    })
    expect(notification.message).not.toContain(rawError)
    expect(notification.message).not.toContain('127.0.0.1')
    expect(notification.message).not.toContain('secret')
  })

  it('maps an authenticated IPC denial to a clear sign-in/access message', () => {
    const notification = formatStory2VideoNotification({
      code: -3,
      message: '当前许可证无权访问 pipeline:startOrchestrated',
    })

    expect(notification).toEqual({
      messageKey: STORY2VIDEO_NOTIFICATION_KEYS.ACCESS_DENIED,
      message: '当前登录状态无法启动图片轮播，请先登录并确认当前账号有对应权益。',
      codePointCount: countUnicodeCodePoints('当前登录状态无法启动图片轮播，请先登录并确认当前账号有对应权益。'),
    })
  })

  it('counts Unicode code points rather than UTF-16 code units or grapheme clusters', () => {
    expect('A😀中'.length).toBe(4)
    expect(countUnicodeCodePoints('A😀中')).toBe(3)
    expect(countUnicodeCodePoints('👩🏽‍💻')).toBe(4)
  })
})

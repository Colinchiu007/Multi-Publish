import { describe, expect, it } from 'vitest'

import {
  STORY2VIDEO_NOTIFICATION_KEYS,
  countUnicodeCodePoints,
  formatStory2VideoNotification,
  getStory2VideoNotificationUiText,
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
      message: '暂时无法完成生成，请稍后再试。',
      codePointCount: countUnicodeCodePoints('暂时无法完成生成，请稍后再试。'),
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
      message: 'Could not finish generation right now. Please try again shortly.',
      codePointCount: countUnicodeCodePoints('Could not finish generation right now. Please try again shortly.'),
    })
  })

  it('replaces an unknown technical error instead of exposing it verbatim', () => {
    const rawError = 'FetchError: POST http://127.0.0.1:9123/internal failed (token=secret)'
    const notification = formatStory2VideoNotification({ message: rawError }, 'en-US')

    expect(notification).toEqual({
      messageKey: STORY2VIDEO_NOTIFICATION_KEYS.UNKNOWN_ERROR,
      message: 'Could not complete the request. Please try again.',
      codePointCount: countUnicodeCodePoints('Could not complete the request. Please try again.'),
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

  it('弹窗标题统一为「提示」/「Notice」，不携带流水线名词前缀', () => {
    // UX 规范（2026-08-08）：{流水线名} 提示 → 提示；无论是否传入流水线名
    expect(getStory2VideoNotificationUiText('zh', '图片轮播').dialogTitle).toBe('提示')
    expect(getStory2VideoNotificationUiText('zh', 'Story2Video').dialogTitle).toBe('提示')
    expect(getStory2VideoNotificationUiText('zh', '').dialogTitle).toBe('提示')
    expect(getStory2VideoNotificationUiText('en', 'Image Carousel').dialogTitle).toBe('Notice')
    expect(getStory2VideoNotificationUiText('en', '').dialogTitle).toBe('Notice')
  })

  it('媒体文件细分提示：格式不支持/大小超限/不可读，参数可插值', () => {
    const zhFormat = formatStory2VideoNotification({
      messageKey: STORY2VIDEO_NOTIFICATION_KEYS.MEDIA_FORMAT_INVALID,
      messageParams: { extension: '.MP3', kindLabel: '背景音乐', extensions: ['.wav', '.m4a', '.mp3'] },
    })
    expect(zhFormat.message).toContain('.MP3')
    expect(zhFormat.message).toContain('背景音乐')
    expect(zhFormat.message).toContain('.wav / .m4a / .mp3')

    const zhSize = formatStory2VideoNotification({
      messageKey: STORY2VIDEO_NOTIFICATION_KEYS.MEDIA_SIZE_EXCEEDED,
      messageParams: { kindLabel: '背景音乐', maxMb: 15, actualMb: 20 },
    })
    expect(zhSize.message).toContain('15MB')
    expect(zhSize.message).toContain('20MB')

    const enUnreadable = formatStory2VideoNotification({
      messageKey: STORY2VIDEO_NOTIFICATION_KEYS.MEDIA_UNREADABLE,
      messageParams: { kindLabel: 'background music' },
    }, 'en')
    expect(enUnreadable.message).toContain('background music')
  })

  it('服务商返回音色无效错误时映射为 VOICE_INVALID 友好提示（含原因与建议）', () => {
    const notification = formatStory2VideoNotification({
      error: 'TTS provider "minimax-tts" failed: invalid params, voice id wrong',
    })
    expect(notification.messageKey).toBe(STORY2VIDEO_NOTIFICATION_KEYS.VOICE_INVALID)
    expect(notification.message).toContain('音色无效或已失效')
    expect(notification.message).toContain('重新选择有效音色')
    expect(notification.message).toContain('voice id wrong')

    const en = formatStory2VideoNotification({
      error: 'TTS provider "minimax-tts" failed: invalid params, voice id wrong',
    }, 'en')
    expect(en.messageKey).toBe(STORY2VIDEO_NOTIFICATION_KEYS.VOICE_INVALID)
    expect(en.message).toContain('invalid or no longer available')
  })

  it('counts Unicode code points rather than UTF-16 code units or grapheme clusters', () => {
    expect('A😀中'.length).toBe(4)
    expect(countUnicodeCodePoints('A😀中')).toBe(3)
    expect(countUnicodeCodePoints('👩🏽‍💻')).toBe(4)
  })
})

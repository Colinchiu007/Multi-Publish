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
      MODEL_API_KEY_REQUIRED: 'story2video.model_api_key_required',
      ACCESS_DENIED: 'story2video.access_denied',
      ORCHESTRATION_FAILED: 'story2video.orchestration_failed',
      TEXT_INPUT_ONLY: 'story2video.text_input_only',
      NEEDS_USER_INPUT: 'story2video.needs_user_input',
      EMPTY_RESULT: 'story2video.empty_result',
      COMPOSE_TIMEOUT: 'story2video.compose_timeout',
      COMPOSE_DURATION_EXCEEDED: 'story2video.compose_duration_exceeded',
      COMPOSE_SEGMENT_DURATION_EXCEEDED: 'story2video.compose_segment_duration_exceeded',
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

  it.each([
    ['成片总时长不能超过 50 分钟', 'zh', '50 分钟', '缩短文案'],
    ['旁白音频总时长不能超过 40 分钟', 'zh', '40 分钟', '减少场景'],
    ['Requested video duration exceeds the allowed limit of 50 minutes', 'en-US', '50-minute', 'shorten'],
    ['Composed video duration exceeds the allowed limit of 50 minutes', 'en', '50-minute', 'fewer scenes'],
  ])('将总时长错误映射为专用通知：%s', (error, locale, limitText, actionText) => {
    const notification = formatStory2VideoNotification({ error }, locale)
    expect(notification.messageKey).toBe(STORY2VIDEO_NOTIFICATION_KEYS.COMPOSE_DURATION_EXCEEDED)
    expect(notification.message).toContain(limitText)
    expect(notification.message.toLowerCase()).toContain(actionText.toLowerCase())
    expect(notification.message).not.toContain(error)
  })

  it('将单段旁白时长超限映射为拆分文案', () => {
    const notification = formatStory2VideoNotification({ error: '单段旁白时长不能超过 3 分钟' })
    expect(notification.messageKey).toBe(STORY2VIDEO_NOTIFICATION_KEYS.COMPOSE_SEGMENT_DURATION_EXCEEDED)
    expect(notification.message).toContain('拆分')
  })

  it('renders the segment-duration action in English', () => {
    const notification = formatStory2VideoNotification({
      error: 'Single narration segment duration exceeds the limit',
    }, 'en-US')
    expect(notification.messageKey).toBe(STORY2VIDEO_NOTIFICATION_KEYS.COMPOSE_SEGMENT_DURATION_EXCEEDED)
    expect(notification.message).toContain('Split')
  })

  it.each([
    'WebM transcode failed: Command timed out after 180000ms',
    'Narration concat failed: ffmpeg timeout',
    'BGM mix failed: spawn ffmpeg ETIMEDOUT',
    'Output validation failed: output validation ffmpeg stage timed out',
    'Output validation failed: 视频校验超时 C:/private/video.mp4 token=secret',
  ])('将合成阶段超时映射为可重试通知且不泄漏技术细节：%s', error => {
    const notification = formatStory2VideoNotification({ error })
    expect(notification.messageKey).toBe(STORY2VIDEO_NOTIFICATION_KEYS.COMPOSE_TIMEOUT)
    expect(notification.message).toContain('断点')
    expect(notification.message).toContain('磁盘')
    expect(notification.message).not.toContain(error)
    expect(notification.message).not.toContain('private')
    expect(notification.message).not.toContain('secret')
  })

  it('renders a safe English compose-timeout action', () => {
    const rawError = 'WebM transcode failed: webm transcode ffmpeg stage timed out at C:/private token=secret'
    const notification = formatStory2VideoNotification({ error: rawError }, 'en-US')
    expect(notification.messageKey).toBe(STORY2VIDEO_NOTIFICATION_KEYS.COMPOSE_TIMEOUT)
    expect(notification.message).toContain('resume from the breakpoint')
    expect(notification.message).toContain('disk space')
    expect(notification.message).not.toContain('private')
    expect(notification.message).not.toContain('secret')
  })

  it('prioritizes duration-limit guidance over a timeout token in the same error', () => {
    const notification = formatStory2VideoNotification({
      error: 'Composed video duration exceeds the allowed limit of 50 minutes after timeout'
    }, 'en-US')
    expect(notification.messageKey).toBe(STORY2VIDEO_NOTIFICATION_KEYS.COMPOSE_DURATION_EXCEEDED)
  })

  it('maps an authenticated IPC denial to a clear sign-in/access message', () => {
    const notification = formatStory2VideoNotification({
      code: -3,
      message: '当前许可证无权访问 pipeline:startOrchestrated',
    })

    expect(notification).toEqual({
      messageKey: STORY2VIDEO_NOTIFICATION_KEYS.ACCESS_DENIED,
      message: '当前登录状态无法启动故事讲述，请先登录并确认当前账号有对应权益。',
      codePointCount: countUnicodeCodePoints('当前登录状态无法启动故事讲述，请先登录并确认当前账号有对应权益。'),
    })
  })

  it('多次空结果（empty_result）映射为独立类别，带场景号且不误标内容安全审查（2026-08-16 复审补强）', () => {
    const zh = formatStory2VideoNotification({
      error: 'Image generation repeatedly returned no result (service fluctuation or account issue); adjust the scene prompt and retry, or check the provider account (scene 3)',
    })
    expect(zh.messageKey).toBe(STORY2VIDEO_NOTIFICATION_KEYS.EMPTY_RESULT)
    expect(zh.message).toContain('多次未返回结果')
    expect(zh.message).toContain('（场景 3）')
    expect(zh.message).not.toContain('内容安全审查')

    const en = formatStory2VideoNotification({
      error: '图片生成多次未返回结果（scene 2），请调整该场景提示词后重试',
    }, 'en-US')
    expect(en.messageKey).toBe(STORY2VIDEO_NOTIFICATION_KEYS.EMPTY_RESULT)
    expect(en.message).toContain('repeatedly returned no result')
    expect(en.message).toContain('(scene 2)')
  })

  it('弹窗标题统一为「提示」/「Notice」，不携带流水线名词前缀', () => {
    // UX 规范（2026-08-08）：{流水线名} 提示 → 提示；无论是否传入流水线名
    expect(getStory2VideoNotificationUiText('zh', '故事讲述').dialogTitle).toBe('提示')
    expect(getStory2VideoNotificationUiText('zh', 'Story2Video').dialogTitle).toBe('提示')
    expect(getStory2VideoNotificationUiText('zh', '').dialogTitle).toBe('提示')
    expect(getStory2VideoNotificationUiText('en', 'Story Telling').dialogTitle).toBe('Notice')
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

    const zhPath = formatStory2VideoNotification({
      messageKey: STORY2VIDEO_NOTIFICATION_KEYS.MEDIA_PATH_UNRESOLVED,
      messageParams: { kindLabel: '背景音乐' },
    })
    expect(zhPath.message).toContain('背景音乐')
    expect(zhPath.message).toContain('本地路径')
    expect(zhPath.message).toContain('重新选择文件')

    const enPath = formatStory2VideoNotification({
      messageKey: STORY2VIDEO_NOTIFICATION_KEYS.MEDIA_PATH_UNRESOLVED,
      messageParams: { kindLabel: 'background music' },
    }, 'en')
    expect(enPath.message).toContain('background music')
    expect(enPath.message).toContain('local path')
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

  it('场景重新生成失败错误映射为对应 failed 通知', () => {
    expect(formatStory2VideoNotification({ error: '无法重新生成字幕：服务暂时不可用' }).messageKey)
      .toBe(STORY2VIDEO_NOTIFICATION_KEYS.SCENE_SUBTITLE_REGENERATE_FAILED)
    expect(formatStory2VideoNotification({ error: '无法生成语音：TTS 服务不可用' }).messageKey)
      .toBe(STORY2VIDEO_NOTIFICATION_KEYS.SCENE_AUDIO_REGENERATE_FAILED)
    expect(formatStory2VideoNotification({ error: '无法重新生成优化词：提示词优化服务不可用' }).messageKey)
      .toBe(STORY2VIDEO_NOTIFICATION_KEYS.SCENE_PROMPT_REGENERATE_FAILED)
    expect(formatStory2VideoNotification({ error: '优化词类型无效：video' }).messageKey)
      .toBe(STORY2VIDEO_NOTIFICATION_KEYS.SCENE_PROMPT_REGENERATE_FAILED)
    expect(formatStory2VideoNotification({ error: '未配置可用的视频供应商，请在模型设置中启用视频生成能力' }).messageKey)
      .toBe(STORY2VIDEO_NOTIFICATION_KEYS.SCENE_AI_VIDEO_GENERATE_FAILED)
    expect(formatStory2VideoNotification({ error: '视频生成调用失败（provider: kling）' }).messageKey)
      .toBe(STORY2VIDEO_NOTIFICATION_KEYS.SCENE_AI_VIDEO_GENERATE_FAILED)
    expect(formatStory2VideoNotification({ error: '视频下载超过大小上限' }).messageKey)
      .toBe(STORY2VIDEO_NOTIFICATION_KEYS.SCENE_AI_VIDEO_GENERATE_FAILED)
    expect(formatStory2VideoNotification({ error: '视频文件无法解码（ffprobe: invalid data）' }).messageKey)
      .toBe(STORY2VIDEO_NOTIFICATION_KEYS.SCENE_AI_VIDEO_GENERATE_FAILED)
    expect(formatStory2VideoNotification({ error: '视频下载结果为空或不可用' }).messageKey)
      .toBe(STORY2VIDEO_NOTIFICATION_KEYS.SCENE_AI_VIDEO_GENERATE_FAILED)
    expect(formatStory2VideoNotification({ error: 'AI 视频生成失败' }).messageKey)
      .toBe(STORY2VIDEO_NOTIFICATION_KEYS.SCENE_AI_VIDEO_GENERATE_FAILED)
  })

  it('场景重新生成失败英文错误同样归一化', () => {
    expect(formatStory2VideoNotification({ error: 'subtitle regeneration failed: provider unavailable' }, 'en').messageKey)
      .toBe(STORY2VIDEO_NOTIFICATION_KEYS.SCENE_SUBTITLE_REGENERATE_FAILED)
    expect(formatStory2VideoNotification({ error: 'tts unavailable for voice synthesis' }, 'en').messageKey)
      .toBe(STORY2VIDEO_NOTIFICATION_KEYS.SCENE_AUDIO_REGENERATE_FAILED)
    expect(formatStory2VideoNotification({ error: 'prompt regeneration returned invalid result' }, 'en').messageKey)
      .toBe(STORY2VIDEO_NOTIFICATION_KEYS.SCENE_PROMPT_REGENERATE_FAILED)
    expect(formatStory2VideoNotification({ error: 'ai video generation failed: provider unavailable' }, 'en').messageKey)
      .toBe(STORY2VIDEO_NOTIFICATION_KEYS.SCENE_AI_VIDEO_GENERATE_FAILED)
  })

  it('counts Unicode code points rather than UTF-16 code units or grapheme clusters', () => {
    expect('A😀中'.length).toBe(4)
    expect(countUnicodeCodePoints('A😀中')).toBe(3)
    expect(countUnicodeCodePoints('👩🏽‍💻')).toBe(4)
  })

  it('cloned voice across accounts maps to VOICE_INVALID not QUOTA_EXCEEDED (run_1786 bug)', () => {
    const result = formatStory2VideoNotification({ error: 'TTS provider failed: voice does not exist' })
    expect(result.messageKey).toBe(STORY2VIDEO_NOTIFICATION_KEYS.VOICE_INVALID)
  })

  it('cloned voice Chinese error also correctly classified', () => {
    const result = formatStory2VideoNotification({ error: 'TTS provider failed: 当前账号无权访问该音色' })
    expect(result.messageKey).toBe(STORY2VIDEO_NOTIFICATION_KEYS.VOICE_INVALID)
  })

  it('QUOTA_EXCEEDED only triggers when errorCode is explicit or no other signal', () => {
    const result = formatStory2VideoNotification({
      error: 'API Key 额度已用完，请升级套餐',
      errorCode: 'AUTH_FAILED',
    })
    expect(result.messageKey).not.toBe(STORY2VIDEO_NOTIFICATION_KEYS.QUOTA_EXCEEDED)
  })

  it('auth error text with quota keywords classified as API_KEY_INVALID not QUOTA_EXCEEDED', () => {
    const result = formatStory2VideoNotification({
      error: 'TTS provider failed: API Key 无效，额度已用完',
    })
    expect(result.messageKey).toBe(STORY2VIDEO_NOTIFICATION_KEYS.API_KEY_INVALID)
  })

  it('quota keywords without auth signal still trigger QUOTA_EXCEEDED (backward compat)', () => {
    const result = formatStory2VideoNotification({
      error: '模型 API 的额度或余额已用完',
    })
    expect(result.messageKey).toBe(STORY2VIDEO_NOTIFICATION_KEYS.QUOTA_EXCEEDED)
  })

  it('SenseNova 429 rpm exhausted classified as RATE_LIMITED not QUOTA_EXCEEDED', () => {
    const result = formatStory2VideoNotification({
      error: "Story2Video optimize failed: Story2Video 场景 2 prompt-engine 优化失败: Error code: 429 - {'error': {'message': 'rpm exhausted', 'type': 'quota_exceeded_error', 'code': '8'}}"
    })
    expect(result.messageKey).toBe(STORY2VIDEO_NOTIFICATION_KEYS.RATE_LIMITED)
  })
})
import { describe, expect, it } from 'vitest'
import {
  MAX_STORY2VIDEO_TEXT_CHARACTERS,
  STORY2VIDEO_NOTIFICATION_KEYS,
  STORY2VIDEO_NOTIFICATION_MESSAGES,
  countStory2VideoTextCharacters,
  resolveStory2VideoNotification,
} from './notifications'

describe('Story2Video 通知模型', () => {
  it('维护完整的中文和英文消息目录，并默认显示中文', () => {
    for (const key of Object.values(STORY2VIDEO_NOTIFICATION_KEYS)) {
      expect(STORY2VIDEO_NOTIFICATION_MESSAGES.zh[key]).toEqual(expect.any(String))
      expect(STORY2VIDEO_NOTIFICATION_MESSAGES.en[key]).toEqual(expect.any(String))
    }

    expect(resolveStory2VideoNotification({ messageKey: STORY2VIDEO_NOTIFICATION_KEYS.MODEL_CONFIGURATION_REQUIRED })).toEqual({
      key: STORY2VIDEO_NOTIFICATION_KEYS.MODEL_CONFIGURATION_REQUIRED,
      params: {},
      message: '未找到需要的相关模型，请在设置中添加模型',
    })
  })

  it('使用稳定消息键翻译中文和英文，并忽略未知技术错误文本', () => {
    expect(resolveStory2VideoNotification({
      messageKey: STORY2VIDEO_NOTIFICATION_KEYS.TEXT_TOO_LONG,
      messageParams: { max: 6000 },
    }, { locale: 'en-US' })).toMatchObject({
      key: STORY2VIDEO_NOTIFICATION_KEYS.TEXT_TOO_LONG,
      message: 'Your script can contain up to 6,000 characters. Please shorten it and try again.',
    })

    expect(resolveStory2VideoNotification({
      error: 'Story2Video optimize scene count exceeds the allowed limit: 60',
    })).toMatchObject({
      key: STORY2VIDEO_NOTIFICATION_KEYS.OPERATION_FAILED,
      message: '当前操作未能完成，请稍后再试。',
    })
  })

  it('按 Unicode code point 计算 6000 个中文、英文和 emoji 字符', () => {
    expect(MAX_STORY2VIDEO_TEXT_CHARACTERS).toBe(6000)
    expect(countStory2VideoTextCharacters('中'.repeat(6000))).toBe(6000)
    expect(countStory2VideoTextCharacters('a'.repeat(6000))).toBe(6000)
    expect(countStory2VideoTextCharacters('😀'.repeat(6000))).toBe(6000)
  })
  it('localizes approved notification parameters and drops unapproved technical fields', () => {
    expect(resolveStory2VideoNotification({
      messageKey: STORY2VIDEO_NOTIFICATION_KEYS.DEGRADED_ASSETS_WARNING,
      messageParams: {
        assetKinds: ['placeholder_image', 'silent_narration'],
        reason: 'C:/private/path token=secret',
      },
    })).toMatchObject({
      key: STORY2VIDEO_NOTIFICATION_KEYS.DEGRADED_ASSETS_WARNING,
      params: { kinds: '占位图片、静音旁白' },
      message: '此成片包含离线降级素材（占位图片、静音旁白），请在发布前预览确认。',
    })

    expect(resolveStory2VideoNotification({
      messageKey: STORY2VIDEO_NOTIFICATION_KEYS.DEGRADED_ASSETS_WARNING,
      messageParams: { assetKinds: ['placeholder_image', 'silent_narration'] },
    }, { locale: 'en-US' })).toMatchObject({
      params: { kinds: 'placeholder images, silent narration' },
      message: 'This video contains offline fallback assets (placeholder images, silent narration). Preview it before publishing.',
    })
  })

})

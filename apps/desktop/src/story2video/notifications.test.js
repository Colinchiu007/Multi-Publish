import { describe, expect, it } from 'vitest'
import {
  MAX_STORY2VIDEO_TEXT_CHARACTERS,
  STORY2VIDEO_NOTIFICATION_KEYS,
  STORY2VIDEO_NOTIFICATION_MESSAGES,
  countStory2VideoTextCharacters,
  formatStory2VideoNotification,
  historyLoadFailureDetail,
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

  it('识别生成限流错误，展示带场景号的友好文案，且技术细节不泄漏', () => {
    const resolved = resolveStory2VideoNotification({
      error: 'Story2Video optimize failed: Story2Video optimize scene 22 failed: You\'ve reached the API rate limit for free users. (request id: 202608060521497814857554AuUFtW2)',
    })
    expect(resolved).toMatchObject({
      key: STORY2VIDEO_NOTIFICATION_KEYS.RATE_LIMITED,
      params: { sceneText: '（第 22 个场景）' },
    })
    expect(resolved.message).toContain('（第 22 个场景）')
    expect(resolved.message).toContain('请稍等片刻后重试')
    expect(resolved.message).not.toContain('request id')

    expect(resolveStory2VideoNotification({
      error: 'provider 429 rate limit',
    }, { locale: 'en-US' })).toMatchObject({
      key: STORY2VIDEO_NOTIFICATION_KEYS.RATE_LIMITED,
      message: 'Generation is rate limited. Wait a moment and try again, or check your provider plan quota.',
    })

    // 对话框二次格式化路径：messageParams 中的 sceneText 需透传
    const dialogMessage = formatStory2VideoNotification({ messageKey: resolved.key, messageParams: resolved.params })
    expect(dialogMessage.message).toContain('（第 22 个场景）')
  })

  it('识别额度耗尽错误并给出明确的本地化提示（不重试类）', () => {
    const resolved = resolveStory2VideoNotification({
      error: 'Insufficient balance: your token plan quota for this 5-hour window has been exhausted (scene 3)',
    })
    expect(resolved).toMatchObject({
      key: STORY2VIDEO_NOTIFICATION_KEYS.QUOTA_EXCEEDED,
      params: { sceneText: '（第 3 个场景）' },
    })
    expect(resolved.message).toContain('额度或余额已用完')
    expect(resolved.message).toContain('第 3 个场景')

    expect(resolveStory2VideoNotification({
      error: 'Your account balance is insufficient',
    }, { locale: 'en-US' })).toMatchObject({
      key: STORY2VIDEO_NOTIFICATION_KEYS.QUOTA_EXCEEDED,
      message: 'The model API quota or balance is exhausted. Check your provider plan, or switch models and resume from the breakpoint.',
    })
  })

  it('将「API Key 未配置/缺失/解密失败」解析为独立提示，而非「未找到模型」', () => {
    const zh = resolveStory2VideoNotification({
      error: '尚未配置 API Key，请先在“模型设置”中填写 MiniMax Image 的 API Key 后重试（API Key not configured）',
    })
    expect(zh.key).toBe(STORY2VIDEO_NOTIFICATION_KEYS.MODEL_API_KEY_REQUIRED)
    expect(zh.message).toContain('API Key')
    expect(zh.message).not.toContain('未找到需要的相关模型')

    // api-key 上下文内的解密失败
    const decrypt = resolveStory2VideoNotification({
      error: 'Provider API Key decrypt failed: safeStorage could not decrypt the api_key ciphertext.',
    })
    expect(decrypt.key).toBe(STORY2VIDEO_NOTIFICATION_KEYS.MODEL_API_KEY_REQUIRED)

    const en = resolveStory2VideoNotification({ error: 'API Key not configured' }, { locale: 'en-US' })
    expect(en.key).toBe(STORY2VIDEO_NOTIFICATION_KEYS.MODEL_API_KEY_REQUIRED)
    expect(en.message).toContain('API key')

    // 常见英文缺失表述
    expect(resolveStory2VideoNotification({ error: 'Missing API key for provider openai' }).key)
      .toBe(STORY2VIDEO_NOTIFICATION_KEYS.MODEL_API_KEY_REQUIRED)
    expect(resolveStory2VideoNotification({ error: 'api key required' }).key)
      .toBe(STORY2VIDEO_NOTIFICATION_KEYS.MODEL_API_KEY_REQUIRED)
    expect(resolveStory2VideoNotification({ error: 'No API key found in config' }).key)
      .toBe(STORY2VIDEO_NOTIFICATION_KEYS.MODEL_API_KEY_REQUIRED)
  })

  it('无 api-key 上下文的解密失败不误归类为「API Key 未配置」', () => {
    const resolved = resolveStory2VideoNotification({
      error: 'Project file Decrypt failed: Error while decrypting the ciphertext provided to safeStorage.decryptString.',
    })
    expect(resolved.key).not.toBe(STORY2VIDEO_NOTIFICATION_KEYS.MODEL_API_KEY_REQUIRED)
  })

  it('真正的模型缺失仍解析为「未找到需要的相关模型」', () => {
    const resolved = resolveStory2VideoNotification({ error: '未找到需要的相关模型，请在设置中添加模型' })
    expect(resolved.key).toBe(STORY2VIDEO_NOTIFICATION_KEYS.MODEL_CONFIGURATION_REQUIRED)
    expect(resolved.message).toBe('未找到需要的相关模型，请在设置中添加模型')
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

describe('Story2Video 后台并发通知', () => {
  it('errorCode=PIPELINE_CONCURRENCY_LIMIT 解析为专用文案并填充 count/max', () => {
    const zh = resolveStory2VideoNotification({ errorCode: 'PIPELINE_CONCURRENCY_LIMIT', errorParams: { count: 2, max: 2 } })
    expect(zh.key).toBe(STORY2VIDEO_NOTIFICATION_KEYS.PIPELINE_CONCURRENCY_LIMIT)
    expect(zh.message).toBe('当前已有 2 条流水线正在后台运行，最多同时运行 2 条，请等待其中一条完成后再启动。')

    const en = resolveStory2VideoNotification({ errorCode: 'PIPELINE_CONCURRENCY_LIMIT', errorParams: { count: 1, max: 2 } }, { locale: 'en-US' })
    expect(en.key).toBe(STORY2VIDEO_NOTIFICATION_KEYS.PIPELINE_CONCURRENCY_LIMIT)
    expect(en.message).toContain('1 pipelines are already running')
    expect(en.message).toContain('Up to 2 can run at once')
  })

  it('中文后端并发错误文本也能通过正则映射到并发通知', () => {
    const resolved = resolveStory2VideoNotification({ error: '当前已有 2 条流水线正在后台运行，最多同时运行 2 条，请等待其中一条完成后再启动。' })
    expect(resolved.key).toBe(STORY2VIDEO_NOTIFICATION_KEYS.PIPELINE_CONCURRENCY_LIMIT)
  })
})

describe('Story2Video 历史记录加载失败建议', () => {
  it('historyLoadFailureDetail 按原因给出可操作建议（登录/存储/超时/未知）', () => {
    expect(historyLoadFailureDetail('无法识别当前用户', 'zh')).toContain('登录')
    expect(historyLoadFailureDetail('Story2Video 项目存储不可用', 'zh')).toContain('重启')
    expect(historyLoadFailureDetail('历史记录加载超时', 'zh')).toContain('重试')
    expect(historyLoadFailureDetail('', 'zh')).toBe('')
    expect(historyLoadFailureDetail(null, 'zh')).toBe('')
    // 非空但不可识别：不泄漏内部错误文本
    expect(historyLoadFailureDetail('some random internal error', 'zh')).toBe('')
    expect(historyLoadFailureDetail('cannot identify user', 'en-US')).toMatch(/sign in/i)
    expect(historyLoadFailureDetail('store unavailable', 'en-US')).toMatch(/restart/i)
  })
})

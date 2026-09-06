import { describe, it, expect } from 'vitest'
import {
  MESSAGE_KEYS,
  ERROR_CATEGORY,
  ERROR_NORMALIZE_RULES,
  NOTIFY_LEVELS,
  NOTIFY_LEVEL_MAP,
  TECHNICAL_TEXT_PATTERNS,
  resolveErrorCategory,
  matchNormalizeRule,
  isAllowedNotifyLevel,
  looksTechnical,
  looksLikeI18nKey,
  isKnownMessageKey,
} from './message-contract'
import { USER_ERROR_CODES } from './user-facing-error'
import { STORY2VIDEO_NOTIFICATION_KEYS } from '@/story2video/story2video-notifications'

describe('message-contract — messageKey 唯一性', () => {
  it('userErrors 与 story2video 命名空间的 key 各自唯一', () => {
    const userKeys = Object.values(USER_ERROR_CODES)
    const s2vKeys = Object.values(STORY2VIDEO_NOTIFICATION_KEYS)
    expect(new Set(userKeys).size).toBe(userKeys.length)
    expect(new Set(s2vKeys).size).toBe(s2vKeys.length)
  })

  it('通用域 key 形态统一（小写点分）', () => {
    expect(MESSAGE_KEYS.OPERATION_FAILED).toBe('operation_failed')
    expect(MESSAGE_KEYS.UNCAUGHT_RENDERER_ERROR).toBe('renderer.uncaught_error')
    expect(MESSAGE_KEYS.OPERATION_FAILED).toMatch(/^[a-z][a-z0-9_.]*$/)
    expect(MESSAGE_KEYS.UNCAUGHT_RENDERER_ERROR).toMatch(/^[a-z][a-z0-9_.]*$/)
  })
})

describe('message-contract — errorCategory 跨模块关联（M1）', () => {
  it('同一语义错误跨命名空间映射到同一 errorCategory', () => {
    // quota_exceeded：userErrors.QUOTA_EXCEEDED 与 story2video.QUOTA_EXCEEDED → 同一 category
    expect(resolveErrorCategory(USER_ERROR_CODES.QUOTA_EXCEEDED)).toBe(ERROR_CATEGORY.QUOTA_EXCEEDED)
    expect(resolveErrorCategory(STORY2VIDEO_NOTIFICATION_KEYS.QUOTA_EXCEEDED)).toBe(ERROR_CATEGORY.QUOTA_EXCEEDED)

    // rate_limited 同理
    expect(resolveErrorCategory(USER_ERROR_CODES.RATE_LIMITED)).toBe(ERROR_CATEGORY.RATE_LIMITED)
    expect(resolveErrorCategory(STORY2VIDEO_NOTIFICATION_KEYS.RATE_LIMITED)).toBe(ERROR_CATEGORY.RATE_LIMITED)
  })

  it('未知 messageKey → ERROR_CATEGORY.UNKNOWN', () => {
    expect(resolveErrorCategory('nonexistent.key')).toBe(ERROR_CATEGORY.UNKNOWN)
    expect(resolveErrorCategory('')).toBe(ERROR_CATEGORY.UNKNOWN)
    expect(resolveErrorCategory(undefined)).toBe(ERROR_CATEGORY.UNKNOWN)
  })
})

describe('message-contract — 共享归一化规则表（C1 真收敛）', () => {
  it('语义重叠模式（quota/rate/timeout/duration/needs_input）收敛为单一规范正则', () => {
    const keys = ERROR_NORMALIZE_RULES.map((r) => r.key)
    expect(keys).toContain('quota_exceeded')
    expect(keys).toContain('rate_limited')
    expect(keys).toContain('compose_timeout')
    expect(keys).toContain('compose_duration_exceeded')
    expect(keys).toContain('needs_user_input')
    // 每个 errorCategory 只出现一次（真收敛，无重复）
    const categories = ERROR_NORMALIZE_RULES.map((r) => r.errorCategory)
    expect(new Set(categories).size).toBe(categories.length)
  })

  it('quota_exceeded：匹配 402 与用量窗口耗尽', () => {
    const r1 = matchNormalizeRule('Error code: 402 insufficient balance')
    expect(r1?.errorCategory).toBe(ERROR_CATEGORY.QUOTA_EXCEEDED)
    expect(r1?.key).toBe('quota_exceeded')

    const r2 = matchNormalizeRule('GoUsageLimitError: daily usage limit reached')
    expect(r2?.errorCategory).toBe(ERROR_CATEGORY.QUOTA_EXCEEDED)
  })

  it('rate_limited：匹配 429 与限流', () => {
    const r1 = matchNormalizeRule('Error code: 429 Too Many Requests')
    expect(r1?.errorCategory).toBe(ERROR_CATEGORY.RATE_LIMITED)
    const r2 = matchNormalizeRule('请求过于频繁，已被限流')
    expect(r2?.errorCategory).toBe(ERROR_CATEGORY.RATE_LIMITED)
  })

  it('compose_timeout / compose_duration_exceeded / needs_user_input', () => {
    expect(matchNormalizeRule('视频合成超时').errorCategory).toBe(ERROR_CATEGORY.COMPOSE_TIMEOUT)
    expect(matchNormalizeRule('视频时长超过 30 分钟上限').errorCategory).toBe(ERROR_CATEGORY.COMPOSE_DURATION_EXCEEDED)
    expect(matchNormalizeRule('内容政策需要用户输入').errorCategory).toBe(ERROR_CATEGORY.NEEDS_USER_INPUT)
  })

  it('空/无匹配 → null', () => {
    expect(matchNormalizeRule('')).toBeNull()
    expect(matchNormalizeRule('some unrelated text')).toBeNull()
  })
})

describe('message-contract — level 白名单与映射（C2/M9）', () => {
  it('NOTIFY_LEVELS 仅含 {info, warn, error}', () => {
    expect(NOTIFY_LEVELS).toEqual(['info', 'warn', 'error'])
  })

  it('isAllowedNotifyLevel 校验', () => {
    expect(isAllowedNotifyLevel('info')).toBe(true)
    expect(isAllowedNotifyLevel('warn')).toBe(true)
    expect(isAllowedNotifyLevel('error')).toBe(true)
    expect(isAllowedNotifyLevel('success')).toBe(false)
    expect(isAllowedNotifyLevel('confirm')).toBe(false)
    expect(isAllowedNotifyLevel('INFO')).toBe(false)
  })

  it('NOTIFY_LEVEL_MAP 渲染端 level → 日志级别', () => {
    expect(NOTIFY_LEVEL_MAP.success).toBe('info')
    expect(NOTIFY_LEVEL_MAP.info).toBe('info')
    expect(NOTIFY_LEVEL_MAP.warning).toBe('warn')
    expect(NOTIFY_LEVEL_MAP.error).toBe('error')
    expect(NOTIFY_LEVEL_MAP.confirm).toBe('info')
  })
})

describe('message-contract — 技术文本检测（M4）', () => {
  it('TECHNICAL_TEXT_PATTERNS 覆盖通道名/错误码/栈/IP:端口', () => {
    expect(looksTechnical('store:list-publish-history failed')).toBe(true)
    expect(looksTechnical('VOICE_CATALOG_UNAVAILABLE')).toBe(true)
    expect(looksTechnical('at line 42')).toBe(true)
    expect(looksTechnical('192.168.1.1:8080')).toBe(true)
    expect(looksTechnical('普通自然语言错误')).toBe(false)
  })

  it('TECHNICAL_TEXT_PATTERNS 为非空数组', () => {
    expect(Array.isArray(TECHNICAL_TEXT_PATTERNS)).toBe(true)
    expect(TECHNICAL_TEXT_PATTERNS.length).toBeGreaterThan(0)
  })
})

describe('message-contract — i18n 原始 key 泄漏检测（i18n-user-facing-messages）', () => {
  it('识别泄漏的 i18n 原始 key（驼峰/下划线点分路径）', () => {
    expect(looksLikeI18nKey('accountsPage.loginExpiredHint')).toBe(true)
    expect(looksLikeI18nKey('accountsPage.goLogin')).toBe(true)
    expect(looksLikeI18nKey('story2video.quota_exceeded')).toBe(true)
    expect(looksLikeI18nKey('publishPage.coverCrop.title')).toBe(true)
  })

  it('不拦截自然语言（含空格/中文/标点）', () => {
    expect(looksLikeI18nKey('hello world')).toBe(false)
    expect(looksLikeI18nKey('登录已失效，请重新登录')).toBe(false)
    expect(looksLikeI18nKey('操作失败: 网络错误')).toBe(false)
    expect(looksLikeI18nKey('')).toBe(false)
    expect(looksLikeI18nKey(null)).toBe(false)
  })

  it('不拦截单段或非 key 形态', () => {
    expect(looksLikeI18nKey('a.b')).toBe(false)
    expect(looksLikeI18nKey('loginExpired')).toBe(false)
    expect(looksLikeI18nKey('123.456')).toBe(false)
  })
})

describe('message-contract — messageKey 白名单（C2 服务端校验）', () => {
  it('已知 key 通过', () => {
    expect(isKnownMessageKey(USER_ERROR_CODES.AUTH_REQUIRED)).toBe(true)
    expect(isKnownMessageKey(STORY2VIDEO_NOTIFICATION_KEYS.QUOTA_EXCEEDED)).toBe(true)
    expect(isKnownMessageKey(MESSAGE_KEYS.OPERATION_FAILED)).toBe(true)
    expect(isKnownMessageKey(MESSAGE_KEYS.UNCAUGHT_RENDERER_ERROR)).toBe(true)
  })

  it('未知 key / 空拒绝', () => {
    expect(isKnownMessageKey('nonexistent.key')).toBe(false)
    expect(isKnownMessageKey('')).toBe(false)
    expect(isKnownMessageKey(undefined)).toBe(false)
  })
})
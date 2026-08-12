// @ts-check
/**
 * log-redact — 日志脱敏辅助（零依赖）
 *
 * 兜底脱敏：即使调用方误把敏感字段拼进日志，输出前统一清洗。
 * 原则：源头不打印敏感字段优先，此处正则仅为最后防线。
 * 覆盖模式：Bearer / apiKey / access_token / refresh_token / password / secret /
 * authorization / cookie / sk- 前缀 / 通用 JWT（eyJ 开头三段）。
 */
'use strict'

var SECRET_PATTERNS = [
  [/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer ***'],
  // 带引号键值（JSON 风格）："apiKey":"x" / password: "p" / access_token="x"
  [/([\"']?(?:api[_-]?key|access_token|refresh_token|password|secret|authorization|cookie)[\"']?\s*[:=]\s*[\"'])[^\"'\s,}]+/gi, '$1***'],
  // 无引号键值（URL/表单风格）：access_token=token123&...
  [/\b(api[_-]?key|access_token|refresh_token|password|secret|cookie)\s*=\s*[^&\s,;\"']+/gi, '$1=***'],
  [/\b(sk-[A-Za-z0-9_-]{4})[A-Za-z0-9_-]+/g, '$1***'],
  [/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{4,}\b/g, 'eyJ***'],
]

function redactText (value) {
  var output = String(value == null ? '' : value)
  for (var i = 0; i < SECRET_PATTERNS.length; i++) {
    output = output.replace(SECRET_PATTERNS[i][0], SECRET_PATTERNS[i][1])
  }
  return output
}

module.exports = { redactText }

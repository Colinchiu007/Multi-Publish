/**
 * 11 个平台格式化函数
 *
 * 每个函数接收统一结构 { title, content, images, tags, originalHtml }
 * 返回 { title, content, tags, coverSize }
 */
const { LIMITS } = require('./rules')

/**
 * 截断字符串到指定长度
 */
function truncate (str, maxLen) {
  if (!str) return ''
  if (str.length <= maxLen) return str
  return str.slice(0, maxLen)
}

/**
 * 将 tags 数组转为平台特定格式
 */
function formatTags (tags, prefix, separator = ' ') {
  if (!tags || tags.length === 0) return ''
  return tags.map(t => `${prefix}${t}`).join(separator)
}

// ─── 各平台格式化函数 ─────────────────────

function wechatFormatter (struct) {
  const limit = LIMITS.wechat_mp
  return {
    title: truncate(struct.title, limit.maxTitle),
    content: struct.content, // 微信保留 HTML
    tags: struct.tags || [],
    coverSize: limit.coverSize,
  }
}

function zhihuFormatter (struct) {
  const limit = LIMITS.zhihu
  const tagStr = struct.tags && struct.tags.length > 0
    ? '\n\n话题：' + struct.tags.join('、')
    : ''
  return {
    title: truncate(struct.title, limit.maxTitle),
    content: truncate(struct.content, limit.maxContent) + tagStr,
    tags: struct.tags || [],
    coverSize: limit.coverSize,
  }
}

function weiboFormatter (struct) {
  const limit = LIMITS.weibo
  const tagStr = struct.tags && struct.tags.length > 0
    ? ' ' + struct.tags.map(t => `#${t}#`).join(' ')
    : ''
  const body = [struct.title, struct.content].filter(Boolean).join('\n')
  return {
    title: truncate(struct.title, limit.maxTitle),
    content: truncate(body, limit.maxContent) + tagStr,
    tags: struct.tags || [],
    coverSize: limit.coverSize,
  }
}

function douyinFormatter (struct) {
  const limit = LIMITS.douyin
  const tagStr = struct.tags && struct.tags.length > 0
    ? ' ' + struct.tags.map(t => `#${t}`).join(' ')
    : ''
  return {
    title: truncate(struct.title, limit.maxTitle),
    content: truncate(struct.content, limit.maxContent) + tagStr,
    tags: struct.tags || [],
    coverSize: limit.coverSize,
  }
}

function xiaohongshuFormatter (struct) {
  const limit = LIMITS.xiaohongshu
  const tagStr = struct.tags && struct.tags.length > 0
    ? '\n' + struct.tags.map(t => `#${t}`).join('\n')
    : ''
  return {
    title: truncate(struct.title, limit.maxTitle),
    content: truncate(struct.content, limit.maxContent) + tagStr,
    tags: struct.tags || [],
    coverSize: limit.coverSize,
  }
}

function tencentVideoFormatter (struct) {
  const limit = LIMITS.tencent_video
  return {
    title: truncate(struct.title, limit.maxTitle),
    content: truncate(struct.content, limit.maxContent),
    tags: struct.tags || [],
    coverSize: limit.coverSize,
  }
}

function kuaishouFormatter (struct) {
  const limit = LIMITS.kuaishou
  return {
    title: truncate(struct.title, limit.maxTitle),
    content: truncate(struct.content, limit.maxContent),
    tags: struct.tags || [],
    coverSize: limit.coverSize,
  }
}

function toutiaoFormatter (struct) {
  const limit = LIMITS.toutiao
  const tagStr = struct.tags && struct.tags.length > 0
    ? '\n\n' + struct.tags.map(t => `#${t}#`).join(' ')
    : ''
  return {
    title: truncate(struct.title, limit.maxTitle),
    content: truncate(struct.content, limit.maxContent) + tagStr,
    tags: struct.tags || [],
    coverSize: limit.coverSize,
  }
}

function youtubeFormatter (struct) {
  const limit = LIMITS.youtube
  const tagStr = struct.tags && struct.tags.length > 0
    ? '\n\n' + struct.tags.map(t => `#${t}`).join(' ')
    : ''
  return {
    title: truncate(struct.title, limit.maxTitle),
    content: truncate(struct.description || struct.content, limit.maxContent) + tagStr,
    tags: struct.tags || [],
    coverSize: limit.coverSize,
  }
}

function tiktokFormatter (struct) {
  const limit = LIMITS.tiktok
  const tagStr = struct.tags && struct.tags.length > 0
    ? ' ' + struct.tags.map(t => `#${t}`).join(' ')
    : ''
  return {
    title: truncate(struct.title, limit.maxTitle),
    content: truncate(struct.content, limit.maxContent) + tagStr,
    tags: struct.tags || [],
    coverSize: limit.coverSize,
  }
}

function bilibiliFormatter (struct) {
  const limit = LIMITS.bilibili
  const tagStr = struct.tags && struct.tags.length > 0
    ? '\n\n' + struct.tags.map(t => `#${t}#`).join(' ')
    : ''
  return {
    title: truncate(struct.title, limit.maxTitle),
    content: truncate(struct.content, limit.maxContent) + tagStr,
    tags: struct.tags || [],
    coverSize: limit.coverSize,
  }
}

// 注册表
const FORMATTERS = {
  wechat_mp: wechatFormatter,
  zhihu: zhihuFormatter,
  weibo: weiboFormatter,
  douyin: douyinFormatter,
  xiaohongshu: xiaohongshuFormatter,
  tencent_video: tencentVideoFormatter,
  kuaishou: kuaishouFormatter,
  toutiao: toutiaoFormatter,
  youtube: youtubeFormatter,
  tiktok: tiktokFormatter,
  bilibili: bilibiliFormatter,
}

module.exports = FORMATTERS

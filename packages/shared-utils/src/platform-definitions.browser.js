// 渲染端使用的 ESM 平台定义。
// 主进程仍使用 platform-definitions.js（CommonJS），避免改变 Node 端契约。
export const PLATFORM_NAMES = {
  wechat_mp: '微信公众号',
  zhihu: '知乎',
  weibo: '微博',
  douyin: '抖音',
  xiaohongshu: '小红书',
  tencent_video: '视频号',
  kuaishou: '快手',
  toutiao: '今日头条',
  bilibili: 'B站',
  baijiahao: '百家号',
  youtube: 'YouTube',
  tiktok: 'TikTok',
  twitter: 'Twitter/X',
  instagram: 'Instagram',
  facebook: 'Facebook',
}

export const PLATFORM_ICONS = {
  wechat_mp: '💬',
  zhihu: '❓',
  weibo: '✧',
  douyin: '🎵',
  xiaohongshu: '📕',
  tencent_video: '▶',
  kuaishou: '🎬',
  toutiao: '📰',
  bilibili: '📺',
  baijiahao: '📖',
  youtube: '▶',
  tiktok: '♪',
  twitter: '✕',
  instagram: '📷',
  facebook: '👍',
}

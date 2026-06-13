/**
 * 各平台限制常量
 */
const LIMITS = {
  wechat_mp: { maxTitle: 64, maxContent: 20000, coverSize: '900x500' },
  zhihu:     { maxTitle: 120, maxContent: 100000, coverSize: '1280x720' },
  weibo:     { maxTitle: 120, maxContent: 2000, coverSize: '980x550' },
  douyin:    { maxTitle: 30, maxContent: 1000, coverSize: '1080x1440' },
  xiaohongshu: { maxTitle: 20, maxContent: 1000, coverSize: '1080x1080' },
  tencent_video: { maxTitle: 60, maxContent: 1000, coverSize: '1080x1080' },
  kuaishou:  { maxTitle: 40, maxContent: 500, coverSize: '1080x1440' },
  toutiao:   { maxTitle: 64, maxContent: 50000, coverSize: '1200x600' },
  youtube:   { maxTitle: 100, maxContent: 5000, coverSize: '1280x720' },
  tiktok:    { maxTitle: 30, maxContent: 500, coverSize: '1080x1440' },
  bilibili:  { maxTitle: 80, maxContent: 20000, coverSize: '1146x717' },
}

module.exports = { LIMITS }

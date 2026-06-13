/**
 * 各平台封面图预设
 */
const PRESETS = {
  wechat_mp:      { width: 900, height: 500, format: 'jpeg', maxSize: 10 * 1024 * 1024, quality: 85, label: '900×500' },
  zhihu:          { width: 1280, height: 720, format: 'jpeg', maxSize: 5 * 1024 * 1024, quality: 85, label: '1280×720' },
  weibo:          { width: 980, height: 550, format: 'jpeg', maxSize: 20 * 1024 * 1024, quality: 85, label: '980×550' },
  douyin:         { width: 1080, height: 1440, format: 'jpeg', maxSize: 20 * 1024 * 1024, quality: 85, label: '1080×1440' },
  xiaohongshu:    { width: 1080, height: 1080, format: 'jpeg', maxSize: 10 * 1024 * 1024, quality: 85, label: '1080×1080' },
  tencent_video:  { width: 1080, height: 1080, format: 'jpeg', maxSize: 10 * 1024 * 1024, quality: 85, label: '1080×1080' },
  kuaishou:       { width: 1080, height: 1440, format: 'jpeg', maxSize: 10 * 1024 * 1024, quality: 85, label: '1080×1440' },
  toutiao:        { width: 1200, height: 600, format: 'jpeg', maxSize: 5 * 1024 * 1024, quality: 85, label: '1200×600' },
  youtube:        { width: 1280, height: 720, format: 'jpeg', maxSize: 2 * 1024 * 1024, quality: 85, label: '1280×720' },
  tiktok:         { width: 1080, height: 1440, format: 'jpeg', maxSize: 20 * 1024 * 1024, quality: 85, label: '1080×1440' },
  bilibili:       { width: 1146, height: 717, format: 'jpeg', maxSize: 5 * 1024 * 1024, quality: 85, label: '1146×717' },
}

module.exports = { PRESETS }

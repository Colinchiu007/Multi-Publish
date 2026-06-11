/**
 * Platform Selectors - 平台选择器常量
 * 
 * 各平台登录/发布页面的 CSS 选择器
 * 如果某平台前端改版导致选择器失效，修改此文件即可
 */
module.exports = {
  PLATFORM_LOGIN_URLS: {
    wechat_mp: 'https://mp.weixin.qq.com/',
    zhihu: 'https://www.zhihu.com/signin',
    weibo: 'https://weibo.com/login',
    douyin: 'https://www.douyin.com/',
    xiaohongshu: 'https://creator.xiaohongshu.com/',
    tencent_video: 'https://channels.weixin.qq.com/',
    kuaishou: 'https://cp.kuaishou.com/',
    toutiao: 'https://mp.toutiao.com/',
    youtube: 'https://studio.youtube.com/',
    tiktok: 'https://www.tiktok.com/upload/',
  },

  PLATFORM_LOGIN_SUCCESS_SELECTORS: {
    wechat_mp: '.weui-desktop-account__name',
    zhihu: '.AppHeader-profile',
    weibo: '.gn_nickname',
    douyin: '.bd3c35b6',
    xiaohongshu: '.user-info, [class*="avatar"]',
    tencent_video: '.user-info, [class*="account"]',
    kuaishou: '.user-info, [class*="avatar"]',
    toutiao: '.user-avatar, .nickname, [class*="avatar"]',
    youtube: '#avatar-btn, ytcp-avatar',
    tiktok: '[data-testid="user-avatar"], [class*="avatar"]',
  },

  PLATFORM_PUBLISH_SELECTORS: {
    wechat_mp: {
      editor_frame: ['iframe#ueditor_0', 'iframe[src*="ueditor"]', '.rich_media_area_primary_inner'],
      save_btn: ['a[data-action="save"]', 'a#js_sync_save', 'a:has-text("保存")'],
      title_input: ['#title', 'input.weui-desktop-input'],
      mass_btn: ['a.btn_masssend', 'a[data-action="masssend"]', 'a:has-text("群发")'],
      publish_btn: ['a.btn_publish', 'a:has-text("发布")'],
    },
    douyin: {
      title_input: ['input[placeholder*="标题"]', '.input__title'],
      publish_btn: ['button:has-text("发布")'],
    },
    kuaishou: {
      title_input: ['input[placeholder*="标题"]', '.title-input'],
      upload_btn: ['.upload-btn', 'button:has-text("上传")'],
    },
  },

  PLATFORM_NAMES: {
    wechat_mp: '微信公众号',
    zhihu: '知乎',
    weibo: '微博',
    douyin: '抖音',
    xiaohongshu: '小红书',
    tencent_video: '视频号',
    kuaishou: '快手',
    toutiao: '今日头条',
    youtube: 'YouTube',
    tiktok: 'TikTok',
  },
};

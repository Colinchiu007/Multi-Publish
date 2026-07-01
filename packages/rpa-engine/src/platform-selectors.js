/**
 * Platform Selectors — 平台选择器配置
 *
 * 所有 12 个平台的 CSS 选择器集中管理。
 * 平台改版导致选择器失效时，只需修改此文件。
 *
 * 选择器数组按优先级排列，第一个匹配的生效。
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
    bilibili: 'https://passport.bilibili.com/login',
    baijiahao: 'https://baijiahao.baidu.com/',
    twitter: 'https://twitter.com/i/flow/login',
    instagram: 'https://www.instagram.com/accounts/login/',
    facebook: 'https://www.facebook.com/login/',
  },

  PLATFORM_LOGIN_SUCCESS_SELECTORS: {
    wechat_mp: ['.index_main', '.menu_box', 'a[href*="cgi-bin/home"]'],
    zhihu: ['.AppHeader-profileAvatar', '.ProfileHeader-avatar', 'img[alt="avatar"]'],
    weibo: ['.gn_name', '.Avatar', '[node-type="userInfo"]'],
    douyin: ['.user-info', '.account-info', '.creator-header'],
    xiaohongshu: ['[class*="avatar"]', '[class*="userInfo"]', '.user-avatar'],
    tencent_video: ['.channel-header', '.creator-header', '[class*="weixinChannel"]'],
    kuaishou: ['.user-info', '.profile-avatar', '[class*="creator-header"]'],
    toutiao: ['.user-avatar', '.header-avatar', '[class*="avatar"]', '.nickname'],
    youtube: ['#avatar-btn', 'ytcp-avatar', '[class*="avatar"]'],
    tiktok: ['[data-testid="user-avatar"]', '[class*="avatar"]', '.user-avatar'],
    bilibili: [], // API 模式检查
    baijiahao: ['.user-info', '.user-avatar', '.nickname', '[class*="user"]'],
    twitter: ['div[data-testid="primaryColumn"]', 'div[data-testid="SideNav_AccountSwitcher_Button"]', 'header[role="banner"]'],
    instagram: ['svg[aria-label="Home"]', 'nav[role="navigation"]', 'section main article', 'a[href="/direct/inbox/"]'],
    facebook: ['a[aria-label*="profile"]', 'a[aria-label*="Profile"]', 'div[aria-label*="Account"]', 'div[data-pagelet*="root"]'],
  },

  PLATFORM_PUBLISH_SELECTORS: {
    wechat_mp: {
      title_input: ['#title', 'input.weui-desktop-input'],
      editor_frame: ['iframe#ueditor_0', 'iframe[src*="ueditor"]', '.rich_media_area_primary_inner'],
      editor: ['#js_editor_content', '.rich_media_area_primary_inner', '[contenteditable="true"]'],
      author_input: ['#author', 'input[name="author"]'],
      agree_checkbox: ['.weui-desktop-btn_wrp .weui-desktop-checkbox', 'input#js_agree'],
      save_btn: ['a[data-action="save"]', 'a#js_sync_save', 'a:has-text("保存")'],
      mass_btn: ['a.btn_masssend', 'a[data-action="masssend"]', 'a:has-text("群发")'],
      publish_btn: ['a.btn_publish', 'a:has-text("发布")'],
    },
    zhihu: {
      title_input: ['.WriteIndex-titleInput', '.DraftEditor-title', '.title-input', '.Editable-title'],
      editor: ['.DraftEditor-root', '.Editable-editor', '.ql-editor', '[contenteditable="true"]'],
      save_btn: ['button:has-text("保存草稿")', '.WriteIndex-saveDraft', '.PublishPanel-saveDraft'],
      publish_btn: ['button:has-text("发布")', '.PublishPanel-publish'],
    },
    weibo: {
      content_textarea: ['.publisher_text textarea', '.W_input', 'textarea[node-type="textEl"]'],
      publish_btn: ['a[node-type="submit"]', '.W_btn_b', 'button:has-text("发布")'],
    },
    douyin: {
      upload_btn: ['button:has-text("上传视频")', '.upload-btn', '[class*="upload"]'],
      file_input: ['input[type="file"]'],
      title_input: ['.publish-title-input', '.title-input', 'input[placeholder*="标题"]'],
      desc_textarea: ['textarea[placeholder*="描述"]', 'textarea[placeholder*="简介"]', '[class*="desc"] textarea', '[class*="description"] textarea'],
      editor: ['.ql-editor', '.notranslate', '[contenteditable="true"]', '.DraftEditor-root'],
      tag_input: ['input[placeholder*="话题"]', 'input[placeholder*="标签"]', '[class*="tag"] input'],
      cover_selector: ['[class*="cover"]', '.cover-upload', '[class*="poster"]'],
      publish_btn: ['button:has-text("发布")', '.publish-btn', '.confirm-btn'],
    },
    xiaohongshu: {
      title_input: ['input[placeholder*="标题"]', 'input[class*="title"]', '[class*="title"] input'],
      editor: ['[contenteditable="true"]', '[class*="ql-editor"]', '[class*="editor"]'],
      textarea: ['textarea[placeholder*="正文"]', 'textarea[class*="content"]'],
      tag_input: ['[class*="tag"] input', 'input[placeholder*="标签"]'],
      publish_btn: ['button:has-text("发布")', '[class*="publish"] button', '[class*="submit"]'],
    },
    tencent_video: {
      upload_btn: ['button:has-text("发表视频")', '[class*="upload"]', 'a:has-text("发表视频")'],
      file_input: ['input[type="file"]'],
      title_input: ['input[placeholder*="标题"]', '[class*="title"] input', '.title-input'],
      desc_textarea: ['textarea', '[class*="desc"] input', '[class*="desc"] textarea'],
      publish_btn: ['button:has-text("发布")', '[class*="publish"] button', '.submit-btn'],
    },
    kuaishou: {
      upload_btn: ['button:has-text("上传视频")', '[class*="upload"]', 'a:has-text("上传视频")'],
      file_input: ['input[type="file"]'],
      title_input: ['input[placeholder*="标题"]', '[class*="title"] input'],
      desc_textarea: ['textarea', '[class*="desc"] textarea', '[class*="description"] input'],
      publish_btn: ['button:has-text("发布")', '[class*="submit"]', '[class*="publish"] button'],
    },
    toutiao: {
      write_btn: ['a:has-text("发表文章")', 'button:has-text("写文章")', '[class*="write"]'],
      title_input: ['input[placeholder*="标题"]', '.title-input input', '[class*="title"] input'],
      editor: ['[contenteditable="true"]', '.ql-editor', '.editor-content', '.notranslate'],
      publish_btn: ['button:has-text("发布")', 'button:has-text("发表")', '.publish-btn', '[class*="submit"]'],
    },
    youtube: {
      create_btn: ['#create-icon', 'ytcp-button#create-icon', 'button[aria-label="创建视频"]'],
      upload_option: ['tp-yt-paper-item:has-text("上传视频")', '.ytcp-menu-item:has-text("上传视频")'],
      file_input: ['input[type="file"]'],
      title_input: ['#title-textarea', '[class*="title"] input', '#title-text'],
      desc_textarea: ['#description-textarea', '[class*="description"] textarea'],
      next_btn: ['ytcp-button:has-text("下一步")', 'button:has-text("下一步")', '#next-button'],
      visibility_btn: ['tp-yt-paper-radio-button[name="PUBLIC"]', '#public-radio-button', '[class*="public"]'],
      publish_btn: ['ytcp-button:has-text("发布")', 'button:has-text("发布")', '#done-button'],
    },
    tiktok: {
      file_input: ['input[type="file"]'],
      caption_textarea: ['[class*="caption"] textarea', '[class*="description"] textarea', '#caption-input'],
      publish_btn: ['button:has-text("Post")', 'button:has-text("发布")', '[class*="post"]'],
    },
    bilibili: {
      // API 模式，不需要页面选择器
      // RPA 视频模式:
      upload_btn: ['.upload-btn', '.upload-file', '[class*="upload"]'],
      title_input: ['input[placeholder*="标题"]', '.video-title input'],
      desc_textarea: ['textarea[placeholder*="简介"]', '.video-desc textarea'],
      publish_btn: ['button:has-text("发布")', '.submit-btn', '[class*="submit"]'],
    },
    twitter: {
      textarea: ['div[data-testid="tweetTextarea_0"][role="textbox"]', 'div[aria-label*="Post"][role="textbox"]', 'div[aria-label*="Tweet"][role="textbox"]'],
      publish_btn: ['div[data-testid="tweetButton"][role="button"]', 'button:has-text("Post")', 'div[role="button"]:has-text("Post")'],
      media_btn: ['div[data-testid="mediaButton"]', 'div[aria-label="Media"][role="button"]'],
      file_input: ['input[data-testid="fileInput"]', 'input[type="file"]'],
    },
    instagram: {
      file_input: ['input[type="file"]', 'input[accept*="image"]', 'input[accept*="video"]'],
      caption_textarea: ['div[aria-label*="caption"][role="textbox"]', 'textarea[aria-label*="caption"]', 'textarea[aria-label*="Caption"]', 'div[aria-label*="Write"][role="textbox"]'],
      publish_btn: ['div[role="button"]:has-text("Share")', 'button:has-text("Share")', 'div[role="button"]:has-text("Post")', 'button:has-text("Post")', 'div[aria-label*="Share"][role="button"]'],
      next_btn: ['div[role="button"]:has-text("Next")', 'button:has-text("Next")', 'div[aria-label*="Next"][role="button"]'],
      create_btn: ['svg[aria-label="New post"]', 'svg[aria-label="Create"]', 'a[href*="create"]'],
    },
        baijiahao: {
      write_btn: ['a[href*="write"]', '[class*="write"]', '.publish-btn', 'button:has-text("写文章")'],
      title_input: ['input[placeholder*="标题"]', '.title-input input', '[class*="title"] input', '#title'],
      editor_frame: ['iframe[class*="editor"]', 'iframe[src*="editor"]'],
      editor: ['[contenteditable]', '.editor-content', '.article-content', '[class*="editor"]'],
      tag_input: ['input[placeholder*="标签"]', '.tag-input input', '[class*="tag"] input'],
      publish_btn: ['button:has-text("发布")', 'button:has-text("提交")', '.submit-btn', '[class*="submit"]'],
    },
    facebook: {
      upload_btn: ['button:has-text("上传视频")', 'a[aria-label*="Create"][role="button"]', '[data-pagelet*="composer"] button', 'div[role="button"]:has-text("视频")'],
      file_input: ['input[type="file"]'],
      title_input: ['input[placeholder*="title"]', 'input[aria-label*="title"]', '[class*="title"] input', 'input[placeholder*="标题"]'],
      desc_textarea: ['[aria-label*="description"] textarea', '[class*="description"] textarea', 'textarea[placeholder*="说明"]', '[data-pagelet*="composer"] textarea'],
      tag_input: ['input[placeholder*="标签"]', '[aria-label*="tag"] input', '[class*="tag"] input'],
      publish_btn: ['button:has-text("发布")', 'button:has-text("Publish")', 'div[aria-label="Publish"][role="button"]', 'div[aria-label="发布"][role="button"]', '[data-testid*="publish"]'],
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
    bilibili: 'B站',
    baijiahao: '百家号',
    twitter: 'Twitter/X',
    instagram: 'Instagram',
    facebook: 'Facebook',
  },
}

# 平台 RPA 选择器验证清单 (V1.1)

> 最后更新: 2026-07-02
> 覆盖范围: 15 个平台的登录选择器 + 发布选择器

## 验证方法

### 自动化验证 (CI)
- `npm run test:platform-verify` — 使用 Playwright 访问各平台页面，检查选择器是否能匹配到元素
- 注意：自动化只能验证**登录页面**（无需认证），发布页面需手动验证

### 手动验证
1. 在 Multi-Publish App 中添加对应平台账号
2. 使用该账号登录平台后台
3. 在发布页面检查各选择器是否能正确定位到目标元素
4. 在下方表格中记录结果

## 选择器总览

| # | 平台 | 标识 | 登录 URL | 登录选择器数 | 发布选择器字段数 |
|---|------|------|---------|------------|---------------|
| 1 | 微信公众号 | `wechat_mp` | https://mp.weixin.qq.com/ | 3 | 7 |
| 2 | 知乎 | `zhihu` | https://www.zhihu.com/signin | 3 | 4 |
| 3 | 微博 | `weibo` | https://weibo.com/login | 3 | 2 |
| 4 | 抖音 | `douyin` | https://www.douyin.com/ | 3 | 7 |
| 5 | 小红书 | `xiaohongshu` | https://creator.xiaohongshu.com/ | 3 | 5 |
| 6 | 视频号 | `tencent_video` | https://channels.weixin.qq.com/ | 3 | 5 |
| 7 | 快手 | `kuaishou` | https://cp.kuaishou.com/ | 3 | 5 |
| 8 | 今日头条 | `toutiao` | https://mp.toutiao.com/ | 4 | 4 |
| 9 | YouTube | `youtube` | https://studio.youtube.com/ | 3 | 7 |
| 10 | TikTok | `tiktok` | https://www.tiktok.com/upload/ | 3 | 3 |
| 11 | B站 | `bilibili` | https://passport.bilibili.com/login | 0 (API模式) | 4 |
| 12 | 百家号 | `baijiahao` | https://baijiahao.baidu.com/ | 4 | 6 |
| 13 | Twitter/X | `twitter` | https://twitter.com/i/flow/login | 3 | 4 |
| 14 | Instagram | `instagram` | https://www.instagram.com/accounts/login/ | 4 | 5 |
| 15 | Facebook | `facebook` | https://www.facebook.com/login/ | 4 | 7 |

## 自动化验证结果

> 运行 `node scripts/verify-platform-selectors.js` 获取最新结果

| 平台 | 页面可达 | 登录页加载 | 选择器匹配 | 备注 |
|------|---------|----------|----------|------|
| wechat_mp | ✅ | mp.weixin.qq.com | 仅登录页 | 登录成功选择器需登录后验证 |
| zhihu | 2026-07-02 | Colin | ? textarea[ph:?????] | ? DraftEditor-root | ? button:has-text('??') | N/A | save_btn N/A(????) | ? ??? |
| weibo | ✅ | weibo.com/login | 仅登录页 | 同上 |
| douyin | 2026-07-02 | Colin | ? SPA?? | ? SPA?? | ? button:has-text('??') | ? SPA?? | cover_selector ?? ?? | ?? ????? |
| xiaohongshu | 2026-07-02 | Colin | ? | ? | ? [class*='publish'] button | N/A | ? | ?? ????? |
| tencent_video | 2026-07-02 | Colin | ? | ? | ? | ? | ? | ? ????? |
| kuaishou | 2026-07-02 | Colin | ? | ? | ? [class*='publish'] button | ? input[type='file'] | upload_btn ?button:has-text | ?? ???? |
| toutiao | 2026-07-02 | Colin | ? | ? | ? | N/A | ? | ? ????? |
| youtube | ✅ | accounts.google.com | 仅登录页 | 重定向到 Google 登录 |
| tiktok | ✅ | tiktok.com/login | 仅登录页 | 同上 |
| bilibili | ✅ | passport.bilibili.com/login | API模式 | 无需登录选择器 |
| baijiahao | 2026-07-02 | Colin | ? | ? | ? | N/A | ? | ? ????? |
| twitter | ✅ | x.com/i/flow/login | 仅登录页 | 同上 |
| instagram | ✅ | instagram.com/accounts/login/ | 仅登录页 | 同上 |
| facebook | ✅ | facebook.com/login/ | 仅登录页 | 同上 |

## 手动验证步骤 (需要已登录状态)

### 前置条件
1. 确保平台账号已绑定到 Multi-Publish
2. 使用 RpaViewManager 打开发布页面
3. 在 Electron DevTools 中执行选择器测试

### 验证方法 (在 Electron 中)

在 RPA 发布窗口打开后，通过 `win.webContents.executeJavaScript()` 执行:

```javascript
// 测试选择器
var selector = "button:has-text('发布')";
var el = document.querySelector(selector);
console.log(selector, el ? '✅ FOUND' : '❌ NOT FOUND', el?.tagName);
```

### 各平台发布选择器明细

#### wechat_mp (微信公众号)
| 字段 | 优先选择器 | 备选 | 状态 |
|------|-----------|------|------|
| title_input | `#title` | `input.weui-desktop-input` | ⏳ |
| editor_frame | `iframe#ueditor_0` | `iframe[src*='ueditor']` | ⏳ |
| editor | `#js_editor_content` | `.rich_media_area_primary_inner` | ⏳ |
| author_input | `#author` | `input[name='author']` | ⏳ |
| agree_checkbox | `.weui-desktop-btn_wrp .weui-desktop-checkbox` | `input#js_agree` | ⏳ |
| save_btn | `a[data-action='save']` | `a#js_sync_save` | ⏳ |
| mass_btn | `a.btn_masssend` | `a[data-action='masssend']` | ⏳ |
| publish_btn | `a.btn_publish` | — | ⏳ |

#### zhihu (知乎)
| 字段 | 优先选择器 | 备选 | 状态 |
|------|-----------|------|------|
| title_input | `.WriteIndex-titleInput` | `.DraftEditor-title` | ⏳ |
| editor | `.DraftEditor-root` | `.ql-editor` | ⏳ |
| save_btn | `button:has-text('保存草稿')` | `.WriteIndex-saveDraft` | ⏳ |
| publish_btn | `button:has-text('发布')` | `.PublishPanel-publish` | ⏳ |

#### weibo (微博)
| 字段 | 优先选择器 | 备选 | 状态 |
|------|-----------|------|------|
| content_textarea | `.publisher_text textarea` | `.W_input` | ⏳ |
| publish_btn | `a[node-type='submit']` | `.W_btn_b` | ⏳ |

#### douyin (抖音)
| 字段 | 优先选择器 | 备选 | 状态 |
|------|-----------|------|------|
| upload_btn | `button:has-text('上传视频')` | — | ⏳ |
| file_input | `input[type='file']` | — | ⏳ |
| title_input | `.publish-title-input` | — | ⏳ |
| desc_textarea | `textarea[placeholder*='描述']` | — | ⏳ |
| publish_btn | `button:has-text('发布')` | `.publish-btn` | ⏳ |

... (继续其他平台)

## 发布页面选择器验证记录

| 平台 | 验证日期 | 验证人 | title_input | editor/desc | publish_btn | file_input | 其他 | 状态 |
|------|---------|-------|------------|------------|------------|------------|------|------|
| wechat_mp | — | — | ⏳ | ⏳ | ⏳ | N/A | ⏳ | ⏳ |
| zhihu | 2026-07-02 | Colin | ? textarea[ph:?????] | ? DraftEditor-root | ? button:has-text('??') | N/A | save_btn N/A(????) | ? ??? |
| weibo | — | — | N/A | ⏳ | ⏳ | N/A | ⏳ | ⏳ |
| douyin | 2026-07-02 | Colin | ? SPA?? | ? SPA?? | ? button:has-text('??') | ? SPA?? | cover_selector ?? ?? | ?? ????? |
| xiaohongshu | 2026-07-02 | Colin | ? | ? | ? [class*='publish'] button | N/A | ? | ?? ????? |
| tencent_video | 2026-07-02 | Colin | ? | ? | ? | ? | ? | ? ????? |
| kuaishou | 2026-07-02 | Colin | ? | ? | ? [class*='publish'] button | ? input[type='file'] | upload_btn ?button:has-text | ?? ???? |
| toutiao | 2026-07-02 | Colin | ? | ? | ? | N/A | ? | ? ????? |
| youtube | — | — | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ |
| tiktok | — | — | N/A | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ |
| bilibili | — | — | ⏳ | ⏳ | ⏳ | N/A | ⏳ | ⏳ |
| baijiahao | 2026-07-02 | Colin | ? | ? | ? | N/A | ? | ? ????? |
| twitter | — | — | N/A | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ |
| instagram | — | — | N/A | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ |
| facebook | — | — | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ |

## 风险与注意事项

1. **`:has-text()` 伪类**: 43 个选择器使用 `:has-text()` — 这是 Playwright/Electron 扩展语法，不兼容标准 CSS
2. **平台改版**: 各平台页面经常更新 DOM 结构，可能导致选择器失效
3. **国际化**: `:has-text('发布')` 在非中文环境下可能不匹配
4. **反爬措施**: Cloudflare Turnstile、reCAPTCHA 等可能阻止自动化访问
5. **Google OAuth**: YouTube 使用 Google 账号登录，无法直接测试

## 自动验证脚本

参见 `scripts/verify-platform-selectors.js`，使用方法:

```bash
node scripts/verify-platform-selectors.js
```

要求: Playwright (已安装在 devDependencies 或全局)

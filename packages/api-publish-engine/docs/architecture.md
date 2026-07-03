# API Publish Engine — 架构文档

> 2026-07-03 · 更新于质量节拍阶段检查

## 整体架构

```
┌─────────────────────────────────────────────────────────┐
│                      Adapter Layer                       │
│  29 platform adapters (src/adapters/*.js)                │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌───────────┐ │
│  │ 抖音    │ │ 小红书   │ │ 快手    │ │ ... 26个  │ │
│  └────┬─────┘ └────┬─────┘ └────┬─────┘ └─────┬─────┘ │
│       │            │            │              │        │
└───────┼────────────┼────────────┼──────────────┼────────┘
        │            │            │              │
┌───────┴────────────┴────────────┴──────────────┴────────┐
│                   Upload Orchestrator                    │
│                (upload/orchestrator.js)                   │
│                                                          │
│   getUploadProvider(platform) → COS | OSS | HTTP         │
│   upload(taskData, cookie) → { video, cover }            │
└───────┬────────────┬──────────────────┬──────────────────┘
        │            │                  │
┌───────▼────┐ ┌────▼─────┐ ┌─────────▼──────────────┐
│ COS       │ │ OSS      │ │ HTTP                    │
│ 小红书    │ │ 知乎     │ │ 24 platforms            │
│ 视频号    │ │ 得物     │ │ + http-config.js         │
│           │ │ 一点号   │ │ + 签名(抖音/快手)        │
└───────────┘ └──────────┘ └─────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│                 Common Infrastructure                    │
│  signer.js │ signer-local.js │ base-adapter.js          │
│  cos-uploader.js │ oss-uploader.js │ xml-builder.js     │
│  error-codes.js │ cancel-token.js │ progress-emitter.js │
│  anti-detect.js │ cover-cropper.js │ rich-text-processor│
│  proxy-manager.js │ task-pool.js │ platform-entries.js  │
└─────────────────────────────────────────────────────────┘
```

## 决策记录

| ADR | 标题 | 状态 |
|-----|------|------|
| ADR-001 | API 签名策略（本地+远程签名服务） | 已批准 |
| ADR-002 | 平台上传实现策略（COS/OSS/HTTP三层） | 已批准 |

## 平台覆盖

### COS 上传（腾讯云）

| 平台 | 适配器 | 状态 |
|------|--------|------|
| 小红书 | xiaohongshu.js | ✅ 已集成 |
| 视频号 | shipinhao.js | ✅ 已集成 |

### OSS 上传（阿里云）

| 平台 | 适配器 | 状态 |
|------|--------|------|
| 知乎 | zhihu.js | ✅ 已集成 |
| 得物 | dewu.js | ✅ 已集成 |
| 一点号 | yidianhao.js | ✅ 已集成 |

### HTTP 直接上传

| 平台 | 适配器 | 上传端点配置 | 签名 |
|------|--------|-------------|------|
| 抖音 | douyin.js | ✅ | _signature |
| 快手 | kuaishou.js | ✅ | __NS_sig3 |
| 百家号 | baijiahao.js | ✅ | Cookie |
| B站 | bilibili.js | ✅ | Cookie |
| 微博 | weibo.js | ✅ | Cookie |
| 头条号 | toutiao.js | ✅ | Cookie |
| 公众号 | wechat_mp.js | ✅ | Cookie |
| 爱奇艺号 | aiqiyi.js | ✅ | Cookie |
| 大鱼号 | dayu.js | ✅ | Cookie |
| 企鹅号 | qiehao.js | ✅ | Cookie |
| 搜狐号 | souhu.js | ✅ | Cookie |
| 网易号 | wangyi.js | ✅ | Cookie |
| 腾讯视频 | tengxun_shipin.js | ✅ | Cookie |
| 微视 | weishi.js | ✅ | Cookie |
| 搜狐视频 | souhu_shipin.js | ✅ | Cookie |
| 皮皮虾 | pipixia.js | ✅ | Cookie |
| 美拍 | meipai.js | ✅ | Cookie |
| AcFun | acfun.js | ✅ | Cookie |
| 车家号 | chejiahao.js | ✅ | Cookie |
| 易车号 | yichehao.js | ✅ | Cookie |
| 美柚 | meiyou.js | ✅ | Cookie |
| 小红书商家号 | xhs_shangjia.js | ✅ | Cookie |
| 西瓜视频 | xigua.js | ✅ | Cookie |
| 多多视频 | duoduo.js | ✅ | Cookie |

## 测试覆盖

| 测试文件 | 覆盖范围 | 测试数 |
|----------|---------|--------|
| test-signer.js | 签名算法 | 4 |
| test-xml.js | XML 构建 | 3 |
| test-cos.js | COS 上传引擎 | 2 |
| test-anti-detect.js | 反检测 | 2 |
| test-cover.js | 封面裁剪 | 1 |
| test-core-modules.js | 核心模块 | 4 |
| test-p2-modules.js | P2 模块 | 3 |
| test-batch-c.js | Batch C 平台 | 13 |
| test-http-adapters.js | HTTP 平台 | 24 |
| test-http-config.js | HTTP 配置 | 30+ |
| test-upload.js | 上传编排 | 25+ |
| **合计** | | **100+** |

## 待办事项

### P3 待实现

- [ ] HTTP 平台 token 获取（各平台调用 API 获取上传凭证）
- [ ] Playwright 降级引擎（API 失败时回退到浏览器自动化）
- [ ] CommentMessageService（评论自动回复）

# AI 生成内容声明 — 产品需求规格

> **版本**: v1.0.0 | **日期**: 2026-09-02 | **状态**: ✅ 已实现

---

## 一、需求背景

根据《互联网信息服务深度合成管理规定》等法规要求，各内容平台要求发布者**如实声明内容创作方式**：

- 使用 AI 生成/辅助生成的内容，必须勾选「AI 生成内容」声明
- 人工创作内容，选择「无需声明」或「人工创作」
- **未如实声明会导致内容违规下架，甚至账号封禁**

本项目（Multi-Publish）的所有内容均通过 AI 流水线生成（Story2Video 等），因此**默认声明为 AI 生成内容**。

---

## 二、功能逻辑

### 2.1 默认行为

| 场景 | 默认值 | 说明 |
|------|--------|------|
| 一键发布 | `aiGenerated = true` | AI 生成内容，勾选声明 |
| Pipeline 发布 | `aiGenerated = true` | 流水线自动设置 |
| API 发布 | `aiGenerated = true` | publisher-router 默认设置 |
| RPA 发布 | `aiGenerated = true` | RPA 脚本自动勾选 |
| 手动发布 | `aiGenerated = true` | 用户可手动改为 false |

### 2.2 数据流

```
用户/流水线设置 aiGenerated
    │
    ▼
publisher-router.js (ApiPublisher/RpaVmPublisher)
    │  article.aiGenerated !== false → true（默认 AI 生成）
    │
    ├── API 模式 → taskData.aiGenerated → adapter.execute()
    │   ├── 百家号: aigc_bjh_status=1 (activity_list 参数)
    │   └── 快手:   ai_generated=1 (buildPostData 字段)
    │
    └── RPA 模式 → article.aiGenerated → _prepBaijiahao() / _prepKuaishou() / 通用 AI 声明
        ├── 百家号: 弹窗选择「AI生成内容」
        ├── 快手:   checkbox 勾选「AI 生成」
        └── B站等:  通用 ai_declaration_label 选择器自动勾选
```

### 2.3 各平台实现

#### 百家号（Baijiahao）

**API 模式**（`packages/api-publish-engine/src/adapters/baijiahao.js`）：
- 参数：`activity_list[0][id]=aigc_bjh_status&activity_list[0][is_checked]=1`
- 规则：`taskData.aiGenerated !== false` → 勾选（1）；严格 `=== false` → 取消（0）

**RPA 模式**（`apps/desktop/electron/services/rpa-view-platforms.js`）：
- `_prepBaijiahao(win, article)` 方法
- 点击「创作声明」输入框 → 弹窗选择「AI生成内容」→ 确定
- 人工创作时选择「无需声明」

#### 快手（Kuaishou）

**API 模式**（`packages/api-publish-engine/src/adapters/kuaishou.js`）：
- 参数：`ai_generated: 1`（AI 生成）或 `0`（人工创作）
- `buildPostData()` 自动设置

**RPA 模式**（`apps/desktop/electron/services/rpa-view-platforms.js`）：
- `_prepKuaishou(win, article)` 方法
- 多策略查找 AI 声明控件（checkbox/switch/标签）
- 找不到时不阻塞发布（warn 日志）

#### B站（Bilibili）

**RPA 模式**（`apps/desktop/electron/services/rpa-view-platforms.js`）：
- 通用 AI 声明自动勾选逻辑（`ai_declaration_label` / `ai_declaration_checkbox` 选择器）
- 选择器定义在 `packages/rpa-engine/src/platform-selectors.js` 的 `bilibili` 下
- 默认 `aiGenerated !== false` 时自动点击声明控件
- 找不到控件时记录 warn 日志，不阻塞发布

**注意**：B站平台配置 `config/platforms.yaml` 中 `has_api: false`，使用 RPA 模式（`publish_url: https://member.bilibili.com/platform/upload/video/frame`）。

---

## 三、数据校验

### 3.1 字段定义

| 字段 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `aiGenerated` | `boolean` | `true` | `true`=AI 生成，`false`=人工创作 |
| `article.aiGenerated` | `boolean` | `true` | 发布任务中的声明标记 |

### 3.2 校验规则

- `aiGenerated` 为 `undefined` / `null` → 按 `true`（AI 生成）处理
- `aiGenerated` 为 `false` → 按人工创作处理
- `aiGenerated` 为其他真值 → 按 `true`（AI 生成）处理
- RPA 模式找不到声明控件 → 不阻塞发布，记录 warn 日志

### 3.3 测试覆盖

| 测试文件 | 覆盖场景 |
|---------|---------|
| `kuaishou-ai-declaration.test.js` | 默认 AI 生成 / 显式 false / 显式 true / 非布尔真值 / 保留原字段 / 空数据 |
| `baijiahao-api-chain.test.js` | AI 声明参数纳入 postData 构建测试 |
| `publisher-router.test.js` | aiGenerated 透传测试 |

---

## 四、交互逻辑

### 4.1 发布页 UI

- 发布页默认显示「AI 生成内容」声明提示（data-testid `ai-declaration-hint`）
- 用户可切换为「人工创作」（设置 `aiGenerated = false`）
- 切换后发布参数自动更新

### 4.2 历史记录

- 发布历史中记录每次发布的 `aiGenerated` 值
- 便于审计和合规追溯

---

## 五、错误处理

| 场景 | 处理方式 |
|------|---------|
| 平台 API 拒绝 AI 声明参数 | 记录错误日志，返回友好提示 |
| RPA 找不到声明控件 | warn 日志，不阻塞发布 |
| 声明控件交互失败 | 重试 1 次，失败后 warn 日志继续 |
| 百家号弹窗确认失败 | 记录 `confirm-missing` 状态，继续发布 |

---

## 六、合规说明

> **重要**：所有通过本工具发布的内容，默认均声明为 AI 生成内容。
> 用户如需发布人工创作内容，必须手动将 `aiGenerated` 设置为 `false`。
> 违反平台内容声明规定可能导致内容下架、账号降权或封禁，本工具不承担相关责任。

---

## 七、一键发布流程（百家号 + 快手）

### 7.1 流程概述

```
用户点击「一键发布」
    │
    ├── 1. 内容准备
    │   ├── 从历史记录/流水线结果加载视频文件
    │   ├── 自动提取标题、正文、话题标签
    │   └── 从视频首帧提取封面图（或调用 AI 生图模型生成）
    │
    ├── 2. 平台选择
    │   ├── 默认勾选百家号 + 快手
    │   └── 发布前校验账号登录态（Cookie 有效性）
    │
    ├── 3. 发布执行（并行）
    │   ├── 百家号 API 模式：7 步发布链（token → appId → preupload → 分片上传 → complete → process 轮询 → publish）
    │   │   └── 发布参数自动注入 AI 声明（aigc_bjh_status=1）
    │   └── 快手 RPA 模式：浏览器自动化填表
    │       └── 发布前自动勾选 AI 生成声明（_prepKuaishou）
    │
    └── 4. 结果汇总
        ├── 成功 → 展示发布链接 + 作品 ID
        └── 失败 → 展示错误原因 + 重试入口
```

### 7.2 数据校验

| 校验项 | 规则 | 百家号 | 快手 |
|--------|------|--------|------|
| 标题长度 | 百家号 UTF-8 ≤149 字节；快手 ≤40 字符 | 超长自动截断 | 超长自动截断 |
| 视频格式 | MP4/H.264 | 横版（width≥height） | 无限制 |
| 视频大小 | ≤4GB | 分片上传（2MB/片） | 统一上传 |
| 封面图 | JPEG/PNG，≤5MB | 首帧自动提取 | 可选上传 |
| AI 声明 | 默认 AI 生成 | `aigc_bjh_status=1` | `ai_generated=1` |
| 话题标签 | ≤5 个 | 逗号分隔 | 数组传递 |
| 账号状态 | Cookie 有效性 | getBaseToken + getAppId | 浏览器登录态 |

### 7.3 功能逻辑

#### 7.3.1 百家号 API 发布链（7 步）

| 步骤 | 接口 | 输入 | 输出 | 超时 |
|------|------|------|------|------|
| 1. getBaseToken | GET `/?source=inner` | Cookie | `BJH__INIT__AUTH__` token | 10s |
| 2. getAppId | GET `/builder/app/appinfo` | Cookie | `app_id` | 10s |
| 3. preuploadVideo | POST `/builder/author/video/preuploadVideo` | app_id, md5, video_type | `upload_key` | 30s |
| 4. uploadVideoPart | POST `rsbjh.baidu.com/.../uploadVideo` | 分片 buffer | `uploadId` | 120s/片 |
| 5. completeUpload | POST `/builder/author/video/compuploadVideo` | upload_key, chunks | `mediaId`, `bos_url` | 30s |
| 6. waitVideoProcess | POST `/pcui/video/process` 轮询 | mediaId | `coverImage` URL | 270s (180次×1.5s) |
| 7. publishVideo | POST `/pcui/article/publish` | postData（含 AI 声明） | `article_id` | 30s |

#### 7.3.2 快手 RPA 发布流程

| 步骤 | 操作 | 选择器 | 超时 |
|------|------|--------|------|
| 1. 导航 | 打开 `https://cp.kuaishou.com/article/publish/video?tabType=1` | — | 30s |
| 2. 上传视频 | CDP `DOM.setFileInputFiles` | `#joyride-wrapper input[type="file"]` | 120s |
| 3. 填写标题 | executeJavaScript 填值 | `input[placeholder*="标题"]` | 10s |
| 4. 填写描述 | executeJavaScript 填值 | `#work-description-edit` | 10s |
| 5. AI 声明 | 多策略查找 checkbox 勾选 | `ai_declaration_checkbox` 选择器 | 10s |
| 6. 上传封面 | CDP 文件上传 | `input[type="file"][accept*="image"]` | 30s |
| 7. 点击发布 | executeJavaScript click | `button:has-text("发布")` | 10s |
| 8. 获取作品 ID | 导航管理页 `article/manage/video` | 网络响应解析 | 30s |

### 7.4 交互逻辑

#### 7.4.1 发布页 UI 元素

| 元素 | data-testid | 说明 |
|------|-------------|------|
| 平台选择区 | `publish-platform-selector` | 多选平台（百家号/快手/抖音等） |
| 标题输入框 | `publish-title-input` | 预填视频标题，可编辑 |
| 正文输入框 | `publish-content-textarea` | 预填视频描述，可编辑 |
| 话题标签输入 | `publish-tags-input` | 自动生成，可增删 |
| 封面预览区 | `publish-cover-preview` | 显示视频首帧或自定义封面 |
| AI 声明提示 | `ai-declaration-hint` | 只读提示：「本内容由 AI 生成，已自动勾选平台 AI 创作声明」 |
| AI 声明开关 | `ai-declaration-toggle` | 切换 AI 生成/人工创作 |
| 发布按钮 | `publish-submit-btn` | 点击后执行发布 |
| 进度条 | `publish-progress-bar` | 显示当前发布进度 |
| 结果展示 | `publish-result-card` | 成功/失败状态 + 作品链接 |

#### 7.4.2 提示文字

| 场景 | 提示文字（中文） | 提示文字（English） |
|------|-----------------|---------------------|
| AI 声明默认提示 | 「本内容由 AI 生成，已自动勾选平台 AI 创作声明」 | "This content is AI-generated. Platform AI declaration is automatically checked." |
| AI 声明切换人工 | 「已切换为人工创作，请确保内容未使用 AI 生成」 | "Switched to human-created. Ensure no AI was used in content creation." |
| 百家号发布中 | 「正在发布到百家号：上传视频 → 等待处理 → 提交发布」 | "Publishing to Baijiahao: uploading → processing → submitting" |
| 快手发布中 | 「正在发布到快手：上传视频 → 填写信息 → 提交发布」 | "Publishing to Kuaishou: uploading → filling → submitting" |
| 发布成功 | 「发布成功！{platform} 作品 ID: {id}」 | "Published! {platform} post ID: {id}" |
| 发布失败-风控 | 「百家号发布被风控拦截，请在浏览器中完成验证后重试」 | "Baijiahao blocked by risk control. Complete verification in browser and retry." |
| 发布失败-Cookie | 「平台 Cookie 已过期，请重新登录 {platform}」 | "Cookie expired. Please re-login to {platform}." |
| 封面提取失败 | 「视频首帧提取失败，将使用默认封面」 | "Cover extraction failed. Using default cover." |
| 标题超长截断 | 「标题超过平台限制，已自动截断」 | "Title exceeds platform limit, truncated automatically." |

### 7.5 显示项

| 位置 | 显示项 | 动态更新 |
|------|--------|---------|
| 发布进度条 | 百分比 + 当前步骤名称 | 实时 IPC 推送 |
| 平台状态卡片 | 平台图标 + 状态（等待中/上传中/发布中/已完成/失败） | 每步更新 |
| 作品链接 | 发布成功后显示可点击链接 | 结果返回后展示 |
| 错误详情 | 失败原因 + 操作建议（重新登录/重试/联系支持） | 失败时展示 |
| 历史记录 | 发布历史列表，含平台/时间/状态/AI 声明标记 | 列表刷新 |

### 7.6 E2E 测试覆盖

| 测试文件 | 用例数 | 覆盖范围 |
|---------|--------|---------|
| `e2e-publish-full-chain.test.js` | 8 | 百家号全链路 + 快手全链路 + AI 声明 + 风控 + 跨平台一致性 |
| `kuaishou-ai-declaration.test.js` | 6 | 快手 AI 声明字段（默认/显式/边界） |
| `baijiahao-api-chain.test.js` | 24 | 百家号 API 全链路（含 AI 声明回归） |

**E2E 测试结果（2026-09-03）**：
- 百家号 API 全链路：✅ 7 步全部通过（真实文件上传 + mock HTTP）
- 快手 API 全链路：✅ buildPostData + publish 成功
- AI 声明一致性：✅ 百家号 + 快手默认均声明 AI 生成
- 风控处理：✅ 10000015 错误码正确识别并返回可操作提示

---

## 八、变更记录

| 日期 | 版本 | 变更 |
|------|------|------|
| 2026-09-03 | v1.1.0 | 新增一键发布流程规格（§7）：数据校验、功能逻辑、交互逻辑、显示项、提示文字、E2E 测试覆盖 |
| 2026-09-02 | v1.0.0 | 初始版本：百家号 API/RPA + 快手 API/RPA AI 声明完整实现 |
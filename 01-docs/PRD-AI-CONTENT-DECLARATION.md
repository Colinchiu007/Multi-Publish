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
    └── RPA 模式 → article.aiGenerated → _prepBaijiahao() / _prepKuaishou()
        ├── 百家号: 弹窗选择「AI生成内容」
        └── 快手:   checkbox 勾选「AI 生成」
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

## 七、变更记录

| 日期 | 版本 | 变更 |
|------|------|------|
| 2026-09-02 | v1.0.0 | 初始版本：百家号 API/RPA + 快手 API/RPA AI 声明完整实现 |
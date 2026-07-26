# Story2Video Text 标准模式对齐实施计划

> **For Codex:** 使用 `Executing Plans` 与 `Test-Driven Development (TDD)` 技能逐项执行。

**目标：** 将 `story2video-compose` 收敛为唯一 `text` 标准模式，并在不改变其他视频流水线合同的前提下，对齐独立 Story2Video 文案创作的功能与参数。

**架构：** 在 Electron Story2Video 适配层新增版本化 `Story2VideoTextConfig`，由专属归一化器完成默认值、边界校验和阶段参数映射。CreateView 为 Story2Video 使用独立表单/输出状态；`StageExecutor`、`ServiceBus` 和普通 `pipelineStart` 的公开合同保持不变。

**技术栈：** Vue 3、Electron IPC、Vitest、Node.js、YAML、ffmpeg。

---

## 范围决策

- `story2video-compose` 只接受 `text`，拒绝 `images`、`audio`、`video` 以及其他旧模式。
- 普通视频流水线继续保留文字、图片、音频和视频输入，不受 Story2Video 限制影响。
- 对齐文案、分句、提示词优化、图片/TTS Provider、字幕、BGM、动效、模板、输出版本、进度、项目历史、结果交付和发布参数。
- 公网分享、音色克隆、真实 Provider、会员/配额只对齐显式能力合同；没有服务端或真实凭据时必须报告不可用，不得返回占位成功。
- 独立 Story2Video 的 `size`、`seconds` 等参数映射到本地分镜/ffmpeg 语义，不将六阶段流水线改造成第三方 AI 视频直出架构。

## 测试场景

1. 合法 text 配置按独立项目默认值归一化，并生成六阶段允许的参数。
2. 非 `text` 模式、空文案、非法枚举及越界数值在创建运行前被拒绝，不留下孤儿运行。
3. `bgm.volume=5` 按兼容合同保存，并在合成阶段转换为 `0.5`。
4. Story2Video 使用独立 `720x1280` 输出配置；普通流水线仍使用原来的 `1920x1080`。
5. Story2Video UI 只显示文字输入；普通流水线仍显示图片、音频和视频输入。
6. 分句与提示词高级参数完整传入 Bridge，生成、合成和发布参数完整传入对应阶段。
7. 完成项目持久化规范化配置，历史、结果编辑、重试、ZIP、裁剪和本地路径操作保持可用。
8. 公网分享、真实 Provider、音色克隆和配额缺少外部能力时显式标记为外部待验收。

## Task 1：版本化参数合同

**实现：**
- 新建 `apps/desktop/electron/services/story2video-text-config.js`。
- 定义默认值、枚举、数值范围、纯 JSON 校验、旧扁平参数兼容和阶段参数映射。

**测试：**
- 新建 `apps/desktop/electron/services/story2video-text-config.test.js`。
- 覆盖默认值、合法覆盖、拒绝非 text、边界与 BGM 单位转换。

**文档：**
- 同步 YAML 运行时合同。

**Review：**
- 检查未知键、原型污染、路径参数和错误消息。

## Task 2：PipelineEngine 集成

**实现：**
- `startOrchestrated` 仅对 `story2video-compose` 调用归一化器。
- 归一化结果写入运行参数并映射到现有 stage options。
- 不修改 `StageExecutor.execute`、`ServiceBus` 和普通流水线启动合同。

**测试：**
- 扩展 Story2Video pipeline 合同测试，验证 RED→GREEN。
- 验证普通流水线参数和人工检查点语义不变。

**文档：**
- 更新架构数据流。

**Review：**
- 检查运行创建前校验、检查点和项目持久化。

## Task 3：CreateView text-only 与参数 UI

**实现：**
- Story2Video 仅显示文字输入。
- 新增独立 `s2vOutputConfig`，不再修改普通 `outputConfig`。
- 将兼容参数组织为 `story2videoTextConfig` 纯 JSON 对象后调用 IPC。

**测试：**
- 更新 CreateView 测试，验证 text-only、完整 payload 和普通流水线隔离。
- 删除原 Story2Video 图片/音频输入成功断言，改为拒绝合同。

**文档：**
- 更新 PRD 参数表和验收标准。

**Review：**
- 检查 Vue 模板、响应式对象 IPC 脱壳及文本溢出。

## Task 4：项目与运行清单同步

**实现：**
- 项目服务持久化规范化配置和版本字段。
- YAML 将 `required_any` 收敛为必需 `text`，同步默认值、约束和阶段映射。

**测试：**
- 项目保存/恢复配置合同。
- YAML 合同和真实阶段参数回归。

**文档：**
- 标明本地历史与公网分享、服务端配额的边界。

**Review：**
- 检查用户隔离、旧项目兼容和敏感 Provider 凭据不落项目文件。

## Task 5：集成、视觉、打包与交付

**测试：**
- Story2Video 聚焦 Vitest。
- Desktop 串行完整测试、coverage、fault、monkey。
- Vue 构建、preload 双 sandbox。
- Story2Video 真实 ffmpeg/ffprobe。
- UI 单视图与像素视觉回归。
- Windows x64 Electron Builder、ASAR、require 链和 8 秒启动 stderr。

**文档：**
- 更新 `CHANGELOG.md`、`.quality-gates.md` 和实现报告。

**Review：**
- 主代理自审 + 独立代码/安全/UI 审查，无未关闭 CRITICAL/MAJOR 后提交。
